# Sound plan (proposal)

Status: PROPOSAL from a research pass on 2026-11-21. Can start in parallel with the visuals. Items marked UNVERIFIED must be checked before use. Licenses were checked from the linked pages on that date; re-check before shipping.

## Recommended stack
- **Engine:** Howler.js (MIT, https://github.com/goldfire/howler.js) for one-shots and loops. Raw Web Audio only for the positional entry cues and CHUD's voice chain.
- **Sources:** Sonniss GDC bundles (best quality, no attribution), Freesound filtered to CC0 only, Pixabay for fill. Skip anything CC-BY-NC or "personal/educational only".
- **Spatial:** one Web Audio `PannerNode` (HRTF) per entry cue; rotate the listener yaw with the current view.
- **CHUD voice:** Kokoro-82M (Apache-2.0) run locally to pre-generate the canned lines; live LLM replies show as text on the monitor with a synthetic "voice babble".
- **Cohesion:** everything through one master chain: shared steel-room convolution reverb, light compressor, limiter. Always-on quiet room-tone bed.
- **Format:** OGG Opus plus an MP3 fallback (Howler `src` array). Decode all SFX behind the "Click to begin" screen.
- **Hygiene:** keep a credits list from the first download. Never commit raw source sound files (Sonniss forbids redistributing raw files).

## 1. Sources and licenses
| Source | License facts | Best for |
|---|---|---|
| Sonniss GDC bundles (2015 to 2024) | No attribution. Use in games and editing/layering allowed. Raw files may NOT be redistributed as SFX or in a pack. AI/ML training prohibited. https://sonniss.com/gameaudiogdc | Storm, waves, door and hatch impacts, metal creaks, jumpscare hits, relays, footsteps |
| Freesound | Each upload is CC0, CC-BY or CC-BY-NC. CC0 needs no credit. CC-BY needs title, author, link and license in credits. Avoid CC-BY-NC. https://freesound.org/help/faq/ | Keyboard clicks, chair creak, breathing, specific one-shots |
| Pixabay | No attribution, modifying allowed, standalone resale prohibited. Read the full license for sound effects. https://pixabay.com/service/license-summary/ | Ambient fill, whooshes |
| ZapSplat | UNVERIFIED (free tier attribution terms) | Skip unless needed |
| Kenney | UNVERIFIED (believed CC0), little horror content | Minimal use |
| BBC Sound Effects | UNVERIFIED, believed personal/educational only. Do not use | None |
| OpenGameArt | Varies per asset, includes NC. Check each file | Occasional |

Shipping edited Sonniss audio inside the web build is part of the game; keep the raw download folder out of git.

## 2. Making it cohesive
- Edit in Audacity, Ocenaudio or Reaper (free evaluation): trim, normalize.
- Layer 2 to 3 sounds per key event. Hatch knock = wood thump + metal ring + low sub. Ladder rung = metal tap + small room reverb.
- EQ: high-pass at about 60 to 80 Hz, cut mud at 200 to 300 Hz. Muffle outside sounds with a low-pass at 1.5 to 3 kHz (storm through walls).
- Reverb: one shared short impulse response (about 0.6 to 1.2 s decay), steel-and-concrete character, on a send bus. Use a free IR with a verified license.
- Room-tone bed: low hum + faint distant surf + wind, always on and quiet. Silence between events is what makes cues scary.
- Loudness: about -16 LUFS integrated, true peak under -1 dBTP (common web convention, UNVERIFIED as a spec). Jumpscares louder but limited.
- Anti-repetition: 3 to 5 variants for keys, footsteps, creaks. In code: random variant (never the same twice in a row), pitch +/-4%, volume +/-2 dB.

## 3. Positional audio
- Skip Resonance Audio (treat as unmaintained). The Howler spatial plugin works but is not actively evolving.
- Create `PannerNode`s yourself with `panningModel: 'HRTF'`. Player at the origin facing the desk (-z):
  - left window: (-2, 0, 0)
  - hatch: (1.5, -2, 0.5), below-right
  - balcony door: (0, 0, +2.5), behind
- On every view change, tween the `AudioListener` yaw (about 250 ms) together with the turn whoosh.
- Create or resume the `AudioContext` on the first click ("Click to begin").
- Formats: Opus support in Safari is limited (iOS full from 18.4, desktop partial, https://caniuse.com/opus). Ship OGG Opus with an MP3 (~128 kbps) fallback. Keep SFX mono.
- Latency: play key clicks from pre-decoded buffers (Web Audio), never HTML5 Audio. Preload on the title screen.

## 4. CHUD voice
| Option | Facts | Verdict |
|---|---|---|
| Kokoro-82M | Apache-2.0, 54 preset voices, https://huggingface.co/hexgrad/Kokoro-82M. CPU speed UNVERIFIED | Use to pre-generate lines |
| Piper | Code GPL-3.0, seeking maintainers, per-voice licenses vary | Fallback only |
| Chatterbox | MIT, no longer maintained, watermarked output, needs a GPU | Not for live use |
| ElevenLabs | Free plan 10,000 credits/month; commercial terms on the free plan not stated, read terms first. https://elevenlabs.io/pricing | One-time batch fallback |
| XTTS-v2, F5-TTS, StyleTTS2 | UNVERIFIED, some believed non-commercial | Skip |

- Live TTS inside the 2.5 s turn budget is not reliable for free (the LLM already uses the budget).
- Hybrid: (a) pre-generate about 40 to 80 canned lines (greetings, lies, threats, morning lines) with Kokoro; (b) for live LLM lines, type the text on the monitor and play a synthetic babble (granular chops of Kokoro syllables, pitched).
- Kokoro uses preset voices, it does not clone. A truly custom cloned voice needs a cloning model whose license must be verified first.
- Monitor-speaker chain (Web Audio, applied to canned lines and babble alike): high-pass 300 Hz, low-pass 4 to 5 kHz, mild bitcrush via `WaveShaper`, very low-mix ring-mod (30 to 50 Hz) or short chorus, then the shared room reverb, faint hum underneath.

## 5. Plan
| Person | Work | Estimate |
|---|---|---|
| A, sound designer | Download, edit, layer; room tone and reverb IR; export | 6 to 8 h |
| B, voice | Line list with the narrative owner, Kokoro generation, post-process, naming | 3 to 4 h |
| C, engineer | `audio.ts`: load, play(name, opts), panners and listener, voice chain, mixer | 4 to 5 h |

- Folder: `public/audio/{amb,sfx,voice,ui}/`. Names `domain_event_variant.ogg`, e.g. `sfx_hatch_knock_02.ogg`, `voice_chud_night1_lie_03.ogg`. Manifest `audio.json` maps event IDs to files.
- **Must-have:** storm and wave bed, room hum bed, rain on glass, key clicks, head-turn whoosh and chair creak, the three entry cues (window tap, ladder rungs and hatch knock, door handle rattle), jumpscare, thunder, CHUD canned voice.
- **Nice-to-have:** dash footsteps and breathing, radio static and coast-guard lines, generator relay clunk, beacon motor, Ram's lines through the door.
- **Risks:** Sonniss download size (grab only needed packs), Safari formats (test early), Kokoro install on Windows (test run first), loudness mismatch (check on headphones).
- **Fallbacks:** if HRTF sounds weak, `StereoPannerNode` plus a low-pass for "behind"; if Kokoro fails, one ElevenLabs free-tier batch after reading the terms.
