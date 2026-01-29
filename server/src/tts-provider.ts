/**
 * Moltbot Voice Bridge - TTS Provider Interface
 * 
 * Unified interface for text-to-speech providers.
 */

import { USE_CHATTERBOX } from './env.js';
import { streamTTS as streamElevenLabs } from './tts.js';
import { streamTTS as streamChatterbox } from './tts-chatterbox.js';

export type TTSChunkCallback = (chunk: Buffer) => void;

/**
 * TTS Provider interface
 */
export interface TTSProvider {
  name: string;
  streamTTS(text: string, apiKey: string, voice: string, onChunk: TTSChunkCallback): Promise<void>;
}

/**
 * ElevenLabs TTS provider
 */
export const elevenLabsProvider: TTSProvider = {
  name: 'ElevenLabs',
  streamTTS: streamElevenLabs,
};

/**
 * Chatterbox TTS provider
 */
export const chatterboxProvider: TTSProvider = {
  name: 'Chatterbox',
  streamTTS: streamChatterbox,
};

/**
 * Get the active TTS provider based on configuration
 */
export function getTTSProvider(): TTSProvider {
  return USE_CHATTERBOX ? chatterboxProvider : elevenLabsProvider;
}

/**
 * Stream TTS using the configured provider
 */
export async function streamTTS(
  text: string,
  apiKey: string,
  voice: string,
  onChunk: TTSChunkCallback
): Promise<void> {
  const provider = getTTSProvider();
  return provider.streamTTS(text, apiKey, voice, onChunk);
}
