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
