/**
 * OpenClaw Voice Bridge - Chatterbox TTS
 *
 * Text-to-speech using local Chatterbox server (OpenAI-compatible API)
 */

// Default to localhost, can be overridden via env
const CHATTERBOX_URL = process.env.CHATTERBOX_URL || 'http://localhost:8880';
const CHATTERBOX_VOICE = process.env.CHATTERBOX_VOICE || 'default';

export interface TTSChunkCallback {
  (chunk: Buffer): void;
}

/**
 * Generate TTS from Chatterbox server
 * 
 * Note: Unlike ElevenLabs, this doesn't stream - it returns full audio.
 * We still use the callback interface for compatibility.
 * 
 * @param text - Text to convert to speech
 * @param voice - Voice name (default from CHATTERBOX_VOICE env or 'default')
 * @param onChunk - Callback for audio data
 */
export async function streamTTS(
  text: string,
  _apiKey: string,  // Not used, kept for interface compatibility
  voice: string,
  onChunk: TTSChunkCallback
): Promise<void> {
  const url = `${CHATTERBOX_URL}/v1/audio/speech`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      voice: voice || CHATTERBOX_VOICE,
      response_format: 'wav',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chatterbox TTS failed (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body from Chatterbox');
  }

  // Read full response (Chatterbox doesn't stream)
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Send as single chunk
  onChunk(buffer);
}

/**
 * Generate TTS and return full audio buffer (non-streaming)
 */
export async function generateTTS(
  text: string,
  apiKey: string,
  voice: string
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  
  await streamTTS(text, apiKey, voice, (chunk) => {
    chunks.push(chunk);
  });
  
  return Buffer.concat(chunks);
}

/**
 * Test Chatterbox TTS server
 */
export async function testTTS(_apiKey: string, voice: string): Promise<boolean> {
  try {
    console.log('Testing Chatterbox TTS...');
    
    // First check health endpoint
    const healthResponse = await fetch(`${CHATTERBOX_URL}/health`);
    if (!healthResponse.ok) {
      console.log('✗ Chatterbox server not responding');
      return false;
    }
    
    const testText = 'Test.';
    let receivedChunks = 0;
    
    await streamTTS(testText, '', voice, () => {
      receivedChunks++;
    });
    
    console.log(`✓ Chatterbox TTS works (received ${receivedChunks} chunks)`);
    return true;
  } catch (err) {
    console.log('✗ Chatterbox TTS failed:', err);
    return false;
  }
}
