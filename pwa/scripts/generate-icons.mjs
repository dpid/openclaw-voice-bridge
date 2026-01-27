#!/usr/bin/env node
/**
 * Generate PWA icons using Canvas
 * Run: node scripts/generate-icons.mjs
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);

  // Ear emoji
  ctx.font = `${size * 0.6}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👂', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

// Generate icons
console.log('Generating PWA icons...');

writeFileSync(join(publicDir, 'ear-192.png'), generateIcon(192));
console.log('Created ear-192.png');

writeFileSync(join(publicDir, 'ear-512.png'), generateIcon(512));
console.log('Created ear-512.png');

console.log('Done!');
