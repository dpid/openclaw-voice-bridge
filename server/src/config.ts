/**
 * Moltbot Voice Bridge - Configuration Loader
 * 
 * Loads config from environment and ~/.moltbot/moltbot.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProxyConfig } from './types.js';

interface MoltbotConfig {
  env?: {
    vars?: {
      GROQ_API_KEY?: string;
    };
  };
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
  messages?: {
    tts?: {
      elevenlabs?: {
        apiKey?: string;
        voiceId?: string;
      };
    };
  };
}

/**
 * Load configuration from moltbot.json and environment
 */
export function loadConfig(): ProxyConfig {
  // Try ~/.moltbot first, fall back to ~/.clawdbot for backwards compatibility
  let configPath = join(homedir(), '.moltbot', 'moltbot.json');
  if (!existsSync(configPath)) {
    configPath = join(homedir(), '.clawdbot', 'clawdbot.json');
  }
  
  let moltbotConfig: MoltbotConfig = {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    moltbotConfig = JSON.parse(raw);
    console.log(`✓ Loaded ${configPath}`);
  } catch (err) {
    console.error(`✗ Failed to load ${configPath}:`, err);
    throw new Error('Could not load moltbot.json');
  }

  // Extract values
  const groqApiKey = process.env.GROQ_API_KEY 
    || moltbotConfig.env?.vars?.GROQ_API_KEY
    || '';
    
  const gatewayPort = moltbotConfig.gateway?.port || 18789;
  const gatewayToken = moltbotConfig.gateway?.auth?.token || '';
  
  const elevenLabsApiKey = moltbotConfig.messages?.tts?.elevenlabs?.apiKey || '';
  const elevenLabsVoiceId = moltbotConfig.messages?.tts?.elevenlabs?.voiceId || '';

  // Validate required config
  const missing: string[] = [];
  if (!groqApiKey) missing.push('GROQ_API_KEY');
  if (!gatewayToken) missing.push('gateway.auth.token');
  if (!elevenLabsApiKey) missing.push('messages.tts.elevenlabs.apiKey');
  if (!elevenLabsVoiceId) missing.push('messages.tts.elevenlabs.voiceId');
  
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }

  // Auth token for PWA connections (required!)
  const authToken = process.env.EAR_AUTH_TOKEN || '';
  if (!authToken) {
    throw new Error('EAR_AUTH_TOKEN environment variable is required');
  }

  // Branding (env vars with Moltbot defaults)
  const assistantName = process.env.ASSISTANT_NAME || 'Moltbot';
  const assistantEmoji = process.env.ASSISTANT_EMOJI || '🦞';

  const config: ProxyConfig = {
    port: parseInt(process.env.PORT || '3001', 10),
    groqApiKey,
    gatewayUrl: `ws://localhost:${gatewayPort}`,
    gatewayToken,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    sessionKey: process.env.SESSION_KEY || 'agent:main:main',  // Shared with CLI for seamless handoff
    authToken,
    assistantName,
    assistantEmoji,
  };

  console.log('✓ Configuration loaded');
  console.log(`  Port: ${config.port}`);
  console.log(`  Gateway: ${config.gatewayUrl}`);
  console.log(`  Session: ${config.sessionKey}`);
  console.log(`  Assistant: ${config.assistantEmoji} ${config.assistantName}`);
  
  return config;
}
