# Status

Overwrite your own section when your status changes. Do not edit other people's sections. Keep it short.

Last updated: 2026-11-21 (late night)

## Team
- Overall: repo and AI setup done. Premise is the lighthouse (docs/GAME_DESIGN.md, working draft). Gameplay rules are locked in docs/GAME_LOGIC.md (wins on rule conflicts). Tech stack decided (see AGENTS.md).
- Done: design, logic spec, style guide, schematics, scene 1 blockout, Blender MCP working.
- Blockers: no game code yet. Organizers not yet confirmed on AI tools, AI art and CC0 assets (draft email was written, unconfirmed whether sent).
- Next: Blender watch room (gray box, then 4 camera angles, materials, lighting, Ram poses, final renders). Then logic phase: AI backend and judge/voice prompts, frontend game loop per GAME_LOGIC.md. Open: game name, LLM provider and model (latency test), 3 or 5 nights in the demo build.

## Yacine (Ceeniboi)
- Done: repo and AI setup, game design, GAME_LOGIC.md, tech stack, Blender MCP connected to Claude Code and Codex (Blender 5.3).
- Working on: Blender watch room environment, starting with the gray box.
- Blockers: none. Poly Haven is still switched off in the MCP for Blender tab (needs ticking before real textures).
- Next: gray box of the watch room, lock the 4 camera angles (cam_desk, cam_window, cam_stairs, cam_balcony), then materials and lighting. Blender files are kept out of git, renders go in art/renders/.
- Blender MCP setup per person: install uv, run `claude mcp add -s user blender uvx mcp-for-blender` (or `codex mcp add blender -- uvx mcp-for-blender`), run `uvx mcp-for-blender install-addon`, open Blender once first, enable "MCP for Blender" in Preferences, Add-ons, press N and start the MCP server, restart the AI tool.

## Vidush (Vidush-jpg)
- Working on: TBD.
- Blockers: none.
- Next: TBD.

## Siqi (siqi-lYuYl)
- Working on: TBD.
- Blockers: none.
- Next: TBD.

## Codex (art pre-production)
- Done: lighthouse style guide, two top-down watch-room schematics with a desk-side chair and braceable right floor hatch, and a catalog of 20 private reference targets.
- Blockers: screenshot hosts were unreachable from the workspace. No reference images were saved locally.
- Next: review the schematics, then prepare gameplay concepts in ChatGPT image generation.
