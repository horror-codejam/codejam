# R.A.M. seeded bot playtest

400 seeds per persona and night (1 to 400). Night 5 dawn with TRAPPED counts as survival.

| Persona | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| skilled | 100.0% | 100.0% | 100.0% | 92.3% | 63.5% |
| average | 85.0% | 62.5% | 47.0% | 32.3% | 3.8% |
| learner | 92.0% | 70.5% | 56.8% | 36.3% | 5.5% |
| careless | 99.3% | 51.5% | 4.3% | 1.5% | 0.0% |
| spammer | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| flatterer | 61.8% | 53.8% | 44.8% | 16.8% | 1.0% |
| silent | 82.0% | 53.5% | 38.5% | 18.3% | 0.8% |

| Persona | N5 slip dropped | N5 code reachable | N5 first slip (s) |
| --- | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 89.12 |
| skilled | 74.3% | 74.3% | 88.54 |
| average | 29.0% | 28.8% | 84.26 |
| learner | 29.3% | 29.3% | 84.60 |
| careless | 5.5% | 5.5% | 81.57 |
| spammer | 0.0% | 0.0% | n/a |
| flatterer | 27.0% | 26.5% | 89.36 |
| silent | 23.3% | 22.5% | 82.54 |

Behavior counts are means per run. Visits count approaches. First arrival averages runs with an arrival. Attempt windows are measured on 0.05 s ticks from arrival to retreat or entry into the room, excluding dawn-cancelled attempts.

Suspicion means include only runs that reached each checkpoint, in seconds. Death breakdowns are totals. Skilled bots ask once per visit inferred from visual cues. Scans use faint tells if Shift would drop a lock still defending a suspected visit, except for deliberate locked peeks.

## oracle

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.00 | 72.00 | 22.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 / 0.00 / 0.07 / 0.07 / 0.13 / 0.20 | none | none |
| 2 | 3.88 | 49.00 | 17.50 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10.00 / 6.44 / 2.31 / 7.47 / 3.00 / 1.35 | none | none |
| 3 | 5.06 | 35.00 | 14.53 | 0.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30.00 / 22.54 / 11.19 / 3.38 / 0.45 / 0.17 | none | none |
| 4 | 6.00 | 24.50 | 12.01 | 0.03 | 0.34 | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 50.00 / 42.02 / 27.19 / 12.15 / 3.44 / 0.94 | none | none |
| 5 | 7.22 | 19.00 | 9.01 | 0.03 | 1.10 | 0.00 | 0.24 | 0.01 | 0.00 | 0.01 | 70.00 / 61.29 / 40.35 / 24.96 / 9.96 / 11.10 | none | none |

## skilled

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.00 | 72.00 | 22.46 | 0.08 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 / 0.00 / 0.00 / 0.00 / 0.00 / 0.00 | none | none |
| 2 | 3.87 | 49.00 | 17.53 | 0.36 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10.00 / 6.40 / 2.20 / 6.65 / 1.86 / 0.78 | none | none |
| 3 | 5.11 | 35.00 | 14.49 | 0.41 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30.00 / 22.74 / 12.24 / 5.41 / 2.23 / 3.11 | none | none |
| 4 | 5.80 | 24.50 | 12.00 | 0.50 | 1.07 | 0.01 | 0.02 | 0.01 | 0.57 | 0.03 | 50.00 / 43.23 / 31.08 / 20.59 / 13.02 / 6.87 | ARMS_GAVE_OUT 26, PEEKED 1, REFUSED 2, SABOTAGE 2 | ARRIVED 31 |
| 5 | 5.42 | 19.00 | 9.00 | 0.40 | 2.53 | 0.02 | 0.27 | 0.03 | 1.63 | 0.01 | 70.00 / 63.33 / 47.24 / 38.85 / 29.35 / 32.37 | ARMS_GAVE_OUT 56, FURIOUS 1, LIED 10, PEEKED 3, REFUSED 41, SABOTAGE 23, UNLOCKED 12 | ARRIVED 121, DAWN 1, LOOK 7, MOVE 11, TIMER 6 |

## average

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.04 | 68.93 | 22.51 | 0.19 | 0.02 | 0.00 | 0.00 | 0.00 | 0.00 | 3.77 | 0.00 / 4.25 / 7.11 / 10.16 / 13.27 / 16.92 | ARMS_GAVE_OUT 1, PEEKED 59 | ARRIVED 1, DAWN 1, LOOK 43, MOVE 8, TIMER 7 |
| 2 | 3.55 | 49.00 | 17.49 | 0.75 | 0.35 | 0.05 | 0.02 | 0.01 | 0.00 | 2.58 | 10.00 / 12.25 / 14.28 / 29.74 / 30.51 / 32.17 | ARMS_GAVE_OUT 16, PEEKED 133, SABOTAGE 1 | ARRIVED 27, DAWN 3, LOOK 77, MOVE 28, TIMER 15 |
| 3 | 4.05 | 35.00 | 14.50 | 0.71 | 0.51 | 0.10 | 0.03 | 0.01 | 0.00 | 2.24 | 30.00 / 30.21 / 29.11 / 27.35 / 27.01 / 27.90 | ARMS_GAVE_OUT 27, PEEKED 181, REFUSED 2, SABOTAGE 1, UNLOCKED 1 | ARRIVED 38, DAWN 7, LOOK 95, MOVE 42, TIMER 30 |
| 4 | 4.05 | 24.50 | 12.03 | 0.69 | 1.25 | 0.27 | 0.07 | 0.04 | 0.00 | 1.62 | 50.00 / 49.55 / 45.46 / 38.67 / 35.30 / 34.65 | ARMS_GAVE_OUT 35, PEEKED 130, REFUSED 38, SABOTAGE 11, UNLOCKED 57 | ARRIVED 100, DAWN 1, LOOK 89, MOVE 53, TIMER 28 |
| 5 | 2.28 | 19.00 | 9.03 | 0.27 | 0.92 | 0.30 | 0.11 | 0.04 | 0.00 | 0.56 | 70.00 / 67.46 / 56.51 / 48.14 / 35.15 / 39.33 | ARMS_GAVE_OUT 25, PEEKED 38, REFUSED 79, SABOTAGE 12, UNLOCKED 231 | ARRIVED 142, LOOK 139, MOVE 78, TIMER 26 |

## learner

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.07 | 69.08 | 22.49 | 0.17 | 0.01 | 0.00 | 0.00 | 0.00 | 0.00 | 3.74 | 0.00 / 3.84 / 6.87 / 9.46 / 11.99 / 14.78 | ARMS_GAVE_OUT 1, PEEKED 31 | ARRIVED 1, DAWN 2, LOOK 20, MOVE 4, TIMER 5 |
| 2 | 3.64 | 49.00 | 17.54 | 0.81 | 0.29 | 0.07 | 0.02 | 0.01 | 0.00 | 2.58 | 10.00 / 12.46 / 14.31 / 29.27 / 28.50 / 28.64 | ARMS_GAVE_OUT 15, PEEKED 102, SABOTAGE 1 | ARRIVED 18, DAWN 8, LOOK 48, MOVE 22, TIMER 22 |
| 3 | 4.34 | 35.00 | 14.53 | 0.77 | 0.45 | 0.09 | 0.04 | 0.01 | 0.00 | 2.41 | 30.00 / 30.01 / 27.21 / 24.29 / 23.97 / 24.05 | ARMS_GAVE_OUT 20, PEEKED 149, REFUSED 1, SABOTAGE 1, UNLOCKED 2 | ARRIVED 28, DAWN 14, LOOK 58, MOVE 42, TIMER 31 |
| 4 | 4.20 | 24.50 | 11.97 | 0.69 | 1.32 | 0.28 | 0.10 | 0.04 | 0.00 | 1.63 | 50.00 / 49.65 / 46.33 / 39.91 / 34.22 / 31.84 | ARMS_GAVE_OUT 39, PEEKED 117, REFUSED 36, SABOTAGE 6, UNLOCKED 57 | ARRIVED 101, DAWN 7, LOOK 75, MOVE 53, TIMER 19 |
| 5 | 2.33 | 19.00 | 9.04 | 0.28 | 0.95 | 0.28 | 0.12 | 0.04 | 0.00 | 0.62 | 70.00 / 68.82 / 58.58 / 45.27 / 34.29 / 46.96 | ARMS_GAVE_OUT 27, PEEKED 28, REFUSED 99, SABOTAGE 8, UNLOCKED 216 | ARRIVED 177, DAWN 1, LOOK 107, MOVE 63, TIMER 30 |

## careless

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.63 | 68.40 | 22.47 | 0.15 | 0.13 | 0.01 | 0.00 | 0.00 | 0.00 | 5.14 | 0.00 / 6.17 / 11.80 / 17.84 / 25.68 / 31.27 | ARMS_GAVE_OUT 3 | ARRIVED 3 |
| 2 | 3.75 | 49.00 | 17.51 | 0.65 | 0.84 | 0.15 | 0.12 | 0.13 | 0.00 | 3.93 | 10.00 / 17.10 / 25.40 / 59.06 / 64.98 / 68.28 | ARMS_GAVE_OUT 24, PEEKED 51, REFUSED 28, SABOTAGE 13, UNLOCKED 78 | ARRIVED 64, DAWN 3, LOOK 74, MOVE 28, TIMER 25 |
| 3 | 1.90 | 35.00 | 14.53 | 0.26 | 0.31 | 0.03 | 0.02 | 0.02 | 0.00 | 1.68 | 30.00 / 35.88 / 42.31 / 50.14 / 53.92 / 60.24 | ARMS_GAVE_OUT 8, PEEKED 22, REFUSED 23, SABOTAGE 4, UNLOCKED 326 | ARRIVED 43, DAWN 4, LOOK 210, MOVE 85, TIMER 41 |
| 4 | 2.54 | 24.50 | 12.00 | 0.38 | 0.69 | 0.19 | 0.06 | 0.07 | 0.00 | 1.71 | 50.00 / 55.56 / 63.07 / 68.54 / 64.77 / 68.57 | ARMS_GAVE_OUT 19, PEEKED 21, REFUSED 37, SABOTAGE 9, UNLOCKED 308 | ARRIVED 94, DAWN 1, LOOK 166, MOVE 94, TIMER 39 |
| 5 | 1.22 | 19.00 | 9.02 | 0.11 | 0.27 | 0.11 | 0.01 | 0.04 | 0.00 | 0.23 | 70.00 / 76.82 / 86.00 / 85.00 / n/a / n/a | PEEKED 4, REFUSED 51, SABOTAGE 4, UNLOCKED 341 | ARRIVED 96, LOOK 192, MOVE 87, TIMER 25 |

## spammer

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 1.00 | 68.44 | 22.60 | 1.02 | 17.84 | 0.00 | 0.00 | 1.79 | 32.85 | 4.33 | 0.00 / 99.94 / 100.00 / 100.00 / 100.00 / 100.00 | FURIOUS 3, LIED 210, REFUSED 187 | DAWN 242, TIMER 158 |
| 2 | 1.00 | 49.00 | 17.51 | 3.64 | 16.07 | 0.00 | 0.06 | 1.74 | 30.04 | 3.54 | 10.00 / 100.00 / 99.98 / 99.85 / 99.94 / 100.00 | FURIOUS 162, LIED 130, REFUSED 92, SABOTAGE 16 | DAWN 241, TIMER 159 |
| 3 | 1.02 | 35.00 | 14.63 | 3.70 | 17.46 | 0.00 | 0.18 | 1.78 | 31.02 | 3.56 | 30.00 / 98.79 / 99.82 / 99.82 / 99.84 / 100.00 | FURIOUS 168, LIED 130, REFUSED 51, SABOTAGE 51 | DAWN 245, TIMER 155 |
| 4 | 1.01 | 24.50 | 12.06 | 4.72 | 17.24 | 0.00 | 0.01 | 1.64 | 31.35 | 3.38 | 50.00 / 99.86 / 99.86 / 99.88 / 99.79 / 100.00 | FURIOUS 4, LIED 364, REFUSED 14, SABOTAGE 2, UNLOCKED 16 | DAWN 256, TIMER 144 |
| 5 | 1.00 | 19.00 | 9.02 | 5.40 | 14.05 | 0.00 | 0.00 | 1.71 | 27.92 | 2.95 | 70.00 / 99.85 / 99.79 / 99.96 / 99.90 / 100.00 | UNLOCKED 400 | DAWN 240, TIMER 160 |

## flatterer

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 2.53 | 72.00 | 22.49 | 0.05 | 1.81 | 0.52 | 0.14 | 1.69 | 0.00 | 0.03 | 0.00 / 32.19 / 85.48 / 99.91 / 99.89 / 84.57 | ARMS_GAVE_OUT 103, PEEKED 20, SABOTAGE 30 | ARRIVED 142, LOOK 9, MOVE 1, TIMER 1 |
| 2 | 3.13 | 49.00 | 17.51 | 0.20 | 2.13 | 0.51 | 0.06 | 2.14 | 0.00 | 0.01 | 10.00 / 36.20 / 91.30 / 99.05 / 97.54 / 82.14 | ARMS_GAVE_OUT 127, FURIOUS 11, PEEKED 37, SABOTAGE 10 | ARRIVED 154, LOOK 22, MOVE 9 |
| 3 | 3.69 | 35.00 | 14.48 | 0.27 | 2.37 | 0.62 | 0.13 | 2.40 | 0.00 | 0.00 | 30.00 / 53.64 / 93.56 / 94.85 / 95.81 / 81.84 | ARMS_GAVE_OUT 138, FURIOUS 6, PEEKED 51, REFUSED 12, SABOTAGE 7, UNLOCKED 7 | ARRIVED 169, LOOK 34, MOVE 15, TIMER 3 |
| 4 | 3.29 | 24.50 | 12.00 | 0.28 | 2.13 | 0.71 | 0.07 | 1.90 | 0.00 | 0.00 | 50.00 / 71.70 / 96.66 / 95.28 / 96.70 / 82.79 | ARMS_GAVE_OUT 74, FURIOUS 10, PEEKED 40, REFUSED 114, SABOTAGE 4, UNLOCKED 91 | ARRIVED 229, DAWN 1, LOOK 58, MOVE 38, TIMER 7 |
| 5 | 2.10 | 19.00 | 9.03 | 0.17 | 1.20 | 0.30 | 0.04 | 0.90 | 0.00 | 0.00 | 70.00 / 90.58 / 95.95 / 95.57 / 96.92 / 81.25 | ARMS_GAVE_OUT 39, FURIOUS 6, PEEKED 23, REFUSED 102, SABOTAGE 2, UNLOCKED 224 | ARRIVED 163, LOOK 142, MOVE 68, TIMER 23 |

## silent

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.46 | 68.25 | 22.48 | 0.47 | 0.51 | 0.12 | 0.00 | 0.00 | 0.00 | 5.63 | 0.00 / 7.10 / 15.27 / 27.93 / 37.19 / 45.00 | ARMS_GAVE_OUT 18, PEEKED 54 | ARRIVED 22, LOOK 40, MOVE 9, TIMER 1 |
| 2 | 3.81 | 49.00 | 17.50 | 1.26 | 1.19 | 0.43 | 0.13 | 0.90 | 0.00 | 4.87 | 10.00 / 19.65 / 33.43 / 87.56 / 95.65 / 83.64 | ARMS_GAVE_OUT 95, FURIOUS 2, PEEKED 72, SABOTAGE 17 | ARRIVED 121, LOOK 41, MOVE 16, TIMER 8 |
| 3 | 4.14 | 35.00 | 14.47 | 0.95 | 1.71 | 0.42 | 0.21 | 0.68 | 0.00 | 4.19 | 30.00 / 40.60 / 57.52 / 80.84 / 92.38 / 83.96 | ARMS_GAVE_OUT 114, FURIOUS 1, PEEKED 102, REFUSED 13, SABOTAGE 10, UNLOCKED 6 | ARRIVED 158, LOOK 57, MOVE 24, TIMER 7 |
| 4 | 3.51 | 24.50 | 12.02 | 0.80 | 1.66 | 0.56 | 0.23 | 0.85 | 0.00 | 2.87 | 50.00 / 62.36 / 82.64 / 97.12 / 90.14 / 83.22 | ARMS_GAVE_OUT 75, FURIOUS 1, PEEKED 56, REFUSED 82, SABOTAGE 13, UNLOCKED 100 | ARRIVED 213, LOOK 55, MOVE 45, TIMER 14 |
| 5 | 1.96 | 19.00 | 9.02 | 0.42 | 0.89 | 0.31 | 0.08 | 0.41 | 0.00 | 0.97 | 70.00 / 83.89 / 97.07 / 94.11 / 93.89 / 85.00 | ARMS_GAVE_OUT 36, PEEKED 5, REFUSED 121, SABOTAGE 6, UNLOCKED 229 | ARRIVED 207, LOOK 116, MOVE 67, TIMER 7 |

32 location claims went unscored because dawn ended the approach before its target was revealed.
