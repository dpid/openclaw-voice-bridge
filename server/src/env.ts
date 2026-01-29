/**
 * Moltbot Voice Bridge - Environment Variables
 * 
 * Centralized environment variable management.
 * All env vars are loaded once at startup.
 */

/**
 * Get an optional environment variable
 */
function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Environment configuration loaded at startup
 */
export const ENV = {
  // Server
  PORT: parseInt(getEnv('PORT', '3001')!, 10),
  
  // Auth
  AUTH_TOKEN: getEnv('MVB_AUTH_TOKEN'),
  
  // API Keys (can also come from moltbot.json)
  GROQ_API_KEY: getEnv('GROQ_API_KEY'),
  
  // TTS Provider
  CHATTERBOX_URL: getEnv('CHATTERBOX_URL'),
  CHATTERBOX_VOICE: getEnv('CHATTERBOX_VOICE', 'Eli'),
  
  // Gateway
  SESSION_KEY: getEnv('SESSION_KEY', 'agent:main:main'),
  
  // Branding
  ASSISTANT_NAME: getEnv('ASSISTANT_NAME', 'Moltbot'),
  ASSISTANT_EMOJI: getEnv('ASSISTANT_EMOJI', '🦞'),
  
  // CORS
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS')?.split(','),
} as const;

/**
 * Check if Chatterbox TTS is enabled
 */
export const USE_CHATTERBOX = !!ENV.CHATTERBOX_URL;
