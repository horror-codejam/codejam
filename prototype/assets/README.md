# Art slots

The game loads the final Blender renders from `scenes/03-watch-room/final/webp/` (WebP, committed) and the team's earlier renders from `scenes/` (map `SCENE_ART` in `src/ui/art.ts`). New files are picked up on reload. No copy step besides the WebP conversion below.

Each slot resolves, in order, to:
1. a file in this folder named after the slot (`.png`, `.webp` or `.jpg`): a manual override, for testing an image without touching `scenes/`
2. a final render in `scenes/03-watch-room/final/webp/` with the slot's name, or the final that an older slot name aliases to (`FINAL_ALIASES` in `src/ui/plates.ts`, for example `view_window` loads `view_window_off`)
3. the earlier render in `scenes/` listed in `SCENE_ART`
4. a coded placeholder (`src/ui/placeholders.ts`)

## Final renders: convert, then commit

Blender writes PNGs to `scenes/03-watch-room/final/png/<job>/` (not committed). Convert them from `prototype/`:

```
node tools/convert_renders.mjs
```

- Stills `png/<job>/<job>.png` become `final/webp/<job>.webp` (1920 x 960, quality 85).
- Sequences `png/<job>/<job>_0001.png ...` become `final/webp/<job>/<job>_0001.webp ...`.
- Idempotent: up-to-date files are skipped. A sequence whose newest frame is under 15 s old is skipped as still rendering; run again later.
- Renders in another checkout: `--src <path to final/png>` (or `RENDERS_SRC`). `--force` re-encodes everything.
- Then commit `scenes/03-watch-room/final/webp/`. The game only uses a sequence when its frames are numbered from 0001 with no gaps.

## The plate-swap rule

Final renders are full plates, one per state, never transparent overlays. When the state changes (Ram's visual, the entry light, standing or bracing) the whole plate swaps. The game shows the plate for the current state alone, with no night grade and no coded overlay on top. If that state's plate is missing, it falls back to the view with the coded overlay (the old behavior). `_on` means that entry's light is on (Shift held while looking at it), `_off` means dark.

Format: plates are 2:1, cover-fitted to 960 x 480 plate px (finals are 1920 x 960). The game pans across the plate, so keep important things away from the outer 10 % on the left and right.

## Slots

| Slot | Loads | What it is |
|---|---|---|
| `view_desk` | final `view_desk_off`, else `03-watch-room/render_blockout_cam_desk.png` | Desk view. The desk is never lit by an entry light (`view_desk_on` is unused). On the final plate the monitor glass is blacked out and CHUD's DOM terminal is scaled onto it (`FINAL_DESK_SCREEN` in `src/ui/scene.ts`); lightning and the beacon glow only on the glazing panes either side of the monitor |
| `view_<entry>_off` (alias `view_<entry>`) | final, else `03-watch-room/render_blockout_cam_<entry>.png` | Entry view, dark. Also the locked view: locked = blind, no tell |
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
| `title_loop`, `ambient_desk`, `desk_typing_<on\|off>`, `dash_*`, `turn_*` | final (when rendered) | Registered and preloaded (`artUrl` for stills, `artFrameUrls` / `artFrames` for sequences) but not shown by the game yet |
| `dash_floor` | `03-watch-room/render_dash_floor.png` | The floor the camera tips toward during the 1.5 s dash |
| `chud_faces` | `03-watch-room/chud_smiley_four_moods.png` | CHUD's four mood faces (WARM, HURT, JEALOUS, FURIOUS) on one sheet |
| `chud_face_malicious` | none yet (drop it in this folder) | CHUD's malicious smile, shown about 1.5 s when it refuses a lock, on sabotage and on JEALOUS or FURIOUS light cuts. Square, shown at 120 x 120. Without it: a coded red SVG grin with a glitch |
| `artifact_clipping` | `03-watch-room/chud_launch_newspaper_clipping_v2.png` | Desk paper (DOM only, never a texture). Hotspot positions: `ARTIFACTS` in `src/uiConfig.ts`, placed for the final desk |
| `artifact_notebook` | `03-watch-room/daniel_vale_notebook.jpg` | Desk paper (DOM only) |
| `artifact_calendar` | `03-watch-room/leaving_calendar_aged_pen.png` | Desk paper (DOM only) |
| `ending_lose` | `99-final-cage-hall/render_lose_in_cage.png` | Behind the loss screen |
| `ending_win` | `99-final-cage-hall/render_win_outside.png` | Behind the win screen |
| `intro` | `01-shipwreck/render_blockout.png` | Behind the name prompt |

Preload: `loadArt(onProgress?)` loads every texture slot and every final sequence frame before the game starts; `artProgress` (`{ done, total }`) holds the progress for a loading screen.

Audio (not art slots): `public/audio/amb/ambient-noise.m4a` loops under the night, `public/audio/sfx/jumpscare.wav` plays at the scare. Both were supplied with unverified reuse rights (docs/STATUS.md).
