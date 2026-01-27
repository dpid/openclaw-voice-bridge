/**
 * The Ear - Type Definitions
 */

// UI States
export type AppState = 
  | 'idle'        // Before session starts
  | 'listening'   // VAD active, waiting for speech
  | 'recording'   // Speech detected, capturing audio
  | 'processing'  // Transcribing or thinking
  | 'speaking'    // Playing TTS response
  | 'error';      // Error state

// Server message types (from proxy)
export interface TranscriptMessage {
  type: 'transcript';
  text: string;
}

export interface ResponseMessage {
  type: 'response';
  text: string;
}

export interface AudioChunkMessage {
  type: 'audio';
  data: string; // base64
}

export interface AudioEndMessage {
  type: 'audio_end';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface PongMessage {
  type: 'pong';
}

export interface StatusMessage {
  type: 'status';
  state: 'transcribing' | 'thinking' | 'speaking';
}

export type ServerMessage = 
  | TranscriptMessage
  | ResponseMessage
  | AudioChunkMessage
  | AudioEndMessage
  | ErrorMessage
  | PongMessage
  | StatusMessage;

// Client message types (to proxy)
export interface AudioMessage {
  type: 'audio';
  data: string; // base64
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = AudioMessage | PingMessage;
