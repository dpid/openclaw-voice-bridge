# AGENTS.md

Instructions for AI assistants working on this codebase.

> **Installing for a user?** See the step-by-step installation guide in [CLAUDE.md](./CLAUDE.md#installation-guide-for-ai-assistants-helping-users).

## What This Is

A hands-free voice interface for OpenClaw using Pipecat for real-time audio processing.
- **Server** — Python/FastAPI backend with Pipecat pipeline
- **Web Client** (`static/`) — Simple HTML/JS WebRTC client

## Message Flow

```
User speaks → WebRTC audio → Pipecat server
    → Groq Whisper (STT) → Hallucination filter
    → OpenClaw Gateway (OpenAI chat completions)
    → Response cleaner → TTS synthesis
    → WebRTC audio → client plays it
```

## Key Files

### Server
| File | Purpose |
|------|---------|
| `server.py` | FastAPI server, WebRTC signaling, offer/answer handling |
| `bot.py` | Pipecat pipeline definition, service instantiation |
| `config.py` | Loads config from openclaw.json and environment |
| `processors/hallucination_filter.py` | Filters Whisper noise/hallucinations |
| `processors/response_cleaner.py` | Strips markdown before TTS |
| `services/chatterbox_tts.py` | Local Chatterbox TTS service |
| `test_gateway.py` | Gateway chat completions endpoint test |

### Static Client (`static/`)
| File | Purpose |
|------|---------|
| `index.html` | WebRTC client, token auth, audio capture/playback |

### Config
| File | Purpose |
|------|---------|
| `.env` | Server secrets (OC_AUTH_TOKEN, etc.) |
| `~/.openclaw/openclaw.json` | Shared OpenClaw config (API keys, gateway) |

## Common Tasks

**Change branding:**
→ Edit `.env` (`ASSISTANT_NAME`, `ASSISTANT_EMOJI`)

**Change TTS provider:**
→ Set `CHATTERBOX_URL` env var for local Chatterbox
→ Otherwise uses ElevenLabs from openclaw.json

**Add hallucination filter pattern:**
→ Edit `processors/hallucination_filter.py`

**Add response cleaning rule:**
→ Edit `processors/response_cleaner.py`

## Gateway Requirements

The server uses the OpenAI-compatible chat completions endpoint on the OpenClaw gateway. Ensure it's enabled:

```bash
# Get the current config hash
HASH=$(openclaw gateway call config.get 2>/dev/null | grep '"hash"' | cut -d'"' -f4)

# Enable chat completions endpoint
openclaw gateway call config.patch --params "{\"baseHash\": \"$HASH\", \"raw\": \"{\\\"gateway\\\":{\\\"http\\\":{\\\"endpoints\\\":{\\\"chatCompletions\\\":{\\\"enabled\\\":true}}}}}\"}"
```

Test with:
```bash
uv run python test_gateway.py
```

## Gotchas

1. **Gateway endpoint must be enabled** — uses `/v1/chat/completions`, not WebSocket protocol
2. **Session key header** — uses `x-openclaw-session-key` for session routing
3. **WebRTC requires ICE** — STUN server configured for NAT traversal
4. **VAD in Pipecat** — uses Silero VAD via aggregators, not separate processor
5. **Rate limiting** — 20 requests/min per connection
6. **TTS fallback** — Chatterbox → ElevenLabs (if Chatterbox unavailable)

## Don't

- Don't commit `.env` files (secrets)
- Don't skip the hallucination filter — catches garbage from silence/noise
- Don't skip the response cleaner — markdown sounds bad when spoken

## Testing

```bash
# Unit tests
uv run pytest

# Gateway integration test
uv run python test_gateway.py
```

## Local Development

1. Start OpenClaw Gateway (with chat completions enabled)
2. Create `.env` from `.env.example`
3. Run server: `uv run python server.py`
4. Open http://localhost:7860
5. Enter auth token, grant mic permission, start session
