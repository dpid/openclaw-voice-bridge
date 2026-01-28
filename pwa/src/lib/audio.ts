/**
 * Moltbot Voice Bridge - Audio Playback
 * Uses Web Audio API with a shared AudioContext for Safari compatibility
 */

// Shared AudioContext - must be unlocked by user gesture
let audioContext: AudioContext | null = null;

/**
 * Get or create the shared AudioContext
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log('[Audio] Created AudioContext, state:', audioContext.state);
  }
  return audioContext;
}

/**
 * Unlock the AudioContext (call from user gesture like button click)
 */
export async function unlockAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  
  if (ctx.state === 'suspended') {
    await ctx.resume();
    console.log('[Audio] AudioContext resumed, state:', ctx.state);
  }
  
  // Also play a tiny silent buffer to fully unlock on iOS Safari
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  
  console.log('[Audio] AudioContext unlocked');
}

export class AudioPlayer {
  private chunks: string[] = [];
  private currentSource: AudioBufferSourceNode | null = null;
  private onPlaybackEnd: (() => void) | null = null;

  constructor(onPlaybackEnd: () => void) {
    this.onPlaybackEnd = onPlaybackEnd;
  }

  /**
   * Add a base64 audio chunk to the buffer
   */
  addChunk(base64: string): void {
    this.chunks.push(base64);
  }

  /**
   * Play all collected audio chunks using Web Audio API
   */
  async play(): Promise<void> {
    if (this.chunks.length === 0) {
      console.log('[Audio] No chunks to play');
      this.onPlaybackEnd?.();
      return;
    }

    console.log(`[Audio] Playing ${this.chunks.length} chunks`);

    try {
      const ctx = getAudioContext();
      
      // Make sure context is running
      if (ctx.state === 'suspended') {
        console.log('[Audio] Context suspended, attempting resume...');
        await ctx.resume();
      }
      
      console.log('[Audio] Context state:', ctx.state);

      // Decode all base64 chunks and combine
      const binaryChunks = this.chunks.map(chunk => {
        const binary = atob(chunk);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      });

      // Calculate total length
      const totalLength = binaryChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[Audio] Total audio size: ${totalLength} bytes`);
      
      // Combine into single buffer
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of binaryChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Decode the MP3 data to audio buffer
      console.log('[Audio] Decoding audio data...');
      const audioBuffer = await ctx.decodeAudioData(combined.buffer);
      console.log(`[Audio] Decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels}ch`);

      // Create and play source
      this.currentSource = ctx.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(ctx.destination);
      
      this.currentSource.onended = () => {
        console.log('[Audio] Playback ended');
        this.currentSource = null;
        this.onPlaybackEnd?.();
      };

      this.currentSource.start(0);
      console.log('[Audio] Playback started');
      
    } catch (err) {
      console.error('[Audio] Failed to play:', err);
      this.onPlaybackEnd?.();
    } finally {
      // Clear chunks for next round
      this.chunks = [];
    }
  }

  /**
   * Stop playback if playing
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore - might already be stopped
      }
      this.currentSource = null;
    }
    this.chunks = [];
  }

  /**
   * Clear buffered chunks without playing
   */
  clear(): void {
    this.chunks = [];
  }
}
