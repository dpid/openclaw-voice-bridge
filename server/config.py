import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    port: int
    groq_api_key: str
    gateway_url: str
    gateway_token: str
    elevenlabs_api_key: str
    elevenlabs_voice_id: str
    chatterbox_url: str | None
    chatterbox_voice: str
    session_key: str
    auth_token: str
    assistant_name: str
    assistant_emoji: str


def load_config() -> Config:
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"

    openclaw_config: dict = {}
    try:
        openclaw_config = json.loads(config_path.read_text())
        print(f"Loaded {config_path}")
    except Exception as e:
        raise RuntimeError(f"Could not load openclaw.json: {e}")

    # Extract values from openclaw.json
    groq_api_key = (
        os.environ.get("GROQ_API_KEY")
        or openclaw_config.get("env", {}).get("vars", {}).get("GROQ_API_KEY")
        or ""
    )

    gateway_port = openclaw_config.get("gateway", {}).get("port", 18789)
    gateway_token = openclaw_config.get("gateway", {}).get("auth", {}).get("token", "")

    tts_config = openclaw_config.get("messages", {}).get("tts", {}).get("elevenlabs", {})
    elevenlabs_api_key = os.environ.get("ELEVENLABS_API_KEY") or tts_config.get("apiKey", "")
    elevenlabs_voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or tts_config.get("voiceId", "")

    # Validate required config
    missing = []
    if not groq_api_key:
        missing.append("GROQ_API_KEY")
    if not gateway_token:
        missing.append("gateway.auth.token")

    if missing:
        raise RuntimeError(f"Missing required config: {', '.join(missing)}")

    # Validate config format (catch placeholder values)
    invalid = []
    if len(groq_api_key) < 20:
        invalid.append("GROQ_API_KEY (too short)")
    if len(gateway_token) < 10:
        invalid.append("gateway.auth.token (too short)")

    if invalid:
        raise RuntimeError(f"Invalid config values: {', '.join(invalid)}")

    # Auth token for signaling endpoint (required!)
    auth_token = os.environ.get("OC_AUTH_TOKEN", "")
    if not auth_token:
        raise RuntimeError("OC_AUTH_TOKEN environment variable is required")

    # Branding
    assistant_name = os.environ.get("ASSISTANT_NAME", "OpenClaw")
    assistant_emoji = os.environ.get("ASSISTANT_EMOJI", "lobster")

    # Chatterbox (local TTS)
    chatterbox_url = os.environ.get("CHATTERBOX_URL")
    chatterbox_voice = os.environ.get("CHATTERBOX_VOICE", "default")

    config = Config(
        port=int(os.environ.get("PORT", "7860")),
        groq_api_key=groq_api_key,
        gateway_url=os.environ.get("GATEWAY_URL", f"http://localhost:{gateway_port}"),
        gateway_token=gateway_token,
        elevenlabs_api_key=elevenlabs_api_key,
        elevenlabs_voice_id=elevenlabs_voice_id,
        chatterbox_url=chatterbox_url,
        chatterbox_voice=chatterbox_voice,
        session_key=os.environ.get("SESSION_KEY", "agent:main:main"),
        auth_token=auth_token,
        assistant_name=assistant_name,
        assistant_emoji=assistant_emoji,
    )

    print("Configuration loaded")
    print(f"  Port: {config.port}")
    print(f"  Gateway: {config.gateway_url}")
    print(f"  Session: {config.session_key}")
    print(f"  Assistant: {config.assistant_emoji} {config.assistant_name}")
    if config.chatterbox_url:
        print(f"  TTS: Chatterbox ({config.chatterbox_url})")
    elif config.elevenlabs_api_key:
        print("  TTS: ElevenLabs")
    else:
        print("  TTS: None configured")

    return config
