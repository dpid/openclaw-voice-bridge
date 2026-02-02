import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict

from dotenv import load_dotenv
from loguru import logger

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import uvicorn

from pipecat.transports.smallwebrtc.connection import IceServer, SmallWebRTCConnection

from config import load_config, Config
from bot import run_bot

load_dotenv()

config: Config | None = None

# Store connections by pc_id
pcs_map: Dict[str, SmallWebRTCConnection] = {}

ICE_SERVERS = [
    IceServer(urls="stun:stun.l.google.com:19302"),
]

# Rate limiting per IP
rate_limits: dict[str, dict] = {}
RATE_LIMIT_REQUESTS = 20
RATE_LIMIT_WINDOW_MS = 60 * 1000


def check_rate_limit(ip: str) -> bool:
    import time

    now = int(time.time() * 1000)
    limit = rate_limits.get(ip)

    if not limit or now > limit["reset_at"]:
        limit = {"count": 0, "reset_at": now + RATE_LIMIT_WINDOW_MS}

    if limit["count"] >= RATE_LIMIT_REQUESTS:
        return False

    limit["count"] += 1
    rate_limits[ip] = limit
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    global config
    print("\n The Ear - Voice Bridge (Pipecat)\n")

    try:
        config = load_config()
    except Exception as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)

    yield

    # Cleanup on shutdown
    coros = [pc.disconnect() for pc in pcs_map.values()]
    await asyncio.gather(*coros)
    pcs_map.clear()


app = FastAPI(lifespan=lifespan)

# CORS
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "").split(",")
allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
if not allowed_origins:
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:7860",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/branding")
async def branding():
    return {
        "name": config.assistant_name if config else "OpenClaw",
        "emoji": config.assistant_emoji if config else "lobster",
        "description": f"Hands-free voice interface for {config.assistant_name if config else 'OpenClaw'}",
    }


@app.post("/api/offer")
async def offer(request: dict, background_tasks: BackgroundTasks):
    if not config:
        return JSONResponse({"error": "Server not configured"}, status_code=500)

    # Auth check via header or body
    token = request.get("token")
    if token != config.auth_token:
        return JSONResponse({"error": "Invalid token"}, status_code=401)

    pc_id = request.get("pc_id")
    location = request.get("location")

    if pc_id and pc_id in pcs_map:
        # Reuse existing connection
        pipecat_connection = pcs_map[pc_id]
        logger.info(f"Reusing connection for pc_id: {pc_id}")
        await pipecat_connection.renegotiate(
            sdp=request["sdp"],
            type=request["type"],
            restart_pc=request.get("restart_pc", False),
        )
    else:
        # New connection
        pipecat_connection = SmallWebRTCConnection(ICE_SERVERS)
        await pipecat_connection.initialize(sdp=request["sdp"], type=request["type"])

        @pipecat_connection.event_handler("closed")
        async def handle_disconnected(webrtc_connection: SmallWebRTCConnection):
            logger.info(f"Discarding connection for pc_id: {webrtc_connection.pc_id}")
            pcs_map.pop(webrtc_connection.pc_id, None)

        # Start the bot pipeline
        background_tasks.add_task(run_bot, config, pipecat_connection, location)

    answer = pipecat_connection.get_answer()
    pcs_map[answer["pc_id"]] = pipecat_connection

    return answer


@app.get("/")
async def index():
    static_dir = Path(__file__).parent / "static"
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return JSONResponse({"error": "Static files not found"}, status_code=404)


# Mount static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
