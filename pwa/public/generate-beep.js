const fs = require('fs');

// Generate a 200ms 880Hz sine wave WAV file
const sampleRate = 44100;
const duration = 0.2; // seconds
const frequency = 880; // Hz
const numSamples = Math.floor(sampleRate * duration);

// WAV header
const buffer = Buffer.alloc(44 + numSamples * 2);

// RIFF header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write('WAVE', 8);

// fmt chunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // chunk size
buffer.writeUInt16LE(1, 20); // PCM format
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
buffer.writeUInt16LE(2, 32); // block align
buffer.writeUInt16LE(16, 34); // bits per sample

// data chunk
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 2, 40);

// Generate sine wave with fade in/out
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let amplitude = Math.sin(2 * Math.PI * frequency * t);
  
  // Fade in first 10%
  if (i < numSamples * 0.1) {
    amplitude *= i / (numSamples * 0.1);
  }
  // Fade out last 10%
  if (i > numSamples * 0.9) {
    amplitude *= (numSamples - i) / (numSamples * 0.1);
  }
  
  const sample = Math.floor(amplitude * 32767 * 0.5);
  buffer.writeInt16LE(sample, 44 + i * 2);
}

fs.writeFileSync('beep.wav', buffer);
console.log('Generated beep.wav');
console.log('Base64:', buffer.toString('base64').slice(0, 100) + '...');
