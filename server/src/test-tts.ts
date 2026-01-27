/**
 * Test ElevenLabs TTS API
 */

import { loadConfig } from './config.js';
import { testTTS } from './tts.js';

async function main(): Promise<void> {
  console.log('🧪 Testing ElevenLabs TTS API\n');
  
  const config = loadConfig();
  const success = await testTTS(config.elevenLabsApiKey, config.elevenLabsVoiceId);
  
  process.exit(success ? 0 : 1);
}

main().catch(console.error);
