/**
 * The Ear - Proxy Server
 * 
 * Express + WebSocket server that bridges the PWA to:
 * - Groq (transcription)
 * - Clawdbot Gateway (chat)
 * - ElevenLabs (TTS)
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { transcribeAudio } from './groq.js';
import { GatewayClient, GatewayResponse } from './gateway.js';
// TTS Provider: Set CHATTERBOX_URL env var to use local Chatterbox, otherwise ElevenLabs
const USE_CHATTERBOX = !!process.env.CHATTERBOX_URL;
import { streamTTS as streamElevenLabs } from './tts.js';
import { streamTTS as streamChatterbox } from './tts-chatterbox.js';
const streamTTS = USE_CHATTERBOX ? streamChatterbox : streamElevenLabs;
import type { ClientMessage, ServerMessage, ProxyConfig } from './types.js';

// ============================================================
// Server Setup
// ============================================================

const config = loadConfig();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    gateway: gatewayClient?.isConnected() ?? false,
  });
});

// ============================================================
// Gateway Client
// ============================================================

let gatewayClient: GatewayClient | null = null;
let pendingResponseCallback: ((response: GatewayResponse) => void) | null = null;

async function initGateway(): Promise<void> {
  gatewayClient = new GatewayClient({
    url: config.gatewayUrl,
    token: config.gatewayToken,
    sessionKey: config.sessionKey,
    onResponse: (response) => {
      console.log(`[Gateway] Response received (${response.text.length} chars, ${response.mediaUrls?.length || 0} media)`);
      if (pendingResponseCallback) {
        pendingResponseCallback(response);
        pendingResponseCallback = null;
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
async function sendToGateway(message: string): Promise<GatewayResponse> {
  if (!gatewayClient?.isConnected()) {
    throw new Error('Gateway not connected');
  }

  return new Promise((resolve, reject) => {
    // Set up response callback
    const timeout = setTimeout(() => {
      pendingResponseCallback = null;
      reject(new Error('Gateway response timeout (5 min)'));
    }, 300000); // 5 minute timeout for complex Opus tasks

    pendingResponseCallback = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };

    // Send message
    gatewayClient!.sendMessage(message).catch((err) => {
      clearTimeout(timeout);
      pendingResponseCallback = null;
      reject(err);
    });
  });
}

// Keepalive ping during long waits (prevents WebSocket timeout)
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepalive(ws: WebSocket): void {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN && pendingResponseCallback) {
      // Send a status update to keep client informed during long waits
      sendMessage(ws, { type: 'status', state: 'thinking' });
    }
  }, 15000); // Every 15 seconds
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
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

async function handleAudioMessage(ws: WebSocket, audioBase64: string): Promise<void> {
  try {
    // 1. Transcribe audio
    console.log('[Pipeline] Transcribing audio...');
    sendMessage(ws, { type: 'status', state: 'transcribing' });
    
    const transcript = await transcribeAudio(audioBase64, config.groqApiKey);
    console.log(`[Pipeline] Transcript: "${transcript}"`);
    
    if (!transcript.trim()) {
      console.log('[Pipeline] Empty transcript, ignoring');
      sendMessage(ws, { type: 'audio_end' }); // Reset client state
      return;
    }
    
    // Filter common Whisper hallucinations on silence/noise
    const hallucinations = [
      'thank you',
      'thanks for watching',
      'subscribe',
      'like and subscribe',
      'see you next time',
      'bye',
    ];
    const normalized = transcript.trim().toLowerCase().replace(/[.!?,]/g, '');
    if (hallucinations.includes(normalized)) {
      console.log(`[Pipeline] Filtered hallucination: "${transcript}"`);
      sendMessage(ws, { type: 'audio_end' }); // Reset client state
      return;
    }
    
    // Send transcript to client
    sendMessage(ws, { type: 'transcript', text: transcript });

    // 2. Send to gateway and get response
    console.log('[Pipeline] Sending to gateway...');
    sendMessage(ws, { type: 'status', state: 'thinking' });
    
    // Prefix message so Vincent knows this is voice
    // 🎤 = TTS on (be concise), 📖 = TTS off (full response OK)
    const ttsEnabled = connectionTtsState.get(ws) ?? true;
    const prefix = ttsEnabled ? '🎤' : '📖';
    
    // Start keepalive pings during long waits (complex Opus tasks can take minutes)
    startKeepalive(ws);
    let response: GatewayResponse;
    try {
      response = await sendToGateway(`${prefix} ${transcript}`);
    } finally {
      stopKeepalive();
    }
    console.log(`[Pipeline] Response: "${response.text.slice(0, 100)}..." mediaUrls:`, response.mediaUrls);
    
    // Send response text to client (use text if available, or a placeholder)
    const displayText = response.text || '(audio response)';
    sendMessage(ws, { type: 'response', text: displayText });

    // 3. Convert response to speech
    console.log('[Pipeline] Generating TTS...');
    sendMessage(ws, { type: 'status', state: 'speaking' });
    
    if (response.text) {
      // We have text - generate our own TTS for perfect sync
      const spokenText = response.text
        .replace(/^>\s*🎤?\s*"[^"]*"\n*/gm, '')  // Remove voice transcription echo
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
        .replace(/\*([^*]+)\*/g, '$1')      // *italic* → italic
        .replace(/`([^`]+)`/g, '$1')        // `code` → code
        .replace(/#{1,6}\s*/g, '')          // headers
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // emojis (misc symbols, emoticons)
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // dingbats
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // variation selectors
        .replace(/[\u{200D}]/gu, '')            // zero-width joiner
        .trim();
      
      console.log(`[Pipeline] Speaking (own TTS): "${spokenText.slice(0, 100)}..."`);
      await generateAndStreamTTS(ws, spokenText);
    } else if (response.mediaUrls && response.mediaUrls.length > 0) {
      // No text but gateway generated audio - use that
      const audioPath = response.mediaUrls[0];
      console.log(`[Pipeline] Using gateway TTS (no text): ${audioPath}`);
      
      try {
        const audioBuffer = await readFile(audioPath);
        console.log(`[Pipeline] Read ${audioBuffer.length} bytes`);
        sendMessage(ws, { type: 'audio', data: audioBuffer.toString('base64') });
      } catch (readErr) {
        console.error(`[Pipeline] Failed to read gateway audio: ${readErr}`);
      }
    } else {
      console.log('[Pipeline] No text or audio to speak');
    }
    
    // Signal end of audio
    sendMessage(ws, { type: 'audio_end' });
    console.log('[Pipeline] Complete');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Pipeline] Error:', message);
    sendMessage(ws, { type: 'error', message });
    sendMessage(ws, { type: 'audio_end' }); // Reset client state
  }
}

async function generateAndStreamTTS(ws: WebSocket, text: string): Promise<void> {
  await streamTTS(
    text,
    config.elevenLabsApiKey,
    config.elevenLabsVoiceId,
    (chunk) => {
      sendMessage(ws, { 
        type: 'audio', 
        data: chunk.toString('base64') 
      });
    }
  );
}

// Track state per connection
const connectionTtsState = new WeakMap<WebSocket, boolean>();
const connectionAuthed = new WeakMap<WebSocket, boolean>();

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
  }, 10000);

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
          await handleAudioMessage(ws, msg.data);
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
  console.log('\n🦻 The Ear - Proxy Server\n');
  
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
