# Art slots

Slots now load the team's renders from `scenes/` automatically (map `SCENE_ART` in `src/ui/art.ts`). Re-render a file in `scenes/` under the same name and the game picks it up on reload. No copy step.

Each slot resolves, in order, to:
1. a file in this folder named after the slot (`.png`, `.webp` or `.jpg`): a manual override, for testing an image without touching `scenes/`
2. the team render in `scenes/` listed below
3. a coded placeholder (`src/ui/placeholders.ts`)

Format: views are 2:1 plates fitted to 960 x 480 (the Blender cameras render 960 x 480). Overlays (tells, silhouettes) must have a transparent background and the same 960 x 480 framing as their view. The game pans across the plate, so keep important things away from the outer 10 % on the left and right.

| Slot | Loads from scenes/ | What it is |
|---|---|---|
| `view_desk` | `03-watch-room/render_blockout_cam_desk.png` | Desk view. CHUD's terminal is DOM drawn over the green screen (`DESK_SCREEN` in `src/ui/layout.ts`) |
| `view_window` | `03-watch-room/render_blockout_cam_window.png` | Left window |
| `view_hatch` | `03-watch-room/render_blockout_cam_hatch.png` | Right floor hatch |
| `view_balcony` | `03-watch-room/render_blockout_cam_balcony.png` | Rear balcony door |
| `view_window_beam` / `view_hatch_beam` / `view_balcony_beam` | none yet | Optional lit version. Without it the game warms the grade and adds an amber wash |
| `hold_window` / `hold_hatch` / `hold_balcony` | `03-watch-room/render_hold_*.png` | Close-up hold views |
| `dash_floor` | `03-watch-room/render_dash_floor.png` | The floor the camera tips toward during the 1.5 s dash |
| `chud_faces` | `03-watch-room/chud_smiley_four_moods.png` | CHUD's four mood faces (WARM, HURT, JEALOUS, FURIOUS) on one sheet |
| `ending_lose` | `99-final-cage-hall/render_lose_in_cage.png` | Behind the loss screen |
| `ending_win` | `99-final-cage-hall/render_win_outside.png` | Behind the win screen |
| `intro` | `01-shipwreck/render_blockout.png` | Behind the name prompt |
| `tell_window` / `tell_hatch` / `tell_balcony` | none yet (coded overlay) | Ram at the entry: hand print, fingers at the lid seam, figure in the door gap |
| `approach_window` / `approach_hatch` / `approach_balcony` | none yet (coded overlay) | Ram on his way, only visible with the beam on |
| `hold_tell_window` / `hold_tell_hatch` / `hold_tell_balcony` | none yet (coded overlay) | Ram's tell on the hold view |
| `jumpscare_window` / `jumpscare_hatch` / `jumpscare_balcony` | none yet (coded) | Single frame shown on breach |

To wire a new file from `scenes/`, add its path to the glob and to `SCENE_ART` in `src/ui/art.ts`.
