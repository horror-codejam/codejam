# Art slots

The game loads the final Blender renders from `scenes/03-watch-room/final/` and the team's earlier renders from `scenes/` (map `SCENE_ART` in `src/ui/art.ts`). New conversions are picked up on reload.

Each slot resolves, in order, to:

1. a final WebP in `scenes/03-watch-room/final/webp/` with its slot name or its canonical name in `FINAL_ALIASES`
2. a file in this folder named after the slot (`.png`, `.webp`, `.jpg` or `.jpeg`) if the final is missing
3. the earlier render in `scenes/` listed in `SCENE_ART`
4. a coded placeholder for slots that still support one

## Final renders: convert, then commit

Blender writes PNGs to `scenes/03-watch-room/final/png/<job>/` (not committed). Convert them from `prototype/`:

```
node tools/convert_renders.mjs
```

- Stills `png/<job>/<job>.png` become `final/webp/<job>.webp` (1600 x 800, quality 85).
- Jumpscares stay at 1280 x 640 as numbered frames in `final/webp/jumpscare_<entry>/`.
- Other contiguous sequences become 24 fps VP9 WebM, targeting 3 Mbps, in `final/webm/<job>.webm`. The title loop goes to `final/title_loop.webm`. The title, ambient and typing clips loop; dash and turn clips play once.
- A sequence is converted once `final/render_log.txt` records its final render ending, or after 15 seconds without a frame update when the log is absent. The converter skips up-to-date outputs.
- Renders in another checkout: `--src <path to final/png>` (or `RENDERS_SRC`). `--force` re-encodes everything.
- Commit the WebP stills and scare frames, plus the finished WebMs. Frame numbering must start at 0001 with no gaps.

## The plate-swap rule

Final renders are full plates, one per state, never transparent overlays. When the state changes (Ram's visual, the entry light, standing or bracing) the whole plate swaps. The game shows the plate for the current state alone, with no night grade and no coded overlay on top. If that state's plate is missing, it falls back to the view with the coded overlay (the old behavior). `_on` means that entry's light is on (Shift held while looking at it), `_off` means dark.

Format: plates are 2:1, cover-fitted to 960 x 480 plate px. The game pans across the plate, so keep important things away from the outer 10% on either side.

## Slots

| Slot | Loads | What it is |
|---|---|---|
| `view_desk` | final `view_desk_off`, else `03-watch-room/render_blockout_cam_desk.png` | Desk view. The four normalized corners in `cam_desk_screen.json` locate both the glass mask and the DOM terminal. Lightning and the fallback beacon sweep are restricted to the side panes |
| `view_<entry>_off` (alias `view_<entry>`) | final, else `03-watch-room/render_blockout_cam_<entry>.png` | Entry view from the desk, dark and empty |
| `view_<entry>_on` (alias `view_<entry>_beam`) | final | Entry view with its light on. Without it: the blockout with a warm grade and an amber wash (`lit_<entry>`) |
| `tell_<entry>_off` / `tell_<entry>_on` | final | Ram at the entry: faint in the dark, clear with the light. Replaces the whole view. Fallback: coded overlay on the view |
| `approach_<entry>_on` | final | Ram on his way, only visible with the light on. Fallback: coded overlay |
| `inside_<entry>_on` (alias `ram_inside_<entry>`) | final, else `04-ram/ram_inside_<entry>.png` | Ram standing just inside the open entry, lit, from the seated camera. Shown while he is inside with that light on, and as the creepy flash (about 0.4 s) before the jumpscare |
| `hold_<entry>_<stand\|brace>_<empty\|tell>_<on\|off>` | final | Close-up at the entry, 8 plates per entry. The brace plates include the player's arms, so the painted arms are not drawn; the camera carries the brace motion (lean, tremor, Ram's shoves). Fallback: `hold_<entry>` with the coded tell and painted arms |
| `hold_<entry>` | final `hold_<entry>_stand_empty_off`, else `03-watch-room/render_hold_<entry>.png` | Fallback hold base |
| `brace_arms_<entry>` | none (painted overlay, `braceArms` in `src/ui/placeholders.ts`) | Fallback only, when no final hold plate exists for the state |
| `jumpscare_<entry>` (sequence) | final `jumpscare_<entry>/jumpscare_<entry>_0001.webp ...`, at least 24 frames, 1280 x 640 | The jumpscare for the breach entry, played at 24 fps, cover-fitted to the stage, `jumpscare.wav` at frame 1, last frame held until the loss screen. Fallback: `ram_jumpscare_1..4` |
| `ram_jumpscare_1` .. `ram_jumpscare_4` | `04-ram/ram_jumpscare_<n>.png` | Fallback jumpscare, four stills, 1280 x 720. Coded stand-in: `ramJumpscare` |
| `title_bg` | final | Title screen background (DOM, `artUrl("title_bg")`) |
| `title_loop` | `final/title_loop.webm` | Muted title background loop, requested when the title opens |
| `ambient_desk` | `final/webm/ambient_desk.webm` | Muted 2:1 ambient plate below the calibrated monitor, played at the powered desk. The coded sweep fills in while the clip is unavailable. |
| `desk_typing_off` | `final/webm/desk_typing_off.webm` | Muted 2:1 desk-camera loop, above ambient and below the monitor mask, visible only during player typing. Match the framing of `view_desk_off`. The desk stays dark, so `desk_typing_on` is unused. |
| `dash_<entry>_go`, `dash_<entry>_back` | `final/webm/<job>.webm` | Muted 36-frame runs at 24 fps (1.5 s). The outward run starts at the desk and ends at the hold view. Return uses the reverse endpoints. The missing-clip path dips to black between stills with camera shake. |
| `turn_<from>_<to>` | `final/webm/<job>.webm` | Muted one-shot in each direction between the desk and each entry. Turns run for 0.25 s, or 0.4 s for the balcony. Missing clips use the plate slide. |
| `chud_faces` | `03-watch-room/chud_smiley_four_moods.png` | CHUD's four mood faces (WARM, HURT, JEALOUS, FURIOUS) on one sheet |
| `chud_face_malicious` | final `chud_face_malicious.webp`, or an asset slot if the final is missing | Dedicated face for refusal, sabotage and higher-suspicion light cuts. While that slot is empty, the terminal styles the smiling pose on the mood sheet. The legacy SVG needs both art sources to be unavailable. |
| `artifact_clipping` | `03-watch-room/chud_launch_newspaper_clipping_v2.png` | DOM-only desk paper. The three papers are gated by `ARTIFACTS_ENABLED` in `src/uiConfig.ts`, off by default |
| `artifact_notebook` | `03-watch-room/daniel_vale_notebook.jpg` | Desk paper (DOM only) |
| `artifact_calendar` | `03-watch-room/leaving_calendar_aged_pen.png` | Desk paper (DOM only) |

Preload: `loadArt(onProgress?)` loads the in-game stills and complete jumpscare sequences. It loads the four legacy scare stills if a sequence is missing or fails to load. The WebMs stay out of the texture preload. The title opens its video on demand, and the game requests optional clips once play begins. Reduced motion uses the same paths as missing clips.

Audio (not art slots): `public/audio/amb/ambient-noise.m4a` loops under the night, `public/audio/sfx/jumpscare.wav` plays at the scare. Both were supplied with unverified reuse rights (docs/STATUS.md).
