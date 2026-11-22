# Overnight log (branch overnight-playtest)

Started 2026-11-22 05:58 EST. Base: origin/main c2ab13b (PR #31 ending logic merged after fbdfc58). Hard stop 11:00.

## Model usage and limits
| Time | Model | Event |
|---|---|---|
| 06:00 | Opus 5.5 (orchestrator) | Start |
| 06:02 to 06:30 | Codex gpt-6.2-sol high | Harness, 2 reviews, 1 bug-fix task. No limit hit yet |
| 06:15 to 06:30 | Sonnet subagents | 2 council reviewers per round |
| 06:30 to 06:50 | Codex + Sonnet | Round 1 and 2 reviews, harness metric. No limit hit yet |
| 06:50 to 07:25 | Codex + Sonnet | Perf task, round 3 and 4 reviews, PEEKED trace (one Codex run stopped to ask for plan approval; rerun with pre-approval). No Codex limit hit |
| 07:30 to 08:43 | Codex | Final sweeps: 6 more rounds, 20 more fixes |
| 08:43 | Codex | **Usage limit hit. Resets 11:01 AM (after the 11:00 stop).** Switched to Sonnet subagents for the remaining reviews |
| about 08:50 | Sonnet / Opus | **Anthropic limit hit (org monthly spend / 5-hour window), reset 09:10.** The FNAF-persona Sonnet sweep stopped mid-run; casual and judge final checks had finished (all 8, MINOR_ONLY yes). Resumed at 09:12 |

## Baseline
- Build: pass. Tests: 308 passed (9 files).
- Bot playtest (2ec272e, 100 seeds): average bot 81/67/38/10/0% for nights 1 to 5 (targets 90/75/55/35/20). Skilled 100/100/100/91/43%.
- Council round 0 (Codex fnaf, Sonnet casual, Sonnet judge):

| Area | fnaf | casual | judge | Median |
|---|---|---|---|---|
| loop | 6 | 6 | 6 | 6 |
| chud | 7 | 7 | 7 | 7 |
| onboarding | 7 | 6 | 6 | 6 |
| horror | 8 | 7 | 8 | 8 |
| ui | 7 | 7 | 7 | 7 |
| bugs | 5 | 6 | 6 | 6 |
| perf | 6 | 6 | 7 | 6 |

## Iterations
| # | Area | Median before | Median after | Change | Commit | Result |
|---|---|---|---|---|---|---|
| 0 | tooling | n/a | n/a | Seeded bot playtest harness (Codex) | 2ec272e | kept |
| 1 | bugs | 6 | 7 | Furious cut silent with no lock; breach ends the episode (found by harness, all 3 reviewers) | 73e691e | kept (real bug) |
| 2 | loop | 6 | 6 | Attempt windows nights 3 to 5: 12-15 / 10-12 / 8-10 s. Skilled N5 43 -> 68%, average N4 10 -> 30% | 446b4bb | kept (median flat, no area hurt; fixes a broken curve, average N4 was 10%) |
| 3 | onboarding | 6 | 7 | Night 1 hints name Shift and the light-drops-lock rule | 0e30f91 | kept |
| 4 | bugs | 6 | 7 | Esc pauses on the first press, also from the chat (Codex) | ed7fdc3 | kept (real bug, verified in browser) |
| 5 | bugs | 6 | 7 | Drop a late LLM reply when a newer event's line showed (Codex 4ace39f, then reworked by orchestrator in 21f58fc: Codex version could drop the reply to the next message) | 4ace39f + 21f58fc | kept (real bug) |
| 6 | ui (release) | 7 | n/a | Production build hides the DEV badge unless ?dev (optional, team call) | 4d77fb1 | kept, optional |
| 7 | onboarding | 7 | 7 | Light that drops a lock plays the loud clunk and flashes the cell | 768cb6a | kept (no area hurt; reviewers cite it) |
| 8 | ui | 7 | 7 | Darker subtitle outline, hints readable over the keyboard (checked in browser) | 93f83e7 | kept (no area hurt) |
| 9 | chud | 7 | 8 | Blocked command repeats the pending question | 673848f | kept |
| 10 | tooling | n/a | n/a | Harness: night 5 kill code reachability (Codex). Showed night 5 was won by about 48% of average bots, not 2% | b1ef3a0 | kept |
| 11 | loop | 6 | 7 | Night 5 last slip drops only from 1:12 AM (LAST_PAPER_AFTER 60 s). Code reachable: average 48 -> 19-22%, skilled 88 -> 79%. Night 5 was one visit long | 6b197a0 | kept |
| 12 | ui | 7 | 8 | At the desk the subtitle sits on the bare desk above the keyboard (checked at 1280x720) | 85b3721 | kept |
| 13 | bugs | 8 | 8 | A question waits up to 3 s for the judge on an answer typed in time (Codex round 2 finding) | 2a51c43 | kept (real bug, 2 tests) |
| 14 | onboarding | 7 | 8 | First lock dropped by a light: one-time caption "Your light dropped the lock." (nights 1-2); cell flash replays at the desk (verified in browser) | 08f7a13 | kept |
| 15 | loop | 7 | 7 | Windows night 2 16-19 s, night 3 13-16 s. 400 seeds: average N2/N3 57/43 -> 63/47%, learner 66/55 -> 71/57% | 83a7e94 | kept (median flat, curve closer to targets, no area hurt) |
| 16 | tooling | n/a | n/a | Learner persona (assumption: the clunk teaches) | 04dc603 | kept |
| 17 | ui | 7 | 8 | Subtitles wrap to 2 balanced lines at 27 px instead of an ellipsis at about 78 chars (verified in browser) | a780765 | kept |
| 18 | perf | 7 | 8 | Title waits only for essential audio, the rest loads in the background (Codex). Blocking audio 3.62 -> 3.14 MB; reviewed for double-decode risk, sanity-checked in browser | 8f4a82e | kept |
| 19 | loop | 7 | 7 | Night 4 window 11-13 s (average 24 -> 34%, learner 31 -> 35%, 400 seeds). NOTE: this commit alone fails the night 4 visit test; pick it with 58b0e23 | 74e8b7e | kept (with 58b0e23) |
| 20 | loop | 7 | 7 | Night 4 away gap 27-41 s restores 6.00 visits, tests green | 58b0e23 | kept (fixes 74e8b7e) |
| 21 | bugs | 8 | n/a | A message after a question's 10 s deadline cannot answer it (edge from the judge grace, Codex round 3) | 5187451 | kept (real bug, test) |
| 22 | perf | 8 | n/a | Storm and room beds load in the background (about 1.2 MB less before the title) | 60845a4 | kept |
| 23 | loop | 7 | n/a | Each night's first slip drop shows the "He left something" hint (Codex round 3: a missed slip blocks night 5) | 0047966 | kept, optional (ending logic) |
| 24 | tooling | n/a | n/a | Bot bug fixed after Codex traced 10 PEEKED deaths (3 bot bugs, 7 realistic): bots now restore a lock after a peek. Average bot 85/63/47/32 -> 89/76/60/33% (targets 90/75/55/35). Note: windows in 83a7e94 and 74e8b7e were tuned with the buggy bot; night 3 now reads slightly easy (60 vs 55%) | cbb98a9 | kept |
| 25 | bugs | 8 | n/a | During the judge grace a typed command stays blocked like a map button (Codex round 4, edge from 5187451) | 8d89bf1 | kept (real bug, test) |
| 26 | perf | 8 | n/a | Title music loads in the background (about 1.4 MB less before the title; title checked in browser) | f8ee802 | kept |

## Council round 1 (after iterations 1 to 5)
| Area | fnaf | casual | judge | Median |
|---|---|---|---|---|
| loop | 6 | 7 | 6 | 6 |
| chud | 7 | 7 | 7 | 7 |
| onboarding | 8 | 7 | 7 | 7 |
| ui | 7 | 7 | 7 | 7 |
| bugs | 7 | 7 | 7 | 7 |
| perf | 6 | 6 | 7 | 6 |
| horror | (not re-scored) | | | 8 |

Note: night 5 window 9-11 or 10-12 s barely moves night 5 (skilled 66-67%, average 4.5-6.5%, 200 seeds). The driver is ChudGPT starting JEALOUS (70). Survival to dawn also overstates night 5, which ends when the kill code is typed; harness metric being added.

## Council round 2 (after iterations 6 to 11)
| Area | fnaf | casual | judge | Median |
|---|---|---|---|---|
| loop | 7 | 7 | 7 | 7 |
| chud | 8 | 8 | 8 | 8 |
| onboarding | 8 | 7 | 7 | 7 |
| horror | 8 | 8 | 8 | 8 |
| ui | 8 | 7 | 7 | 7 |
| bugs | 7 | 8 | 8 | 8 |
| perf | 6 | 7 | 8 | 7 |

Iterations 7, 8, 9, 11 kept: chud 7 -> 8, bugs 7 -> 8, loop 6 -> 7, ui flat, no area dropped.
Seed noise note: 100 vs 200 seed runs differed by up to 12 points on one cell; decisions from 07:00 use 400 seeds.

## Council round 3 (after iterations 12 to 20)
| Area | fnaf | casual | judge | Median |
|---|---|---|---|---|
| loop | 8 | 7 | 7 | 7 |
| chud | 8 | 8 | 8 | 8 |
| onboarding | 8 | 8 | 8 | 8 |
| horror | 8 | 8 | 8 | 8 |
| ui | 9 | 8 | 8 | 8 |
| bugs | 8 | 8 | 8 | 8 |
| perf | 7 | 8 | 8 | 8 |

Remaining: loop (casual, judge: nights 2 and 3 average bot under target, mostly PEEKED). Codex tracing PEEKED deaths to tell bot artifact from game problem.

## Council round 4 (after iterations 21 to 24)
| Area | fnaf | casual | judge | Median |
|---|---|---|---|---|
| loop | 8 | 8 | 8 | 8 |
| chud | 8 | 8 | 8 | 8 |
| onboarding | 8 | 8 | 9 | 8 |
| horror | 8 | 8 | 8 | 8 |
| ui | 9 | 8 | 8 | 8 |
| bugs | 8 | 8 | 9 | 8 |
| perf | 8 | 8 | 9 | 8 |

Stop condition met at 07:28: every median 8 or higher, remaining problems minor. Fixed the one real bug from round 4 (8d89bf1) and one perf item (f8ee802), then stopped. Final: build pass, 315 tests pass, branch pushed. Summary in OVERNIGHT_REPORT.md.
Model status at stop: Codex never hit its limit (11 runs). No limit resets to track.

## Final checks after round 4 (07:30 to 09:15)
- Codex (FNAF) found more real edge cases in rounds 5 to 13 (late judge verdicts, parser negation, status questions, offline judge answers, captions, sabotage timing, speech queue). All were fixed with tests: 8d89bf1 f8ee802 f174eca f25ac73 c3d8253 c682ce5 a294389 3155954 ea13884 b6443ae 5485176 c814a1e 888fc3f 322d542 4800905 ce84566 7ad82d3 92729ee edab4bb c1b0cbe 9f1baf6 367b432 0e78ab0.
- Production build checked with vite preview: blocking audio arrives first, beds and title music load in the background, intro starts with no errors, DEV badge hidden.
- Final council on HEAD 0e78ab0: FNAF persona (Sonnet, after the Codex limit) loop 8 chud 8 onboarding 8 horror 8 ui 9 bugs 8 perf 8, MINOR_ONLY yes. Casual: all 8, MINOR_ONLY yes. Judge: all 8, MINOR_ONLY yes.
- Stopped at 09:15: build passes, 344 tests pass, branch pushed.
