import pytest
from processors.hallucination_filter import should_filter, is_hallucination, is_too_short


class TestIsHallucination:
    def test_thank_you_patterns(self):
        assert is_hallucination("thanks")
        assert is_hallucination("Thanks.")
        assert is_hallucination("Thank you")
        assert is_hallucination("Thanks for watching")
        assert is_hallucination("Thanks for watching.")

    def test_subscribe_patterns(self):
        assert is_hallucination("subscribe")
        assert is_hallucination("Subscribe")
        assert is_hallucination("Please subscribe")
        assert is_hallucination("like and subscribe")
        assert is_hallucination("Like and Subscribe")

    def test_goodbye_patterns(self):
        assert is_hallucination("bye")
        assert is_hallucination("Bye")
        assert is_hallucination("byeee")
        assert is_hallucination("see you next time")
        assert is_hallucination("See you later")
        assert is_hallucination("see you soon")

    def test_filler_sounds(self):
        assert is_hallucination("uh")
        assert is_hallucination("uhh")
        assert is_hallucination("um")
        assert is_hallucination("umm")
        assert is_hallucination("hmm")
        assert is_hallucination("hmmm")

    def test_periods_only(self):
        # After stripping punctuation, these become empty strings
        # which don't match any pattern. The should_filter catches them as noise.
        # The regex pattern still works for "..." in actual content.
        filtered, reason = should_filter("...")
        assert filtered
        assert reason == "noise"  # Caught as too short after punctuation stripped

    def test_valid_speech(self):
        assert not is_hallucination("hello")
        assert not is_hallucination("what's the weather like?")
        assert not is_hallucination("tell me a joke")
        assert not is_hallucination("thank you for helping me")  # Different from "thanks for watching"


class TestIsTooShort:
    def test_too_short(self):
        assert is_too_short("")
        assert is_too_short("a")
        assert is_too_short(".")
        assert is_too_short("?")

    def test_long_enough(self):
        assert not is_too_short("hi")
        assert not is_too_short("ok")
        assert not is_too_short("hello")


class TestShouldFilter:
    def test_empty(self):
        filtered, reason = should_filter("")
        assert filtered
        assert reason == "empty"

    def test_whitespace_only(self):
        filtered, reason = should_filter("   ")
        assert filtered
        assert reason == "empty"

    def test_noise(self):
        filtered, reason = should_filter("a")
        assert filtered
        assert reason == "noise"

    def test_hallucination(self):
        filtered, reason = should_filter("thanks for watching")
        assert filtered
        assert reason == "hallucination"

    def test_valid(self):
        filtered, reason = should_filter("what time is it?")
        assert not filtered
        assert reason is None
