from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection


class TranscriptionPrefixerProcessor(FrameProcessor):
    def __init__(self, connection: SmallWebRTCConnection, **kwargs):
        super().__init__(**kwargs)
        self._connection = connection
        self._tts_enabled = True

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, UserStartedSpeakingFrame):
            self._send_state("recording")

        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._send_state("processing")

        elif isinstance(frame, TranscriptionFrame):
            # Send original text to UI before prefixing
            self._send_message({
                "type": "transcription",
                "text": frame.text,
                "final": True,
            })

            # Prefix for LLM context
            emoji = "\U0001F3A4" if self._tts_enabled else "\U0001F4D6"
            prefixed_text = f'{emoji} "{frame.text}"'
            frame = TranscriptionFrame(
                text=prefixed_text,
                user_id=frame.user_id,
                timestamp=frame.timestamp,
            )

        await self.push_frame(frame, direction)

    def _send_state(self, state: str):
        self._send_message({"type": "state", "state": state})

    def _send_message(self, msg: dict):
        self._connection.send_app_message(msg)

    @property
    def tts_enabled(self) -> bool:
        return self._tts_enabled

    @tts_enabled.setter
    def tts_enabled(self, value: bool):
        self._tts_enabled = value
