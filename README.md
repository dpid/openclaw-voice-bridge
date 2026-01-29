# Moltbot Voice Bridge

A hands-free voice interface for Moltbot. Voice-activated PWA with automatic speech detection — just talk naturally. Shares context with your CLI session for seamless keyboard ↔ voice handoff.

Fully customizable branding via environment variables — name it after your own assistant.

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐     WebSocket     ┌─────────────────┐
│   PWA (Svelte)  │ ←───────────────→  │  Proxy Server   │ ←───────────────→ │ Moltbot Gateway │
│  Voice capture  │                    │  Groq + TTS     │                   │    AI session   │
└─────────────────┘                    └─────────────────┘                   └─────────────────┘
```

- **PWA**: Captures audio with Voice Activity Detection, plays TTS responses
- **Proxy Server**: Transcribes audio (Groq), routes to Gateway, streams TTS back
- **Shared Session**: Uses `agent:main:main` by default — same context as CLI
- **Location Aware**: Optionally shares your location so you can ask about nearby places

## Features

- ✅ Voice Activity Detection (no push-to-talk)
- ✅ Automatic speech transcription (Groq Whisper)
- ✅ Real-time TTS responses (ElevenLabs or local Chatterbox)
- ✅ Shared session with CLI (seamless keyboard ↔ voice)
- ✅ Location-aware queries ("find me a coffee shop nearby")
- ✅ Multi-device support (phone + laptop simultaneously)
- ✅ XSS protection (DOMPurify)
- ✅ Rate limiting (20 req/min per connection)
- ✅ Request ID tracking for debugging

## Setup

### Prerequisites

- Node.js 20+
- Running Moltbot Gateway
- Groq API key (for Whisper transcription)
- ElevenLabs API key (for TTS) — or local Chatterbox server

### Server

```bash
cd server
npm install
npm run build

# Create .env file
cat > .env << 'EOF'
MVB_AUTH_TOKEN=your-secret-token
SESSION_KEY=agent:main:main
# Optional: Allowed origins for CORS (comma-separated)
# ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:5173
# Optional: Use local Chatterbox instead of ElevenLabs
# CHATTERBOX_URL=http://localhost:8880
EOF

npm start
```

The server reads additional config from `~/.moltbot/moltbot.json`:
- `gateway.port` and `gateway.auth.token`
- `messages.tts.elevenlabs.apiKey` and `voiceId`
- `env.vars.GROQ_API_KEY`

### PWA

```bash
cd pwa
npm install
npm run dev      # Development
npm run build    # Production (outputs to dist/)
```

### Tunnel (for mobile access)

```bash
cloudflared tunnel --url http://localhost:3001
```

Or set up a persistent tunnel pointing to `localhost:3001`.

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MVB_AUTH_TOKEN` | Yes | Auth token for PWA connections |
| `SESSION_KEY` | No | Moltbot session key (default: `agent:main:main`) |
| `PORT` | No | Server port (default: `3001`) |
| `GROQ_API_KEY` | No | Override Groq key (otherwise from moltbot.json) |
| `CHATTERBOX_URL` | No | Local Chatterbox server URL (e.g., `http://localhost:8880`) |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) |
| `ASSISTANT_NAME` | No | Assistant name shown in responses (default: `Moltbot`) |
| `ASSISTANT_EMOJI` | No | Emoji shown in responses (default: `🦞`) |

### PWA (`pwa/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_PROXY_URL` | Yes | WebSocket URL for proxy server |
| `VITE_BOT_NAME` | No | Bot name in UI and PWA manifest (default: `Moltbot`) |
| `VITE_BOT_EMOJI` | No | Bot emoji in UI (default: `🦞`) |
| `VITE_BOT_DESCRIPTION` | No | Description in UI/manifest (default: `Hands-free voice interface for Moltbot`) |

## Testing

```bash
cd server

# Unit tests (Vitest)
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage

# Integration tests
npm run test:groq     # Test Whisper transcription
npm run test:gateway  # Test Gateway connection
npm run test:tts      # Test ElevenLabs TTS
npm run test:all      # Run all integration tests
```

## Security

The proxy server includes several security features:

- **Authentication**: Token required for WebSocket connections
- **Rate Limiting**: 20 requests/minute per connection
- **Input Validation**: Audio size limits, format validation
- **CORS Restrictions**: Configurable allowed origins
- **XSS Protection**: DOMPurify sanitizes all markdown
- **Error Sanitization**: Internal errors not leaked to client
- **Multi-Device Isolation**: Per-connection response routing

## TTS Providers

### ElevenLabs (default)

Configured via `~/.moltbot/moltbot.json`:

```json
{
  "messages": {
    "tts": {
      "elevenlabs": {
        "apiKey": "your-api-key",
        "voiceId": "voice-id"
      }
    }
  }
}
```

### Chatterbox (local, free)

Set `CHATTERBOX_URL` environment variable to use a local Chatterbox server instead:

```bash
CHATTERBOX_URL=http://localhost:8880 npm start
```

## How It Works

1. User speaks — VAD automatically detects speech start/end
2. Audio sent to proxy server via WebSocket
3. Server transcribes with Groq (Whisper)
4. Hallucination filter removes noise/junk transcriptions
5. Transcript sent to Moltbot Gateway (same session as CLI)
6. Response streamed back with TTS audio
7. PWA plays audio response

### Location Awareness

The PWA requests location permission on session start. When granted, your coordinates are included with each voice message:

```
[Location: 45.5515, -122.6732] Find me a coffee shop nearby
```

Your assistant can use this to answer questions about nearby places, give directions, or provide location-relevant information.

### TTS Mode Prefix

Voice messages are prefixed to indicate TTS state:
- **🎤** = TTS enabled (be concise)
- **📖** = TTS disabled (full response OK)

## Deployment

### PWA (Frontend)

Build and serve the `pwa/dist/` folder from any static host:

```bash
cd pwa
npm run build
# Serve dist/ via nginx, Cloudflare Pages, Netlify, Vercel, or a simple static server
```

**GitHub Pages**: Build locally with your `.env` vars, then deploy the `dist/` folder to GitHub Pages (or add your own CI workflow).

**Cloudflare Tunnel**: A simple Python server works:
```bash
python3 -m http.server 3002 -d dist
```

### Proxy Server (Backend)

The proxy must be accessible from wherever you use the PWA.

**Local + Tunnel** (recommended for personal use):
```bash
cd server && npm start
cloudflared tunnel --url http://localhost:3001
```

**Auto-start on boot** (Linux/systemd):
```bash
sudo tee /etc/systemd/system/moltbot-voice-bridge.service << EOF
[Unit]
Description=Moltbot Voice Bridge Proxy Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/server
ExecStart=$(which node) --env-file=.env dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable moltbot-voice-bridge
sudo systemctl start moltbot-voice-bridge
```

## Project Structure

```
moltbot-voice-bridge/
├── pwa/                  # Svelte PWA frontend
│   ├── src/
│   │   ├── App.svelte    # Main application
│   │   └── lib/          # Audio, VAD, WebSocket utilities
│   └── public/           # PWA assets
├── server/               # Node.js proxy server
│   ├── src/
│   │   ├── index.ts      # Main server + WebSocket
│   │   ├── config.ts     # Configuration loader
│   │   ├── env.ts        # Environment variables
│   │   ├── filters.ts    # Hallucination detection
│   │   ├── groq.ts       # Whisper transcription
│   │   ├── gateway.ts    # Moltbot Gateway client
│   │   ├── tts.ts        # ElevenLabs TTS
│   │   ├── tts-chatterbox.ts  # Local Chatterbox TTS
│   │   ├── tts-provider.ts    # TTS provider interface
│   │   └── *.test.ts     # Unit tests
│   └── vitest.config.ts  # Test configuration
└── README.md             # This file
```

## License

MIT
