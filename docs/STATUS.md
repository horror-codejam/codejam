# Status

Overwrite your own section when your status changes. Do not edit other people's sections. Keep it short.

Last updated: 2026-11-21 (late night)

## Team
- Overall: repo and AI setup done. Premise is the lighthouse (docs/GAME_DESIGN.md, working draft). Gameplay rules are locked in docs/GAME_LOGIC.md (wins on rule conflicts). Tech stack decided (see AGENTS.md).
- Done: design, logic spec, style guide, schematics, scene 1 blockout, Blender MCP working.
- Blockers: no game code yet. Organizers not yet confirmed on AI tools, AI art and CC0 assets (draft email was written, unconfirmed whether sent).
- Next: Blender watch room (gray box, then 4 camera angles, materials, lighting, Ram poses, final renders). Then logic phase: AI backend and judge/voice prompts, frontend game loop per GAME_LOGIC.md. Open: game name, LLM provider and model (latency test), 3 or 5 nights in the demo build.

## Yacine (Ceeniboi)
- Done: repo and AI setup, game design, GAME_LOGIC.md, tech stack, Blender MCP connected to Claude Code and Codex (Blender 5.3). Watch room gray box in scenes/03-watch-room/: 10 m room, 4 seated cameras (cam_desk, cam_window, cam_hatch, cam_balcony), 3 hold close-ups and a dash floor camera. Single 1.5 s dash travel time in GAME_LOGIC.md.
- Working on: watch room look pass.
- Blockers: none. Poly Haven is switched on in the MCP for Blender tab.
- Next: real materials from Poly Haven (wet stone, worn metal, glass), then moody lighting per camera, then the hands and animated props.
- Blender MCP setup per person: install uv, run `claude mcp add -s user blender uvx mcp-for-blender` (or `codex mcp add blender -- uvx mcp-for-blender`), run `uvx mcp-for-blender install-addon`, open Blender once first, enable "MCP for Blender" in Preferences, Add-ons, press N and start the MCP server, restart the AI tool.

## Vidush (Vidush-jpg)
- Working on: TBD.
- Blockers: none.
- Next: TBD.

## Siqi (siqi-lYuYl)
- Working on: game logic prototype, iterative (branch proto/playable-loop, off proto/game-logic). Same stack as the final game (Vite + TypeScript + PixiJS), art and gameplay refined a little at a time instead of a final rush.
- Done: first playable loop. Every night 1 to 5 plays in the browser with coded placeholder art, synthesized Web Audio cues (approach, hatch/window/balcony attempts, relay clunk, shouts, breach), desk chat with the offline judge, quick buttons, kill switch, looking around, the 1.5 s dash and hold views, name prompt, night card, loss and win screens, dev panel on backtick. Run: `cd prototype && npm install && npm run dev`, then open http://localhost:5173.
- Art slots: drop a render named after its slot into prototype/assets/ (list in prototype/assets/README.md) and it replaces the placeholder on reload. No code change.
- CHUD is conversable: Claude Haiku 5.5 judges every typed message and voices CHUD's conversational replies, through a Hono API mounted in the Vite dev server. Needs ANTHROPIC_API_KEY in prototype/.env (gitignored); without it the game falls back to the offline judge and canned lines. Details in prototype/IMPLEMENTATION_NOTES.md.
- Blockers: none.
- Prototype 3.0 (branch proto/v3-2.5d, uncommitted, merge from main staged): the 2.5D renderer works. The team's watch room renders from scenes/ load automatically (desk, window, hatch, balcony, the three hold views, dash floor) with mouse pan, a perspective warp, a night grade (dark blue without the beam, warm with it) and the beacon sweep across the desk glazing while power is on BEAM. CHUD's terminal is DOM on the desk screen and follows the pan: Vidush's mood faces by band, chat, quick buttons, kill switch, clock, a top-down map whose entry dots start holds and go green when that lock is powered (never shows Ram), and the 4-cell power bar. Loss, win and name screens show the cage hall and shipwreck renders behind the text. tsc, 160 tests and the build pass; smoke-checked in the browser. Details in prototype/IMPLEMENTATION_NOTES.md, handoff in prototype/HANDOFF_V3.md.
- Next: playtest Prototype 3.0 and tune the look (grade, tell placement, sweep), then ask the team before committing and pushing. Later: deploy the same Hono app as a Vercel function.

## Codex (art pre-production)
- Done: lighthouse style guide, two top-down watch-room schematics with a desk-side chair and braceable right floor hatch, and a catalog of 20 private reference targets.
- Blockers: screenshot hosts were unreachable from the workspace. No reference images were saved locally.
- Next: review the schematics, then prepare gameplay concepts in ChatGPT image generation.
