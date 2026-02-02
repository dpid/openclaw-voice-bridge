from pipecat.frames.frames import (
    Frame,
    TextFrame,
    LLMFullResponseEndFrame,
)
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection


class UINotifierProcessor(FrameProcessor):
    def __init__(self, connection: SmallWebRTCConnection, **kwargs):
        super().__init__(**kwargs)
        self._connection = connection
        self._current_response = ""

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TextFrame):
            self._current_response += frame.text
            self._send_message({
                "type": "response",
                "text": frame.text,
                "done": False,
            })

        elif isinstance(frame, LLMFullResponseEndFrame):
            if self._current_response:
                self._send_message({
                    "type": "response",
                    "text": "",
                    "done": True,
                })
                self._current_response = ""

        await self.push_frame(frame, direction)

    def _send_message(self, msg: dict):
        self._connection.send_app_message(msg)
