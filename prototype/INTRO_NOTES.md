# Intro cutscene (scene 1, shipwreck)

Files: `src/ui/intro.ts`, `src/ui/intro.css`, `tests/intro.test.ts`. Self-contained, nothing else edited.

## API
```ts
import { playIntro } from "./ui/intro";
const h = playIntro({ root: $("ui"), onDone: () => {}, muted: false }); // h.skip(), h.destroy()
```
- `root` is the 1280x720 stage overlay. The intro adds a full-stage layer (z-index 900, captures pointer) and removes it when done.
- `onDone` fires exactly once: after the beat 12 fade, or after skip (Space/Esc). `destroy()` tears down without firing `onDone`.
- Input: click or Enter advances a beat, Space or Esc skips. Keydowns are stopped in the capture phase (repeats ignored), and the matching keyup is swallowed for 600 ms. A "Space: skip" hint appears after 1 s.

## Wiring in main.ts (before the name prompt on first load)
```ts
import { playIntro } from "./ui/intro";
const params = new URLSearchParams(location.search);
if (!params.has("night") && !params.has("nointro")) {
  playIntro({ root: $("ui"), muted: sound.muted /* or false */, onDone: startAfterIntro });
} else startAfterIntro();
```
Where `startAfterIntro` is whatever currently shows the name prompt. Check that the engine does not tick behind the intro (it is only an overlay).

## Beats and timings (about 61 s total)
Duration = max(minimum, 1.8 s + 52 ms per character).
1 storm 5.5 s (first lightning at 2.6 s) | 2 YOU 3.6 | 3 MATE 5.8 | 4 YOU 3.9 | 5 MATE 6.0 | 6 COAST GUARD (radio static) 8.1 | 7 YOU 3.7 | 8 MATE 3.9 (wave impact and bed cut just before the end, the line is cut off) | 9 YOU 3.6 | 10 wave then capsize 5.6 (hard silence at start, impact at 2.7 s) | 11 four blinks 8.2 (heartbeat, muffled rumble) | 12 fade to black 3.2.
Lightning repeats every 4.5 to 8.5 s from beat 1 to 9 (white flash, thunder 0.35 to 1.25 s later). Shake on beats 2 to 9, slow push-in on the helm.

## Frames (`scenes/01-shipwreck/intro/`, picked up by glob, missing ones fall back)
| File | Used for | Fallback |
|---|---|---|
| `intro_01_helm.png` | beats 1 to 9 | `render_blockout.png` |
| `intro_02_lightning.png` | flash overlay | CSS brightness on the helm plus white flash |
| `intro_03_wave.png` | beat 10 rise | blockout, zoom and dim |
| `intro_04_capsize.png` | beat 10 capsize | blockout, rotate 38 deg, blur |
| `intro_05_blink_1/2/3.png` | beat 11 (sequence 1, 2, 2, 3) | blockout cropped on the lighthouse, tilted, blur 9/6/4 px, plus the WARM face (frame 0 of `chud_smiley_four_moods.png`) small and faint (22/40/58 percent) |

The fallback face position is tuned to the blockout lighthouse lantern (about x 585, y 215 of 1920x1080).

## Rough
- Skip is instant (no fade). Sound is untested by ear, only that nodes build and tear down. Rain streaks are a CSS overlay and are visible over real renders too (opacity 0.25), tune or remove once the renders have rain. No recorded voices.
- The keyup swallow uses one 600 ms timer that outlives the intro.
