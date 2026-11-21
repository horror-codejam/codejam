# Scenes

One folder per scene of the game, numbered in play order: `NN-short-name/` (for example `01-shipwreck/`). The final scene uses `99-` until the total number of scenes is known.

## What goes in each scene folder
| File | What it is |
|---|---|
| `README.md` | The scene sheet: what the player sees, hears and does, the dialogue script, assets needed, open questions |
| `sketch.jpg` | The original hand sketch the scene was built from |
| `sceneNN_<name>.blend` | The Blender file for the scene |
| `render_*.png` | Renders from the Blender file (blockouts, lit and dark versions, final frames) |

## Rules
- The scene README is the source of truth for that scene. If a scene changes the overall story or rules, also update docs/GAME_DESIGN.md and add a line to docs/DECISIONS.md.
- Blender backup files (`*.blend1`) are gitignored. Do not commit them.
- Keep each `.blend` under about 50 MB so it stays below GitHub's 100 MB file limit.

## Scene list
| # | Folder | Scene | Status |
|---|---|---|---|
| 1 | [01-shipwreck](01-shipwreck/) | Storm at sea, the boat sinks, you black out | Blockout done, dialogue drafted |
| 2 | (not created yet) | Next scene, sketch in progress | Not started |
| 3 | [03-watch-room](03-watch-room/) | The watch room where the player survives each night | Gray box done, cameras placed |
| Final | [99-final-cage-hall](99-final-cage-hall/) | The twist: caged victims and monsters, seen from inside a cage (lose) or outside (win) | Blockout done, script drafted |
