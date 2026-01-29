/**
 * Moltbot Voice Bridge - Audio Filters
 * 
 * Filters for detecting hallucinations and noise in transcriptions.
 */

/**
 * Patterns that match common Whisper hallucinations on silence/noise
 */
const HALLUCINATION_PATTERNS = [
  /^thanks?\s*(you)?\s*(for\s+watching)?$/i,  // thank you, thanks, thanks for watching
  /^(please\s+)?subscribe/i,
  /^like\s+and\s+subscribe/i,
  /^see\s+you\s+(next\s+time|later|soon)/i,
  /^bye+$/i,
  /^(uh+|um+|hmm+)$/i,
  /^\.+$/,  // Just periods
];

/**
 * Minimum transcript length to be considered valid speech
 */
const MIN_TRANSCRIPT_LENGTH = 2;

/**
 * Check if a transcript is likely a Whisper hallucination
 */
export function isHallucination(transcript: string): boolean {
  const normalized = transcript.trim().replace(/[.!?,]/g, '');
  return HALLUCINATION_PATTERNS.some(p => p.test(normalized));
}

/**
 * Check if a transcript is too short (likely noise)
 */
export function isTooShort(transcript: string): boolean {
  const normalized = transcript.trim().replace(/[.!?,]/g, '');
  return normalized.length < MIN_TRANSCRIPT_LENGTH;
}

/**
 * Filter result with reason
 */
export interface FilterResult {
  filtered: boolean;
  reason?: 'hallucination' | 'noise' | 'empty';
}

/**
 * Check if a transcript should be filtered
 */
export function shouldFilter(transcript: string): FilterResult {
  const trimmed = transcript.trim();
  
  if (!trimmed) {
    return { filtered: true, reason: 'empty' };
  }
  
  if (isTooShort(trimmed)) {
    return { filtered: true, reason: 'noise' };
  }
  
  if (isHallucination(trimmed)) {
    return { filtered: true, reason: 'hallucination' };
  }
  
  return { filtered: false };
}
