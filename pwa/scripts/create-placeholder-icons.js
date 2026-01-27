#!/usr/bin/env node
/**
 * Create placeholder PWA icons
 * These are minimal valid PNGs - replace with proper icons for production
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(width, height, r, g, b) {
  // Create raw pixel data (RGBA)
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte for each row
    for (let x = 0; x < width; x++) {
      rawData.push(r, g, b, 255); // RGBA
    }
  }
  
  const imageData = Buffer.from(rawData);
  const compressed = deflateSync(imageData);
  
  // PNG chunks
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // Length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16); // Bit depth
  ihdr.writeUInt8(6, 17); // Color type (RGBA)
  ihdr.writeUInt8(0, 18); // Compression
  ihdr.writeUInt8(0, 19); // Filter
  ihdr.writeUInt8(0, 20); // Interlace
  ihdr.writeUInt32BE(crc32(ihdr.slice(4, 21)), 21);
  
  // IDAT
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length);
  const idatType = Buffer.from('IDAT');
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(Buffer.concat([idatType, compressed])));
  
  // IEND
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
  
  return Buffer.concat([signature, ihdr, idatLen, idatType, compressed, idatCrc, iend]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Create dark themed icons (#1a1a2e = rgb(26, 26, 46))
try {
  writeFileSync('public/ear-192.png', createPNG(192, 192, 26, 26, 46));
  writeFileSync('public/ear-512.png', createPNG(512, 512, 26, 26, 46));
  console.log('✓ Placeholder icons created in public/');
  console.log('  - ear-192.png (192x192)');
  console.log('  - ear-512.png (512x512)');
  console.log('\nNote: Replace with proper ear icons for production!');
} catch (err) {
  console.error('Failed:', err);
}
