# The Ear - Proxy Server

Voice PWA proxy server that bridges the PWA client to Clawdbot Gateway, Groq transcription, and ElevenLabs TTS.

## Architecture

```
┌─────────────────┐        ┌─────────────────────────────────────┐
│                 │   WS   │           Proxy Server              │
│   PWA Client    │◄──────►│  ┌─────────┐ ┌─────────┐ ┌───────┐  │
│  (browser/iOS)  │  /ws   │  │  Groq   │ │ Gateway │ │  TTS  │  │
│                 │        │  │ (STT)   │ │ (chat)  │ │ (11L) │  │
└─────────────────┘        │  └─────────┘ └─────────┘ └───────┘  │
                           └─────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Test all components
npm run test:all

# Start server
npm start
```

## Configuration

The server reads configuration from `~/.clawdbot/clawdbot.json`:

| Setting | Path in clawdbot.json |
|---------|----------------------|
| Groq API Key | `env.vars.GROQ_API_KEY` |
| Gateway Token | `gateway.auth.token` |
| Gateway Port | `gateway.port` (default: 18789) |
| ElevenLabs Key | `messages.tts.elevenlabs.apiKey` |
| Voice ID | `messages.tts.elevenlabs.voiceId` |

Override the server port with `PORT` environment variable (default: 3001).

## Endpoints

### WebSocket `/ws`

Main communication channel for the PWA.

#### Client → Server

```typescript
// Send recorded audio
{ type: 'audio', data: string }  // base64 audio

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
{ type: 'audio', data: string }  // base64 mp3

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
4. **Gateway processes** → Chat with Vincent
5. **Send response to client** → For UI display
6. **ElevenLabs TTS** → Streaming audio
7. **Stream audio chunks** → Client plays in real-time
8. **Send audio_end** → Client resumes listening

## Session

All messages go to session key: `voice:ear:main`

This maintains conversation context across sessions and blends into the existing Clawdbot session system.

## Files

```
server/
├── src/
│   ├── index.ts      # Main server
│   ├── config.ts     # Configuration loader
│   ├── types.ts      # TypeScript types
│   ├── groq.ts       # Groq transcription
│   ├── gateway.ts    # Gateway WebSocket client
│   ├── tts.ts        # ElevenLabs TTS
│   └── test-*.ts     # Test scripts
├── package.json
├── tsconfig.json
└── README.md
```

## Required Clawdbot Config

For the proxy to receive text (not just TTS audio), disable gateway TTS:

```json
"messages": {
  "tts": {
    "auto": "never"
  }
}
```

The proxy generates its own TTS via ElevenLabs, ensuring text and audio always match.
