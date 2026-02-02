#!/usr/bin/env python3
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import aiohttp

load_dotenv()


def load_gateway_config():
    """Load just the gateway config without requiring OC_AUTH_TOKEN."""
    home = Path.home()
    config_path = home / ".moltbot" / "moltbot.json"
    if not config_path.exists():
        config_path = home / ".clawdbot" / "clawdbot.json"

    try:
        moltbot_config = json.loads(config_path.read_text())
        print(f"Loaded {config_path}")
    except Exception as e:
        raise RuntimeError(f"Could not load moltbot.json: {e}")

    gateway_port = moltbot_config.get("gateway", {}).get("port", 18789)
    gateway_token = moltbot_config.get("gateway", {}).get("auth", {}).get("token", "")
    gateway_url = os.environ.get("GATEWAY_URL", f"http://localhost:{gateway_port}")
    session_key = os.environ.get("SESSION_KEY", "agent:main:main")

    if not gateway_token:
        raise RuntimeError("Missing gateway.auth.token in moltbot.json")

    return gateway_url, gateway_token, session_key


async def test_gateway_chat_completions():
    gateway_url, gateway_token, session_key = load_gateway_config()

    url = f"{gateway_url}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {gateway_token}",
        "Content-Type": "application/json",
        "x-openclaw-session-key": session_key,
    }
    body = {
        "model": "openclaw:main",
        "messages": [
            {"role": "user", "content": "Say 'test successful' and nothing else."},
        ],
    }

    print(f"\nTesting gateway chat completions...")
    print(f"  URL: {url}")
    print(f"  Session: {session_key}")

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, json=body, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    print(f"\n  Gateway response: {content[:100]}...")
                    print(f"\n  Chat completions endpoint is working!")
                    return True
                else:
                    text = await resp.text()
                    print(f"\n  Failed with status {resp.status}: {text}")

                    if resp.status == 404:
                        print("\n  The chat completions endpoint may not be enabled.")
                        print("  Try running:")
                        print('  openclaw gateway call config.patch --params \'{"raw": "{\\"gateway\\":{\\"http\\":{\\"endpoints\\":{\\"chatCompletions\\":{\\"enabled\\":true}}}}}"}\'')
                    return False

        except aiohttp.ClientError as e:
            print(f"\n  Connection error: {e}")
            print("  Make sure the OpenClaw gateway is running.")
            return False


if __name__ == "__main__":
    success = asyncio.run(test_gateway_chat_completions())
    sys.exit(0 if success else 1)
