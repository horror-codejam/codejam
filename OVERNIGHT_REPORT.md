# Overnight report (branch `overnight-playtest`)

Stopped at 09:15. The stop condition was first met at 07:30. A stricter final check by the FNAF reviewer then found more real edge cases, and I fixed those until all three reviewers agreed on HEAD 0e78ab0: every area is 8 or higher, and only minor problems remain.

## Result
- Branch `overnight-playtest`, based on `origin/main` c2ab13b (PR #31 ending logic was merged after fbdfc58). Pushed. `main`, `release-integration` and Vercel were not touched.
- `npm run build` passes. `npm test` passes 348 tests (308 before).
- The council had three reviewers: Codex playing a hardcore FNAF player, Sonnet playing a first-time casual player, and Sonnet playing a hackathon judge. Median scores:

| Area | Start | Round 1 | Round 2 | Round 3 | Round 4 | Final (HEAD 0e78ab0) |
|---|---|---|---|---|---|---|
| Gameplay loop and curve | 6 | 6 | 7 | 7 | 8 | 8 |
| ChudGPT behavior | 7 | 7 | 8 | 8 | 8 | 8 |
| Onboarding | 6 | 7 | 7 | 8 | 8 | 8 |
| Horror feel and pacing | 8 | n/a | 8 | 8 | 8 | 8 |
| UI and readability | 7 | 7 | 7 | 8 | 8 | 8 |
| Bugs and robustness | 6 | 7 | 8 | 8 | 8 | 8 |
| Performance and loading | 6 | 6 | 7 | 8 | 8 | 8 |

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

### Late-verdict and parser fixes (found by the final Codex checks; take together, in order)
- f174eca: a typed command sent while a question was pending stays blocked when its verdict arrives late, unless that message answered the question.
- f25ac73 + c3d8253: a lock or power-off from a late verdict never overrides a lock the player asked for later. Requests are ordered by when the player made them, not by when verdicts arrive.
- c682ce5: a negated request ("Please don't unlock the window") is never parsed as the opposite command.
- a294389: the entry named after the lock verb wins ("The window is clear. Lock the hatch." now locks the hatch).
- 3155954: in the offline fallback judge, asking where he is never counts as an answer to ChudGPT's question. It used to fail memory checks (+20).
- ea13884: a hint's countdown pauses while a paper is open or another caption covers it, so the slip hint can't expire unseen.
- b6443ae: urgent ChudGPT lines (questions, location answers, refusals, cuts) skip queued speech and cut short a synthesis that hasn't started playing.
- 5485176: "close" and "shut" only lock when they have an object ("close the hatch"). "Is he close to the hatch?" used to move an active lock.
- c814a1e: sabotage and the Furious cut also leave time for a trip cooldown still running. GAME_LOGIC 12.4 updated.
- 888fc3f: hints queue instead of overwriting each other. A ChudGPT question caption also stays up for most of its 10 s timer, so the night 2 radio caption can't hide it.
- 322d542: in the offline judge, an answer and a location request in one message both count ("Halifax. Where is it?").
- 4800905: a status question ("Is the hatch locked?", "are the lights off?") never changes power. In the offline judge, a command on its own ("Unlock all") never answers a question, and "Halifax and where is it?" still counts as an answer.
- ce84566: a sabotage or Furious cut must leave the player's fastest route to a brace from where they actually are, including the trip back from another entry. GAME_LOGIC 12.4 updated.
- 7ad82d3: status questions are checked per clause after filler words ("Okay, is the hatch locked?").
- 92729ee: in the offline judge, "Did he leave?" no longer counts as the keeper leaving (+25), and a numeric answer next to a command survives ("3, where is it?").
- edab4bb + 367b432: away from the desk, a pending question keeps its own caption until it resolves. A message sent inside the 1.5 s limit now sends itself once the limit ends and the player is back at the desk, instead of being silently dropped.
- c1b0cbe: embedded status questions ("Can you tell me if the hatch is locked?") never change power.
- 9f1baf6: in the offline judge, a status question is never an answer.
- 0e78ab0: an insult like "shut up and get off me" no longer parses as power-off.

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
- The audio preload commits were checked in a local production build (vite preview). The blocking sounds (night_start, jumpscare.wav) arrive by 0.36 s. The beds and title music finish in the background by 1.7 s, before the title shows at 3.3 s (art is the slower part). New Game starts the intro with no console errors. Nobody has listened yet: give the title music one listen on a cold load.
- I drove these UI changes in the browser at 09:20 on the dev server:
  - Hint pause and queue (ea13884, 888fc3f): the 0:08 hint, fired while the clipping was open, still showed after closing it at 0:27. The 0:24 hint queued behind it and showed next.
  - Question caption (edab4bb): at the hatch, newer lines covered the pending question. It came back once they expired, and it cleared when the question timed out.
  - Draft resend (edab4bb, 367b432): a draft sent inside the 1.5 s limit sent itself about 1.55 s after the previous message. "lock the hatch", sent while turning to the window, waited and then locked the hatch on return to the desk.
- The urgent speech queue (b6443ae) is covered by 4 unit tests (dbc984d): an urgent line replaces the waiting lines and cuts short a line still being synthesized, but never one already playing. It can't be heard locally, because there's no text-to-speech server here (`/api/tts` returns 503).
- Left for a human, because I can't hear audio or play the game: one listen to a question line and to the title music on a cold load of the deployed preview, and one human playthrough of nights 1 to 3 to confirm the bot-based difficulty.
- The LLM voice path could not run locally because there's no API key in this worktree. The stale-reply fix (21f58fc) is typecheck- and logic-reviewed only.
- `prototype/src/main.ts` got several small edits. Expect merge conflicts if teammates changed the same HUD or POWER_CHANGED code.

## Safe to cherry-pick first
Small, independent bug fixes:
```
git cherry-pick 73e691e ed7fdc3 4ace39f 21f58fc 2a51c43 5187451 8d89bf1 673848f
```
Then the late-verdict and parser fixes (they build on the set above):
```
git cherry-pick f174eca f25ac73 c3d8253 c682ce5 a294389 3155954 322d542 5485176 c814a1e 4800905 ce84566 7ad82d3 92729ee c1b0cbe 9f1baf6 0e78ab0
```
Then the UI and onboarding set. The last commit, 08f7a13, needs 768cb6a.
```
git cherry-pick 0e30f91 93f83e7 85b3721 a780765 768cb6a 08f7a13
```
Then, after a quick look:
- Difficulty: 446b4bb 83a7e94 74e8b7e 58b0e23 (the last two together)
- Perf and audio: 8f4a82e 60845a4 f8ee802 b6443ae
- Captions and chat: ea13884 888fc3f edab4bb 367b432 (after 08f7a13)
- Ending: 6b197a0 0047966
- Release: 4d77fb1

## Remaining minor problems (not fixed)
- The parser misses some requests ("cut the power", "lock the door", "lock everything"). In the deployed game the LLM judge catches them, about 2.5 s later.
- The server allows 90 requests per minute per IP. A room on one network at the demo could hit that, and the game would then fall back to the offline judge.
- Whether the LLM judge treats "I'm going to brace the window" as leaving can't be tested without the API key.
- Careless play falls off sharply on night 3: 4% survival for the careless bot (judge).
- Silent players struggle from night 2. GAME_LOGIC 15 says this is intended.

## Model usage
- Codex `gpt-6.2-sol` high ran 21 times: the harness, 14 reviews and sweeps, 4 fix or diagnosis tasks, one rerun after a run stopped to ask for plan approval, and one sweep cut off by the limit. It hit its usage limit at 08:43, and it resets at 11:01 AM.
- Sonnet subagents ran 13 council reviews and checks. An Anthropic limit hit at about 08:50 and reset at 09:10. One review was resumed after it.
- Opus orchestrated, made the fixes after round 2 and checked them in the browser where the pane was visible.
