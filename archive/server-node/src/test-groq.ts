/**
 * Test Groq transcription API
 */

import { loadConfig } from './config.js';
import { testGroq } from './groq.js';

async function main(): Promise<void> {
  console.log('🧪 Testing Groq Transcription API\n');
  
  const config = loadConfig();
  const success = await testGroq(config.groqApiKey);
  
  process.exit(success ? 0 : 1);
}

main().catch(console.error);
