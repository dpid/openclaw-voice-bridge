/**
 * The Ear - Type Definitions
 * 
 * Message protocol between PWA client and proxy server.
 */

// ============================================================
// PWA ↔ Proxy Protocol
// ============================================================

/** Client sends audio data */
export interface AudioMessage {
  type: 'audio';
  data: string;  // base64 encoded audio
}

/** Client can request status */
export interface PingMessage {
  type: 'ping';
}

/** Client notifies TTS state change */
export interface TtsStateMessage {
  type: 'tts_state';
  enabled: boolean;
}

/** All possible client messages */
export type ClientMessage = AudioMessage | PingMessage | TtsStateMessage;

/** Server sends transcript of user speech */
export interface TranscriptMessage {
  type: 'transcript';
  text: string;
}

/** Server sends AI response text */
export interface ResponseMessage {
  type: 'response';
  text: string;
}

/** Server sends TTS audio chunk */
export interface AudioChunkMessage {
  type: 'audio';
  data: string;  // base64 encoded audio chunk
}

/** Server signals end of TTS audio */
export interface AudioEndMessage {
  type: 'audio_end';
}

/** Server sends error */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/** Server responds to ping */
export interface PongMessage {
  type: 'pong';
}

/** Server indicates processing state */
export interface StatusMessage {
  type: 'status';
  state: 'transcribing' | 'thinking' | 'speaking';
}

/** All possible server messages */
export type ServerMessage = 
  | TranscriptMessage 
  | ResponseMessage 
  | AudioChunkMessage 
  | AudioEndMessage 
  | ErrorMessage
  | PongMessage
  | StatusMessage;

// ============================================================
// Gateway Protocol
// ============================================================

export interface GatewayConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: string;
  };
  caps: string[];
  auth?: {
    token?: string;
  };
  role: string;
  scopes: string[];
}

export interface GatewayRequestFrame {
  type: 'req';
  id: string;
  method: string;
  params: unknown;
}

export interface GatewayResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export interface GatewayEventFrame {
  type: 'evt';
  event: string;
  seq?: number;
  payload?: unknown;
}

// ============================================================
// Config
// ============================================================

export interface ProxyConfig {
  port: number;
  groqApiKey: string;
  gatewayUrl: string;
  gatewayToken: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  sessionKey: string;
}

// ============================================================
// Groq API
// ============================================================

export interface GroqTranscriptionResponse {
  text: string;
}
