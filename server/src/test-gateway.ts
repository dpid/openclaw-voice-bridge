/**
 * Test Gateway connection
 */

import { loadConfig } from './config.js';
import { testGateway } from './gateway.js';

async function main(): Promise<void> {
  console.log('🧪 Testing Gateway Connection\n');
  
  const config = loadConfig();
  const success = await testGateway(config.gatewayUrl, config.gatewayToken);
  
  process.exit(success ? 0 : 1);
}

main().catch(console.error);
