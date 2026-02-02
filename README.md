# OpenClaw Voice Bridge

A hands-free voice interface for OpenClaw. WebRTC-based real-time conversation using Pipecat for audio pipeline management. Shares context with your CLI session for seamless keyboard <-> voice handoff.

Fully customizable branding via environment variables.

## Architecture

```
┌─────────────────┐     WebRTC        ┌─────────────────┐     HTTP/WS      ┌─────────────────┐
│   Web Client    │ <───────────────> │  Pipecat Server │ <─────────────── │ OpenClaw Gateway │
│  Voice capture  │                   │  STT + LLM + TTS│                  │    AI session   │
└─────────────────┘                   └─────────────────┘                  └─────────────────┘
```

- **Web Client**: Captures audio, sends via WebRTC, plays TTS responses
- **Pipecat Server**: Transcribes audio (Groq), routes to Gateway, generates TTS
- **Shared Session**: Uses `agent:main:main` by default — same context as CLI
- **Location Aware**: Optionally shares your location for location-relevant queries

## Features

- Real-time voice conversation via WebRTC
- Voice Activity Detection (Silero VAD)
- Speech transcription (Groq Whisper)
- TTS responses (ElevenLabs or local Chatterbox)
- Shared session with CLI (seamless keyboard <-> voice)
- Location-aware queries
- Hallucination filtering (removes Whisper noise)
- Response cleaning (strips markdown for speech)
- Interrupt support (speak while response is playing)

## Setup

### Prerequisites

- Python 3.11+
- Running OpenClaw Gateway with chat completions endpoint enabled
- Groq API key (for Whisper transcription)
- ElevenLabs API key (for TTS) — or local Chatterbox server

### Gateway Configuration

Ensure the chat completions endpoint is enabled in your OpenClaw gateway:

```bash
# Get the current config hash
HASH=$(openclaw gateway call config.get 2>/dev/null | grep '"hash"' | cut -d'"' -f4)

# Enable chat completions endpoint
openclaw gateway call config.patch --params "{\"baseHash\": \"$HASH\", \"raw\": \"{\\\"gateway\\\":{\\\"http\\\":{\\\"endpoints\\\":{\\\"chatCompletions\\\":{\\\"enabled\\\":true}}}}}\"}"
```

Test the endpoint:

```bash
cd server
uv run python test_gateway.py
```

### Server

```bash
cd server

# Create virtual environment and install dependencies
uv sync

# Create .env file
cp .env.example .env
# Edit .env with your OC_AUTH_TOKEN

# Run the server
uv run python server.py
```

The server reads additional config from `~/.openclaw/openclaw.json`:
- `gateway.port` and `gateway.auth.token`
- `messages.tts.elevenlabs.apiKey` and `voiceId`
- `env.vars.GROQ_API_KEY`

### Access

Open http://localhost:7860 in your browser, enter your auth token, and start talking.

### Tunnel (for mobile access)

```bash
cloudflared tunnel --url http://localhost:7860
```

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OC_AUTH_TOKEN` | Yes | Auth token for WebRTC signaling |
| `SESSION_KEY` | No | OpenClaw session key (default: `agent:main:main`) |
| `PORT` | No | Server port (default: `7860`) |
| `GATEWAY_URL` | No | Gateway HTTP URL (default: `http://localhost:18789`) |
| `GROQ_API_KEY` | No | Override Groq key (otherwise from openclaw.json) |
| `CHATTERBOX_URL` | No | Local Chatterbox server URL (e.g., `http://localhost:8880`) |
| `CHATTERBOX_VOICE` | No | Chatterbox voice name (default: `default`) |
| `ELEVENLABS_API_KEY` | No | Override ElevenLabs key (otherwise from openclaw.json) |
| `ELEVENLABS_VOICE_ID` | No | Override ElevenLabs voice (otherwise from openclaw.json) |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) |
| `ASSISTANT_NAME` | No | Assistant name (default: `OpenClaw`) |
| `ASSISTANT_EMOJI` | No | Emoji (default: `lobster`) |

## Testing

```bash
cd server

# Unit tests
uv run pytest

# Test gateway connection
uv run python test_gateway.py
```

## Security

- **Authentication**: Token required for WebRTC signaling
- **Rate Limiting**: 20 requests/minute per connection
- **CORS Restrictions**: Configurable allowed origins

## TTS Providers

### ElevenLabs (default)

Configured via `~/.openclaw/openclaw.json`:

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

Set `CHATTERBOX_URL` environment variable to use a local Chatterbox server:

```bash
CHATTERBOX_URL=http://localhost:8880 uv run python server.py
```

## How It Works

1. User speaks — VAD automatically detects speech start/end
2. Audio sent to server via WebRTC
3. Server transcribes with Groq (Whisper)
4. Hallucination filter removes noise/junk transcriptions
5. Transcript sent to OpenClaw Gateway (OpenAI-compatible chat completions)
6. Response cleaner strips markdown for natural speech
7. TTS converts response to audio
8. Audio streamed back via WebRTC

### Location Awareness

The web client requests location permission on session start. When granted, your coordinates are included in the system prompt:

```
User's current location: 45.5515, -122.6732
```

## Project Structure

```
the-ear/
├── server/               # Python/Pipecat server
│   ├── server.py         # FastAPI + WebRTC signaling
│   ├── bot.py            # Pipecat pipeline definition
│   ├── config.py         # Configuration loader
│   ├── processors/       # Custom frame processors
│   │   ├── hallucination_filter.py   # Filters Whisper noise artifacts
│   │   ├── response_cleaner.py       # Strips markdown for TTS
│   │   ├── transcription_prefixer.py # Adds emoji prefix, sends to UI
│   │   ├── ui_notifier.py            # Streams response text to frontend
│   │   └── bot_state_notifier.py     # Sends speaking/listening state
│   ├── services/         # Custom TTS services
│   │   └── chatterbox_tts.py
│   ├── static/           # Web client
│   │   └── index.html
│   └── tests/            # Unit tests
├── archive/              # Old Node.js server (reference)
│   └── server-node/
├── pwa/                  # Original Svelte PWA (reference)
└── README.md
```

## License

MIT
