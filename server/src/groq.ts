/**
 * Moltbot Voice Bridge - Groq Transcription
 * 
 * Transcribes audio using Groq's Whisper API
 */

import { request as httpsRequest } from 'node:https';
import type { GroqTranscriptionResponse } from './types.js';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

/**
 * Create multipart form data manually
 */
function createMultipartFormData(
  audioBuffer: Buffer,
  filename: string,
  contentType: string,
  model: string
): { boundary: string; body: Buffer } {
  const boundary = `----FormBoundary${Date.now()}`;
  
  const parts: Buffer[] = [];
  
  // File part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from('\r\n'));
  
  // Model part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `${model}\r\n`
  ));
  
  // Response format part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `json\r\n`
  ));
  
  // Language part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `en\r\n`
  ));
  
  // End boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  
  return {
    boundary,
    body: Buffer.concat(parts),
  };
}

/**
 * Make HTTPS request with Buffer body
 */
async function httpsPost(
  url: string,
  headers: Record<string, string>,
  body: Buffer
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const req = httpsRequest({
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': body.length.toString(),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Transcribe audio using Groq's Whisper API
 * 
 * @param audioBase64 - Base64 encoded audio data
 * @param apiKey - Groq API key
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBase64: string, 
  apiKey: string
): Promise<string> {
  // Convert base64 to buffer
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  
  // Create form data
  const { boundary, body } = createMultipartFormData(
    audioBuffer,
    'audio.webm',
    'audio/webm',
    GROQ_MODEL
  );

  // Make request
  const response = await httpsPost(GROQ_TRANSCRIPTION_URL, {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  }, body);

  if (response.status !== 200) {
    throw new Error(`Groq transcription failed (${response.status}): ${response.body}`);
  }

  const result = JSON.parse(response.body) as GroqTranscriptionResponse;
  return result.text || '';
}

/**
 * Test the Groq transcription API
 */
export async function testGroq(apiKey: string): Promise<boolean> {
  try {
    console.log('Testing Groq API connection...');
    
    // Create a minimal test request
    const silentOgg = Buffer.from([
      0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x01, 0x1e, 0x01, 0x76, 0x6f, 0x72,
    ]);
    
    const { boundary, body } = createMultipartFormData(
      silentOgg,
      'test.ogg',
      'audio/ogg',
      GROQ_MODEL
    );
    
    const response = await httpsPost(GROQ_TRANSCRIPTION_URL, {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }, body);
    
    // Even if the audio is invalid, a 400 means the API key works
    // A 401 would mean authentication failed
    if (response.status === 401) {
      console.log('✗ Groq API key is invalid');
      return false;
    }
    
    console.log(`✓ Groq API connected (status: ${response.status})`);
    return true;
  } catch (err) {
    console.log('✗ Groq API test failed:', err);
    return false;
  }
}
