# The Ear - Voice PWA

A voice-first Progressive Web App for hands-free conversation with Vincent.

## Features

- **Voice Activity Detection (VAD)** - Automatically detects when you start/stop speaking
- **No Push-to-Talk** - Just speak naturally, the app handles the rest
- **Real-time Transcription** - See what you said
- **Voice Responses** - Vincent responds with TTS audio
- **PWA Support** - Install on your home screen
- **Wake Lock** - Keeps screen on during sessions

## Requirements

- **Proxy Server** - The backend proxy must be running on `localhost:3001`
- **Modern Browser** - Chrome, Safari, Firefox with WebRTC support
- **Microphone** - Permission will be requested on first use

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

## Testing

1. **Start the proxy server** (from `~/Projects/the-ear/server`):
   ```bash
   npm run dev
   ```

2. **Start the PWA dev server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**: http://localhost:5173

4. **Grant microphone permission** when prompted

5. **Tap "Start Session"** to begin

6. **Speak** - The app will automatically detect your voice

7. **Wait for response** - Vincent will reply via TTS

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

The PWA connects to `ws://localhost:3001/ws` and uses this protocol:

### Client → Server

```typescript
{ type: 'audio', data: string }  // base64 WAV audio
{ type: 'ping' }                 // keepalive
```

### Server → Client

```typescript
{ type: 'transcript', text: string }           // what user said
{ type: 'response', text: string }             // Vincent's reply
{ type: 'audio', data: string }                // TTS chunk (base64 mp3)
{ type: 'audio_end' }                          // end of TTS
{ type: 'status', state: string }              // processing state
{ type: 'error', message: string }             // error
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
│  Groq → Gateway → ElevenLabs            │
└─────────────────────────────────────────┘
```

## Tech Stack

- **Svelte 5** - Reactive UI framework
- **Vite** - Build tool
- **vite-plugin-pwa** - PWA manifest & service worker
- **@ricky0123/vad-web** - Voice Activity Detection (Silero via ONNX)
- **onnxruntime-web** - ONNX model runtime

## Icons

Placeholder icons are included. To generate proper icons:

1. Open `public/generate-icons.html` in a browser
2. Download the generated PNG files
3. Replace `public/ear-192.png` and `public/ear-512.png`

## Troubleshooting

### "Microphone permission denied"
- Check browser settings for microphone access
- Ensure HTTPS or localhost (mic requires secure context)

### "WebSocket disconnected"
- Ensure proxy server is running on port 3001
- Check for CORS issues if not on localhost

### VAD not detecting speech
- Check microphone is working
- Speak louder/closer to mic
- Check browser console for VAD initialization errors

### No audio playback
- Check device volume
- Some browsers require user interaction before audio playback
- Try tapping the screen after a response comes in
