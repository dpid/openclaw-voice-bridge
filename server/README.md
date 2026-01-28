# The Ear - Proxy Server

Voice PWA proxy server that bridges the PWA client to Moltbot Gateway, Groq transcription, and TTS (ElevenLabs or Chatterbox).

## Architecture

```
┌─────────────────┐        ┌─────────────────────────────────────┐
│                 │   WS   │           Proxy Server              │
│   PWA Client    │◄──────►│  ┌─────────┐ ┌─────────┐ ┌───────┐  │
│  (browser/iOS)  │  /ws   │  │  Groq   │ │ Gateway │ │  TTS  │  │
│                 │        │  │ (STT)   │ │ (chat)  │ │       │  │
└─────────────────┘        │  └─────────┘ └─────────┘ └───────┘  │
                           └─────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Create .env file
cat > .env << 'EOF'
EAR_AUTH_TOKEN=your-secret-token
SESSION_KEY=agent:main:main
# Optional: Use local Chatterbox instead of ElevenLabs
# CHATTERBOX_URL=http://localhost:8880
EOF

# Test all components
npm run test:all

# Start server
npm start
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EAR_AUTH_TOKEN` | Yes | Auth token for PWA connections |
| `SESSION_KEY` | No | Moltbot session key (default: `agent:main:main`) |
| `PORT` | No | Server port (default: `3001`) |
| `GROQ_API_KEY` | No | Override Groq key (otherwise from moltbot.json) |
| `CHATTERBOX_URL` | No | Local Chatterbox TTS URL (e.g., `http://localhost:8880`) |

### Moltbot Config

The server reads additional configuration from `~/.moltbot/moltbot.json`:

| Setting | Path in moltbot.json |
|---------|----------------------|
| Groq API Key | `env.vars.GROQ_API_KEY` |
| Gateway Token | `gateway.auth.token` |
| Gateway Port | `gateway.port` (default: 18789) |
| ElevenLabs Key | `messages.tts.elevenlabs.apiKey` |
| Voice ID | `messages.tts.elevenlabs.voiceId` |

## TTS Providers

### ElevenLabs (default)

Uses ElevenLabs API configured in `~/.moltbot/moltbot.json`. Streams audio chunks for low-latency playback.

### Chatterbox (local)

Set `CHATTERBOX_URL` to use a local Chatterbox server instead:

```bash
CHATTERBOX_URL=http://localhost:8880 npm start
```

Chatterbox returns full audio (no streaming), but it's free and runs locally.

## Endpoints

### WebSocket `/ws`

Main communication channel for the PWA. Requires auth token in query string: `/ws?token=<EAR_AUTH_TOKEN>`

#### Client → Server

```typescript
// Send recorded audio
{ type: 'audio', data: string }  // base64 audio

// Toggle TTS mode
{ type: 'tts', enabled: boolean }

// Check connection
{ type: 'ping' }
```

#### Server → Client

```typescript
// Transcription result
{ type: 'transcript', text: string }

// AI response text
{ type: 'response', text: string }

// TTS audio chunk (streaming)
{ type: 'audio', data: string }  // base64 mp3/wav

// End of audio stream
{ type: 'audio_end' }

// Processing state
{ type: 'status', state: 'transcribing' | 'thinking' | 'speaking' }

// Error occurred
{ type: 'error', message: string }

// Ping response
{ type: 'pong' }
```

### HTTP `/health`

Health check endpoint.

```bash
curl http://localhost:3001/health
# {"status":"ok","gateway":true}
```

## Testing

```bash
# Test individual components
npm run test:groq    # Test Groq transcription API
npm run test:gateway # Test Gateway connection
npm run test:tts     # Test ElevenLabs TTS

# Test all at once
npm run test:all
```

## Development

```bash
# Watch mode (auto-rebuild + restart)
npm run dev
```

## Pipeline Flow

1. **Client sends audio** → Base64 encoded audio blob
2. **Groq transcribes** → Text transcript  
3. **Send transcript to client** → For UI display
4. **Gateway processes** → Chat with Claude (5 minute timeout for complex tasks)
5. **Keepalive pings** → Sent every 15s during long waits
6. **Send response to client** → For UI display
7. **TTS generation** → ElevenLabs (streaming) or Chatterbox (full)
8. **Stream audio chunks** → Client plays in real-time
9. **Send audio_end** → Client resumes listening

## Session

Default session key: `agent:main:main`

This shares context with the Moltbot CLI, enabling seamless keyboard ↔ voice handoff. Override with `SESSION_KEY` env var.

## Files

```
server/
├── src/
│   ├── index.ts          # Main server + WebSocket handler
│   ├── config.ts         # Configuration loader
│   ├── types.ts          # TypeScript types
│   ├── groq.ts           # Groq Whisper transcription
│   ├── gateway.ts        # Moltbot Gateway WebSocket client
│   ├── tts.ts            # ElevenLabs TTS (streaming)
│   ├── tts-chatterbox.ts # Chatterbox TTS (local)
│   └── test-*.ts         # Test scripts
├── .env                  # Environment variables (create this)
├── package.json
├── tsconfig.json
└── README.md
```

## TTS Mode Prefix

Voice messages are prefixed to indicate TTS state:
- **🎤** = TTS enabled → Claude responds concisely (saves credits)
- **📖** = TTS disabled → Full response OK (user is reading)

## Required Moltbot Config

For the proxy to receive text (not just TTS audio), disable gateway TTS:

```json
"messages": {
  "tts": {
    "auto": "never"
  }
}
```

The proxy generates its own TTS, ensuring text and audio always match.
