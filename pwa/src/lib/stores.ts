/**
 * The Ear - Svelte Stores
 */

import { writable } from 'svelte/store';
import type { AppState } from './types';

// Application state
export const appState = writable<AppState>('idle');

// Latest transcript (what user said)
export const transcript = writable<string>('');

// Latest response (what Vincent said)
export const response = writable<string>('');

// Error message
export const errorMessage = writable<string>('');

// Connection status
export const connected = writable<boolean>(false);

// Audio is unlocked via unlockAudioContext() in audio.ts when session starts
