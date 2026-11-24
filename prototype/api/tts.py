"""Vercel's same-origin speech function."""

import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "chud-tts"))
from chud_tts import BUNDLED_VOICE, load_voice, serve_speech

try:
    _voice = load_voice(BUNDLED_VOICE)
    _load_error = None
except Exception as error:
    _voice = None
    _load_error = str(error)


def get_voice():
    if _load_error is not None:
        raise RuntimeError(_load_error)
    return _voice


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        serve_speech(self, get_voice)
