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
import { streamTTS } from './tts.js';
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
      reject(new Error('Gateway response timeout'));
    }, 120000); // 2 minute timeout

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
      return;
    }
    
    // Send transcript to client
    sendMessage(ws, { type: 'transcript', text: transcript });

    // 2. Send to gateway and get response
    console.log('[Pipeline] Sending to gateway...');
    sendMessage(ws, { type: 'status', state: 'thinking' });
    
    const response = await sendToGateway(transcript);
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

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp}`);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      
      switch (msg.type) {
        case 'audio':
          await handleAudioMessage(ws, msg.data);
          break;
          
        case 'ping':
          sendMessage(ws, { type: 'pong' });
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
