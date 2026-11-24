"""Fill and verify the CHUD clip catalog. Run after npm install, with FFmpeg on PATH."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile

import chud_tts


HERE = Path(__file__).resolve().parent
PROTOTYPE = HERE.parents[1]
ROOT = PROTOTYPE.parent
AUDIO = PROTOTYPE / "assets" / "audio"
DIALOGUE = AUDIO / "dialogue.json"
VOICE_TAG = f"CHUD_VOICE={chud_tts.VOICE}@{chud_tts.VOICE_REVISION}"


def legacy_ryan_blobs():
    """The original 398 Ryan additions are the only trusted untagged clips."""
    result = subprocess.run(
        ["git", "diff-tree", "--no-commit-id", "--diff-filter=A", "--abbrev=40", "-r",
         "b28293c", "--", "prototype/assets/audio"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return {
        Path(path).name: fields.split()[3]
        for fields, path in (line.split("\t", 1) for line in result.stdout.splitlines())
        if Path(path).match("chud_*.ogg")
    }


def has_voice(path, legacy):
    if not path.is_file():
        return False
    with path.open("rb") as source:
        head = source.read(8192)
        if head.startswith(b"OggS") and VOICE_TAG.encode() in head:
            return True
        if path.name not in legacy:
            return False
        data = head + source.read()
    git_blob = f"blob {len(data)}\0".encode() + data
    return hashlib.sha1(git_blob).hexdigest() == legacy[path.name]


def render(voice, band, text, path):
    wav = chud_tts.synthesize(voice, text, band)
    ogg = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0",
         "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-b:a", "64k",
         "-metadata", VOICE_TAG, "-f", "ogg", "pipe:1"],
        input=wav, stdout=subprocess.PIPE, check=True,
    ).stdout
    if not ogg.startswith(b"OggS") or VOICE_TAG.encode() not in ogg[:8192]:
        raise ValueError(f"FFmpeg did not write a tagged Ogg for {path.name}")
    publish(path, ogg)


def publish(path, data):
    temporary = NamedTemporaryFile(dir=path.parent, prefix=".", suffix=".tmp", delete=False)
    output = Path(temporary.name)
    try:
        with temporary:
            temporary.write(data)
        output.replace(path)
    finally:
        output.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the catalog without synthesizing or writing")
    args = parser.parse_args()
    catalog = json.loads(subprocess.check_output(
        ["node", "node_modules/vite-node/vite-node.mjs", "tools/chud-tts/export-lines.ts"],
        cwd=PROTOTYPE,
    ))
    dialogue = json.loads(DIALOGUE.read_text(encoding="utf-8"))
    clips = dialogue["chud"]
    lookup = {mood: {text.lower(): file for text, file in lines.items()} for mood, lines in clips.items()}
    legacy = legacy_ryan_blobs()
    files_to_render = {
        file: (mood.upper(), text)
        for mood, lines in clips.items() for text, file in lines.items()
        if not has_voice(AUDIO / file, legacy)
    }
    replaced = len(files_to_render)
    fixed_before = sum(item["text"].lower() in lookup[item["band"].lower()] for item in catalog["fixed"])
    added = 0
    for item in catalog["clips"]:
        band, text = item["band"], item["text"]
        mood = band.lower()
        if text.lower() in lookup[mood]:
            continue
        key = f"{band}|{text.lower()}".encode()
        file = f"chud_{mood}_{hashlib.sha256(key).hexdigest()[:20]}.ogg"
        clips[mood][text] = file
        lookup[mood][text.lower()] = file
        added += 1
        if not has_voice(AUDIO / file, {}):
            files_to_render[file] = band, text

    stale_index = dialogue.get("chudNamed") != catalog["named"]
    dialogue["chudNamed"] = catalog["named"]
    if args.check and (files_to_render or added or stale_index):
        parser.exit(1, f"CHUD catalog is out of date ({len(files_to_render)} clips to render). Run gen_clips.py.\n")
    if files_to_render or added or stale_index:
        print(f"Rendering {len(files_to_render)} clips ({replaced} missing or using an unverified voice)", flush=True)
        if files_to_render:
            voice = chud_tts.load_voice(chud_tts.BUNDLED_VOICE)
            for index, (file, (band, text)) in enumerate(files_to_render.items(), 1):
                render(voice, band, text, AUDIO / file)
                if index % 50 == 0 or index == len(files_to_render):
                    print(f"Rendered {index}/{len(files_to_render)}", flush=True)
        publish(DIALOGUE, (json.dumps(dialogue, indent=2, ensure_ascii=False) + "\n").encode())

    indexed = {file for lines in clips.values() for file in lines.values()}
    actual = {path.name for path in AUDIO.glob("chud_*.ogg")}
    if actual != indexed:
        parser.exit(1, f"CHUD files differ from the index: {sorted(actual ^ indexed)}\n")
    fixed = len(catalog["fixed"])
    named = sum(len(lines) for lines in catalog["named"].values())
    print(f"Fixed canned coverage: {fixed}/{fixed} ({fixed_before} already indexed)")
    print(f"Personalized templates with a recorded segment: {named}/{catalog['namedTotal']}")
    print(f"Total Ryan clips, including older indexed lines: {len(indexed)}")


if __name__ == "__main__":
    main()
