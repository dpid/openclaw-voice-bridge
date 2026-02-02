import re
from pipecat.frames.frames import Frame, TextFrame, LLMFullResponseEndFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection


class ResponseCleanerProcessor(FrameProcessor):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._buffer = ""
        self._echo_stripped = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMFullResponseEndFrame):
            # Flush any remaining buffer
            if self._buffer:
                cleaned = self._clean_for_speech(self._buffer)
                if cleaned:
                    await self.push_frame(TextFrame(text=cleaned), direction)
            self._buffer = ""
            self._echo_stripped = False
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, TextFrame):
            text = frame.text

            if not self._echo_stripped:
                # Accumulate until we can identify and strip the echo
                self._buffer += text

                # Look for the echo pattern: > 🎤 "..."\n\n or > "...".
                # OpenClaw echoes with double newlines, but may also use period
                # Pattern handles: > 🎤 "text"\n\n or > "text".
                match = re.search(r'^>[^"]*"[^"]*"(?:\.\s*|\s*\n+)', self._buffer)
                if match:
                    # Found complete echo, strip it
                    self._buffer = self._buffer[match.end():]
                    self._echo_stripped = True
                    if self._buffer:
                        cleaned = self._clean_for_speech(self._buffer)
                        if cleaned:
                            await self.push_frame(TextFrame(text=cleaned), direction)
                        self._buffer = ""
                elif not self._buffer.startswith('>') and '"' not in self._buffer[:10]:
                    # Doesn't look like an echo, pass through
                    self._echo_stripped = True
                    cleaned = self._clean_for_speech(self._buffer)
                    if cleaned:
                        await self.push_frame(TextFrame(text=cleaned), direction)
                    self._buffer = ""
                # else: still accumulating, waiting for echo to complete
                return

            # Echo already stripped, just clean and pass through
            cleaned = self._clean_for_speech(text)
            if cleaned:
                frame = TextFrame(text=cleaned)
                await self.push_frame(frame, direction)
            return

        await self.push_frame(frame, direction)

    def _clean_for_speech(self, text: str) -> str:
        # Remove code blocks
        text = re.sub(r"```[\s\S]*?```", " (code block omitted) ", text)

        # Remove table rows
        text = re.sub(r"\|[^\n]+\|", "", text)

        # [link text](url) -> link text
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)

        # Remove raw URLs
        text = re.sub(r"https?://\S+", "", text)

        # **bold** -> bold
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)

        # *italic* -> italic
        text = re.sub(r"\*([^*]+)\*", r"\1", text)

        # `code` -> code
        text = re.sub(r"`([^`]+)`", r"\1", text)

        # Remove headers
        text = re.sub(r"#{1,6}\s*", "", text)

        # Remove bullet points
        text = re.sub(r"^[-*]\s+", "", text, flags=re.MULTILINE)

        # Remove numbered lists
        text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)

        # Remove emojis
        text = re.sub(r"[\U0001F300-\U0001F9FF]", "", text)
        text = re.sub(r"[\u2600-\u26FF]", "", text)
        text = re.sub(r"[\u2700-\u27BF]", "", text)
        text = re.sub(r"[\uFE00-\uFE0F]", "", text)
        text = re.sub(r"[\u200D]", "", text)

        # Multiple newlines -> pause
        text = re.sub(r"\n{2,}", ". ", text)

        # Single newlines -> space
        text = re.sub(r"\n", " ", text)

        # Normalize internal whitespace (but preserve leading/trailing for concatenation)
        text = re.sub(r"\s+", " ", text)

        # Return text with spaces preserved, or empty if all whitespace
        return text if text.strip() else ""
