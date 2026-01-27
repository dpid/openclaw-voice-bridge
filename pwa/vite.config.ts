import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Base path for GitHub Pages - uses repo name
  base: process.env.GITHUB_ACTIONS ? '/the-ear/' : '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'ear-192.png', 'ear-512.png'],
      manifest: {
        name: 'The Ear',
        short_name: 'The Ear',
        description: 'Voice-first conversation with Vincent',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: process.env.GITHUB_ACTIONS ? '/the-ear/' : '/',
        start_url: process.env.GITHUB_ACTIONS ? '/the-ear/' : '/',
        icons: [
          {
            src: 'ear-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'ear-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'ear-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,onnx}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // 30MB for ONNX/WASM files
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['localhost', '.ngrok-free.dev', '.trycloudflare.com'],
  },
});
