# Decisions

Append only. One line per decision: date, decision, why. Newest at the bottom.

- 2026-11-20: Build a browser horror game for CodeJam 16. Why: Best Game prize exists, horror demos land fast with judges.
- 2026-11-20: Dropped the government/1984 setting. Why: tone too serious.
- 2026-11-20: Chose the smart-home AI concept (working title HOMI) over the "keep it talking" PC companion. Why: the loss condition is code-controlled so prompt injection cannot win, and the goal is clearer.
- 2026-11-20: The AI never decides win or loss. Code owns all game state, the LLM only judges messages and writes dialogue. Why: anti-cheat and fairness.
- 2026-11-20: FNAF-style art (dark static images), not pixel art. Why: team preference, low animation cost.
- 2026-11-20: Game name is not final. Why: still deciding.
- 2026-11-20: No game code before Friday Nov 20, 7 PM. Why: event rule, build from scratch.
- 2026-11-20: Replaced the smart-apartment premise (HOMI, the Neighbors) with a lighthouse premise: stranded sailor, attached lighthouse AI, its ex-founder (now Ram Altman) trying to break in. Why: clearer reason to stay (stranded until rescue) and a more realistic threat. Same core loop: 3 entries, one power slot, suspicion meter.
- 2026-11-20: The lighthouse AI does not want the player dead, it wants to be needed. It withholds protection when it suspects the player is leaving. Why: removes the "wants you as keeper but wants you dead" contradiction.
- 2026-11-20: 5 nights (was 4). Why: matches the 5-day rescue wait.
- 2026-11-20: Names: the founder is Ram Altman (was Loki), the AI is CHUD, short for Continuous Helping Unit Deployment. Why: team choice.
- 2026-11-20: Tech stack: 2.5D pre-rendered Blender (Cycles) stills plus Blender MCP, Vite + TypeScript + PixiJS frontend, Howler.js or Web Audio, Node (Express or Hono) /turn backend, Vercel. Why: matches how FNAF 4 was built (pre-rendered stills in a 2D engine), AI coding tools are strongest at web code, lowest 36-hour risk. Godot and real-time 3D rejected.
- 2026-11-21: Adopted the lighthouse visual style guide and designated the local screenshot folder private and gitignored. Why: keep concept art consistent and keep third-party screenshots out of the repo.
- 2026-11-21: Adopted the team whiteboard layout, with CHUD in front of the ocean view, a left entry window, a right stairwell to the ground door, and a rear balcony door. Why: the four views follow the player's position in the room and checking the balcony requires looking behind the chair.
- 2026-11-21: Gameplay rules locked in docs/GAME_LOGIC.md (wins over GAME_DESIGN.md on rule conflicts). Changes vs the design doc: night 1 uses 2 entries (stairs and window), quick command buttons added (fast but do not count as talking), holding has a 6 s limit and 4 s cooldown, the Furious episode lasts one visit then resets to 80, and commands are parsed by code first so the game works even if the LLM is slow. Why: removes solvable or unfair cases and keeps the loop fast.
- 2026-11-21: Each game scene gets its own folder under scenes/ holding its sketch, Blender file, renders and a scene sheet with dialogue. Why: keeps art and story for each scene in one place.
- 2026-11-21: The player is a boat captain with a crew. Scene 1 opens first person at the wheel in a storm, the crew is lost and the boat capsizes. Why: team's starting-scene sketch and outline. Rescue wait (7 vs 5 days) still open.
- 2026-11-21: Rescue wait stays 5 days in the scene 1 coast guard line (not 7). Why: matches the 5 nights.
- 2026-11-21: Limited the schematics to the upper watch room, moved the chair closer to CHUD, and replaced the right stairs with a fixed ladder under a floor hatch. Why: the player can defend the ladder entrance by bracing the lid from inside the room.
- 2026-11-21: Watch room enlarged to 10 m inner diameter and 4 m ceiling (was 6 m and 3 m). Furniture, doors and hatch stay real-world size. Why: the room should feel big, with the entries far apart.
- 2026-11-21: One travel time for every entry, TRAVEL_TIME = 1.5 s, shown as a FNAF 4-style dash (camera tips to the floor, shakes, rises into a close-up hold view). Why: hides the real distances in the bigger room, keeps every fairness rule intact, simpler code.
- 2026-11-21: Game logic prototype in prototype/ (Vite + TypeScript, no art): pure engine first, then a canvas UI, then Claude Haiku as judge and voice through a local server. Commands found by the code parser run at once; the judge result only adds social effects. Why: test the game loop before art is ready, and keep commands fast even when the LLM is slow.
- 2026-11-21: Prototype UI built on the final stack (PixiJS canvas + DOM HUD + Web Audio) so the prototype grows into the game. Every image is an art slot: a coded placeholder until a render with the slot name lands in prototype/assets/. Why: iterative development, art and gameplay added a little at a time instead of a final rush.
- 2026-11-21: LLM is Claude Haiku 5.5 for both judge and voice (team key in prototype/.env). The voice only words conversational lines; locks, beam, location claims and questions stay canned and instant. Why: measured judge 1.2 to 2.2 s and voice under 1 s, fine for conversation but too slow for urgent lines.
