/**
 * Moltbot Voice Bridge - Gateway Client
 * 
 * WebSocket client for Clawdbot Gateway communication
 */

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { 
  GatewayConnectParams, 
  GatewayRequestFrame, 
  GatewayResponseFrame,
  GatewayEventFrame 
} from './types.js';

const PROTOCOL_VERSION = 3;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export interface GatewayResponse {
  text: string;
  mediaUrls?: string[];
}

export interface GatewayClientOptions {
  url: string;
  token: string;
  sessionKey: string;
  onResponse?: (response: GatewayResponse) => void;
  onError?: (err: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Gateway WebSocket Client
 * 
 * Connects to the Clawdbot gateway and handles chat communication.
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private opts: GatewayClientOptions;
  private pending = new Map<string, PendingRequest>();
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private connectNonce: string | null = null;
  private responseBuffer = new Map<string, string>();
  private mediaUrlsBuffer = new Map<string, string[]>();
  
  constructor(opts: GatewayClientOptions) {
    this.opts = opts;
  }

  /**
   * Connect to the gateway
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      console.log(`Connecting to gateway: ${this.opts.url}`);
      
      this.ws = new WebSocket(this.opts.url, {
        maxPayload: 25 * 1024 * 1024,
      });

      let connectResolved = false;
      const timeout = setTimeout(() => {
        if (!connectResolved) {
          connectResolved = true;
          reject(new Error('Gateway connection timeout'));
          this.ws?.close();
        }
      }, 15000);

      const finishConnect = (success: boolean, err?: Error) => {
        if (connectResolved) return;
        connectResolved = true;
        clearTimeout(timeout);
        if (success) {
          this.connected = true;
          this.opts.onConnect?.();
          resolve();
        } else {
          reject(err || new Error('Connection failed'));
        }
      };

      this.ws.on('open', () => {
        console.log('WebSocket connected, waiting for challenge...');
        // Schedule connect after delay in case no challenge comes
        setTimeout(() => {
          if (!this.connectNonce && !connectResolved) {
            console.log('No challenge received, sending connect anyway...');
            this.sendConnect().then(() => finishConnect(true)).catch((e) => finishConnect(false, e));
          }
        }, 1000);
      });

      this.ws.on('message', (data) => {
        const raw = data.toString();
        this.handleMessage(raw, finishConnect);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Gateway closed: ${code} ${reason.toString()}`);
        this.connected = false;
        this.connectPromise = null;
        this.opts.onDisconnect?.();
        if (!connectResolved) {
          finishConnect(false, new Error(`Gateway closed: ${code}`));
        }
      });

      this.ws.on('error', (err) => {
        console.error('Gateway error:', err);
        finishConnect(false, err instanceof Error ? err : new Error(String(err)));
      });
    });

    return this.connectPromise;
  }

  /**
   * Handle incoming message from gateway
   */
  private handleMessage(
    raw: string,
    finishConnect: (success: boolean, err?: Error) => void
  ): void {
    try {
      const parsed = JSON.parse(raw);
      console.log('[Gateway] Received frame:', JSON.stringify(parsed).slice(0, 300));
      
      // Handle event frames (type is 'event', not 'evt')
      if (parsed.type === 'event') {
        const evt = parsed as GatewayEventFrame;
        console.log(`[Gateway] Event type: ${evt.event}, has payload: ${!!evt.payload}`);
        
        // Handle connect challenge
        if (evt.event === 'connect.challenge') {
          const payload = evt.payload as { nonce?: string } | undefined;
          if (payload?.nonce) {
            this.connectNonce = payload.nonce;
            console.log('Received challenge, sending connect...');
            this.sendConnect()
              .then(() => finishConnect(true))
              .catch((e) => finishConnect(false, e));
          }
          return;
        }
        
        // Handle tick (keepalive)
        if (evt.event === 'tick') {
          return;
        }
        
        // Handle agent events (contain mediaUrls for TTS)
        if (evt.event === 'agent') {
          this.handleAgentEvent(evt.payload);
          return;
        }
        
        // Handle chat events (streamed responses)
        if (evt.event === 'chat') {
          console.log('[Gateway] Received chat event:', JSON.stringify(evt.payload).slice(0, 200));
          this.handleChatEvent(evt.payload);
          return;
        }
        
        return;
      }
      
      // Handle response frames
      if (parsed.type === 'res') {
        const res = parsed as GatewayResponseFrame;
        const pending = this.pending.get(res.id);
        if (pending) {
          this.pending.delete(res.id);
          if (res.ok) {
            pending.resolve(res.payload);
          } else {
            pending.reject(new Error(res.error?.message || 'Unknown error'));
          }
        }
      }
    } catch (err) {
      console.error('Failed to parse gateway message:', err);
    }
  }

  /**
   * Handle agent event (contains text and mediaUrls)
   */
  private handleAgentEvent(payload: unknown): void {
    const p = payload as {
      runId?: string;
      sessionKey?: string;
      stream?: string;
      data?: {
        text?: string;
        mediaUrls?: string[];
      };
    };
    
    // Only process events for our session
    const expectedKeys = [
      this.opts.sessionKey,
      `agent:main:${this.opts.sessionKey}`,
    ];
    if (!expectedKeys.includes(p.sessionKey || '')) {
      return;
    }
    
    // Only process assistant stream
    if (p.stream !== 'assistant') return;
    
    const runId = p.runId || 'unknown';
    
    // Track text content (accumulate the longest version)
    if (p.data?.text) {
      const prev = this.responseBuffer.get(runId) || '';
      if (p.data.text.length > prev.length) {
        this.responseBuffer.set(runId, p.data.text);
      }
    }
    
    // Track mediaUrls (keep the last complete URL)
    if (p.data?.mediaUrls && p.data.mediaUrls.length > 0) {
      // Filter for complete .mp3 paths
      const mp3Urls = p.data.mediaUrls.filter(u => u.endsWith('.mp3'));
      if (mp3Urls.length > 0) {
        this.mediaUrlsBuffer.set(runId, mp3Urls);
        console.log(`[Gateway] Captured mediaUrls for ${runId}:`, mp3Urls);
      }
    }
  }

  /**
   * Handle chat event (streamed response)
   */
  private handleChatEvent(payload: unknown): void {
    const p = payload as {
      runId?: string;
      sessionKey?: string;
      state?: string;
      message?: {
        role?: string;
        content?: Array<{ type: string; text?: string }>;
      };
    };
    
    // Only process events for our session (gateway may prefix with agent:main:)
    const expectedKeys = [
      this.opts.sessionKey,
      `agent:main:${this.opts.sessionKey}`,
    ];
    console.log(`[Gateway] Chat event sessionKey: ${p.sessionKey}, expected: ${expectedKeys.join(' or ')}`);
    if (!expectedKeys.includes(p.sessionKey || '')) {
      console.log('[Gateway] Ignoring event - sessionKey mismatch');
      return;
    }
    
    const runId = p.runId || 'unknown';
    
    // Extract text content from message
    if (p.message?.role === 'assistant' && p.message?.content) {
      const textParts = p.message.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text || '');
      
      console.log(`[Gateway] Text parts: ${textParts.length}, state: ${p.state}`);
      
      if (textParts.length > 0) {
        const fullText = textParts.join('');
        
        // Track content in buffer
        const prev = this.responseBuffer.get(runId) || '';
        if (fullText.length > prev.length) {
          this.responseBuffer.set(runId, fullText);
        }
        
        // On final state, emit the complete response
        if (p.state === 'final') {
          const finalText = this.responseBuffer.get(runId) || fullText;
          const mediaUrls = this.mediaUrlsBuffer.get(runId);
          console.log(`[Gateway] Final response for ${runId}: "${finalText.slice(0, 100)}..." mediaUrls:`, mediaUrls);
          this.opts.onResponse?.({ text: finalText, mediaUrls });
          this.responseBuffer.delete(runId);
          this.mediaUrlsBuffer.delete(runId);
        }
      }
    }
    
    // Also emit on final even if no text content (might have mediaUrls only)
    if (p.state === 'final') {
      const existingText = this.responseBuffer.get(runId);
      const mediaUrls = this.mediaUrlsBuffer.get(runId);
      
      if (!existingText && mediaUrls) {
        console.log(`[Gateway] Final response (mediaUrls only) for ${runId}:`, mediaUrls);
        this.opts.onResponse?.({ text: '', mediaUrls });
      }
      
      this.responseBuffer.delete(runId);
      this.mediaUrlsBuffer.delete(runId);
    }
  }

  /**
   * Send connect request to gateway
   */
  private async sendConnect(): Promise<void> {
    const params: GatewayConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        // Must be a known gateway client ID
        id: 'gateway-client',
        displayName: 'Moltbot Voice Bridge Proxy',
        version: '1.0.0',
        platform: process.platform,
        mode: 'backend',
      },
      caps: [],
      auth: {
        token: this.opts.token,
      },
      role: 'operator',
      scopes: ['operator.admin'],
    };

    await this.request('connect', params);
    console.log('✓ Gateway connected and authenticated');
  }

  /**
   * Send a chat message to the gateway
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('Gateway not connected');
    }

    const idempotencyKey = randomUUID();
    
    const params = {
      sessionKey: this.opts.sessionKey,
      message,
      idempotencyKey,
    };

    const result = await this.request('chat.send', params);
    console.log('[Gateway] chat.send result:', JSON.stringify(result));
  }

  /**
   * Send a request to the gateway
   */
  private async request(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway not connected');
    }

    const id = randomUUID();
    const frame: GatewayRequestFrame = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Test gateway connection
 */
export async function testGateway(url: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    
    const done = (success: boolean, reason?: string) => {
      if (resolved) return;
      resolved = true;
      if (success) {
        console.log('✓ Gateway connection successful');
      } else {
        console.log('✗ Gateway connection failed:', reason || 'unknown');
      }
      client.disconnect();
      resolve(success);
    };
    
    const client = new GatewayClient({
      url,
      token,
      sessionKey: 'test:probe',
      onConnect: () => done(true),
      onError: (err) => done(false, err.message),
    });

    client.connect()
      .then(() => done(true))
      .catch((err) => done(false, err.message));

    // Longer timeout for gateway handshake
    setTimeout(() => done(false, 'timeout'), 15000);
  });
}
