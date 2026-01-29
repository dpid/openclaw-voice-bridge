# Moltbot Voice Bridge - Proxy Server

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
MVB_AUTH_TOKEN=your-secret-token
SESSION_KEY=agent:main:main
# Optional: CORS allowed origins (comma-separated)
# ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:5173
# Optional: Use local Chatterbox instead of ElevenLabs
# CHATTERBOX_URL=http://localhost:8880
EOF

# Run unit tests
npm test

# Test all integrations
npm run test:all

# Start server
npm start
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MVB_AUTH_TOKEN` | Yes | Auth token for PWA connections |
| `SESSION_KEY` | No | Moltbot session key (default: `agent:main:main`) |
| `PORT` | No | Server port (default: `3001`) |
| `GROQ_API_KEY` | No | Override Groq key (otherwise from moltbot.json) |
| `CHATTERBOX_URL` | No | Local Chatterbox TTS URL (e.g., `http://localhost:8880`) |
| `CHATTERBOX_VOICE` | No | Chatterbox voice name (default: `Eli`) |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) |
| `ASSISTANT_NAME` | No | Assistant name for branding (default: `Moltbot`) |
| `ASSISTANT_EMOJI` | No | Emoji for branding (default: `🦞`) |

### Moltbot Config

The server reads additional configuration from `~/.moltbot/moltbot.json`:

| Setting | Path in moltbot.json |
|---------|----------------------|
| Groq API Key | `env.vars.GROQ_API_KEY` |
| Gateway Token | `gateway.auth.token` |
| Gateway Port | `gateway.port` (default: 18789) |
| ElevenLabs Key | `messages.tts.elevenlabs.apiKey` |
| Voice ID | `messages.tts.elevenlabs.voiceId` |

## Security Features

- **Authentication**: Token required for WebSocket connections (10s timeout)
- **Rate Limiting**: 20 requests/minute per connection
- **Input Validation**: 10MB max audio size, format validation
- **CORS Restrictions**: Configurable allowed origins
- **Error Sanitization**: Internal errors not leaked to client
- **Per-Connection Isolation**: Responses routed to correct client
- **Config Validation**: Catches placeholder API keys on startup

## Testing

```bash
# Unit tests (Vitest)
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report

# Integration tests
npm run test:groq     # Test Groq transcription API
npm run test:gateway  # Test Gateway connection
npm run test:tts      # Test ElevenLabs TTS
npm run test:all      # Run all integration tests
```

## TTS Providers

### ElevenLabs (default)

Uses ElevenLabs API configured in `~/.moltbot/moltbot.json`. Streams audio chunks for low-latency playback.

### Chatterbox (local)

Set `CHATTERBOX_URL` to use a local Chatterbox server instead:

```bash
CHATTERBOX_URL=http://localhost:8880 npm start
```

Chatterbox returns full audio (no streaming), but it's free and runs locally.

The TTS provider is selected automatically at startup and logged:
```
🦻 Moltbot Voice Bridge - Proxy Server

   TTS Provider: ElevenLabs
```

## Endpoints

### WebSocket `/ws`

Main communication channel for the PWA. Requires authentication.

#### Client → Server

```typescript
// Authenticate (must be first message)
{ type: 'auth', token: string }

// Send recorded audio
{ type: 'audio', data: string, location?: { lat: number, lng: number } }

// Toggle TTS mode
{ type: 'tts_state', enabled: boolean }

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

### HTTP `/branding`

Returns branding configuration for the PWA.

```bash
curl http://localhost:3001/branding
# {"name":"Moltbot","emoji":"🦞","description":"Hands-free voice interface for Moltbot"}
```

## Development

```bash
# Watch mode (auto-rebuild + restart)
npm run dev
```

## Pipeline Flow

1. **Client authenticates** → Token validated
2. **Client sends audio** → Base64 encoded audio blob
3. **Rate limit check** → 20 req/min per connection
4. **Input validation** → Size and format checks
5. **Groq transcribes** → Text transcript
6. **Hallucination filter** → Removes "thank you", noise, etc.
7. **Send transcript to client** → For UI display
8. **Gateway processes** → Chat with AI (5 minute timeout)
9. **Keepalive pings** → Sent every 15s during long waits
10. **Send response to client** → For UI display
11. **TTS generation** → ElevenLabs (streaming) or Chatterbox (full)
12. **Stream audio chunks** → Client plays in real-time
13. **Send audio_end** → Client resumes listening

All steps are logged with a request ID (e.g., `[a1b2c3d4]`) for debugging.

## Project Structure

```
server/
├── src/
│   ├── index.ts          # Main server + WebSocket handler
│   ├── config.ts         # Configuration loader
│   ├── env.ts            # Centralized environment variables
│   ├── types.ts          # TypeScript types
│   ├── filters.ts        # Hallucination/noise detection
│   ├── filters.test.ts   # Unit tests for filters
│   ├── groq.ts           # Groq Whisper transcription
│   ├── gateway.ts        # Moltbot Gateway WebSocket client
│   ├── tts.ts            # ElevenLabs TTS (streaming)
│   ├── tts-chatterbox.ts # Chatterbox TTS (local)
│   ├── tts-provider.ts   # TTS provider interface
│   └── test-*.ts         # Integration test scripts
├── vitest.config.ts      # Vitest configuration
├── .env                  # Environment variables (create this)
├── package.json
├── tsconfig.json
└── README.md
```

## Session

Default session key: `agent:main:main`

This shares context with the Moltbot CLI, enabling seamless keyboard ↔ voice handoff. Override with `SESSION_KEY` env var.

## TTS Mode Prefix

Voice messages are prefixed to indicate TTS state:
- **🎤** = TTS enabled (be concise)
- **📖** = TTS disabled (full response OK)

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
