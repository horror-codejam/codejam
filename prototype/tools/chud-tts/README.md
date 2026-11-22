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

Keep Piper running on port `5100` and start the game with `npm run dev` from `prototype/`. Select New Game or Continue on the title screen to unlock browser audio. CHUD's opening line, questions, lock and light responses, and conversation are voiced automatically.

The game sends the displayed line and its original mood to the same-origin `POST /api/tts` route. Hono forwards the request to Piper, and Web Audio plays the WAV from the desk. Speech plays one line at a time. The game displays subtitles and plays the chime immediately, including when Piper is offline. Pausing freezes voice playback. A power cutoff, restart, breach, dawn or return to the title clears pending and playing speech.

Piper runs with or without an Anthropic key. Claude can rewrite certain conversational lines, while Piper speaks the final text. The local Vite speech proxy expects Piper on the same machine.

```json
{"text":"I'm still here, keeper.","band":"WARM"}
```

`POST /tts` accepts 1–300 characters of final dialogue and one of the four bands above. A successful response is `200 audio/wav`.

## Vercel deployment

The repository root Vercel configuration deploys the Vite frontend and both API functions from `prototype/`. A project whose Root Directory is `prototype` uses that folder's configuration and requires access to the shared `scenes/` files outside it. Both configurations serve `POST /api/tts` from the Python function. On a cold instance, Piper downloads and verifies the pinned model into temporary storage. It reuses the initialized model on warm requests.

Set `ANTHROPIC_API_KEY` as a server-side Vercel environment variable if you want the Claude judge and generated dialogue. The Python speech function works with the game's canned dialogue without a key.

Verify that `GET /api/health` on the deployment returns JSON. Then request a WAV from the same deployment, substituting its URL below.

```sh
curl --fail --show-error --max-time 35 https://YOUR_DEPLOYMENT/api/tts \
  -H 'Content-Type: application/json' \
  --data '{"text":"Welcome, keeper.","band":"WARM"}' \
  -o /tmp/chud-vercel.wav
```

The first request may take longer while the model downloads. The game shows the subtitle and chime immediately. A `404` indicates a missing Vercel route. A `503` indicates Piper could not initialize. Check the Python function logs for download, checksum or dependency errors.
