import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const botName = env.VITE_BOT_NAME || 'Moltbot';
  const botDescription = env.VITE_BOT_DESCRIPTION || 'Hands-free voice interface for Moltbot';
  
  return {
  base: '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: `${botName} Voice Bridge`,
        short_name: `${botName} Voice Bridge`,
        description: botDescription,
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-maskable-512.png',
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
}});
