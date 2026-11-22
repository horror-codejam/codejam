# Overnight report (branch `overnight-playtest`)

DRAFT, updated through 07:15. Final version at stop time.

## Result
- Branch: `overnight-playtest`, based on `origin/main` c2ab13b (PR #31 ending logic was merged after fbdfc58). Pushed to origin. Nothing touched on `main`, `release-integration` or Vercel.
- Build passes, 314 tests pass (was 308).
- Council medians, baseline -> latest (3 reviewers: Codex as hardcore FNAF player, Sonnet as first-time casual player, Sonnet as hackathon judge):

| Area | Baseline | Latest |
|---|---|---|
| Gameplay loop and curve | 6 | 7 |
| ChudGPT behavior | 7 | 8 |
| Onboarding | 6 | 8 |
| Horror feel and pacing | 8 | 8 |
| UI and readability | 7 | 8 |
| Bugs and robustness | 6 | 8 |
| Performance and loading | 6 | 8 |

## Playtest evidence (seeded bots, 400 seeds per cell)
Command: `cd prototype && npx vite-node tools/playtest/bots.ts -- --seeds 400`. Report: `prototype/tools/playtest/last-report.md`.
- Average bot survival, nights 1 to 4: 81/67/38/10% at the start -> 85/63/47/32% now. Targets 90/75/55/35%.
- Night 5 is won by typing the kill code, so it is measured as "code reachable": average 29%, skilled 74% (target 20%). It was 48% for average before the last-slip gate, because night 5 was one visit long.
- Skilled bot night 5 code reachable 74%; skilled nights 1 to 4 stay 100/100/100/92%.
- The remaining night 1 to 3 gap is mostly PEEKED deaths: the average bot peeks a lock it set on 20% of scans and never learns. A "learner" bot (same, but 5% after it hears the new loud clunk) gets 92/71/57/36%.

## Changes (what, why, commit)
TBD in final version.

## Risky or needs a team call
TBD in final version.

## Safe to cherry-pick first
TBD in final version.
