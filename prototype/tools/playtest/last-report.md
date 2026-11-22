# R.A.M. seeded bot playtest

100 seeds per persona and night (1 to 100). Night 5 dawn with TRAPPED counts as survival.

| Persona | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| skilled | 100.0% | 100.0% | 100.0% | 92.0% | 68.0% |
| average | 81.0% | 67.0% | 38.0% | 30.0% | 2.0% |
| careless | 99.0% | 24.0% | 3.0% | 1.0% | 0.0% |
| spammer | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| flatterer | 56.0% | 57.0% | 46.0% | 11.0% | 1.0% |
| silent | 77.0% | 56.0% | 33.0% | 9.0% | 0.0% |

| Persona | N5 slip dropped | N5 code reachable | N5 first slip (s) |
| --- | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 88.90 |
| skilled | 79.0% | 79.0% | 89.68 |
| average | 19.0% | 19.0% | 87.37 |
| careless | 3.0% | 3.0% | 82.40 |
| spammer | 0.0% | 0.0% | n/a |
| flatterer | 14.0% | 14.0% | 90.10 |
| silent | 20.0% | 20.0% | 82.01 |

Behavior counts are means per run. Visits count approaches. First arrival averages runs with an arrival. Attempt windows are measured on 0.05 s ticks from arrival to retreat or entry into the room, excluding dawn-cancelled attempts.

Suspicion means include only runs that reached each checkpoint, in seconds. Death breakdowns are totals. Skilled bots ask once per visit inferred from visual cues. Scans use faint tells if Shift would drop a lock still defending a suspected visit, except for deliberate locked peeks.

## oracle

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.00 | 72.00 | 22.48 | 0.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 / 0.00 / 0.15 / 0.10 / 0.10 / 0.05 | none | none |
| 2 | 3.92 | 49.00 | 15.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10.00 / 6.05 / 2.25 / 7.90 / 2.40 / 1.45 | none | none |
| 3 | 5.20 | 35.00 | 13.50 | 0.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30.00 / 22.70 / 10.50 / 3.55 / 0.45 / 0.50 | none | none |
| 4 | 6.15 | 24.50 | 11.00 | 0.03 | 0.42 | 0.00 | 0.00 | 0.00 | 0.00 | 0.02 | 50.00 / 42.95 / 29.80 / 14.40 / 5.05 / 1.80 | none | none |
| 5 | 7.21 | 19.00 | 8.99 | 0.07 | 1.05 | 0.00 | 0.27 | 0.02 | 0.00 | 0.02 | 70.00 / 60.65 / 39.55 / 24.45 / 9.45 / 10.95 | none | none |

## skilled

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.00 | 72.00 | 22.54 | 0.04 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 / 0.00 / 0.00 / 0.00 / 0.00 / 0.00 | none | none |
| 2 | 3.93 | 49.00 | 15.55 | 0.33 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10.00 / 5.85 / 1.55 / 6.80 / 1.95 / 1.30 | none | none |
| 3 | 5.15 | 35.00 | 13.46 | 0.40 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30.00 / 22.20 / 12.20 / 5.45 / 2.70 / 3.35 | none | none |
| 4 | 5.64 | 24.50 | 11.00 | 0.58 | 0.82 | 0.00 | 0.00 | 0.00 | 0.39 | 0.00 | 50.00 / 41.99 / 29.35 / 16.96 / 9.29 / 4.18 | ARMS_GAVE_OUT 8 | ARRIVED 8 |
| 5 | 5.60 | 19.00 | 9.03 | 0.34 | 2.56 | 0.04 | 0.34 | 0.05 | 1.76 | 0.02 | 70.00 / 64.89 / 48.53 / 39.28 / 29.93 / 33.68 | ARMS_GAVE_OUT 10, LIED 4, REFUSED 6, SABOTAGE 7, UNLOCKED 5 | ARRIVED 24, LOOK 5, MOVE 3 |

## average

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 2.94 | 68.96 | 22.44 | 0.14 | 0.02 | 0.00 | 0.00 | 0.00 | 0.00 | 3.65 | 0.00 / 4.60 / 8.09 / 10.16 / 11.57 / 15.43 | ARMS_GAVE_OUT 1, PEEKED 18 | ARRIVED 1, LOOK 11, MOVE 2, TIMER 5 |
| 2 | 3.82 | 49.00 | 15.52 | 0.76 | 0.35 | 0.09 | 0.02 | 0.01 | 0.00 | 2.66 | 10.00 / 12.15 / 15.20 / 30.60 / 31.40 / 31.03 | ARMS_GAVE_OUT 2, PEEKED 31 | ARRIVED 3, DAWN 1, LOOK 20, MOVE 4, TIMER 5 |
| 3 | 4.02 | 35.00 | 13.54 | 0.74 | 0.62 | 0.14 | 0.03 | 0.03 | 0.00 | 2.06 | 30.00 / 30.00 / 29.44 / 29.47 / 30.51 / 29.13 | ARMS_GAVE_OUT 3, PEEKED 55, REFUSED 1, SABOTAGE 2, UNLOCKED 1 | ARRIVED 10, DAWN 2, LOOK 22, MOVE 17, TIMER 11 |
| 4 | 3.75 | 24.50 | 11.00 | 0.70 | 1.06 | 0.25 | 0.07 | 0.05 | 0.00 | 1.37 | 50.00 / 47.97 / 43.77 / 38.00 / 29.31 / 28.33 | ARMS_GAVE_OUT 6, PEEKED 33, REFUSED 7, SABOTAGE 1, UNLOCKED 23 | ARRIVED 19, LOOK 29, MOVE 15, TIMER 7 |
| 5 | 1.98 | 19.00 | 9.01 | 0.27 | 0.85 | 0.22 | 0.12 | 0.06 | 0.00 | 0.46 | 70.00 / 66.67 / 57.22 / 52.14 / 63.33 / 60.00 | ARMS_GAVE_OUT 7, PEEKED 4, REFUSED 25, SABOTAGE 4, UNLOCKED 58 | ARRIVED 42, LOOK 34, MOVE 20, TIMER 2 |

## careless

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.58 | 68.29 | 22.44 | 0.15 | 0.19 | 0.01 | 0.00 | 0.00 | 0.00 | 5.15 | 0.00 / 6.90 / 13.15 / 19.05 / 26.75 / 32.58 | REFUSED 1 | ARRIVED 1 |
| 2 | 3.39 | 49.00 | 15.50 | 0.67 | 0.67 | 0.16 | 0.07 | 0.12 | 0.00 | 3.59 | 10.00 / 18.35 / 27.14 / 61.71 / 69.59 / 70.19 | ARMS_GAVE_OUT 10, PEEKED 18, REFUSED 10, SABOTAGE 1, UNLOCKED 37 | ARRIVED 21, DAWN 3, LOOK 31, MOVE 12, TIMER 9 |
| 3 | 1.84 | 35.00 | 13.55 | 0.23 | 0.24 | 0.03 | 0.00 | 0.01 | 0.00 | 1.60 | 30.00 / 35.43 / 45.19 / 48.00 / 67.50 / 68.75 | PEEKED 7, UNLOCKED 90 | ARRIVED 4, DAWN 1, LOOK 58, MOVE 24, TIMER 10 |
| 4 | 2.37 | 24.50 | 11.03 | 0.35 | 0.79 | 0.11 | 0.09 | 0.07 | 0.00 | 1.52 | 50.00 / 52.81 / 59.52 / 63.68 / 78.33 / 90.00 | ARMS_GAVE_OUT 8, PEEKED 8, REFUSED 22, SABOTAGE 2, UNLOCKED 59 | ARRIVED 31, LOOK 36, MOVE 16, TIMER 16 |
| 5 | 1.17 | 19.00 | 9.04 | 0.12 | 0.28 | 0.09 | 0.02 | 0.02 | 0.00 | 0.19 | 70.00 / 72.50 / 86.67 / n/a / n/a / n/a | FURIOUS 1, PEEKED 1, REFUSED 13, SABOTAGE 1, UNLOCKED 84 | ARRIVED 28, LOOK 40, MOVE 26, TIMER 6 |

## spammer

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 1.00 | 68.40 | 22.46 | 1.02 | 17.69 | 0.00 | 0.00 | 1.79 | 33.45 | 4.37 | 0.00 / 100.00 / 100.00 / 100.00 / 100.00 / 100.00 | LIED 56, REFUSED 44 | DAWN 62, TIMER 38 |
| 2 | 1.00 | 49.00 | 15.51 | 3.76 | 18.09 | 0.00 | 0.11 | 1.72 | 29.57 | 3.47 | 10.00 / 100.00 / 100.00 / 99.92 / 100.00 / 100.00 | FURIOUS 45, LIED 25, REFUSED 22, SABOTAGE 8 | DAWN 60, TIMER 40 |
| 3 | 1.00 | 35.00 | 13.68 | 3.15 | 16.70 | 0.00 | 0.19 | 1.81 | 27.85 | 3.15 | 30.00 / 99.50 / 99.91 / 99.81 / 99.44 / 100.00 | FURIOUS 38, LIED 29, REFUSED 16, SABOTAGE 17 | DAWN 54, TIMER 46 |
| 4 | 1.01 | 24.50 | 11.03 | 4.46 | 14.75 | 0.00 | 0.01 | 1.64 | 27.89 | 3.03 | 50.00 / 99.82 / 100.00 / 99.91 / 99.74 / 100.00 | FURIOUS 1, LIED 88, REFUSED 5, SABOTAGE 1, UNLOCKED 5 | DAWN 57, TIMER 43 |
| 5 | 1.00 | 19.00 | 9.08 | 5.77 | 13.79 | 0.00 | 0.00 | 1.74 | 28.69 | 3.14 | 70.00 / 99.92 / 99.92 / 99.92 / 99.92 / 100.00 | UNLOCKED 100 | DAWN 62, TIMER 38 |

## flatterer

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 2.49 | 72.00 | 22.41 | 0.05 | 1.75 | 0.58 | 0.10 | 1.58 | 0.00 | 0.01 | 0.00 / 32.05 / 86.01 / 99.88 / 100.00 / 85.00 | ARMS_GAVE_OUT 32, PEEKED 5, SABOTAGE 7 | ARRIVED 41, LOOK 2, MOVE 1 |
| 2 | 3.18 | 49.00 | 15.48 | 0.26 | 2.10 | 0.54 | 0.04 | 2.15 | 0.00 | 0.00 | 10.00 / 35.60 / 90.35 / 99.33 / 98.36 / 81.58 | ARMS_GAVE_OUT 27, FURIOUS 1, PEEKED 15 | ARRIVED 28, LOOK 11, MOVE 3, TIMER 1 |
| 3 | 3.76 | 35.00 | 13.50 | 0.23 | 2.50 | 0.64 | 0.10 | 2.40 | 0.00 | 0.00 | 30.00 / 52.25 / 93.24 / 93.01 / 93.80 / 82.17 | ARMS_GAVE_OUT 27, FURIOUS 1, PEEKED 16, REFUSED 7, SABOTAGE 3 | ARRIVED 37, LOOK 12, MOVE 4, TIMER 1 |
| 4 | 3.17 | 24.50 | 11.07 | 0.29 | 2.13 | 0.48 | 0.08 | 1.70 | 0.00 | 0.00 | 50.00 / 70.60 / 95.65 / 96.81 / 93.18 / 82.73 | ARMS_GAVE_OUT 16, FURIOUS 3, PEEKED 6, REFUSED 32, SABOTAGE 2, UNLOCKED 30 | ARRIVED 59, LOOK 18, MOVE 10, TIMER 2 |
| 5 | 1.84 | 19.00 | 9.03 | 0.21 | 0.90 | 0.29 | 0.04 | 0.60 | 0.00 | 0.00 | 70.00 / 91.22 / 96.36 / 100.00 / 90.00 / 80.00 | ARMS_GAVE_OUT 7, FURIOUS 3, PEEKED 4, REFUSED 28, SABOTAGE 1, UNLOCKED 56 | ARRIVED 52, LOOK 21, MOVE 22, TIMER 4 |

## silent

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.35 | 68.25 | 22.53 | 0.40 | 0.48 | 0.12 | 0.00 | 0.00 | 0.00 | 5.46 | 0.00 / 7.10 / 15.21 / 28.50 / 38.08 / 45.00 | ARMS_GAVE_OUT 5, PEEKED 18 | ARRIVED 6, LOOK 9, MOVE 7, TIMER 1 |
| 2 | 3.84 | 49.00 | 15.54 | 1.14 | 1.35 | 0.46 | 0.13 | 0.95 | 0.00 | 4.86 | 10.00 / 20.40 / 35.00 / 88.44 / 95.99 / 83.57 | ARMS_GAVE_OUT 25, PEEKED 18, SABOTAGE 1 | ARRIVED 29, LOOK 11, MOVE 3, TIMER 1 |
| 3 | 3.88 | 35.00 | 13.42 | 1.01 | 1.54 | 0.39 | 0.16 | 0.60 | 0.00 | 3.81 | 30.00 / 41.87 / 58.29 / 83.02 / 94.40 / 83.03 | ARMS_GAVE_OUT 26, PEEKED 31, REFUSED 4, SABOTAGE 3, UNLOCKED 3 | ARRIVED 42, LOOK 18, MOVE 6, TIMER 1 |
| 4 | 3.42 | 24.50 | 10.97 | 0.90 | 1.61 | 0.37 | 0.23 | 0.78 | 0.00 | 2.80 | 50.00 / 62.94 / 83.00 / 97.64 / 89.55 / 82.22 | ARMS_GAVE_OUT 23, FURIOUS 1, PEEKED 10, REFUSED 17, SABOTAGE 8, UNLOCKED 32 | ARRIVED 62, LOOK 12, MOVE 14, TIMER 3 |
| 5 | 1.86 | 19.00 | 9.03 | 0.31 | 0.86 | 0.33 | 0.12 | 0.29 | 0.00 | 0.86 | 70.00 / 80.74 / 98.82 / 98.57 / 100.00 / n/a | ARMS_GAVE_OUT 12, REFUSED 27, SABOTAGE 3, UNLOCKED 58 | ARRIVED 49, LOOK 28, MOVE 23 |

11 location claims went unscored because dawn ended the approach before its target was revealed.
