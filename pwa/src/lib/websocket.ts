/**
 * The Ear - WebSocket Client
 * Connects to the proxy server and handles message protocol
 */

import type { ServerMessage, ClientMessage } from './types';

export interface WebSocketHandlers {
  onTranscript: (text: string) => void;
  onResponse: (text: string) => void;
  onAudioChunk: (base64: string) => void;
  onAudioEnd: () => void;
  onStatus: (state: 'transcribing' | 'thinking' | 'speaking') => void;
  onError: (message: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export class ProxyWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: WebSocketHandlers;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(url: string, handlers: WebSocketHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect(): void {
    console.log('[WS] Connecting to', this.url);
    
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.handlers.onConnect();
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.handlers.onDisconnect();
      this.scheduleReconnect();
    };

    this.ws.onerror = (event) => {
      console.error('[WS] Error:', event);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      console.log('[WS] Attempting reconnect...');
      this.doConnect();
    }, 3000);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as ServerMessage;
      
      switch (msg.type) {
        case 'transcript':
          this.handlers.onTranscript(msg.text);
          break;
        case 'response':
          this.handlers.onResponse(msg.text);
          break;
        case 'audio':
          this.handlers.onAudioChunk(msg.data);
          break;
        case 'audio_end':
          this.handlers.onAudioEnd();
          break;
        case 'status':
          this.handlers.onStatus(msg.state);
          break;
        case 'error':
          this.handlers.onError(msg.message);
          break;
        case 'pong':
          // Keepalive response, ignore
          break;
        default:
          console.warn('[WS] Unknown message type:', (msg as { type: string }).type);
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
    }
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send - not connected');
      return;
    }
    
    this.ws.send(JSON.stringify(message));
  }

  sendAudio(base64: string): void {
    this.send({ type: 'audio', data: base64 });
  }

  sendTtsState(enabled: boolean): void {
    this.send({ type: 'tts_state', enabled });
  }

  sendAuth(token: string): void {
    this.send({ type: 'auth', token });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
