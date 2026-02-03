# OpenClaw Voice Bridge

A hands-free voice interface for OpenClaw. WebRTC-based real-time conversation using Pipecat for audio pipeline management. Shares context with your CLI session for seamless keyboard <-> voice handoff.

> **Prerequisites:** Requires a running [OpenClaw](https://github.com/dpid/openclaw) installation with gateway enabled. New to OpenClaw? Set that up first.

## Quickstart (for existing OpenClaw users)

```bash
# Install uv if needed: curl -LsSf https://astral.sh/uv/install.sh | sh
git clone https://github.com/dpid/openclaw-voice-bridge.git
cd openclaw-voice-bridge
uv sync
echo "OC_AUTH_TOKEN=$(openssl rand -hex 16)" > .env
uv run python server.py
# Open http://localhost:7860
```

The server reads your Groq API key and gateway token from `~/.openclaw/openclaw.json`. For TTS, configure ElevenLabs in that file or set `CHATTERBOX_URL` for local [Chatterbox](https://github.com/resemble-ai/chatterbox) TTS.

## Architecture

```
┌─────────────────┐     WebRTC        ┌─────────────────┐     HTTP/WS      ┌──────────────────┐
│   Web Client    │ <───────────────> │  Pipecat Server │ <─────────────── │ OpenClaw Gateway │
│  Voice capture  │                   │    STT + TTS    │                  │   LLM session    │
└─────────────────┘                   └─────────────────┘                  └──────────────────┘
```

- **Web Client**: Captures audio, sends via WebRTC, plays TTS responses
- **Pipecat Server**: Transcribes audio (Groq), routes to Gateway, generates TTS
- **Shared Session**: Uses `agent:main:main` by default — same context as CLI
- **Location Aware**: Optionally shares your location for location-relevant queries

## Features

- Real-time voice conversation via WebRTC
- Voice Activity Detection (Silero VAD)
- Speech transcription (Groq Whisper)
- TTS responses (ElevenLabs or local [Chatterbox](https://github.com/resemble-ai/chatterbox))
- Shared session with CLI (seamless keyboard <-> voice)
- Location-aware queries
- Hallucination filtering (removes Whisper noise)
- Response cleaning (strips markdown for speech)
- Interrupt support (speak while response is playing)
- Customizable branding via environment variables

## Setup

### Prerequisites

- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Running OpenClaw Gateway with chat completions endpoint enabled
- `~/.openclaw/openclaw.json` with:
  - `gateway.auth.token` — your gateway auth token
  - `env.vars.GROQ_API_KEY` — Groq API key for Whisper transcription
  - `messages.tts.elevenlabs.apiKey` and `voiceId` — for ElevenLabs TTS (or use local [Chatterbox](https://github.com/resemble-ai/chatterbox))

### Gateway Configuration

Enable the chat completions endpoint in your OpenClaw gateway:

```bash
# Get the current config hash
HASH=$(openclaw gateway call config.get 2>/dev/null | grep '"hash"' | cut -d'"' -f4)

# Enable chat completions endpoint
openclaw gateway call config.patch --params "{\"baseHash\": \"$HASH\", \"raw\": \"{\\\"gateway\\\":{\\\"http\\\":{\\\"endpoints\\\":{\\\"chatCompletions\\\":{\\\"enabled\\\":true}}}}}\"}"
```

Test the endpoint:

```bash
uv run python test_gateway.py
```

### Server

```bash
# Install dependencies
uv sync

# Create .env with a random auth token (this secures the WebRTC endpoint)
echo "OC_AUTH_TOKEN=$(openssl rand -hex 16)" > .env

# Run the server
uv run python server.py
```

**Note:** `OC_AUTH_TOKEN` is a secret you create — it's used to authenticate WebRTC connections to this server. Generate any random string you like.

### Access

Open http://localhost:7860 in your browser, enter your auth token, and start talking.

### Tunnel (for mobile access)

```bash
cloudflared tunnel --url http://localhost:7860
```

## Environment Variables

### Server (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OC_AUTH_TOKEN` | Yes | Secret you create to secure WebRTC signaling (any random string) |
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

### [Chatterbox](https://github.com/resemble-ai/chatterbox) (local, free)

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

## Agent Configuration

The voice bridge prefixes transcriptions with 🎤 (TTS on) or 📖 (TTS muted) so your agent knows whether the response will be spoken aloud or read as text. Your agent should be concise and avoid markdown when 🎤 is active, and echo the transcription back so the user can confirm what was heard.

See [CLAUDE.md](./CLAUDE.md#agent-configuration) for full details, response guidelines, and a system prompt snippet you can copy into your agent.

## Project Structure

```
openclaw-voice-bridge/
├── server.py             # FastAPI + WebRTC signaling
├── bot.py                # Pipecat pipeline definition
├── config.py             # Configuration loader
├── processors/           # Custom frame processors
│   ├── hallucination_filter.py   # Filters Whisper noise artifacts
│   ├── response_cleaner.py       # Strips markdown for TTS
│   ├── transcription_prefixer.py # Adds emoji prefix, sends to UI
│   ├── ui_notifier.py            # Streams response text to frontend
│   └── bot_state_notifier.py     # Sends speaking/listening state
├── services/             # Custom TTS services
│   └── chatterbox_tts.py
├── static/               # Web client
│   └── index.html
├── tests/                # Unit tests
├── test_gateway.py       # Gateway connection test
└── README.md
```

## License

MIT
