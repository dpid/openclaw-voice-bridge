import aiohttp
from typing import AsyncGenerator

from pipecat.frames.frames import Frame, TTSAudioRawFrame, TTSStartedFrame, TTSStoppedFrame
from pipecat.services.tts_service import TTSService


class ChatterboxTTSService(TTSService):
    def __init__(
        self,
        url: str = "http://localhost:8880",
        voice: str = "default",
        sample_rate: int = 24000,
    ):
        super().__init__(sample_rate=sample_rate)
        self._url = url.rstrip("/")
        self._voice = voice
        self._session: aiohttp.ClientSession | None = None

    async def start(self, frame: Frame):
        await super().start(frame)
        self._session = aiohttp.ClientSession()

    async def stop(self, frame: Frame):
        if self._session:
            await self._session.close()
            self._session = None
        await super().stop(frame)

    async def run_tts(self, text: str) -> AsyncGenerator[Frame, None]:
        if not self._session:
            self._session = aiohttp.ClientSession()

        yield TTSStartedFrame()

        try:
            async with self._session.post(
                f"{self._url}/v1/audio/speech",
                json={
                    "input": text,
                    "voice": self._voice,
                    "response_format": "wav",
                },
            ) as response:
                if not response.ok:
                    error_text = await response.text()
                    raise RuntimeError(f"Chatterbox TTS failed ({response.status}): {error_text}")

                # Read full response (Chatterbox doesn't stream)
                audio_data = await response.read()

                # Skip WAV header (44 bytes) and yield raw PCM
                if len(audio_data) > 44:
                    yield TTSAudioRawFrame(
                        audio=audio_data[44:],
                        sample_rate=self._sample_rate,
                        num_channels=1,
                    )
        finally:
            yield TTSStoppedFrame()

    async def health_check(self) -> bool:
        try:
            if not self._session:
                self._session = aiohttp.ClientSession()

            async with self._session.get(f"{self._url}/health") as response:
                return response.ok
        except Exception:
            return False
