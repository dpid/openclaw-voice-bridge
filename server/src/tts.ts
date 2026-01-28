/**
 * Moltbot Voice Bridge - ElevenLabs TTS
 * 
 * Text-to-speech using ElevenLabs streaming API
 */

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface TTSChunkCallback {
  (chunk: Buffer): void;
}

/**
 * Stream text-to-speech from ElevenLabs
 * 
 * @param text - Text to convert to speech
 * @param apiKey - ElevenLabs API key
 * @param voiceId - ElevenLabs voice ID
 * @param onChunk - Callback for each audio chunk
 */
export async function streamTTS(
  text: string,
  apiKey: string,
  voiceId: string,
  onChunk: TTSChunkCallback
): Promise<void> {
  const url = `${ELEVENLABS_TTS_URL}/${voiceId}/stream`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body from ElevenLabs');
  }

  // Stream the audio chunks
  const reader = response.body.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    if (value) {
      onChunk(Buffer.from(value));
    }
  }
}

/**
 * Generate TTS and return full audio buffer (non-streaming)
 */
export async function generateTTS(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  
  await streamTTS(text, apiKey, voiceId, (chunk) => {
    chunks.push(chunk);
  });
  
  return Buffer.concat(chunks);
}

/**
 * Test ElevenLabs TTS API
 */
export async function testTTS(apiKey: string, voiceId: string): Promise<boolean> {
  try {
    console.log('Testing ElevenLabs TTS...');
    
    const testText = 'Test.';
    let receivedChunks = 0;
    
    await streamTTS(testText, apiKey, voiceId, () => {
      receivedChunks++;
    });
    
    console.log(`✓ ElevenLabs TTS works (received ${receivedChunks} chunks)`);
    return true;
  } catch (err) {
    console.log('✗ ElevenLabs TTS failed:', err);
    return false;
  }
}
