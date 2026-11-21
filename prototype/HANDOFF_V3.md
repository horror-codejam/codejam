# Prototype 3.0 handoff (2.5D)

Last updated: 2026-11-21. Owner: Siqi. Read this, then docs/GAME_LOGIC.md, then prototype/IMPLEMENTATION_NOTES.md before touching code.

## Goal (Siqi's words)
"The final idea is to make this a 2.5D game where it's not a full 3D render but uses screen shots of 3D models to make appear 3D. Add in the assets we already have to this prototype. It's gonna be prototype 3.0."

Iterative, not waterfall: same stack as the final game, art and gameplay added a little at a time.

## Where things stand
- Branch: `proto/v3-2.5d`, cut from `proto/playable-loop` (2fbb1b4, Prototype 2.0, already pushed).
- `origin/main` is merged into it but the merge is NOT committed yet. Conflicts in docs/STATUS.md and docs/DECISIONS.md are resolved and staged. Do not commit or push without Siqi's OK (Siqi has always chosen "playtest first").
- Done in this branch, uncommitted (steps 1 to 6 below are done):
  - `src/sim/engine.ts`: each night starts with power on BEAM (GAME_LOGIC rule 5.1). Test in `tests/engine.smoke.test.ts`. 160 tests pass.
  - `src/ui/layout.ts`: plate space (`PLATE_W`, `PLATE_H`, `ZOOM`, `K`, `PAN_X`, `PAN_Y`, `DESK_SCREEN`, `DESK_GLAZING`).
  - `src/ui/art.ts`: slots resolve to `prototype/assets/` override, else the render in `scenes/`, else the coded placeholder. `artUrl(slot)` for DOM.
  - `src/ui/scene.ts`: plate-space renderer. Mouse pan, RenderTexture on a warped PlaneGeometry mesh, ColorMatrix night grade, beacon sweep on the desk glazing while BEAM, rain foreground parallax, tells and silhouettes placed on the render geometry. Turn fade, dash, holds, lightning, jumpscare, grain, vignette kept. `deskScreenRect()` and `fadeAlpha` feed the DOM terminal.
  - `src/ui/placeholders.ts`: CRT import removed; new `onRender*` overlays in plate px for the renders.
  - `index.html`, `src/ui/style.css`, `src/main.ts`: CHUD terminal as DOM on the desk screen (face by band from the sprite sheet, chat, quick buttons, kill switch, clock, map with hold dots and lock state, 4-cell power bar). Behind button top center, hint at y 84, desk hold buttons top left. Endings and name prompt show renders.
  - `vite.config.ts`: `server.fs.allow` includes the repo root so Vite can serve `../scenes`.
  - Docs: Siqi's STATUS section, IMPLEMENTATION_NOTES "2.5D renderer (Prototype 3.0)", one DECISIONS line, `prototype/assets/README.md`.
- Verified: `npx tsc --noEmit` clean, `npm test` 160 passed, `npm run build` OK. Browser smoke check (engine driven from JS): all 12 scene images load with 200, no console errors; desk with terminal and sweep, window tell with beam, hatch faint tell without, balcony hold tell, lock turns the map dot and power cell green, face swaps by band, loss, win and name screens show their renders.
- Rough / not verified: visual tuning only checked on screenshots (grade values, tell positions and sizes, sweep strength, rain). The DOM terminal ignores the edge warp, so it can sit a few px off the warped screen at full pan. Music player not built. The win render is the cage hall (`render_win_outside.png`), which may not match the helicopter text. Performance of the per-frame RenderTexture pass not measured on slow machines.
- Dev server: `.claude/launch.json` (one level above the repo, in McGillCodeJam2026/) has config "prototype" on port 5173. `prototype/.env` holds ANTHROPIC_API_KEY (gitignored, chmod 600). Never print, copy or commit it.

## Assets to wire in (all in scenes/, from main)
- `03-watch-room/`, all 960x480 PNG:
  - `render_blockout_cam_desk.png`: four glazing panes at y 0 to 215, big green screen at x 155 to 808, y 262 to 457.
  - `render_blockout_cam_window.png`: twin panes at x 360 to 588, y 80 to 285.
  - `render_blockout_cam_hatch.png`: hatch quad (385,207), (573,207), (600,284), (360,284).
  - `render_blockout_cam_balcony.png`: door at x 424 to 535, y 131 to 385.
  - `render_hold_window/hatch/balcony.png`, `render_dash_floor.png`.
- `03-watch-room/chud_smiley_four_moods.png`: 2172x724, black background, faces left to right WARM, HURT, JEALOUS, FURIOUS. Frames about x 30-550, 560-1080, 1090-1610, 1620-2140, y 90-630.
- `99-final-cage-hall/render_lose_in_cage.png`, `render_win_outside.png` (1920x1080).
- `01-shipwreck/render_blockout.png`.
- `03b-chud-terminal/README.md` + `sketch.png`: terminal layout. Face left above a music player, chat center, clock top right, top-down map with entry dots right, POWER bar with 4 cells bottom right. Clicking a map dot may start a hold. The map must never show Ram. Music must not cover entry cues.

## Remaining work, in order
1. Rework `src/ui/scene.ts` to plate space:
   - World container holds plate-sized views scaled by `K`, centered, panned by the mouse (lerped) up to `PAN_X` / `PAN_Y`.
   - Perspective warp: render the world to a RenderTexture, show it on a `Mesh` with `PlaneGeometry({width, height, verticesX, verticesY})`, displace vertex y with `y' = cy + (y - cy) * (1 + s * nx^2)`, s about 0.08 (PixiJS 8.23).
   - Night grade with ColorMatrixFilter: darker and bluer without the beam, warmer and lighter with it.
   - Beacon sweep: additive amber band moving across `DESK_GLAZING` while `power.slot === "BEAM"` (new GAME_LOGIC rule).
   - One parallax foreground layer (rain streaks or glass drips) moving more than the plate.
   - Re-place tells, approach silhouettes and lit-window overlays on the render geometry listed above, in plate px. Coded placeholders stay as fallback (scaled 0.75 into plate space).
   - Keep everything else: turn fade, dash, holds, lightning, jumpscare (still coded), grain, vignette, `speakingUntil`.
2. CHUD terminal as DOM over the in-world desk screen (`DESK_SCREEN`, follows the pan), replacing the coded CRT face and the old desk panel: sprite-sheet face by band via CSS background-position (`artUrl("chud_faces")`), chat log and input center, entry map dots that start holds and go green when that lock is powered, 4-cell power bar, kill switch, clock. No Ram on the map.
3. Move the "Behind" nav button to top center, hint down to y about 84.
4. Endings: lose render behind the loss screen, win render on GAME_WON, shipwreck render behind the name prompt.
5. `npx tsc --noEmit`, `npm test`, `npm run build`, then playtest in the Browser pane. The pane throttles requestAnimationFrame, so drive `window.engine` from JS for timing tests.
6. Update docs: Siqi section of docs/STATUS.md, a "2.5D renderer (Prototype 3.0)" section in prototype/IMPLEMENTATION_NOTES.md, append one line to docs/DECISIONS.md, update prototype/assets/README.md (slots now auto-load from scenes/).
7. Ask Siqi before committing the merge plus Prototype 3.0, and before pushing or opening a PR.

## Rules that still apply
- GAME_LOGIC.md wins on rules. The engine stays pure TypeScript; the renderer only reads state.
- Judge/voice split for the LLM is unchanged (see IMPLEMENTATION_NOTES.md).
- No em dashes in docs. Edit only Siqi's STATUS section. DECISIONS.md is append-only.
