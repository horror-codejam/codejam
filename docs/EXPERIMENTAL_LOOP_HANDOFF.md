# Experimental gameplay loop: build brief

Branch: `experimental-gameplay-loop`. This is an alternate loop to prototype and playtest next to the current one on `main`. Do not merge into main until the team has playtested both.

## For the AI building it
Read `docs/GAME_LOGIC.md` on this branch in full. It is the complete rule set for this loop and wins over anything else. Then change the prototype in `prototype/` (engine in `src/sim/engine.ts`, numbers in `src/config.ts`, sound in `src/ui/audio.ts`) to match it. Keep the current controls, CHUD pipeline, questions, sabotage and Furious logic: they are unchanged.

## The loop in four rules (what the player learns on night 1)
1. Ram creeps up to one of the entries in total silence. No sound ever tells you where he is.
2. Turn to an entry and look. With the lights on you can see him there.
3. If he is there, lock it or brace it before he gets in.
4. Or skip the looking and ask CHUD where he is. Faster, but CHUD lies more every night.

## What changed from main (build checklist)
1. **Night length:** `HOUR_LENGTH` 50 s, so a night is 300 s (5 minutes).
2. **Per-night table (section 4):** new first visit delays, AWAY gap base ranges, approach times, and a random attempt window per visit (9 to 11 s on night 1 down to 5 to 7 s on night 5). New per-night values: lull chance, quick-return chance, decoy interval.
3. **Pacing (section 7.6):** gap = base range times the hour ramp (1.25, 1.15, 1.0, 0.95, 0.85, 0.8 for 12 AM to 5 AM), then a lull roll (times 1.8), with a quick-return roll first (gap 4 to 7 s). Silence pull cuts and the 4 s floor still apply.
4. **No Ram audio (section 7.4):** remove the approach sound, the three per-entry attempt sounds and the retreat shout. Ram is silent in every state.
5. **Decoy noises (section 7.4):** a scheduler plays random creaks, knocks and metal sounds from random directions at the night's decoy interval. It must never read Ram's state or target.
6. **CHUD while WARM (section 8.3):** every night, CHUD warns unprompted when Ram arrives at an entry ("The hatch, keeper. Now.") and says "He's gone." when he retreats. Only if WARM at that exact moment.
7. **Location questions (sections 8.7 and 9):** "gone" and "still there" map to `ASK_LOCATION`. A lie is now a random pick from the other active entries plus "no one".
8. **Brace:** `HOLD_MAX` 8 s (was 6 s).
9. **Loss cause:** add `PEEKED` (the player dropped the lock to look and the window ended before it landed again).
10. **Night 1 hints (section 10):** "Look around. You won't hear him.", "Ask CHUD where he is", "Lock it or hold it". Voice log 1 text updated.
11. **Tests:** update the engine tests for the new numbers and add tests for: the hour ramp, lull and quick-return rolls, decoys never correlating with Ram, the WARM arrival warning, a "no one" lie, and `PEEKED`.

## Playtest questions
- Does night 1 feel like a slow burn and not boring?
- Does any night feel predictable? Can a player guess when he is coming?
- Is night 5 still survivable with a 5 s minimum window?
- Do players talk to CHUD more than on main, because a warm CHUD warns them?
