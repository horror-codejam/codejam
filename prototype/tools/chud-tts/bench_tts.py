"""Measure HTTP time until the WAV is ready to decode for ten CHUD lines."""

import argparse
import importlib
import json
import statistics
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from time import perf_counter
from urllib.request import Request, urlopen


LINES = [
    ("WARM", "I saw your boat go under.", "I pulled you into the lighthouse before the waves could carry you away. You're safe right here for now."),
    ("WARM", "I can see the hatch from here.", "Keep the light on it a little longer. I'll tell you if I see anything move."),
    ("HURT", "I thought you were listening.", "You can check the radio again if you want, but I wish you'd talk to me first."),
    ("JEALOUS", "You keep looking at the radio.", "I can hear the same static you can. It hasn't said anything worth leaving your chair for."),
    ("FURIOUS", "I heard what you said.", "If you want the hatch held shut tonight, you can walk over there and hold it yourself."),
    ("WARM", "You can come back to the desk.", ""),
    ("HURT", "I remember what you told me.", ""),
    ("JEALOUS", "Why look out there? Look at me.", ""),
    ("FURIOUS", "No. Hold it yourself.", ""),
    ("WARM", "The window is clear for now.", ""),
]


def wav_request(base_url, band, text):
    request = Request(
        base_url.rstrip("/") + "/api/tts",
        data=json.dumps({"band": band, "text": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    start = perf_counter()
    with urlopen(request, timeout=60) as response:
        if response.headers.get_content_type() != "audio/wav":
            raise ValueError(f"Unexpected content type: {response.headers.get_content_type()}")
        head = response.read(44)
        first_ms = (perf_counter() - start) * 1000
        size = len(head) + len(response.read())
        full_ms = (perf_counter() - start) * 1000
    if not head.startswith(b"RIFF") or size <= 44:
        raise ValueError("Expected a WAV containing speech")
    return first_ms, full_ms, size


def local_server():
    """Serve the actual Vercel handler on an OS-assigned loopback port."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api"))
    start = perf_counter()
    tts = importlib.import_module("tts")
    print(f"Handler import: {(perf_counter() - start) * 1000:.1f} ms")

    # The pre-bundle handler imports these functions into its module namespace.
    # Measure its cold stages in place, with the same request path as production.
    for name in ("download_voice", "load_voice"):
        if hasattr(tts, name):
            original = getattr(tts, name)

            def timed(*args, function=original, label=name):
                start = perf_counter()
                try:
                    return function(*args)
                finally:
                    print(f"{label}: {(perf_counter() - start) * 1000:.1f} ms", flush=True)

            setattr(tts, name, timed)

    class QuietHandler(tts.handler):
        def log_request(self, *args):
            pass

    return ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)


def benchmark(base_url, split):
    def measure(label, band, text):
        first_ms, full_ms, size = wav_request(base_url, band, text)
        print(f"{label:>8}  {first_ms:8.1f}  {full_ms:8.1f}  {size:8d}", flush=True)
        return full_ms

    print(" request  first ms  ready ms     bytes", flush=True)
    band, first, rest = LINES[0]
    measure("cold", band, f"{first} {rest}")
    ready = []
    for index, (band, first, rest) in enumerate(LINES, 1):
        text = first if split else f"{first} {rest}".strip()
        ready.append(measure(index, band, text))
        if split and rest:
            measure("tail", band, rest)
    print(f"Warm full-buffer median: {statistics.median(ready):.1f} ms")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--base-url", help="Same-origin base URL, e.g. http://localhost:5173")
    source.add_argument("--local-handler", action="store_true", help="Start api/tts.py on a private loopback port")
    parser.add_argument("--split", action="store_true", help="Measure the first segment of each long reply")
    args = parser.parse_args()
    if args.base_url:
        benchmark(args.base_url, args.split)
        return
    with local_server() as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            benchmark(f"http://127.0.0.1:{server.server_port}", args.split)
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
