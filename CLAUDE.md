# The Ear - Voice Bridge for OpenClaw

Hands-free voice interface using Pipecat for real-time WebRTC audio.

## Current State

**Branch:** `pipecat` - End-to-end working (browser → STT → LLM → TTS → browser)

See `.claude/pipecat-migration-state.md` for detailed migration status.

## Quick Reference

```bash
cd server
uv run python server.py      # Start server on :7860
uv run python test_gateway.py # Test gateway connection
uv run pytest                 # Run unit tests
```

## Architecture

```
Browser ←→ WebRTC ←→ FastAPI/Pipecat ←→ OpenClaw Gateway (chat completions)
                         ↓
              Groq STT → LLM → TTS (ElevenLabs/Chatterbox)
```

## Key Files

- `server/server.py` - FastAPI + WebRTC signaling
- `server/bot.py` - Pipecat pipeline definition
- `server/config.py` - Config from `~/.openclaw/openclaw.json`
- `server/processors/` - Custom frame processors:
  - `hallucination_filter.py` - Filters Whisper noise artifacts
  - `response_cleaner.py` - Strips OpenClaw echo + markdown for TTS
  - `transcription_prefixer.py` - Adds emoji prefix, sends transcription to UI
  - `ui_notifier.py` - Streams response text to frontend
  - `bot_state_notifier.py` - Sends speaking/listening state to UI
- `server/services/` - Chatterbox TTS service
- `server/static/index.html` - WebRTC client with chat UI

## Requirements

- Gateway chat completions endpoint must be enabled (see README.md)
- `OC_AUTH_TOKEN` in `server/.env`
- ElevenLabs credentials in `~/.openclaw/openclaw.json` (or Chatterbox running)

## See Also

- `AGENTS.md` - Detailed developer instructions
- `README.md` - Setup and usage guide
