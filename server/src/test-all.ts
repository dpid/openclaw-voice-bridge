/**
 * Test all components
 */

import { loadConfig } from './config.js';
import { testGroq } from './groq.js';
import { testGateway } from './gateway.js';
import { testTTS } from './tts.js';

async function main(): Promise<void> {
  console.log('🧪 Testing All Components\n');
  console.log('═'.repeat(50));
  
  const config = loadConfig();
  
  console.log('\n📝 1. Testing Groq Transcription...\n');
  const groqOk = await testGroq(config.groqApiKey);
  
  console.log('\n🌐 2. Testing Gateway Connection...\n');
  const gatewayOk = await testGateway(config.gatewayUrl, config.gatewayToken);
  
  console.log('\n🔊 3. Testing ElevenLabs TTS...\n');
  const ttsOk = await testTTS(config.elevenLabsApiKey, config.elevenLabsVoiceId);
  
  console.log('\n' + '═'.repeat(50));
  console.log('\n📊 Results:\n');
  console.log(`  Groq:    ${groqOk ? '✓ OK' : '✗ FAILED'}`);
  console.log(`  Gateway: ${gatewayOk ? '✓ OK' : '✗ FAILED'}`);
  console.log(`  TTS:     ${ttsOk ? '✓ OK' : '✗ FAILED'}`);
  console.log();
  
  const allOk = groqOk && gatewayOk && ttsOk;
  
  if (allOk) {
    console.log('🎉 All tests passed! Ready to run server.\n');
  } else {
    console.log('⚠️  Some tests failed. Check configuration.\n');
  }
  
  process.exit(allOk ? 0 : 1);
}

main().catch(console.error);
