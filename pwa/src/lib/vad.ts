/**
 * Moltbot Voice Bridge - Voice Activity Detection
 * Uses @ricky0123/vad-web (Silero VAD via ONNX) for speech detection
 * Loaded from CDN via script tags to bypass bundler issues
 */

// Use global vad object loaded from CDN
declare global {
  interface Window {
    vad: {
      MicVAD: {
        new: (options: any) => Promise<any>;
      };
    };
    ort: any;
  }
}

const getMicVAD = () => window.vad?.MicVAD;

export interface VADOptions {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
}

export class VoiceActivityDetector {
  private vad: MicVAD | null = null;
  private options: VADOptions;
  private isRunning = false;

  constructor(options: VADOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[VAD] Already running');
      return;
    }

    console.log('[VAD] Starting...');

    try {
      // Get base path for assets (handles GitHub Pages subdirectory)
      const basePath = import.meta.env.BASE_URL || '/';
      
      const MicVAD = getMicVAD();
      if (!MicVAD) {
        throw new Error('VAD library not loaded. Make sure CDN scripts are loaded.');
      }
      
      // Configure ONNX runtime for Safari before VAD init
      if (window.ort) {
        console.log('[VAD] Configuring ONNX runtime...');
        window.ort.env.wasm.numThreads = 1;
      }
      
      this.vad = await MicVAD.new({
        // Speech detection callbacks
        onSpeechStart: () => {
          console.log('[VAD] Speech started');
          this.options.onSpeechStart();
        },
        onSpeechEnd: (audio: Float32Array) => {
          console.log('[VAD] Speech ended, samples:', audio.length);
          this.options.onSpeechEnd(audio);
        },
        // Model options
        positiveSpeechThreshold: 0.7,   // Slightly more sensitive to start
        negativeSpeechThreshold: 0.4,   // More lenient to keep going
        redemptionFrames: 24,           // ~2.3 seconds pause tolerance (was 768ms)
        minSpeechFrames: 3,
        preSpeechPadFrames: 10,         // Capture more lead-in audio
      });

      this.vad.start();
      this.isRunning = true;
      console.log('[VAD] Started successfully');
    } catch (err) {
      console.error('[VAD] Failed to start:', err);
      throw err;
    }
  }

  pause(): void {
    if (this.vad && this.isRunning) {
      this.vad.pause();
      console.log('[VAD] Paused');
    }
  }

  resume(): void {
    if (this.vad && this.isRunning) {
      this.vad.start();
      console.log('[VAD] Resumed');
    }
  }

  stop(): void {
    if (this.vad) {
      this.vad.pause();
      this.vad.destroy();
      this.vad = null;
      this.isRunning = false;
      console.log('[VAD] Stopped');
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Convert Float32Array audio samples to WAV format (base64)
 * The VAD returns raw PCM samples at 16kHz
 */
export function audioToWav(samples: Float32Array, sampleRate = 16000): string {
  // Convert Float32 to Int16
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // WAV header
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const byteLength = int16.length * 2;

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, byteLength, true);

  // Combine header and data
  const wav = new Uint8Array(44 + byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(new Uint8Array(int16.buffer), 44);

  // Convert to base64
  let binary = '';
  for (let i = 0; i < wav.length; i++) {
    binary += String.fromCharCode(wav[i]);
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
