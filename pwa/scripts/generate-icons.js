#!/usr/bin/env node
/**
 * Generate simple ear icons for PWA
 * Run: node scripts/generate-icons.js
 */

import { writeFileSync } from 'fs';
import { createCanvas } from 'canvas';

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);
  
  // Ear emoji (centered)
  ctx.font = `${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👂', size / 2, size / 2);
  
  return canvas.toBuffer('image/png');
}

try {
  writeFileSync('public/ear-192.png', generateIcon(192));
  writeFileSync('public/ear-512.png', generateIcon(512));
  console.log('Icons generated successfully!');
} catch (err) {
  console.error('Failed to generate icons:', err.message);
  console.log('Falling back to placeholder...');
  
  // Create minimal placeholder PNGs (1x1 pixel)
  // This is a valid PNG but you should replace with proper icons
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xD7, 0x63, 0x18, 0x19, 0x18, 0x00,
    0x00, 0x01, 0x04, 0x00, 0x01, 0x42, 0xFD, 0x8C,
    0xF9, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  
  writeFileSync('public/ear-192.png', minimalPng);
  writeFileSync('public/ear-512.png', minimalPng);
  console.log('Placeholder icons created. Replace with proper icons for production.');
}
