from pipecat.frames.frames import (
    Frame,
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection


class BotStateNotifierProcessor(FrameProcessor):
    def __init__(self, connection: SmallWebRTCConnection, **kwargs):
        super().__init__(**kwargs)
        self._connection = connection

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, BotStartedSpeakingFrame):
            self._send_state("speaking")

        elif isinstance(frame, BotStoppedSpeakingFrame):
            self._send_state("listening")

        await self.push_frame(frame, direction)

    def _send_state(self, state: str):
        msg = {"type": "state", "state": state}
        self._connection.send_app_message(msg)
