# The Ear 👂

A hands-free voice interface for Moltbot. Push-to-talk PWA that shares context with your CLI session — seamless keyboard ↔ voice handoff.

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐     WebSocket     ┌─────────────────┐
│   PWA (Svelte)  │ ←───────────────→  │  Proxy Server   │ ←───────────────→ │ Moltbot Gateway │
│  Voice capture  │                    │  Groq + TTS     │                   │  Claude session │
└─────────────────┘                    └─────────────────┘                   └─────────────────┘
```

- **PWA**: Captures audio via push-to-talk, plays TTS responses
- **Proxy Server**: Transcribes audio (Groq), routes to Gateway, streams TTS back
- **Shared Session**: Uses `agent:main:main` by default — same context as CLI

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
EAR_AUTH_TOKEN=your-secret-token
SESSION_KEY=agent:main:main
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

| Variable | Required | Description |
|----------|----------|-------------|
| `EAR_AUTH_TOKEN` | Yes | Auth token for PWA connections |
| `SESSION_KEY` | No | Moltbot session key (default: `agent:main:main`) |
| `PORT` | No | Server port (default: `3001`) |
| `GROQ_API_KEY` | No | Override Groq key (otherwise from moltbot.json) |
| `CHATTERBOX_URL` | No | Local Chatterbox server URL (e.g., `http://localhost:8880`) |

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

## Testing

```bash
cd server
npm run test:groq      # Test Whisper transcription
npm run test:gateway   # Test Gateway connection
npm run test:tts       # Test ElevenLabs TTS
npm run test:all       # Run all tests
```

## How It Works

1. User holds push-to-talk button, speaks
2. Audio sent to proxy server via WebSocket
3. Server transcribes with Groq (Whisper)
4. Transcript sent to Moltbot Gateway (same session as CLI)
5. Response streamed back with TTS audio
6. PWA plays audio response

### TTS Mode Prefix

Voice messages are prefixed to indicate TTS state:
- **🎤** = TTS enabled → Claude responds concisely (saves ElevenLabs credits)
- **📖** = TTS disabled → Full response OK (user is reading)

## Deployment

The PWA is deployed to GitHub Pages at https://dpid.github.io/the-ear/

The proxy server runs locally and is exposed via cloudflared tunnel.

## License

MIT
