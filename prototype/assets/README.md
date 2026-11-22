# Art slots

Slots now load the team's renders from `scenes/` automatically (map `SCENE_ART` in `src/ui/art.ts`). Re-render a file in `scenes/` under the same name and the game picks it up on reload. No copy step.

Each slot resolves, in order, to:
1. a file in this folder named after the slot (`.png`, `.webp` or `.jpg`): a manual override, for testing an image without touching `scenes/`
2. the team render in `scenes/` listed below
3. a coded placeholder (`src/ui/placeholders.ts`)

Format: views are 2:1 plates fitted to 960 x 480 (the Blender cameras render 960 x 480). Overlays (tells, silhouettes) must have a transparent background and the same 960 x 480 framing as their view. The game pans across the plate, so keep important things away from the outer 10 % on the left and right.

| Slot | Loads from scenes/ | What it is |
|---|---|---|
| `title_bg` | `03-watch-room/final/png/title_bg/title_bg.png` | Title still. Falls back to `view_desk_off`, then `view_desk` |
| `title_loop` | `03-watch-room/final/title_loop.webm` | Optional muted video over the title still |
| `view_desk` | `03-watch-room/render_blockout_cam_desk.png` | Desk view. CHUD's terminal is DOM drawn over the green screen (`DESK_SCREEN` in `src/ui/layout.ts`) |
| `view_window` | `03-watch-room/render_blockout_cam_window.png` | Left window |
| `view_hatch` | `03-watch-room/render_blockout_cam_hatch.png` | Right floor hatch |
| `view_balcony` | `03-watch-room/render_blockout_cam_balcony.png` | Rear balcony door |
| `view_window_beam` / `view_hatch_beam` / `view_balcony_beam` | none yet | Optional lit version of the entry (its own light on, held with Shift). Without it the game warms the grade and adds an amber wash (`lit_<entry>`) |
| `hold_window` / `hold_hatch` / `hold_balcony` | `03-watch-room/render_hold_*.png` | Close-up hold views |
| `dash_floor` | `03-watch-room/render_dash_floor.png` | The floor the camera tips toward during the 1.5 s dash |
| `chud_faces` | `03-watch-room/chud_smiley_four_moods.png` | CHUD's four mood faces (WARM, HURT, JEALOUS, FURIOUS) on one sheet |
| `chud_face_malicious` | none yet (drop it in this folder, or add a `03-watch-room` file to `SCENE_ART`) | CHUD's malicious smile, shown about 1.5 s when it refuses a lock, on sabotage and on JEALOUS or FURIOUS light cuts. Square, shown at 120 x 120 with `background-size: cover`. Without it: a coded red SVG grin with a glitch |
| `artifact_clipping` | `03-watch-room/chud_launch_newspaper_clipping_v2.png` | Desk paper: thumbnail on the sill and the full-screen read (DOM only, never a texture) |
| `artifact_notebook` | `03-watch-room/daniel_vale_notebook.jpg` | Desk paper: the old keeper's notebook (DOM only) |
| `artifact_calendar` | `03-watch-room/leaving_calendar_aged_pen.png` | Desk paper: the leaving calendar (DOM only) |
| `ram_inside_window` / `ram_inside_hatch` / `ram_inside_balcony` | `04-ram/ram_inside_<entry>.png` | Ram standing in the room just inside that entry, 960 x 480 from the entry camera. Shown over the lit entry view while he is inside, and as the creepy flash (about 0.4 s) before the jumpscare. Coded stand-in: `ramInside` |
| `ram_jumpscare_1` .. `ram_jumpscare_4` | `04-ram/ram_jumpscare_<n>.png` | The jumpscare, four frames each closer, 1280 x 720 (stage size, cover-fitted). Played with `public/audio/sfx/jumpscare.wav`. Coded stand-in: `ramJumpscare` |
| `ending_lose` | `99-final-cage-hall/render_lose_in_cage.png` | Legacy cage-hall loss render |
| `ending_win` | `99-final-cage-hall/render_win_outside.png` | Legacy cage-hall win render |
| `intro` | `01-shipwreck/render_blockout.png` | Behind the name prompt |
| `tell_window` / `tell_hatch` / `tell_balcony` | none yet (coded overlay) | Ram at the entry: hand print, fingers at the lid seam, figure in the door gap |
| `approach_window` / `approach_hatch` / `approach_balcony` | none yet (coded overlay) | Ram on his way, only visible with that entry's light on |
| `hold_tell_window` / `hold_tell_hatch` / `hold_tell_balcony` | none yet (coded overlay) | Ram's tell on the hold view |
| `brace_arms_window` / `brace_arms_hatch` / `brace_arms_balcony` | none yet (painted overlay, `braceArms` in `src/ui/placeholders.ts`) | The player's forearms and hands pressed on the entry, shown only while bracing. Transparent background, same 960 x 480 framing as `hold_<entry>`, arms entering from the bottom of frame. Keep clear of Ram's hold tell (window: hand print on the left pane around x 280 to 440, y 120 to 300; hatch: fingers at the near seam, x 400 to 575; balcony: the door gap on the left edge, x 120 to 230). The game slides it in from below, shakes it and slips it down with fatigue |

To wire a new file from `scenes/`, add its path to the glob and to `SCENE_ART` in `src/ui/art.ts`. Everything in `scenes/04-ram/*.png` is already globbed.

Audio (not art slots): `public/audio/amb/ambient-noise.m4a` loops under the night, `public/audio/sfx/jumpscare.wav` plays at the scare. Both were supplied with unverified reuse rights (docs/STATUS.md).
