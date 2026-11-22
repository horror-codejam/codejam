# Status

Overwrite your own section when your status changes. Do not edit other people's sections. Keep it short.

Last updated: 2026-11-21 (late night)

## Team
- Overall: repo and AI setup done. Premise is the lighthouse (docs/GAME_DESIGN.md, working draft). Gameplay rules are locked in docs/GAME_LOGIC.md (wins on rule conflicts). Tech stack decided (see AGENTS.md).
- Done: design, logic spec, style guide, schematics, scene 1 blockout, Blender MCP working.
- Blockers: no game code yet. Organizers not yet confirmed on AI tools, AI art and CC0 assets (draft email was written, unconfirmed whether sent).
- Next: Blender watch room (gray box, then 4 camera angles, materials, lighting, Ram poses, final renders). Then logic phase: AI backend and judge/voice prompts, frontend game loop per GAME_LOGIC.md. Open: game name, LLM provider and model (latency test), 3 or 5 nights in the demo build.

## Yacine (Ceeniboi)
- Done: ported THE KEEPER screens and local checkpoint onto the new loop, including the shipwreck handoff, timed night cards, dawn, loss, ending and credits. The title uses the desk fallback until the production still or video lands.
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
- Working on: the new loop on branch proto/new-loop (uncommitted, needs the team's review before commit and push). Same stack as the final game (Vite + TypeScript + PixiJS).
- Done (proto/new-loop): Ram is silent (no approach, attempt, push or retreat sound, no shouts or lines); decoy creaks, knocks and metal from a separate seeded stream, stereo panned, over the ambient bed; 5 minute nights (HOUR_LENGTH 50 s), night 1 slow burn (first visit at 60 s, 3 to 4 visits) up to 7 to 8 visits on night 5, with an hour ramp, lulls and quick returns; random attempt windows of 9 to 11 s (night 1) down to 5 to 7 s (night 5); one light per entry on Shift (instant, drops any lock, locked = blind, PEEKED loss cause); CHUD cannot control lights but can force one off by band with a possessive line; lock hijack (refusal chance by band, malicious smile, REFUSED cause) replaces gate questions; silent breach: Ram INSIDE, scare on looking at his lit entry (creepy flash then jumpscare frames and jumpscare.wav), on putting down a desk paper, or a rolled TIMER, NONE or MOVE trigger, 6 AM with him inside loses; three readable desk papers (clipping, notebook, calendar) that keep the night running; CHUD never names Ram (canned lines, voice prompt, server and client filters). Dev panel: light and cut state, refusal odds, inside readout and trigger, force breach, set power. Rules in docs/GAME_LOGIC.md, notes in prototype/IMPLEMENTATION_NOTES.md.
- Checks: tsc, 243 tests and the build pass; the scare, the reader, the lock refusal face and the Shift light were driven once in the browser.
- Earlier (still true): Prototype 3.0 2.5D renderer and the adopted edge controls (proto/v3-2.5d, proto/v3-controls-edge). CHUD is conversable through the Hono API with ANTHROPIC_API_KEY in prototype/.env (gitignored); offline judge and canned lines without it. Art slots: drop a render named after its slot into prototype/assets/ (list in prototype/assets/README.md). Run: `cd prototype && npm install && npm run dev`, then open http://localhost:5173.
- Blockers: none. The ambient and jumpscare audio have unverified reuse rights (see Codex section).
- Next: team playtest of the new loop (is night 1 tense rather than empty, are PEEKED and refusals fair, light cut rate), tune numbers in prototype/src/config.ts, then commit and PR with the team's go-ahead.

## Codex (art pre-production)
- Audio: wired the local Piper service to CHUD's scripted and generated dialogue on `audio/chud-piper-playback`. It uses the line's mood, plays from the desk, and falls back to the existing subtitle and chime. Setup in `prototype/tools/chud-tts/README.md`.
- Audio: extracted the full stereo ambience from the supplied `FNAF Ambience Extended.mp4` to `prototype/public/audio/amb/ambient-noise.m4a` without re-encoding. Reuse rights are unverified.
- Audio: trimmed the first jumpscare (0:04.84 to 0:07.22) from the supplied CaseOh compilation to `prototype/public/audio/sfx/jumpscare.wav`. The clip includes the source reaction. Reuse rights are unverified.
- Done: lighthouse style guide, two top-down watch-room schematics with a desk-side chair and braceable right floor hatch, and a catalog of 20 private reference targets.
- Blockers: screenshot hosts were unreachable from the workspace. No reference images were saved locally.
- Next: review the schematics, then prepare gameplay concepts in ChatGPT image generation.
