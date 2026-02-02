/**
 * OpenClaw Voice Bridge - Configuration Loader
 *
 * Loads config from environment and ~/.openclaw/openclaw.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProxyConfig } from './types.js';

interface OpenClawConfig {
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
 * Load configuration from openclaw.json and environment
 */
export function loadConfig(): ProxyConfig {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');
  
  let openclawConfig: OpenClawConfig = {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    openclawConfig = JSON.parse(raw);
    console.log(`✓ Loaded ${configPath}`);
  } catch (err) {
    console.error(`✗ Failed to load ${configPath}:`, err);
    throw new Error('Could not load openclaw.json');
  }

  // Extract values
  const groqApiKey = process.env.GROQ_API_KEY
    || openclawConfig.env?.vars?.GROQ_API_KEY
    || '';

  const gatewayPort = openclawConfig.gateway?.port || 18789;
  const gatewayToken = openclawConfig.gateway?.auth?.token || '';

  const elevenLabsApiKey = openclawConfig.messages?.tts?.elevenlabs?.apiKey || '';
  const elevenLabsVoiceId = openclawConfig.messages?.tts?.elevenlabs?.voiceId || '';

  // Validate required config
  const missing: string[] = [];
  if (!groqApiKey) missing.push('GROQ_API_KEY');
  if (!gatewayToken) missing.push('gateway.auth.token');
  if (!elevenLabsApiKey) missing.push('messages.tts.elevenlabs.apiKey');
  if (!elevenLabsVoiceId) missing.push('messages.tts.elevenlabs.voiceId');
  
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }
  
  // Validate config format (catch placeholder values)
  const invalid: string[] = [];
  if (groqApiKey.length < 20) invalid.push('GROQ_API_KEY (too short)');
  if (gatewayToken.length < 10) invalid.push('gateway.auth.token (too short)');
  if (elevenLabsApiKey.length < 20) invalid.push('elevenlabs.apiKey (too short)');
  if (elevenLabsVoiceId.length < 10) invalid.push('elevenlabs.voiceId (too short)');
  
  if (invalid.length > 0) {
    throw new Error(`Invalid config values: ${invalid.join(', ')}`);
  }

  // Auth token for PWA connections (required!)
  const authToken = process.env.OC_AUTH_TOKEN || '';
  if (!authToken) {
    throw new Error('OC_AUTH_TOKEN environment variable is required');
  }

  // Branding (env vars with OpenClaw defaults)
  const assistantName = process.env.ASSISTANT_NAME || 'OpenClaw';
  const assistantEmoji = process.env.ASSISTANT_EMOJI || '🦞';

  // Chatterbox voice (only used when CHATTERBOX_URL is set)
  const chatterboxVoice = process.env.CHATTERBOX_VOICE || 'Eli';

  const config: ProxyConfig = {
    port: parseInt(process.env.PORT || '3001', 10),
    groqApiKey,
    gatewayUrl: process.env.GATEWAY_URL || `ws://localhost:${gatewayPort}`,
    gatewayToken,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    chatterboxVoice,
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
