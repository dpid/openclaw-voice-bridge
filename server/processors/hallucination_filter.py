import re
from pipecat.frames.frames import Frame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

HALLUCINATION_PATTERNS = [
    re.compile(r"^thanks?\s*(you)?\s*(for\s+watching)?$", re.IGNORECASE),
    re.compile(r"^(please\s+)?subscribe", re.IGNORECASE),
    re.compile(r"^like\s+and\s+subscribe", re.IGNORECASE),
    re.compile(r"^see\s+you\s+(next\s+time|later|soon)", re.IGNORECASE),
    re.compile(r"^bye+$", re.IGNORECASE),
    re.compile(r"^(uh+|um+|hmm+)$", re.IGNORECASE),
    re.compile(r"^\.+$"),
]

MIN_TRANSCRIPT_LENGTH = 2


def is_hallucination(transcript: str) -> bool:
    normalized = re.sub(r"[.!?,]", "", transcript.strip())
    return any(p.search(normalized) for p in HALLUCINATION_PATTERNS)


def is_too_short(transcript: str) -> bool:
    normalized = re.sub(r"[.!?,]", "", transcript.strip())
    return len(normalized) < MIN_TRANSCRIPT_LENGTH


def should_filter(transcript: str) -> tuple[bool, str | None]:
    trimmed = transcript.strip()

    if not trimmed:
        return True, "empty"

    if is_too_short(trimmed):
        return True, "noise"

    if is_hallucination(trimmed):
        return True, "hallucination"

    return False, None


class HallucinationFilterProcessor(FrameProcessor):
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            filtered, reason = should_filter(frame.text)
            if filtered:
                print(f"[Filter] Dropped ({reason}): {frame.text!r}")
                return
            print(f"[Filter] Passed: {frame.text!r}")

        await self.push_frame(frame, direction)
