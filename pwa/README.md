# Moltbot Voice Bridge - Voice PWA

A voice-first Progressive Web App for hands-free conversation with your Moltbot assistant.

## Features

- **Voice Activity Detection (VAD)** — Automatically detects when you start/stop speaking
- **No Push-to-Talk Required** — Just speak naturally, the app handles the rest
- **Real-time Transcription** — See what you said
- **Voice Responses** — TTS audio playback (toggleable)
- **Chat History** — Scrollable transcript with Markdown rendering
- **Mute Controls** — "Mute Me" (stops sending) and "Mute You" (stops TTS)
- **Location Awareness** — Share location for "nearby" queries
- **PWA Support** — Install on your home screen
- **Wake Lock** — Keeps screen on during sessions
- **XSS Protection** — All markdown sanitized with DOMPurify

## Requirements

- **Proxy Server** — The backend proxy must be running (default: `localhost:3001`)
- **Modern Browser** — Chrome, Safari, Firefox with WebRTC support
- **Microphone** — Permission will be requested on first use
- **Auth Token** — You'll be prompted to enter your `EAR_AUTH_TOKEN` on first use

## Development

### Install dependencies

```bash
npm install
```

### Run development server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Configuration

Set the proxy URL via environment variable when building:

```bash
VITE_PROXY_URL=wss://your-proxy.example.com/ws npm run build
```

If not set, defaults to `ws://localhost:3001/ws` for local development.

## Testing

1. **Start the proxy server** (from `server/` directory):
   ```bash
   npm run dev
   ```

2. **Start the PWA dev server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**: http://localhost:5173

4. **Enter auth token** when prompted (same as `EAR_AUTH_TOKEN` on server)

5. **Grant microphone permission** when prompted

6. **Grant location permission** (optional, for nearby queries)

7. **Tap "Start Session"** to begin

8. **Speak** — The app will automatically detect your voice via VAD

9. **Wait for response** — Audio plays automatically (if TTS enabled)

## UI States

| State | Description | Visual |
|-------|-------------|--------|
| Idle | Before session starts | Static icon, "Tap to Start" |
| Listening | VAD active, waiting for speech | Pulsing animation |
| Recording | Speech detected, capturing | Bouncing animation |
| Processing | Transcribing/thinking | Spinning animation |
| Speaking | Playing TTS response | Wave animation |
| Error | Something went wrong | Shake animation, red bg |

## WebSocket Protocol

The PWA connects to the proxy server and uses this protocol:

### Client → Server

```typescript
{ type: 'auth', token: string }              // authenticate first
{ type: 'audio', data: string, location?: Location }  // base64 WAV audio
{ type: 'tts_state', enabled: boolean }      // toggle TTS mode
{ type: 'ping' }                             // keepalive
```

### Server → Client

```typescript
{ type: 'transcript', text: string }           // what user said
{ type: 'response', text: string }             // assistant's reply
{ type: 'audio', data: string }                // TTS chunk (base64)
{ type: 'audio_end' }                          // end of TTS
{ type: 'status', state: string }              // processing state
{ type: 'error', message: string }             // error
{ type: 'pong' }                               // keepalive response
```

## PWA Installation

### iOS Safari

1. Open the app in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"

### Android Chrome

1. Open the app in Chrome
2. Tap the menu (⋮)
3. Tap "Add to Home Screen" or "Install App"

## Architecture

```
┌─────────────────────────────────────────┐
│              PWA (Svelte)               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │   VAD   │→ │ Capture │→ │WebSocket│  │
│  └─────────┘  └─────────┘  └────┬────┘  │
│       ↑                         │       │
│  ┌────┴────┐                    │       │
│  │ Playback│←───────────────────┘       │
│  └─────────┘                            │
└─────────────────────────────────────────┘
              │ WebSocket
              ▼
┌─────────────────────────────────────────┐
│         Proxy Server (Node.js)          │
│  Groq → Moltbot Gateway → TTS           │
└─────────────────────────────────────────┘
```

## Tech Stack

- **Svelte 5** — Reactive UI framework
- **Vite** — Build tool
- **vite-plugin-pwa** — PWA manifest & service worker
- **@ricky0123/vad-web** — Voice Activity Detection (Silero via ONNX)
- **onnxruntime-web** — ONNX model runtime
- **marked** — Markdown rendering for chat messages
- **DOMPurify** — XSS protection for rendered HTML

## Project Structure

```
pwa/
├── src/
│   ├── App.svelte        # Main application component
│   ├── main.ts           # Entry point
│   ├── app.css           # Global styles
│   └── lib/
│       ├── audio.ts      # Audio playback (Web Audio API)
│       ├── vad.ts        # Voice Activity Detection
│       ├── websocket.ts  # WebSocket client
│       ├── wakelock.ts   # Screen wake lock
│       ├── stores.ts     # Svelte stores
│       └── types.ts      # TypeScript types
├── public/
│   ├── icon-192.png      # PWA icon (small)
│   ├── icon-512.png      # PWA icon (large)
│   └── icon-maskable-512.png  # Android adaptive icon
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── package.json
└── README.md
```

## Icons

Placeholder icons are included. To customize:

1. Replace `public/icon-192.png` and `public/icon-512.png` with your own
2. Optionally replace `public/icon-maskable-512.png` for Android adaptive icons
3. Rebuild the PWA

## Troubleshooting

### "Microphone permission denied"
- Check browser settings for microphone access
- Ensure HTTPS or localhost (mic requires secure context)

### "WebSocket disconnected"
- Ensure proxy server is running
- Check auth token is correct
- Check for CORS issues if not on localhost

### "Rate limit exceeded"
- Wait 1 minute before trying again
- The server limits to 20 requests/minute per connection

### VAD not detecting speech
- Check microphone is working
- Speak louder/closer to mic
- Check browser console for VAD initialization errors

### No audio playback
- Check device volume
- Check "Mute You" isn't enabled
- Some browsers require user interaction before audio playback
- Try tapping the screen after a response comes in

### Long response times
- Complex queries may take up to 5 minutes (depending on model and task complexity)
- The server sends keepalive pings to prevent timeout
- Check the "thinking" status indicator

### Location not working
- Grant location permission when prompted
- Check browser settings for location access
- Ensure HTTPS or localhost (location requires secure context)
