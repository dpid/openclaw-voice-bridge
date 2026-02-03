# OpenClaw Voice Bridge

Hands-free voice interface using Pipecat for real-time WebRTC audio.

**This is an add-on for OpenClaw.** It cannot be installed standalone — the user must have OpenClaw already installed and configured with a running gateway.

## Installation Guide (for AI assistants helping users)

### 1. Verify Prerequisites

```bash
# OpenClaw CLI exists
which openclaw  # Should return a path, not "not found"

# Config file exists and is valid JSON
cat ~/.openclaw/openclaw.json | head -20  # Should show JSON config
```

If either fails: **Stop.** User needs to install OpenClaw first. Direct them to https://github.com/dpid/openclaw

### 2. Verify Required Config

Requires `jq`. Install if missing: `brew install jq` (macOS) or `apt install jq` (Linux).

```bash
# Check required keys (all must return non-null values)
jq -r '.gateway.auth.token' ~/.openclaw/openclaw.json
jq -r '.env.vars.GROQ_API_KEY' ~/.openclaw/openclaw.json

# Check TTS (at least one must be configured)
jq -r '.messages.tts.elevenlabs.apiKey' ~/.openclaw/openclaw.json
```

If gateway token or Groq key is null: User needs to configure OpenClaw.
If ElevenLabs is null: User can use local Chatterbox instead (set CHATTERBOX_URL).

### 3. Install

```bash
git clone https://github.com/dpid/openclaw-voice-bridge.git
cd openclaw-voice-bridge
uv sync
```

### 4. Enable Chat Completions Endpoint

```bash
uv run python test_gateway.py
```

- **If "Chat completions endpoint is working!"** -- Continue to step 5
- **If 404 error** -- Run this, then re-test:
  ```bash
  HASH=$(openclaw gateway call config.get 2>/dev/null | grep '"hash"' | cut -d'"' -f4)
  openclaw gateway call config.patch --params "{\"baseHash\": \"$HASH\", \"raw\": \"{\\\"gateway\\\":{\\\"http\\\":{\\\"endpoints\\\":{\\\"chatCompletions\\\":{\\\"enabled\\\":true}}}}}\"}"
  ```
- **If connection error** -- Gateway not running. User needs to start it.

### 5. Create .env and Start Server

```bash
# Generate random token and save to .env
TOKEN=$(openssl rand -hex 16)
echo "OC_AUTH_TOKEN=$TOKEN" > .env

# Start server
uv run python server.py
```

Server should print "Configuration loaded" without errors.

### 6. Tell the User

After server starts, tell the user:
1. Open http://localhost:7860 in your browser
2. When prompted for auth token, enter: `[show them the $TOKEN value]`
3. Grant microphone permission when asked
4. Click "Start Session" and start talking

### Common Errors

| Error | Fix |
|-------|-----|
| `Could not load openclaw.json` | OpenClaw not installed -- user must install it first |
| `Missing gateway.auth.token` | Gateway not configured -- user needs `openclaw dashboard` |
| `Missing GROQ_API_KEY` | No Groq key -- user needs to add to OpenClaw config |
| `Connection error` in test | Gateway not running -- user needs to start it |
| `404` in test | Chat completions not enabled -- run config.patch above |
| `OC_AUTH_TOKEN required` | Missing .env file -- create it per step 5 |
| `TTS: None configured` | No ElevenLabs key -- set CHATTERBOX_URL or configure ElevenLabs |

### Success Indicators

When everything is working, the server output should include:

```
Configuration loaded
  Port: 7860
  Gateway: http://localhost:18789
  Session: agent:main:main
  TTS: ElevenLabs (or Chatterbox)
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:7860
```

## Quick Reference

```bash
uv run python server.py       # Start server on :7860
uv run python test_gateway.py # Test gateway connection
uv run pytest                 # Run unit tests
```

## Architecture

```
Browser <-> WebRTC <-> FastAPI/Pipecat <-> OpenClaw Gateway (chat completions)
                            |
                 Groq STT -> LLM -> TTS (ElevenLabs/Chatterbox)
```

## Key Files

- `server.py` - FastAPI + WebRTC signaling
- `bot.py` - Pipecat pipeline definition
- `config.py` - Config from `~/.openclaw/openclaw.json`
- `processors/` - Custom frame processors:
  - `hallucination_filter.py` - Filters Whisper noise artifacts
  - `response_cleaner.py` - Strips OpenClaw echo + markdown for TTS
  - `transcription_prefixer.py` - Adds emoji prefix, sends transcription to UI
  - `ui_notifier.py` - Streams response text to frontend
  - `bot_state_notifier.py` - Sends speaking/listening state to UI
- `services/` - Chatterbox TTS service
- `static/index.html` - WebRTC client with chat UI

## Requirements

- Gateway chat completions endpoint must be enabled (see README.md)
- `OC_AUTH_TOKEN` in `.env`
- ElevenLabs credentials in `~/.openclaw/openclaw.json` (or Chatterbox running)

## See Also

- `AGENTS.md` - Detailed developer instructions
- `README.md` - Setup and usage guide
