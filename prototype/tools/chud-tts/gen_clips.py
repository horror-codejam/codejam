"""Pre-generates .ogg clips for the scripted lines that have none yet (see export-lines.ts).

Run from prototype/ with the venv from README.md:
  npx vite-node tools/chud-tts/export-lines.ts > tools/chud-tts/models/missing.json
  tools/chud-tts/.venv/Scripts/python.exe tools/chud-tts/gen_clips.py

Each clip uses the same Piper voice and band delivery as the live /api/tts route. Needs ffmpeg on PATH.
"""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import chud_tts  # noqa: E402

AUDIO = HERE.parent.parent / "assets" / "audio"
DIALOGUE = AUDIO / "dialogue.json"


def main():
    missing = json.loads((HERE / "models" / "missing.json").read_text(encoding="utf-8"))["missing"]
    dialogue = json.loads(DIALOGUE.read_text(encoding="utf-8"))
    voice = chud_tts.load_voice(HERE / "models")
    counters = {}
    for done, item in enumerate(missing, 1):
        band, text = item["band"], item["text"]
        mood = band.lower()
        if text in dialogue["chud"][mood]:
            continue
        counters[mood] = counters.get(mood, 0) + 1
        name = f"chud_{mood}_pacing_{counters[mood]:03d}.ogg"
        while (AUDIO / name).exists():
            counters[mood] += 1
            name = f"chud_{mood}_pacing_{counters[mood]:03d}.ogg"
        wav = chud_tts.synthesize(voice, text, band)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-b:a", "64k", str(AUDIO / name)],
            input=wav,
            check=True,
        )
        dialogue["chud"][mood][text] = name
        print(f"{done}/{len(missing)} {name}", flush=True)
    DIALOGUE.write_text(json.dumps(dialogue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
