# Art slots

Drop a render here with one of these exact names and it replaces the coded placeholder on the next reload. No code change needed. Any missing file falls back to the placeholder, so art can land one image at a time.

Format: PNG, WebP or JPG. Full views are drawn to cover a 1280 x 720 stage (wider renders are fine, they are centered). Overlays (tells, silhouettes) must have a transparent background and the same framing as their view.

| File name (any of .png .webp .jpg) | What it is |
|---|---|
| `view_desk` | Desk view: CHUD's CRT, desk, ocean behind. CHUD's face is drawn in code on top, inside the CRT rectangle (see `src/ui/layout.ts`) |
| `view_window` | Left window, dark (no beam) |
| `view_window_beam` | Left window, lit by the beam |
| `view_hatch` | Right floor hatch, dark |
| `view_hatch_beam` | Right floor hatch, lit |
| `view_balcony` | Rear balcony door and rail, dark |
| `view_balcony_beam` | Rear balcony, lit |
| `tell_window` | Overlay: fog and hand print on the glass (shown faint without beam, full with beam) |
| `tell_hatch` | Overlay: fingers at the lid seam |
| `tell_balcony` | Overlay: Ram's partial silhouette at the rail |
| `approach_window` / `approach_hatch` / `approach_balcony` | Overlay: Ram climbing toward that entry, only visible with the beam on |
| `hold_window` / `hold_hatch` / `hold_balcony` | Close-up hold view: the player's hands bracing that entry |
| `hold_tell_window` / `hold_tell_hatch` / `hold_tell_balcony` | Overlay on the hold view while Ram is at that entry |
| `dash_floor` | The floor the camera tips toward during the 1.5 s dash |
| `jumpscare_window` / `jumpscare_hatch` / `jumpscare_balcony` | Single frame shown on breach (frame sequences later) |

Renders from Blender go to `art/renders/` per STATUS.md. Copy the game-ready export here under the slot name.
