import os
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import EndFrame, LLMMessagesFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from config import Config
from processors import (
    BotStateNotifierProcessor,
    HallucinationFilterProcessor,
    ResponseCleanerProcessor,
    TranscriptionPrefixerProcessor,
    UINotifierProcessor,
)
from services import ChatterboxTTSService


async def run_bot(
    config: Config,
    webrtc_connection: SmallWebRTCConnection,
    location: dict | None = None,
):
    logger.info("Starting pipeline")

    # Create transport from the WebRTC connection
    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )

    # STT: Groq Whisper
    stt = GroqSTTService(api_key=config.groq_api_key)

    # LLM: OpenClaw Gateway via OpenAI-compatible endpoint
    llm = OpenAILLMService(
        api_key=config.gateway_token,
        model="openclaw:main",
        base_url=f"{config.gateway_url}/v1",
        default_headers={"x-openclaw-session-key": config.session_key},
    )

    # TTS: Chatterbox (local) or ElevenLabs (cloud)
    tts: ChatterboxTTSService | ElevenLabsTTSService
    if config.chatterbox_url:
        tts = ChatterboxTTSService(
            url=config.chatterbox_url,
            voice=config.chatterbox_voice,
        )
        # Check health
        if not await tts.health_check():
            logger.warning("Chatterbox not available, falling back to ElevenLabs")
            if config.elevenlabs_api_key:
                tts = ElevenLabsTTSService(
                    api_key=config.elevenlabs_api_key,
                    voice_id=config.elevenlabs_voice_id,
                )
            else:
                raise RuntimeError("No TTS service available")
    elif config.elevenlabs_api_key:
        tts = ElevenLabsTTSService(
            api_key=config.elevenlabs_api_key,
            voice_id=config.elevenlabs_voice_id,
        )
    else:
        raise RuntimeError("No TTS service configured (need CHATTERBOX_URL or ELEVENLABS_API_KEY)")

    # Custom processors
    hallucination_filter = HallucinationFilterProcessor()
    transcription_prefixer = TranscriptionPrefixerProcessor(connection=webrtc_connection)
    ui_notifier = UINotifierProcessor(connection=webrtc_connection)
    response_cleaner = ResponseCleanerProcessor()
    bot_state_notifier = BotStateNotifierProcessor(connection=webrtc_connection)

    # Build system prompt with optional location
    system_content = (
        f"You are {config.assistant_name}, a helpful voice assistant. "
        "Keep responses concise and conversational since they will be spoken aloud. "
        "Avoid code blocks, tables, and complex formatting."
    )
    if location:
        system_content += f"\n\nUser's current location: {location['lat']:.6f}, {location['lng']:.6f}"

    messages = [{"role": "system", "content": system_content}]
    context = LLMContext(messages)

    # Create aggregators with VAD
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.7,
                    stop_secs=0.8,
                )
            ),
        ),
    )

    # Build pipeline
    # Flow: audio → STT → filter → prefix+notify → aggregate → LLM → clean → notify → TTS → output → state notify
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            hallucination_filter,
            transcription_prefixer,
            user_aggregator,
            llm,
            response_cleaner,
            ui_notifier,
            tts,
            transport.output(),
            bot_state_notifier,
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected: {client}")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected: {client}")
        await task.cancel()

    @transport.event_handler("on_app_message")
    async def on_app_message(transport, message, sender):
        if isinstance(message, dict) and message.get("type") == "tts_enabled":
            transcription_prefixer.tts_enabled = message.get("value", True)
            logger.debug(f"TTS enabled: {transcription_prefixer.tts_enabled}")

    runner = PipelineRunner(handle_sigint=False)
    await runner.run(task)
