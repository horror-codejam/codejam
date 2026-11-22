# CHUD speech handoff

This local service accepts CHUD's final dialogue and current mood, then returns a mono WAV ready for Web Audio. It runs alongside the prototype and needs no API key.

## Voice

The voice is Piper's `en_US-ryan-medium`, the model used by the Local provider in Verity JE 6.0.0. The pinned upstream model has the same values for all 396 named initializers retained by the mod's optimized graph, and the model config is byte-for-byte identical. The service checks the SHA-256 of the upstream model and config before loading them.

| CHUD band | Delivery |
| --- | --- |
| `WARM` | A little brighter, quicker, and clearer |
| `HURT` | Slower, softer, and slightly lower |
| `JEALOUS` | Lower and tighter with a hint of speaker distortion |
| `FURIOUS` | Deliberate, low, and more distorted, with restrained volume |

The presets use Piper's speaking-rate control plus pitch, level, tone, and saturation processing on the same voice. Piper synthesizes the dialogue as supplied.

Sources: [Verity JE 6.0.0](https://www.curseforge.com/minecraft/mc-mods/verity-je/files/9300987), [pinned Ryan voice and config](https://huggingface.co/rhasspy/piper-voices/tree/b145f2ac26522d6a2ccde0164b7b0e48b1e3199c/en/en_US/ryan/medium), [Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/v1.4.2/docs/API_PYTHON.md). The Piper runtime and voice files are downloaded separately. [Piper licensing](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md) · [Ryan model card](https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_US/ryan/medium/MODEL_CARD)

## Run and audition

From the repo root, with Python 3.10–3.13:

```sh
cd prototype/tools/chud-tts
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
mkdir -p models
ryan_url='https://huggingface.co/rhasspy/piper-voices/resolve/b145f2ac26522d6a2ccde0164b7b0e48b1e3199c/en/en_US/ryan/medium'
curl --fail --location "$ryan_url/en_US-ryan-medium.onnx" -o models/en_US-ryan-medium.onnx
curl --fail --location "$ryan_url/en_US-ryan-medium.onnx.json" -o models/en_US-ryan-medium.onnx.json
.venv/bin/python chud_tts.py
```

On Windows, use `py -m venv .venv`, run `.venv\Scripts\python.exe` in place of `.venv/bin/python`, and download the two files from the pinned model link into `models/`.

In another terminal, run this from the repo root to audition one line in every mood. The WAVs go in the ignored `models/` directory.

```sh
cd prototype/tools/chud-tts
for band in WARM HURT JEALOUS FURIOUS; do
  curl --fail --silent --show-error http://127.0.0.1:5100/tts \
    -H 'Content-Type: application/json' \
    --data "{\"text\":\"I am still here, keeper.\",\"band\":\"$band\"}" \
    -o "models/chud-${band}.wav"
done
```

## Prototype integration

1. In `prototype/src/main.ts`, carry `ev.band` from `CHUD_SAY` into `showChud` for both canned and generated dialogue. Start the speech request when the final subtitle appears. Keep the existing night-token check around asynchronous playback.
2. Add a same-origin `POST /api/tts` to the Hono dev server. Forward JSON of the form below to `http://127.0.0.1:5100/tts` with a timeout and return the WAV. The local service binds to loopback, so the Vite/Hono server must run on the same machine. A hosted build needs a separately hosted service or baked clips.
3. Decode the WAV in the existing Web Audio context and play it from the desk. Stop pending and active speech when CHUD powers off or the night restarts. Keep subtitles and the chime available when synthesis fails.
4. Pre-render time-critical warnings and power-cut lines with the same endpoint. Play those from cached buffers so timing stays independent of synthesis.

```json
{"text":"I'm still here, keeper.","band":"WARM"}
```

`POST /tts` accepts 1–300 characters of final dialogue and one of the four bands above. A successful response is `200 audio/wav`.
