# Overnight log (branch overnight-playtest)

Started 2026-11-22 05:58 EST. Base: origin/main c2ab13b (PR #31 ending logic merged after fbdfc58). Hard stop 11:00.

## Model usage and limits
| Time | Model | Event |
|---|---|---|
| 06:00 | Opus 5.5 (orchestrator) | Start |
| 06:02 to 06:30 | Codex gpt-6.2-sol high | Harness, 2 reviews, 1 bug-fix task. No limit hit yet |
| 06:15 to 06:30 | Sonnet subagents | 2 council reviewers per round |
| 06:30 to 06:50 | Codex + Sonnet | Round 1 and 2 reviews, harness metric. No limit hit yet |

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
| 7 | onboarding | 7 | pending | Light that drops a lock plays the loud clunk and flashes the cell | 768cb6a | pending |
| 8 | ui | 7 | pending | Darker subtitle outline, hints readable over the keyboard (checked in browser) | 93f83e7 | pending |
| 9 | chud | 7 | pending | Blocked command repeats the pending question | 673848f | pending |
| 10 | tooling | n/a | n/a | Harness: night 5 kill code reachability (Codex). Showed night 5 was won by about 48% of average bots, not 2% | b1ef3a0 | kept |
| 11 | loop | 6 | pending | Night 5 last slip drops only from 1:12 AM (LAST_PAPER_AFTER 60 s). Code reachable: average 48 -> 19-22%, skilled 88 -> 79%. Night 5 was one visit long | 6b197a0 | pending |

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
