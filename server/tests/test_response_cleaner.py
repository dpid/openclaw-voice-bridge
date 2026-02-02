import pytest
from processors.response_cleaner import ResponseCleanerProcessor


class TestResponseCleaner:
    def setup_method(self):
        self.cleaner = ResponseCleanerProcessor()

    def test_strip_code_blocks(self):
        text = "Here's some code:\n```python\nprint('hello')\n```\nThat's it."
        result = self.cleaner._clean_for_speech(text)
        assert "```" not in result
        assert "(code block omitted)" in result

    def test_strip_links(self):
        text = "Check out [this link](https://example.com) for more info."
        result = self.cleaner._clean_for_speech(text)
        assert "https://example.com" not in result
        assert "this link" in result

    def test_strip_raw_urls(self):
        text = "Visit https://example.com for more."
        result = self.cleaner._clean_for_speech(text)
        assert "https://example.com" not in result

    def test_strip_bold(self):
        text = "This is **important** text."
        result = self.cleaner._clean_for_speech(text)
        assert "**" not in result
        assert "important" in result

    def test_strip_italic(self):
        text = "This is *emphasized* text."
        result = self.cleaner._clean_for_speech(text)
        assert "*" not in result
        assert "emphasized" in result

    def test_strip_inline_code(self):
        text = "Use the `print` function."
        result = self.cleaner._clean_for_speech(text)
        assert "`" not in result
        assert "print" in result

    def test_strip_headers(self):
        text = "# Title\n## Subtitle\nContent here."
        result = self.cleaner._clean_for_speech(text)
        assert "#" not in result
        assert "Title" in result

    def test_strip_bullets(self):
        text = "List:\n- item one\n- item two"
        result = self.cleaner._clean_for_speech(text)
        assert "-" not in result
        assert "item one" in result

    def test_strip_numbered_list(self):
        text = "List:\n1. first\n2. second"
        result = self.cleaner._clean_for_speech(text)
        assert "1." not in result
        assert "first" in result

    def test_multiple_newlines_to_pause(self):
        text = "First paragraph.\n\nSecond paragraph."
        result = self.cleaner._clean_for_speech(text)
        assert "\n" not in result
        assert ". " in result

    def test_single_newlines_to_space(self):
        text = "Line one.\nLine two."
        result = self.cleaner._clean_for_speech(text)
        assert "\n" not in result
        assert "Line one. Line two." in result

    def test_strip_table_rows(self):
        text = "Data:\n| Name | Value |\n| --- | --- |\n| A | 1 |"
        result = self.cleaner._clean_for_speech(text)
        assert "|" not in result

    def test_strip_voice_echo(self):
        text = '> :microphone: "What time is it?"\n\nIt\'s 3 PM.'
        result = self.cleaner._clean_for_speech(text)
        assert "microphone" not in result
        assert "What time is it" not in result
        assert "3 PM" in result

    def test_strip_voice_echo_emoji(self):
        text = '\U0001F3A4 "This is a test message."\n\nHere is my response.'
        result = self.cleaner._clean_for_speech(text)
        assert "test message" not in result
        assert "Here is my response" in result

    def test_strip_voice_echo_blockquote(self):
        text = '> "A broken pencil.". A broken pencil who?'
        result = self.cleaner._clean_for_speech(text)
        assert "A broken pencil" not in result or result.count("broken pencil") == 1
        assert "who" in result

    def test_preserve_plain_text(self):
        text = "The weather today is sunny with a high of 72 degrees."
        result = self.cleaner._clean_for_speech(text)
        assert result == text
