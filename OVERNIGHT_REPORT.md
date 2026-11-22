# Overnight report (branch `overnight-playtest`)

Stopped at 07:30 because the stop condition was met: every area's council median is 8 or higher, and the remaining problems are minor.

## Result
- Branch `overnight-playtest`, based on `origin/main` c2ab13b (PR #31 ending logic was merged after fbdfc58). Pushed. `main`, `release-integration` and Vercel were not touched.
- `npm run build` passes. `npm test` passes 315 tests (308 before).
- The council had three reviewers: Codex playing a hardcore FNAF player, Sonnet playing a first-time casual player, and Sonnet playing a hackathon judge. Median scores:

| Area | Start | Round 1 | Round 2 | Round 3 | Final (round 4) |
|---|---|---|---|---|---|
| Gameplay loop and curve | 6 | 6 | 7 | 7 | 8 |
| ChudGPT behavior | 7 | 7 | 8 | 8 | 8 |
| Onboarding | 6 | 7 | 7 | 8 | 8 |
| Horror feel and pacing | 8 | n/a | 8 | 8 | 8 |
| UI and readability | 7 | 7 | 7 | 8 | 8 |
| Bugs and robustness | 6 | 7 | 8 | 8 | 8 |
| Performance and loading | 6 | 6 | 7 | 8 | 8 |

## Playtest evidence (seeded bots)
- Run it with `cd prototype && npx vite-node tools/playtest/bots.ts -- --seeds 400`. It takes about 70 s. The report lands in `prototype/tools/playtest/last-report.md`.
- The bots play through the public engine API and only perceive what a human perceives. There are 8 personas: oracle, skilled, average, learner, careless, spammer, flatterer and silent.
- Average bot first-try survival on nights 1 to 4: 81/67/38/10% at the start, 89/76/60/33% now. The targets in GAME_LOGIC 14 are 90/75/55/35%.
- Night 5 is won by typing the kill code, so it is measured as "code reachable". The average bot reaches it in 27% of runs (target 20%) and the skilled bot in 74%.
- Use 400 seeds for any decision. Runs of 100 seeds moved by up to 12 points on one cell.

## Changes
### Bugs (all have tests or a browser check)
- 73e691e: the Furious cut no longer says "If I can't keep you, nobody will. Hold it yourself." when there is no lock to cut. That line gave away his arrival at an entry, which happened about 1,300 times in the playtest. A breach now ends the Furious episode, as GAME_LOGIC 8.9 says.
- ed7fdc3: Esc pauses on the first press, including from the chat box. It used to only leave the chat.
- 4ace39f + 21f58fc: a slow LLM reply no longer overwrites a newer refusal, sabotage or question line. Cherry-pick both commits together: 21f58fc fixes a case in 4ace39f that dropped the reply to the next message.
- 2a51c43 + 5187451 + 8d89bf1 (take all three together):
  - An answer typed before the 10 s question timeout waits up to 3 s for the judge. Before, a slow hosted judge could turn a valid answer into a +15 timeout.
  - A message sent after the deadline cannot answer the question.
  - During that grace, typed commands stay blocked like the map buttons.

### ChudGPT
- 673848f: a blocked command ("Answer me first") repeats the pending question, so a question that scrolled off the monitor can still be answered.

### Onboarding and UI
- 0e30f91: two night 1 hints now name Shift and say the light drops the lock: "Hold Shift to look. You won't hear him." and "Lock it or hold it. Your light drops the lock."
- 768cb6a: a light that drops a lock now plays the loud relay clunk and flashes the lock cell. It used to make the same quiet click as an ordinary light. PEEKED was the top death on nights 1 to 3.
- 08f7a13 (needs 768cb6a): the first time a light drops a lock on nights 1 and 2, the one-time caption "Your light dropped the lock." shows. The cell flash also replays when the player is back at the desk.
- 93f83e7: subtitles get a darker outline.
- 85b3721: at the desk, the subtitle sits on the bare desk above the keyboard.
- a780765: subtitles wrap to two balanced lines at 27 px. They used to be cut off with "..." at about 78 characters.

### Difficulty (config only; GAME_LOGIC sections 4 and 12 updated)
- 446b4bb: longer attempt windows on nights 3 to 5. 83a7e94: night 2 to 16-19 s and night 3 to 13-16 s.
- 74e8b7e + 58b0e23: night 4 window 11-13 s, and night 4 away gap 27-41 s to keep 6 visits. **Take both together: 74e8b7e alone fails the night 4 visit test.**
- Final windows for nights 1 to 5: 20-25, 16-19, 13-16, 11-13 and 8-10 s.

### Ending logic (Siqi's area, separate commits)
- 6b197a0: on night 5, the last slip drops only from 1:12 AM (`ENDING.LAST_PAPER_AFTER` = 60 s). Before this, the 4th slip dropped about 28 s in, so night 5 was one visit long and the 5 AM radio beat never played. Average code reach went from 48% to about 27%.
- 0047966: "He left something at the {entry}." now shows on each night's first slip drop. It used to show only once per run, and a missed slip makes night 5 unwinnable.

### Performance (Codex plus small follow-ups)
- 8f4a82e: the title now waits only for essential sounds, and the rest of the sound bank loads in the background.
- 60845a4: the storm and room beds load in the background.
- f8ee802: the title music loads in the background.
- Audio that blocks the title went from about 3.6 MB to about 0.5 MB, estimated from Codex's measured 3.14 MB minus the beds (about 1.2 MB) and the title track (about 1.44 MB). Any sound not loaded yet starts on demand, or falls back to the existing synth once.

### Release
- 4d77fb1 (team call): production builds hide the DEV badge unless the URL has `?dev`. The panel shows the kill code and offers "Win night now" to anyone. Skip this commit if you want the badge for the demo.

### Tools and docs
- 2ec272e, b1ef3a0, 04dc603, cbb98a9: the bot playtest harness, the night 5 code-reach metric, the learner persona, and a bot bug fix. Codex traced 10 deaths, and the bot now restores its own lock after a peek.
- GAME_LOGIC.md is updated for every rule and number change. OVERNIGHT_LOG.md has every iteration, score and model note.

## Risky or needs a team call
- All difficulty numbers come from bots, not humans. Nights 2 to 4 were tuned partly before the bot fix in cbb98a9. With the fixed bot, night 3 reads slightly easy (60% against a 55% target). One human playtest of nights 2 and 3 would settle it.
- The two ending commits (6b197a0, 0047966) change how night 5 plays. Siqi should agree before merging.
- The audio preload commits were checked on the dev server: the title loads, a night starts, and there are no new console errors. Codex also checked late decoding in headless Chrome. Nobody listened to them in a production build. Worth one listen on the deployed preview, especially the title music start on a cold load.
- The LLM voice path could not run locally because there's no API key in this worktree. The stale-reply fix (21f58fc) is typecheck- and logic-reviewed only.
- `prototype/src/main.ts` got several small edits. Expect merge conflicts if teammates changed the same HUD or POWER_CHANGED code.

## Safe to cherry-pick first
Small, independent bug fixes:
```
git cherry-pick 73e691e ed7fdc3 4ace39f 21f58fc 2a51c43 5187451 8d89bf1 673848f
```
Then the UI and onboarding set. The last commit, 08f7a13, needs 768cb6a.
```
git cherry-pick 0e30f91 93f83e7 85b3721 a780765 768cb6a 08f7a13
```
Then, after a quick look:
- Difficulty: 446b4bb 83a7e94 74e8b7e 58b0e23 (the last two together)
- Perf: 8f4a82e 60845a4 f8ee802
- Ending: 6b197a0 0047966
- Release: 4d77fb1

## Remaining minor problems (from round 4, not fixed)
- The slip hint can be hidden behind a ChudGPT caption or an open paper, so it can show for less than its full time (Codex).
- Careless play falls off sharply on night 3: 4% survival for the careless bot (judge).
- Silent players struggle from night 2. GAME_LOGIC 15 says this is intended.

## Model usage
- Codex `gpt-6.2-sol` high ran 11 times: the harness, 5 reviews, 4 fix or diagnosis tasks, and one rerun after a run stopped to ask for plan approval. It never hit its usage limit.
- Sonnet subagents ran 8 council reviews. Opus orchestrated, made the small fixes and checked everything in the browser.
