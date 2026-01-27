/**
 * The Ear - Configuration Loader
 * 
 * Loads config from environment and ~/.clawdbot/clawdbot.json
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProxyConfig } from './types.js';

interface ClawdbotConfig {
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
 * Load configuration from clawdbot.json and environment
 */
export function loadConfig(): ProxyConfig {
  const configPath = join(homedir(), '.clawdbot', 'clawdbot.json');
  
  let clawdbotConfig: ClawdbotConfig = {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    clawdbotConfig = JSON.parse(raw);
    console.log('✓ Loaded clawdbot.json');
  } catch (err) {
    console.error('✗ Failed to load clawdbot.json:', err);
    throw new Error('Could not load clawdbot.json');
  }

  // Extract values
  const groqApiKey = process.env.GROQ_API_KEY 
    || clawdbotConfig.env?.vars?.GROQ_API_KEY
    || '';
    
  const gatewayPort = clawdbotConfig.gateway?.port || 18789;
  const gatewayToken = clawdbotConfig.gateway?.auth?.token || '';
  
  const elevenLabsApiKey = clawdbotConfig.messages?.tts?.elevenlabs?.apiKey || '';
  const elevenLabsVoiceId = clawdbotConfig.messages?.tts?.elevenlabs?.voiceId || '';

  // Validate required config
  const missing: string[] = [];
  if (!groqApiKey) missing.push('GROQ_API_KEY');
  if (!gatewayToken) missing.push('gateway.auth.token');
  if (!elevenLabsApiKey) missing.push('messages.tts.elevenlabs.apiKey');
  if (!elevenLabsVoiceId) missing.push('messages.tts.elevenlabs.voiceId');
  
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }

  const config: ProxyConfig = {
    port: parseInt(process.env.PORT || '3001', 10),
    groqApiKey,
    gatewayUrl: `ws://localhost:${gatewayPort}`,
    gatewayToken,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    sessionKey: process.env.SESSION_KEY || 'agent:main:main',  // Shared with CLI for seamless handoff
  };

  console.log('✓ Configuration loaded');
  console.log(`  Port: ${config.port}`);
  console.log(`  Gateway: ${config.gatewayUrl}`);
  console.log(`  Session: ${config.sessionKey}`);
  
  return config;
}
