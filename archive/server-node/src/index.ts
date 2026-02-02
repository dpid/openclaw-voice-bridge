/**
 * OpenClaw Voice Bridge - Proxy Server
 *
 * Express + WebSocket server that bridges the PWA to:
 * - Groq (transcription)
 * - OpenClaw Gateway (chat)
 * - ElevenLabs or Chatterbox (TTS)
 */

import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { transcribeAudio } from './groq.js';
import { GatewayClient, GatewayResponse } from './gateway.js';
import { streamTTS, getTTSProvider } from './tts-provider.js';
import { USE_CHATTERBOX } from './env.js';
import { shouldFilter } from './filters.js';
import type { ClientMessage, ServerMessage, ProxyConfig } from './types.js';

// ============================================================
// Server Setup
// ============================================================

const config = loadConfig();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ 
  server, 
  path: '/ws',
  maxPayload: 10 * 1024 * 1024,  // 10MB max message size
});

// Constants
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const RATE_LIMIT_REQUESTS = 20; // requests per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const GATEWAY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for complex tasks
const KEEPALIVE_INTERVAL_MS = 15 * 1000; // 15 seconds
const AUTH_TIMEOUT_MS = 10 * 1000; // 10 seconds

// CORS middleware - use allowed origins from env or default to common dev URLs
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:4173',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    gateway: gatewayClient?.isConnected() ?? false,
  });
});

// Branding endpoint - PWA fetches this on load
app.get('/branding', (_req, res) => {
  res.json({
    name: config.assistantName,
    emoji: config.assistantEmoji,
    description: `Hands-free voice interface for ${config.assistantName}`,
  });
});

// ============================================================
// Gateway Client
// ============================================================

let gatewayClient: GatewayClient | null = null;

// Per-connection pending responses (queue for FIFO ordering since gateway processes in order)
interface PendingRequest {
  ws: WebSocket;
  callback: (response: GatewayResponse) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}
const pendingRequests: PendingRequest[] = [];

// Per-connection keepalive intervals
const keepaliveIntervals = new Map<WebSocket, NodeJS.Timeout>();

async function initGateway(): Promise<void> {
  gatewayClient = new GatewayClient({
    url: config.gatewayUrl,
    token: config.gatewayToken,
    sessionKey: config.sessionKey,
    onResponse: (response) => {
      console.log(`[Gateway] Response received (${response.text.length} chars, ${response.mediaUrls?.length || 0} media)`);
      // Deliver to first pending request (FIFO - gateway processes in order)
      const pending = pendingRequests.shift();
      if (pending) {
        clearTimeout(pending.timeout);
        pending.callback(response);
      } else {
        console.warn('[Gateway] Response received but no pending request');
      }
    },
    onConnect: () => {
      console.log('[Gateway] Connected');
    },
    onDisconnect: () => {
      console.log('[Gateway] Disconnected, will reconnect...');
      // Attempt reconnect after delay
      setTimeout(() => {
        if (!gatewayClient?.isConnected()) {
          gatewayClient?.connect().catch(console.error);
        }
      }, 3000);
    },
  });

  await gatewayClient.connect();
}

/**
 * Send message to gateway and wait for response
 */
async function sendToGateway(ws: WebSocket, message: string): Promise<GatewayResponse> {
  if (!gatewayClient?.isConnected()) {
    throw new Error('Gateway not connected');
  }

  return new Promise((resolve, reject) => {
    const pendingRequest: PendingRequest = {
      ws,
      callback: resolve,
      reject,
      timeout: setTimeout(() => {
        // Remove from queue on timeout
        const idx = pendingRequests.indexOf(pendingRequest);
        if (idx >= 0) pendingRequests.splice(idx, 1);
        reject(new Error('Gateway response timeout (5 min)'));
      }, GATEWAY_TIMEOUT_MS),
    };

    // Add to queue
    pendingRequests.push(pendingRequest);

    // Send message
    gatewayClient!.sendMessage(message).catch((err) => {
      clearTimeout(pendingRequest.timeout);
      const idx = pendingRequests.indexOf(pendingRequest);
      if (idx >= 0) pendingRequests.splice(idx, 1);
      reject(err);
    });
  });
}

// Keepalive ping during long waits (prevents WebSocket timeout)
function startKeepalive(ws: WebSocket): void {
  stopKeepalive(ws);
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // Check if this connection has a pending request
      const hasPending = pendingRequests.some(p => p.ws === ws);
      if (hasPending) {
        sendMessage(ws, { type: 'status', state: 'thinking' });
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
  keepaliveIntervals.set(ws, interval);
}

function stopKeepalive(ws: WebSocket): void {
  const interval = keepaliveIntervals.get(ws);
  if (interval) {
    clearInterval(interval);
    keepaliveIntervals.delete(ws);
  }
}

// ============================================================
// WebSocket Handler
// ============================================================

function sendMessage(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function handleAudioMessage(ws: WebSocket, audioBase64: string, location?: { lat: number; lng: number; accuracy?: number }): Promise<void> {
  const reqId = randomUUID().slice(0, 8);  // Short ID for logs
  
  try {
    // 1. Transcribe audio
    console.log(`[${reqId}] Transcribing audio...`);
    sendMessage(ws, { type: 'status', state: 'transcribing' });
    
    const transcript = await transcribeAudio(audioBase64, config.groqApiKey);
    console.log(`[${reqId}] Transcript: "${transcript}"`);
    
    // Filter empty, too short, or hallucinated transcripts
    const filterResult = shouldFilter(transcript);
    if (filterResult.filtered) {
      console.log(`[${reqId}] Filtered (${filterResult.reason}): "${transcript}"`);
      sendMessage(ws, { type: 'audio_end' }); // Reset client state
      return;
    }
    
    // Send transcript to client
    sendMessage(ws, { type: 'transcript', text: transcript });

    // 2. Send to gateway and get response
    console.log(`[${reqId}] Sending to gateway...`);
    sendMessage(ws, { type: 'status', state: 'thinking' });
    
    // Prefix message so assistant knows this is voice input
    // 🎤 = TTS on (be concise), 📖 = TTS off (full response OK)
    const ttsEnabled = connectionTtsState.get(ws) ?? true;
    const prefix = ttsEnabled ? '🎤' : '📖';
    
    // Build message with optional location context
    let message = `${prefix} ${transcript}`;
    if (location) {
      message = `${prefix} [Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}] ${transcript}`;
    }
    
    // Start keepalive pings during long waits (complex Opus tasks can take minutes)
    startKeepalive(ws);
    let response: GatewayResponse;
    try {
      response = await sendToGateway(ws, message);
    } finally {
      stopKeepalive(ws);
    }
    console.log(`[${reqId}] Response: "${response.text.slice(0, 100)}..." mediaUrls:`, response.mediaUrls);
    
    // Send response text to client (use text if available, or a placeholder)
    const displayText = response.text || '(audio response)';
    sendMessage(ws, { type: 'response', text: displayText });

    // 3. Convert response to speech
    console.log(`[${reqId}] Generating TTS...`);
    sendMessage(ws, { type: 'status', state: 'speaking' });
    
    if (response.text) {
      // We have text - generate our own TTS for perfect sync
      const spokenText = response.text
        .replace(/^>\s*🎤?\s*"[^"]*"\n*/gm, '')  // Remove voice transcription echo
        .replace(/```[\s\S]*?```/g, ' (code block omitted) ')  // Remove code blocks
        .replace(/\|[^\n]+\|/g, '')         // Remove table rows
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [link text](url) → link text
        .replace(/https?:\/\/\S+/g, '')     // Remove raw URLs
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
        .replace(/\*([^*]+)\*/g, '$1')      // *italic* → italic
        .replace(/`([^`]+)`/g, '$1')        // `code` → code
        .replace(/#{1,6}\s*/g, '')          // headers
        .replace(/^[-*]\s+/gm, '')          // bullet points
        .replace(/^\d+\.\s+/gm, '')         // numbered lists
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // emojis (misc symbols, emoticons)
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // dingbats
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // variation selectors
        .replace(/[\u{200D}]/gu, '')            // zero-width joiner
        .replace(/\n{2,}/g, '. ')           // Multiple newlines → pause
        .replace(/\n/g, ' ')                // Single newlines → space
        .trim();
      
      if (spokenText) {
        console.log(`[${reqId}] Speaking (own TTS): "${spokenText.slice(0, 100)}..."`);
        await generateAndStreamTTS(ws, spokenText);
      } else {
        console.log(`[${reqId}] No text to speak after stripping`);
      }
    } else if (response.mediaUrls && response.mediaUrls.length > 0) {
      // No text but gateway generated audio - use that
      const audioPath = response.mediaUrls[0];
      console.log(`[${reqId}] Using gateway TTS (no text): ${audioPath}`);
      
      try {
        const audioBuffer = await readFile(audioPath);
        console.log(`[${reqId}] Read ${audioBuffer.length} bytes`);
        sendMessage(ws, { type: 'audio', data: audioBuffer.toString('base64') });
      } catch (readErr) {
        console.error(`[${reqId}] Failed to read gateway audio: ${readErr}`);
      }
    } else {
      console.log(`[${reqId}] No text or audio to speak`);
    }
    
    // Signal end of audio
    sendMessage(ws, { type: 'audio_end' });
    console.log(`[${reqId}] Complete`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${reqId}] Error:`, message);
    
    // Sanitize error message for client - don't leak internal details
    const safeMessage = getSafeErrorMessage(err);
    sendMessage(ws, { type: 'error', message: safeMessage });
    sendMessage(ws, { type: 'audio_end' }); // Reset client state
  }
}

/**
 * Get a safe error message for the client without leaking internal details
 */
function getSafeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'An unexpected error occurred';
  }
  
  const message = err.message.toLowerCase();
  
  // Map known errors to safe messages
  if (message.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  if (message.includes('gateway') || message.includes('not connected')) {
    return 'Service temporarily unavailable. Please try again.';
  }
  if (message.includes('transcri')) {
    return 'Failed to process audio. Please try again.';
  }
  if (message.includes('tts') || message.includes('speech')) {
    return 'Voice synthesis failed. Response is text-only.';
  }
  
  return 'An error occurred. Please try again.';
}

async function generateAndStreamTTS(ws: WebSocket, text: string): Promise<void> {
  // Use appropriate voice based on TTS provider
  const voice = USE_CHATTERBOX ? config.chatterboxVoice : config.elevenLabsVoiceId;
  
  await streamTTS(
    text,
    config.elevenLabsApiKey,
    voice,
    (chunk) => {
      sendMessage(ws, { 
        type: 'audio', 
        data: chunk.toString('base64') 
      });
    }
  );
}

// Track state per connection
// Per-connection state
const connectionTtsState = new WeakMap<WebSocket, boolean>();
const connectionAuthed = new WeakMap<WebSocket, boolean>();
const connectionRateLimit = new WeakMap<WebSocket, { count: number; resetAt: number }>();

/**
 * Check rate limit for a connection
 */
function checkRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  let limit = connectionRateLimit.get(ws);
  
  if (!limit || now > limit.resetAt) {
    limit = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  
  if (limit.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }
  
  limit.count++;
  connectionRateLimit.set(ws, limit);
  return true;
}

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp}`);
  
  // Default states
  connectionTtsState.set(ws, true);
  connectionAuthed.set(ws, false);
  
  // Auth timeout - close if not authenticated within 10 seconds
  const authTimeout = setTimeout(() => {
    if (!connectionAuthed.get(ws)) {
      console.log(`[WS] Auth timeout for ${clientIp}, closing connection`);
      sendMessage(ws, { type: 'error', message: 'Authentication timeout' });
      ws.close();
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      
      // Must authenticate first
      if (!connectionAuthed.get(ws)) {
        if (msg.type === 'auth') {
          if (msg.token === config.authToken) {
            connectionAuthed.set(ws, true);
            clearTimeout(authTimeout);
            console.log(`[WS] Client authenticated from ${clientIp}`);
            sendMessage(ws, { type: 'status', state: 'transcribing' }); // Ack auth with any status
          } else {
            console.log(`[WS] Invalid auth token from ${clientIp}`);
            sendMessage(ws, { type: 'error', message: 'Invalid token' });
            ws.close();
          }
        } else {
          console.log(`[WS] Unauthenticated message from ${clientIp}: ${msg.type}`);
          sendMessage(ws, { type: 'error', message: 'Not authenticated' });
        }
        return;
      }
      
      // Authenticated - process normally
      switch (msg.type) {
        case 'audio':
          // Rate limiting
          if (!checkRateLimit(ws)) {
            sendMessage(ws, { type: 'error', message: 'Rate limit exceeded. Please wait.' });
            sendMessage(ws, { type: 'audio_end' });
            break;
          }
          
          // Input validation - check size
          const audioSize = Buffer.byteLength(msg.data, 'base64');
          if (audioSize > MAX_AUDIO_SIZE) {
            sendMessage(ws, { type: 'error', message: 'Audio data too large' });
            sendMessage(ws, { type: 'audio_end' });
            break;
          }
          
          await handleAudioMessage(ws, msg.data, msg.location);
          break;
          
        case 'ping':
          sendMessage(ws, { type: 'pong' });
          break;
          
        case 'tts_state':
          connectionTtsState.set(ws, msg.enabled);
          console.log(`[WS] TTS state changed: ${msg.enabled ? 'ON' : 'OFF'}`);
          break;
          
        case 'auth':
          // Already authenticated, ignore
          break;
          
        default:
          console.warn('[WS] Unknown message type:', (msg as { type: string }).type);
      }
    } catch (err) {
      console.error('[WS] Message handling error:', err);
      sendMessage(ws, { 
        type: 'error', 
        message: 'Failed to process message' 
      });
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    // Clean up any pending requests for this connection
    for (let i = pendingRequests.length - 1; i >= 0; i--) {
      if (pendingRequests[i].ws === ws) {
        clearTimeout(pendingRequests[i].timeout);
        pendingRequests.splice(i, 1);
      }
    }
    // Clean up keepalive
    stopKeepalive(ws);
    console.log(`[WS] Client disconnected from ${clientIp}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error from ${clientIp}:`, err);
  });
});

// ============================================================
// Startup
// ============================================================

async function main(): Promise<void> {
  console.log('\n🦻 OpenClaw Voice Bridge - Proxy Server\n');
  
  // Log TTS provider
  const ttsProvider = getTTSProvider();
  console.log(`   TTS Provider: ${ttsProvider.name}`);
  
  // Connect to gateway
  try {
    await initGateway();
  } catch (err) {
    console.error('Failed to connect to gateway:', err);
    console.log('Server will start anyway, gateway will reconnect...');
  }

  // Start HTTP server
  server.listen(config.port, () => {
    console.log(`\n🚀 Server running on port ${config.port}`);
    console.log(`   WebSocket: ws://localhost:${config.port}/ws`);
    console.log(`   Health: http://localhost:${config.port}/health\n`);
  });
}

main().catch(console.error);
