"""Vercel's same-origin speech function."""

import sys
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from tempfile import gettempdir
from threading import Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "chud-tts"))
from chud_tts import VOICE, VOICE_REVISION, download_voice, load_voice, serve_speech

_models = Path(gettempdir()) / f"chud-piper-{VOICE}-{VOICE_REVISION[:12]}"
_load_lock = Lock()


@lru_cache(maxsize=1)
def _load():
    download_voice(_models)
    return load_voice(_models)


def get_voice():
    with _load_lock:
        return _load()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        serve_speech(self, get_voice)
