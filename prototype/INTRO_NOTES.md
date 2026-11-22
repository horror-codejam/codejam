# Intro cutscene (scene 1, shipwreck)

Files: `src/ui/intro.ts`, `src/ui/intro.css`, `tests/intro.test.ts`. Self-contained, nothing else edited.

## API
```ts
import { playIntro } from "./ui/intro";
const h = playIntro({ root: $("ui"), onDone: () => {}, muted: false }); // h.skip(), h.destroy()
```
- `root` is the 1280x720 stage overlay. The intro adds a full-stage layer (z-index 900, captures pointer) and removes it when done.
- `onDone` fires exactly once: after the beat 9 fade, or after skip (Space/Esc). `destroy()` tears down without firing `onDone`.
- Input: click or Enter advances a beat, Space or Esc skips. Keydowns are stopped in the capture phase (repeats ignored), and the matching keyup is swallowed for 600 ms. A tiny dim `space` hint sits in the bottom right corner, appears after 2 s and fades out after about 4 s.

## Wiring in main.ts
New Game calls `playIntro` after clearing the save. Its `onDone` callback hands off to the name prompt. The engine waits during the intro. Continue and the `?night=N` deep link open their night card directly. `?nointro` skips the shipwreck on New Game.

## Beats and timings (about 45 s total)
Duration = max(minimum, 1.8 s + 52 ms per character).
1 helm and storm 4.0 s (first lightning at 2.6 s) | 2 MATE 4.5 (shake starts, creak) | 3 YOU 3.6 | 4 COAST GUARD (radio static) 8.1 | 5 YOU 3.7 | 6 MATE "Wave, starboard side!" 3.6 (wave impact and bed cut just before the end, extra lightning at 0.9 s) | 7 wave then capsize 5.6 (hard silence at start, black water rises, hard cut to black with the impact at 2.7 s) | 8 four blinks 8.2 (heartbeat, muffled rumble) | 9 fade to black 3.2.
Lightning repeats every 4.5 to 8.5 s from beat 1 to 6 (white flash, thunder 0.35 to 1.25 s later). Shake on beats 2 to 6, slow push-in on the helm.
Old to new beat numbers: 10 to 7 (capsize), 11 to 8 (blinks), 12 to 9 (fade), old 8 to 6 (wave), old 6 to 4 (coast guard static), old 7 to 5.

## Look
Beats 1 to 7 use one still, `intro_helm_final.webp` (Blender scene "Intro Helm" in `scene03_watch_room_look.blend`: Cycles, AgX, the game's cold storm grade, rain streaming on the windshield, wheel and dials in the foreground). Everything else is code on that still:
- Lightning (beats 1 to 6): white flash plus a brightness pop on the still. The old `intro_02_lightning.png` is only used when the new still is missing.
- Beat 7: hard cut to silence, then the still darkens, tilts 26 deg and blurs while a flat black water edge rises over the frame (about 1 s to 2.7 s), then a hard cut to black on the impact. `intro_03_wave.png` and `intro_04_capsize.png` are no longer used (files left in place).
- Beat 8 (four blinks) and beat 9 (fade) are unchanged.
- Subtitles use the in-game `#subtitle` look: bottom center, VT323 25 px, off-white `#e5dfd2`, no box. The speaker is a small dim prefix on the same line, the line types at a steady 36 characters per second, and COAST GUARD lines get a subtle static flicker and 1 px jitter. No other text on screen.
- The CSS rain overlay is switched off with the new still, since the glass already has rain.

## Frames (`scenes/01-shipwreck/intro/`, picked up by glob, missing ones fall back)
| File | Used for | Fallback |
|---|---|---|
| `intro_helm_final.webp` | beats 1 to 7 (committed WebP of `intro_helm_final.png`, quality 85) | `intro_01_helm.png`, then `render_blockout.png` |
| `intro_01_helm.png` | beats 1 to 7 only if the new still is missing | `render_blockout.png` |
| `intro_02_lightning.png` | flash overlay only if the new still is missing | CSS brightness on the helm plus white flash |
| `intro_05_blink_1/2/3.png` | beat 8 (sequence 1, 2, 2, 3) | blockout cropped on the lighthouse, tilted, blur 9/6/4 px, plus the WARM face (frame 0 of `chud_smiley_four_moods.png`) small and faint (22/40/58 percent) |

The fallback face position is tuned to the blockout lighthouse lantern (about x 585, y 215 of 1920x1080).

## Rough
- Skip is instant (no fade). Sound is untested by ear, only that nodes build and tear down. No recorded voices.
- The keyup swallow uses one 600 ms timer that outlives the intro.
