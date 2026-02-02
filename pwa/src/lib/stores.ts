/**
 * OpenClaw Voice Bridge - Svelte Stores
 */

import { writable } from 'svelte/store';
import type { AppState } from './types';

// Application state
export const appState = writable<AppState>('idle');

// Latest transcript (what user said)
export const transcript = writable<string>('');

// Latest response (what assistant said)
export const response = writable<string>('');

// Error message
export const errorMessage = writable<string>('');

// Connection status
export const connected = writable<boolean>(false);

// Branding (loaded from server)
export interface Branding {
  name: string;
  emoji: string;
  description: string;
}

export const branding = writable<Branding>({
  name: import.meta.env.VITE_BOT_NAME || 'OpenClaw',
  emoji: import.meta.env.VITE_BOT_EMOJI || '🦞',
  description: import.meta.env.VITE_BOT_DESCRIPTION || 'Hands-free voice interface for OpenClaw',
});

// Audio is unlocked via unlockAudioContext() in audio.ts when session starts
