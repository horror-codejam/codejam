"""Local Piper speech service for CHUD."""

import argparse
import hashlib
import io
import json
import math
import re
import sys
import wave
from array import array
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


VOICE = "en_US-ryan-medium"
BUNDLED_VOICE = Path(__file__).resolve().parent / "voice"
VOICE_HASHES = {
    f"{VOICE}.onnx": "abf4c274862564ed647ba0d2c47f8ee7c9b717d27bdad9219100eb310db4047a",
    f"{VOICE}.onnx.json": "44034c056cb15681b2ad494307c7f3f2e4499d1253c700c711fa0a4607ffe78d",
}
FORBIDDEN_NAME = re.compile(r"\b(?:ram|altman)\b", re.IGNORECASE | re.ASCII)


@dataclass(frozen=True)
class Delivery:
    length_scale: float
    pitch_semitones: float
    volume: float
    cutoff_hz: int
    drive: float


DELIVERIES = {
    "WARM": Delivery(0.95, 0.4, 0.82, 4200, 1.0),
    "HURT": Delivery(1.12, -0.5, 0.66, 3400, 1.0),
    "JEALOUS": Delivery(1.04, -1.0, 0.74, 3000, 1.3),
    "FURIOUS": Delivery(1.25, -2.0, 0.67, 2600, 2.1),
}


def load_voice(model_dir):
    from piper import PiperVoice

    for filename, expected in VOICE_HASHES.items():
        path = model_dir / filename
        if not path.is_file():
            raise ValueError(f"Missing {path}. See README.md for the pinned voice files.")
        with path.open("rb") as source:
            digest = hashlib.sha256()
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected:
            raise ValueError(f"Wrong Ryan revision: {path}. See README.md for the pinned voice files.")
    return PiperVoice.load(model_dir / f"{VOICE}.onnx")


def shape_voice(samples, rate, delivery):
    """Shift pitch slightly and filter the voice through the terminal speaker."""
    step = 2 ** (delivery.pitch_semitones / 12)
    lowpass = 1 - math.exp(-2 * math.pi * delivery.cutoff_hz / rate)
    highpass = 1 - math.exp(-2 * math.pi * 220 / rate)
    low = baseline = 0.0
    output = array("h")
    saturation = math.tanh(delivery.drive)
    for index in range(math.ceil(len(samples) / step)):
        position = min(index * step, len(samples) - 1)
        left = int(position)
        right = min(left + 1, len(samples) - 1)
        sample = (samples[left] + (samples[right] - samples[left]) * (position - left)) / 32768
        baseline += highpass * (sample - baseline)
        low += lowpass * (sample - baseline - low)
        saturated = math.tanh(low * delivery.drive) / saturation
        level = max(-1.0, min(1.0, saturated * delivery.volume))
        output.append(round(level * 32767))
    return output


def synthesize(voice, text, band):
    from piper import SynthesisConfig

    delivery = DELIVERIES[band]
    settings = SynthesisConfig(length_scale=delivery.length_scale)
    chunks = list(voice.synthesize(text, syn_config=settings))
    if not chunks:
        raise ValueError("The text did not produce any speech.")
    original = array("h", b"".join(chunk.audio_int16_bytes for chunk in chunks))

    rate = chunks[0].sample_rate
    samples = shape_voice(original, rate, delivery)
    if not samples:
        raise ValueError("The text did not produce any speech.")
    if sys.byteorder == "big":
        samples.byteswap()
    with io.BytesIO() as buffer:
        with wave.open(buffer, "wb") as wav:
            wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            wav.writeframes(samples.tobytes())
        return buffer.getvalue()


def parse_request(raw):
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object.")
    text = payload.get("text")
    band = payload.get("band")
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 300:
        raise ValueError("text must contain 1 to 300 characters.")
    if FORBIDDEN_NAME.search(text):
        raise ValueError("The speech contains a forbidden name.")
    if not isinstance(band, str) or band not in DELIVERIES:
        raise ValueError("band must be WARM, HURT, JEALOUS, or FURIOUS.")
    return text.strip(), band


def serve_speech(request, get_voice):
    if request.headers.get_content_type() != "application/json":
        request.send_error(415, "Expected application/json")
        return
    try:
        size = int(request.headers.get("Content-Length", "0"))
        if not 1 <= size <= 4096:
            raise ValueError("Invalid request size.")
        text, band = parse_request(request.rfile.read(size))
    except (ValueError, TimeoutError) as error:
        request.send_error(400, str(error))
        return

    try:
        voice = get_voice()
    except Exception as error:
        request.log_error("Piper model unavailable: %s", error)
        request.send_error(503, "Piper model unavailable")
        return

    try:
        wav = synthesize(voice, text, band)
    except ValueError as error:
        request.send_error(422, str(error))
        return
    request.send_response(200)
    request.send_header("Content-Type", "audio/wav")
    request.send_header("Cache-Control", "no-store")
    request.send_header("Content-Length", str(len(wav)))
    request.end_headers()
    request.wfile.write(wav)


class SpeechHandler(BaseHTTPRequestHandler):
    timeout = 5

    def do_POST(self):
        if self.path != "/tts":
            self.send_error(404)
            return
        serve_speech(self, lambda: self.server.voice)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, default=BUNDLED_VOICE)
    parser.add_argument("--port", type=int, default=5100)
    args = parser.parse_args()
    try:
        voice = load_voice(args.models)
    except (ImportError, OSError, ValueError) as error:
        parser.exit(1, f"{error}\nSee README.md for setup.\n")

    with HTTPServer(("127.0.0.1", args.port), SpeechHandler) as server:
        server.voice = voice
        print(f"{VOICE} ready at http://127.0.0.1:{server.server_port}/tts", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
