# Moltbot Voice Bridge 🦞

A hands-free voice interface for Moltbot. Voice-activated PWA with automatic speech detection — just talk naturally. Shares context with your CLI session for seamless keyboard ↔ voice handoff.

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
| `ASSISTANT_NAME` | No | Assistant name shown in PWA (default: `Moltbot`) |
| `ASSISTANT_EMOJI` | No | Emoji shown in PWA (default: `🦞`) |

## Customization

The PWA fetches branding from the server's `/branding` endpoint on load. Customize via environment variables:

```bash
# In server/.env
ASSISTANT_NAME=MyBot
ASSISTANT_EMOJI=🤖
```

The PWA will display your custom name and emoji instead of the Moltbot defaults.

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

1. User speaks — VAD automatically detects speech start/end
2. Audio sent to proxy server via WebSocket
3. Server transcribes with Groq (Whisper)
4. Transcript sent to Moltbot Gateway (same session as CLI)
5. Response streamed back with TTS audio
6. PWA plays audio response

### Location Awareness

The PWA requests location permission on session start. When granted, your coordinates are included with each voice message:

```
[Location: 45.5515, -122.6732] Find me a coffee shop nearby
```

Your assistant can use this to answer questions about nearby places, give directions, or provide location-relevant information.

### TTS Mode Prefix

Voice messages are prefixed to indicate TTS state:
- **🎤** = TTS enabled
- **📖** = TTS disabled

To configure your assistant, send this message to your Moltbot:

> Add a "Voice Interface" section to TOOLS.md explaining that voice messages arrive prefixed with 🎤 (TTS on — be concise, 1-3 sentences, no markdown, skip pleasantries) or 📖 (TTS off — full response OK, user is reading).

## Deployment

### PWA (Frontend)

**GitHub Pages** (easiest):
```bash
# Fork the repo, enable GitHub Pages on main branch
# PWA auto-deploys via GitHub Actions
```

**Self-hosted**: Serve the `pwa/dist/` folder from any static host (Netlify, Vercel, Cloudflare Pages, etc.)

### Proxy Server (Backend)

The proxy must be accessible from wherever you use the PWA.

**Local + Tunnel** (recommended for personal use):
```bash
cd server && npm start
cloudflared tunnel --url http://localhost:3001
```

**Auto-start on boot** (Linux/systemd):
```bash
# Create service file
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

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable moltbot-voice-bridge
sudo systemctl start moltbot-voice-bridge
```

**VPS/Cloud**: Run the server on any Node.js host. Set `VITE_PROXY_URL` when building the PWA to point to your server.

**Same machine**: If PWA and proxy run on the same host, the default `ws://localhost:3001/ws` works.

## License

MIT
