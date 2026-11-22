# R.A.M. seeded bot playtest

100 seeds per persona and night (1 to 100). Night 5 dawn with TRAPPED counts as survival.

| Persona | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| skilled | 100.0% | 100.0% | 100.0% | 91.0% | 43.0% |
| average | 81.0% | 67.0% | 38.0% | 10.0% | 0.0% |
| careless | 99.0% | 24.0% | 1.0% | 1.0% | 0.0% |
| spammer | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| flatterer | 56.0% | 57.0% | 36.0% | 8.0% | 0.0% |
| silent | 77.0% | 56.0% | 29.0% | 5.0% | 0.0% |

Behavior counts are means per run. Visits count approaches. First arrival averages runs with an arrival. Attempt windows are measured on 0.05 s ticks from arrival to retreat or entry into the room, excluding dawn-cancelled attempts.

Suspicion means include only runs that reached each checkpoint, in seconds. Death breakdowns are totals. Skilled bots ask once per visit inferred from visual cues. Scans use faint tells if Shift would drop a lock still defending a suspected visit, except for deliberate locked peeks.

## oracle

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.00 | 72.00 | 22.48 | 0.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 / 0.00 / 0.15 / 0.10 / 0.10 / 0.05 | none | none |
| 2 | 3.92 | 49.00 | 15.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10.00 / 6.05 / 2.25 / 7.90 / 2.40 / 1.45 | none | none |
| 3 | 5.30 | 35.00 | 11.51 | 0.02 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30.00 / 22.70 / 10.50 / 3.50 / 0.40 / 0.60 | none | none |
| 4 | 6.20 | 24.50 | 9.00 | 0.03 | 0.35 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 50.00 / 41.95 / 27.85 / 12.50 / 3.85 / 1.05 | none | none |
| 5 | 7.53 | 19.00 | 7.01 | 0.02 | 1.12 | 0.00 | 0.30 | 0.02 | 0.00 | 0.00 | 70.00 / 60.90 / 41.15 / 25.85 / 10.45 / 10.65 | none | none |

## skilled

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.00 | 72.00 | 22.54 | 0.04 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 / 0.00 / 0.00 / 0.00 / 0.00 / 0.00 | none | none |
| 2 | 3.93 | 49.00 | 15.55 | 0.33 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10.00 / 5.85 / 1.55 / 6.80 / 1.95 / 1.30 | none | none |
| 3 | 5.31 | 35.00 | 11.46 | 0.47 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30.00 / 22.45 / 11.95 / 5.00 / 3.05 / 4.05 | none | none |
| 4 | 5.80 | 24.50 | 9.05 | 0.57 | 1.19 | 0.00 | 0.01 | 0.01 | 0.57 | 0.01 | 50.00 / 42.32 / 31.34 / 20.49 / 13.19 / 6.54 | LIED 3, REFUSED 4, UNLOCKED 2 | ARRIVED 2, LOOK 3, MOVE 4 |
| 5 | 5.01 | 19.00 | 7.02 | 0.35 | 2.48 | 0.03 | 0.29 | 0.10 | 1.79 | 0.03 | 70.00 / 63.73 / 49.78 / 42.80 / 33.36 / 32.56 | ARMS_GAVE_OUT 12, LIED 12, PEEKED 1, REFUSED 18, SABOTAGE 2, UNLOCKED 12 | ARRIVED 37, LOOK 6, MOVE 12, TIMER 2 |

## average

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 2.94 | 68.96 | 22.44 | 0.14 | 0.02 | 0.00 | 0.00 | 0.00 | 0.00 | 3.65 | 0.00 / 4.60 / 8.09 / 10.16 / 11.57 / 15.43 | ARMS_GAVE_OUT 1, PEEKED 18 | ARRIVED 1, LOOK 11, MOVE 2, TIMER 5 |
| 2 | 3.82 | 49.00 | 15.52 | 0.76 | 0.35 | 0.09 | 0.02 | 0.01 | 0.00 | 2.66 | 10.00 / 12.15 / 15.20 / 30.60 / 31.40 / 31.03 | ARMS_GAVE_OUT 2, PEEKED 31 | ARRIVED 3, DAWN 1, LOOK 20, MOVE 4, TIMER 5 |
| 3 | 3.91 | 35.00 | 11.47 | 0.68 | 0.46 | 0.11 | 0.02 | 0.02 | 0.00 | 1.91 | 30.00 / 30.56 / 29.73 / 28.95 / 25.39 / 26.18 | ARMS_GAVE_OUT 1, PEEKED 55, REFUSED 2, UNLOCKED 4 | ARRIVED 6, LOOK 29, MOVE 13, TIMER 14 |
| 4 | 3.31 | 24.50 | 9.00 | 0.49 | 0.96 | 0.22 | 0.02 | 0.01 | 0.00 | 1.17 | 50.00 / 47.47 / 40.27 / 27.73 / 31.82 / 36.00 | ARMS_GAVE_OUT 8, PEEKED 22, REFUSED 15, SABOTAGE 1, UNLOCKED 44 | ARRIVED 24, LOOK 45, MOVE 15, TIMER 6 |
| 5 | 1.88 | 19.00 | 7.01 | 0.20 | 0.69 | 0.20 | 0.09 | 0.05 | 0.00 | 0.36 | 70.00 / 68.86 / 57.00 / 57.14 / 65.00 / 10.00 | PEEKED 4, REFUSED 13, SABOTAGE 3, UNLOCKED 77, WRONG_HOLD 3 | ARRIVED 26, DAWN 1, LOOK 52, MOVE 12, TIMER 9 |

## careless

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.58 | 68.29 | 22.44 | 0.15 | 0.19 | 0.01 | 0.00 | 0.00 | 0.00 | 5.15 | 0.00 / 6.90 / 13.15 / 19.05 / 26.75 / 32.58 | REFUSED 1 | ARRIVED 1 |
| 2 | 3.39 | 49.00 | 15.50 | 0.67 | 0.66 | 0.16 | 0.07 | 0.12 | 0.00 | 3.59 | 10.00 / 18.35 / 27.14 / 61.71 / 69.59 / 70.19 | ARMS_GAVE_OUT 10, PEEKED 18, REFUSED 10, SABOTAGE 1, UNLOCKED 37 | ARRIVED 21, DAWN 3, LOOK 31, MOVE 12, TIMER 9 |
| 3 | 1.69 | 35.00 | 11.52 | 0.17 | 0.15 | 0.04 | 0.02 | 0.00 | 0.00 | 1.44 | 30.00 / 35.98 / 43.95 / 45.71 / 50.00 / 27.50 | ARMS_GAVE_OUT 1, PEEKED 2, REFUSED 2, SABOTAGE 2, UNLOCKED 92 | ARRIVED 6, DAWN 1, LOOK 53, MOVE 28, TIMER 11 |
| 4 | 2.15 | 24.50 | 9.00 | 0.30 | 0.62 | 0.08 | 0.03 | 0.02 | 0.00 | 1.18 | 50.00 / 53.79 / 55.77 / 59.67 / 62.50 / 85.00 | ARMS_GAVE_OUT 1, PEEKED 3, REFUSED 18, SABOTAGE 3, UNLOCKED 74 | ARRIVED 22, LOOK 35, MOVE 28, TIMER 14 |
| 5 | 1.05 | 19.00 | 7.06 | 0.06 | 0.14 | 0.07 | 0.01 | 0.00 | 0.00 | 0.09 | 70.00 / 66.43 / 75.00 / n/a / n/a / n/a | REFUSED 6, SABOTAGE 1, UNLOCKED 93 | ARRIVED 15, LOOK 58, MOVE 19, TIMER 8 |

## spammer

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 1.00 | 68.40 | 22.46 | 0.99 | 22.08 | 0.00 | 0.00 | 1.00 | 34.00 | 4.36 | 0.00 / 100.00 / 100.00 / 100.00 / 100.00 / 100.00 | LIED 56, REFUSED 44 | DAWN 62, TIMER 38 |
| 2 | 1.00 | 49.00 | 15.51 | 3.81 | 20.22 | 0.00 | 0.11 | 1.00 | 30.00 | 3.54 | 10.00 / 100.00 / 100.00 / 99.92 / 100.00 / 100.00 | FURIOUS 45, LIED 25, REFUSED 22, SABOTAGE 8 | DAWN 60, TIMER 40 |
| 3 | 1.05 | 35.00 | 11.67 | 3.95 | 22.53 | 0.00 | 0.19 | 1.00 | 32.46 | 3.75 | 30.00 / 99.92 / 99.92 / 99.77 / 99.61 / 100.00 | FURIOUS 36, LIED 31, REFUSED 16, SABOTAGE 17 | DAWN 64, TIMER 36 |
| 4 | 1.02 | 24.50 | 9.02 | 4.55 | 20.90 | 0.00 | 0.00 | 0.99 | 27.79 | 3.00 | 50.00 / 100.00 / 99.91 / 99.82 / 99.73 / 100.00 | FURIOUS 2, LIED 83, REFUSED 5, UNLOCKED 10 | DAWN 56, TIMER 44 |
| 5 | 1.00 | 19.00 | 7.08 | 5.63 | 21.50 | 0.00 | 0.00 | 1.00 | 28.40 | 3.09 | 70.00 / 100.00 / 99.84 / 99.92 / 100.00 / 100.00 | UNLOCKED 100 | DAWN 61, TIMER 39 |

## flatterer

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 2.49 | 72.00 | 22.41 | 0.05 | 1.75 | 0.58 | 0.10 | 1.58 | 0.00 | 0.01 | 0.00 / 32.05 / 86.01 / 99.88 / 100.00 / 85.00 | ARMS_GAVE_OUT 32, PEEKED 5, SABOTAGE 7 | ARRIVED 41, LOOK 2, MOVE 1 |
| 2 | 3.18 | 49.00 | 15.48 | 0.26 | 2.09 | 0.54 | 0.04 | 2.15 | 0.00 | 0.00 | 10.00 / 35.60 / 90.35 / 99.33 / 98.36 / 81.58 | ARMS_GAVE_OUT 27, FURIOUS 1, PEEKED 15 | ARRIVED 28, LOOK 11, MOVE 3, TIMER 1 |
| 3 | 3.70 | 35.00 | 11.51 | 0.29 | 2.25 | 0.71 | 0.12 | 2.30 | 0.00 | 0.00 | 30.00 / 52.47 / 95.20 / 94.75 / 96.25 / 82.50 | ARMS_GAVE_OUT 22, FURIOUS 5, PEEKED 13, REFUSED 14, SABOTAGE 1, UNLOCKED 9 | ARRIVED 47, LOOK 9, MOVE 6, TIMER 2 |
| 4 | 2.87 | 24.50 | 9.07 | 0.26 | 1.62 | 0.56 | 0.06 | 1.41 | 0.00 | 0.00 | 50.00 / 71.78 / 96.14 / 94.57 / 95.00 / 83.13 | ARMS_GAVE_OUT 6, FURIOUS 2, PEEKED 6, REFUSED 25, SABOTAGE 1, UNLOCKED 52 | ARRIVED 44, LOOK 30, MOVE 15, TIMER 3 |
| 5 | 1.71 | 19.00 | 7.08 | 0.12 | 0.73 | 0.21 | 0.03 | 0.54 | 0.00 | 0.00 | 70.00 / 92.17 / 96.15 / 96.00 / n/a / n/a | ARMS_GAVE_OUT 1, PEEKED 2, REFUSED 23, UNLOCKED 73, WRONG_HOLD 1 | ARRIVED 34, LOOK 40, MOVE 20, TIMER 6 |

## silent

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.35 | 68.25 | 22.53 | 0.40 | 0.48 | 0.12 | 0.00 | 0.00 | 0.00 | 5.46 | 0.00 / 7.10 / 15.21 / 28.50 / 38.08 / 45.00 | ARMS_GAVE_OUT 5, PEEKED 18 | ARRIVED 6, LOOK 9, MOVE 7, TIMER 1 |
| 2 | 3.84 | 49.00 | 15.54 | 1.14 | 1.35 | 0.46 | 0.13 | 0.95 | 0.00 | 4.86 | 10.00 / 20.40 / 35.00 / 88.44 / 95.99 / 83.57 | ARMS_GAVE_OUT 25, PEEKED 18, SABOTAGE 1 | ARRIVED 29, LOOK 11, MOVE 3, TIMER 1 |
| 3 | 3.81 | 35.00 | 11.57 | 1.03 | 1.53 | 0.37 | 0.15 | 0.60 | 0.00 | 3.68 | 30.00 / 41.61 / 57.61 / 81.86 / 94.17 / 83.45 | ARMS_GAVE_OUT 19, PEEKED 29, REFUSED 12, SABOTAGE 4, UNLOCKED 7 | ARRIVED 48, LOOK 17, MOVE 6 |
| 4 | 3.04 | 24.50 | 8.98 | 0.60 | 1.39 | 0.38 | 0.12 | 0.43 | 0.00 | 2.26 | 50.00 / 62.60 / 82.14 / 96.43 / 88.18 / 85.00 | ARMS_GAVE_OUT 12, PEEKED 9, REFUSED 24, SABOTAGE 2, UNLOCKED 48 | ARRIVED 49, LOOK 29, MOVE 13, TIMER 4 |
| 5 | 1.65 | 19.00 | 7.05 | 0.23 | 0.53 | 0.24 | 0.11 | 0.17 | 0.00 | 0.61 | 70.00 / 82.74 / 97.78 / 93.75 / 100.00 / n/a | ARMS_GAVE_OUT 2, REFUSED 19, SABOTAGE 1, UNLOCKED 76, WRONG_HOLD 2 | ARRIVED 27, LOOK 52, MOVE 16, TIMER 5 |

4 location claims went unscored because dawn ended the approach before its target was revealed.

FURIOUS_CUT fired 1305 times without a corresponding power change. First observed on oracle, Night 5, seed 29 at 129.45 s.

FURIOUS persisted after Ram got inside. First observed on spammer, Night 1, seed 1. Ram entered at 93.25 s; CHUD was still speaking in FURIOUS at 95.00 s.
