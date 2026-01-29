# AGENTS.md

Instructions for AI assistants working on this codebase.

## What This Is

A hands-free voice interface for Moltbot. Two components:
- **PWA** (`pwa/`) — Svelte frontend, captures audio via VAD, plays TTS responses
- **Proxy Server** (`server/`) — Node.js backend, transcribes audio (Groq), routes to Moltbot Gateway, streams TTS back

## Message Flow

```
User speaks → VAD detects speech → audio captured as WAV
    → WebSocket to server → Groq Whisper transcription
    → Moltbot Gateway (AI response) → TTS synthesis
    → audio streamed back → PWA plays it
```

## Key Files

### Server (`server/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | WebSocket server, main entry point, message routing |
| `groq.ts` | Whisper transcription via Groq API |
| `gateway.ts` | Moltbot Gateway WebSocket client |
| `tts.ts` | ElevenLabs TTS |
| `tts-chatterbox.ts` | Local Chatterbox TTS (alternative) |
| `tts-provider.ts` | TTS provider interface/factory |
| `filters.ts` | Hallucination detection for transcriptions |
| `config.ts` | Loads config from moltbot.json |

### PWA (`pwa/src/`)
| File | Purpose |
|------|---------|
| `App.svelte` | Main UI component, state machine, chat display |
| `lib/vad.ts` | Voice Activity Detection (Silero via ONNX) |
| `lib/websocket.ts` | WebSocket client, message handling |
| `lib/audio.ts` | Audio playback (Web Audio API) |
| `lib/stores.ts` | Svelte stores (state, branding, etc.) |
| `lib/types.ts` | TypeScript type definitions |

### Config
| File | Purpose |
|------|---------|
| `server/.env` | Server secrets (MVB_AUTH_TOKEN, etc.) |
| `pwa/.env` | PWA config (proxy URL, branding) |
| `pwa/vite.config.ts` | Build config, PWA manifest |

## Common Tasks

**Change branding (name, emoji, description):**
→ Edit `pwa/.env` (`VITE_BOT_NAME`, `VITE_BOT_EMOJI`, `VITE_BOT_DESCRIPTION`)
→ Rebuild PWA

**Add new WebSocket message type:**
→ Define type in `pwa/src/lib/types.ts`
→ Handle in `server/src/index.ts` (server→client) or `pwa/src/lib/websocket.ts` (client→server)
→ Update protocol docs in `pwa/README.md`

**Change TTS provider:**
→ Edit `server/src/tts-provider.ts` or set `CHATTERBOX_URL` env var

**Update PWA icons:**
→ Replace PNGs in `pwa/public/` (192, 512, maskable-512, apple-touch-icon, favicon)
→ Maskable icon needs ~80% scale with padding for Android safe zone

**Add hallucination filter pattern:**
→ Edit `server/src/filters.ts`

## Config Relationships

Server and PWA have **separate** branding configs:
- Server: `ASSISTANT_NAME`, `ASSISTANT_EMOJI` — used in server logs/responses
- PWA: `VITE_BOT_NAME`, `VITE_BOT_EMOJI`, `VITE_BOT_DESCRIPTION` — used in UI and PWA manifest

These are intentionally decoupled (server doesn't know about PWA branding).

## Gotchas

1. **PWA caches aggressively** — after changes, hard refresh (Ctrl+Shift+R) or clear site data
2. **Maskable icons** need content in center 80%, padding around edges (Android adaptive icons crop)
3. **`.env` is gitignored**, `.env.example` is not — don't commit secrets
4. **VAD model files** are large (~5MB ONNX) — they're in `pwa/public/vad/`, don't delete
5. **Rate limiting** — server limits 20 requests/min per connection
6. **Audio unlock** — browsers require user interaction before audio playback; PWA handles this on session start

## Don't

- Don't commit `.env` files (secrets)
- Don't delete `pwa/public/vad/` (VAD model files)
- Don't change WebSocket protocol without updating both server and PWA
- Don't skip the hallucination filter — it catches garbage transcriptions from silence/noise

## Testing

```bash
# Server unit tests
cd server && npm test

# Server integration tests (need running services)
npm run test:groq      # Whisper
npm run test:gateway   # Moltbot connection
npm run test:tts       # ElevenLabs
npm run test:all       # All integration tests

# PWA dev server
cd pwa && npm run dev
```

## Local Development

1. Start Moltbot Gateway
2. Start server: `cd server && npm run dev`
3. Start PWA: `cd pwa && npm run dev`
4. Open http://localhost:5173
5. Enter auth token, grant mic permission, start session
