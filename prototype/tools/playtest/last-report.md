# R.A.M. seeded bot playtest

400 seeds per persona and night (1 to 400). Night 5 dawn with TRAPPED counts as survival.

| Persona | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| skilled | 100.0% | 100.0% | 100.0% | 92.3% | 63.5% |
| average | 89.3% | 76.3% | 59.8% | 32.5% | 3.8% |
| learner | 92.8% | 81.3% | 69.3% | 33.5% | 3.8% |
| careless | 99.3% | 51.5% | 4.3% | 1.5% | 0.0% |
| spammer | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| flatterer | 62.3% | 56.5% | 51.8% | 18.8% | 2.0% |
| silent | 84.8% | 59.3% | 46.0% | 14.8% | 0.8% |

| Persona | N5 slip dropped | N5 code reachable | N5 first slip (s) |
| --- | ---: | ---: | ---: |
| oracle | 100.0% | 100.0% | 89.12 |
| skilled | 74.3% | 74.3% | 88.54 |
| average | 27.3% | 26.8% | 83.89 |
| learner | 28.8% | 28.5% | 85.05 |
| careless | 5.5% | 5.5% | 81.57 |
| spammer | 0.0% | 0.0% | n/a |
| flatterer | 26.3% | 25.8% | 90.37 |
| silent | 23.3% | 22.3% | 81.93 |

Behavior counts are means per run. Visits count approaches. First arrival averages runs with an arrival. Attempt windows are measured on 0.05 s ticks from arrival to retreat or entry into the room, excluding dawn-cancelled attempts.

Suspicion means include only runs that reached each checkpoint, in seconds. Death breakdowns are totals. Skilled bots ask once per visit inferred from visual cues. Deliberate peeks check the locked entry first. Average, learner, flatterer and silent try to restore a lock after an empty lit check and finish scanning without Shift.

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
| 1 | 3.14 | 68.93 | 22.54 | 0.22 | 0.03 | 0.00 | 0.00 | 0.00 | 0.00 | 3.85 | 0.00 / 4.25 / 7.05 / 10.04 / 13.11 / 17.08 | ARMS_GAVE_OUT 2, PEEKED 41 | ARRIVED 3, DAWN 1, LOOK 31, MOVE 2, TIMER 6 |
| 2 | 3.82 | 49.00 | 17.49 | 0.85 | 0.36 | 0.08 | 0.02 | 0.01 | 0.00 | 2.74 | 10.00 / 12.25 / 13.90 / 28.41 / 28.80 / 29.73 | ARMS_GAVE_OUT 12, PEEKED 82, SABOTAGE 1 | ARRIVED 17, DAWN 6, LOOK 42, MOVE 14, TIMER 16 |
| 3 | 4.46 | 35.00 | 14.50 | 0.90 | 0.60 | 0.10 | 0.03 | 0.02 | 0.00 | 2.50 | 30.00 / 30.01 / 27.79 / 25.21 / 26.62 / 26.36 | ARMS_GAVE_OUT 22, PEEKED 129, REFUSED 1, UNLOCKED 9 | ARRIVED 38, DAWN 7, LOOK 58, MOVE 34, TIMER 24 |
| 4 | 4.09 | 24.50 | 12.02 | 0.76 | 1.33 | 0.23 | 0.07 | 0.06 | 0.00 | 1.67 | 50.00 / 49.51 / 44.96 / 40.41 / 33.57 / 31.81 | ARMS_GAVE_OUT 42, PEEKED 100, REFUSED 46, SABOTAGE 5, UNLOCKED 77 | ARRIVED 113, DAWN 5, LOOK 73, MOVE 45, TIMER 34 |
| 5 | 2.29 | 19.00 | 9.02 | 0.25 | 1.01 | 0.29 | 0.11 | 0.05 | 0.00 | 0.54 | 70.00 / 67.64 / 56.91 / 49.37 / 37.90 / 49.06 | ARMS_GAVE_OUT 25, PEEKED 24, REFUSED 84, SABOTAGE 12, UNLOCKED 240 | ARRIVED 155, DAWN 1, LOOK 137, MOVE 66, TIMER 26 |

## learner

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.09 | 69.08 | 22.49 | 0.16 | 0.01 | 0.00 | 0.00 | 0.00 | 0.00 | 3.79 | 0.00 / 3.84 / 6.60 / 9.29 / 12.03 / 14.81 | ARMS_GAVE_OUT 2, PEEKED 27 | ARRIVED 2, DAWN 1, LOOK 17, MOVE 5, TIMER 4 |
| 2 | 3.89 | 49.00 | 17.50 | 1.03 | 0.40 | 0.06 | 0.02 | 0.01 | 0.00 | 2.79 | 10.00 / 12.47 / 14.54 / 30.67 / 30.00 / 30.36 | ARMS_GAVE_OUT 16, PEEKED 56, REFUSED 1, SABOTAGE 2 | ARRIVED 21, DAWN 5, LOOK 23, MOVE 10, TIMER 16 |
| 3 | 4.72 | 35.00 | 14.53 | 0.89 | 0.52 | 0.06 | 0.02 | 0.01 | 0.00 | 2.50 | 30.00 / 30.12 / 27.10 / 23.64 / 22.42 / 22.25 | ARMS_GAVE_OUT 13, PEEKED 103, REFUSED 1, SABOTAGE 1, UNLOCKED 5 | ARRIVED 20, DAWN 8, LOOK 39, MOVE 27, TIMER 29 |
| 4 | 4.18 | 24.50 | 12.00 | 0.76 | 1.38 | 0.25 | 0.10 | 0.04 | 0.00 | 1.67 | 50.00 / 49.56 / 46.76 / 40.65 / 37.57 / 31.45 | ARMS_GAVE_OUT 42, PEEKED 89, REFUSED 54, SABOTAGE 10, UNLOCKED 71 | ARRIVED 122, DAWN 7, LOOK 66, MOVE 41, TIMER 30 |
| 5 | 2.31 | 19.00 | 9.01 | 0.29 | 1.02 | 0.29 | 0.12 | 0.04 | 0.00 | 0.63 | 70.00 / 68.97 / 58.11 / 48.55 / 35.59 / 39.25 | ARMS_GAVE_OUT 26, PEEKED 19, REFUSED 96, SABOTAGE 11, UNLOCKED 233 | ARRIVED 174, DAWN 5, LOOK 108, MOVE 73, TIMER 25 |

## careless

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.63 | 68.40 | 22.47 | 0.15 | 0.13 | 0.01 | 0.00 | 0.00 | 0.00 | 5.14 | 0.00 / 6.17 / 11.80 / 17.84 / 25.68 / 31.27 | ARMS_GAVE_OUT 3 | ARRIVED 3 |
| 2 | 3.75 | 49.00 | 17.51 | 0.65 | 0.84 | 0.15 | 0.12 | 0.13 | 0.00 | 3.93 | 10.00 / 17.10 / 25.40 / 59.06 / 64.98 / 68.28 | ARMS_GAVE_OUT 24, PEEKED 51, REFUSED 28, SABOTAGE 13, UNLOCKED 78 | ARRIVED 64, DAWN 3, LOOK 74, MOVE 28, TIMER 25 |
| 3 | 1.90 | 35.00 | 14.53 | 0.26 | 0.31 | 0.03 | 0.02 | 0.02 | 0.00 | 1.68 | 30.00 / 35.88 / 42.31 / 50.14 / 53.92 / 60.24 | ARMS_GAVE_OUT 8, PEEKED 22, REFUSED 23, SABOTAGE 4, UNLOCKED 326 | ARRIVED 43, DAWN 4, LOOK 210, MOVE 85, TIMER 41 |
| 4 | 2.54 | 24.50 | 12.00 | 0.38 | 0.69 | 0.19 | 0.06 | 0.07 | 0.00 | 1.71 | 50.00 / 55.56 / 63.07 / 68.54 / 65.68 / 68.57 | ARMS_GAVE_OUT 19, PEEKED 21, REFUSED 37, SABOTAGE 9, UNLOCKED 308 | ARRIVED 94, DAWN 1, LOOK 166, MOVE 94, TIMER 39 |
| 5 | 1.22 | 19.00 | 9.02 | 0.11 | 0.27 | 0.11 | 0.01 | 0.04 | 0.00 | 0.23 | 70.00 / 76.82 / 85.25 / 85.00 / n/a / n/a | PEEKED 4, REFUSED 51, SABOTAGE 4, UNLOCKED 341 | ARRIVED 96, LOOK 192, MOVE 87, TIMER 25 |

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
| 1 | 2.54 | 72.00 | 22.51 | 0.05 | 1.85 | 0.49 | 0.14 | 1.69 | 0.00 | 0.03 | 0.00 / 32.19 / 85.21 / 99.91 / 99.84 / 84.54 | ARMS_GAVE_OUT 103, PEEKED 18, SABOTAGE 30 | ARRIVED 142, LOOK 7, MOVE 1, TIMER 1 |
| 2 | 3.28 | 49.00 | 17.48 | 0.20 | 2.23 | 0.63 | 0.06 | 2.26 | 0.00 | 0.00 | 10.00 / 36.25 / 91.50 / 98.90 / 97.28 / 82.65 | ARMS_GAVE_OUT 129, FURIOUS 10, PEEKED 25, REFUSED 1, SABOTAGE 9 | ARRIVED 155, LOOK 12, MOVE 4, TIMER 3 |
| 3 | 3.94 | 35.00 | 14.50 | 0.29 | 2.62 | 0.68 | 0.12 | 2.58 | 0.00 | 0.00 | 30.00 / 53.72 / 93.55 / 94.52 / 95.15 / 82.34 | ARMS_GAVE_OUT 122, FURIOUS 9, PEEKED 38, REFUSED 10, SABOTAGE 9, UNLOCKED 5 | ARRIVED 162, LOOK 17, MOVE 11, TIMER 3 |
| 4 | 3.41 | 24.50 | 11.99 | 0.28 | 2.31 | 0.64 | 0.08 | 2.00 | 0.00 | 0.00 | 50.00 / 71.79 / 95.96 / 96.04 / 97.05 / 83.07 | ARMS_GAVE_OUT 80, FURIOUS 9, PEEKED 30, REFUSED 108, SABOTAGE 7, UNLOCKED 91 | ARRIVED 234, LOOK 43, MOVE 41, TIMER 7 |
| 5 | 2.11 | 19.00 | 9.02 | 0.18 | 1.21 | 0.35 | 0.04 | 0.92 | 0.00 | 0.00 | 70.00 / 90.50 / 96.25 / 95.91 / 95.63 / 80.63 | ARMS_GAVE_OUT 34, FURIOUS 6, PEEKED 20, REFUSED 104, SABOTAGE 3, UNLOCKED 225 | ARRIVED 167, LOOK 121, MOVE 81, TIMER 23 |

## silent

| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 3.48 | 68.25 | 22.52 | 0.47 | 0.54 | 0.10 | 0.00 | 0.00 | 0.00 | 5.69 | 0.00 / 7.10 / 15.28 / 28.01 / 37.17 / 45.00 | ARMS_GAVE_OUT 16, PEEKED 45 | ARRIVED 24, DAWN 1, LOOK 25, MOVE 7, TIMER 4 |
| 2 | 3.99 | 49.00 | 17.50 | 1.40 | 1.23 | 0.48 | 0.19 | 0.98 | 0.00 | 5.12 | 10.00 / 19.65 / 33.50 / 87.65 / 95.64 / 83.38 | ARMS_GAVE_OUT 100, FURIOUS 1, PEEKED 44, SABOTAGE 18 | ARRIVED 125, LOOK 26, MOVE 4, TIMER 8 |
| 3 | 4.41 | 35.00 | 14.49 | 1.13 | 1.92 | 0.46 | 0.22 | 0.80 | 0.00 | 4.52 | 30.00 / 40.55 / 57.36 / 80.91 / 91.23 / 83.40 | ARMS_GAVE_OUT 121, FURIOUS 1, PEEKED 65, REFUSED 7, SABOTAGE 11, UNLOCKED 11 | ARRIVED 159, LOOK 40, MOVE 14, TIMER 3 |
| 4 | 3.50 | 24.50 | 12.01 | 0.82 | 1.77 | 0.52 | 0.18 | 0.82 | 0.00 | 2.87 | 50.00 / 62.23 / 83.27 / 96.43 / 90.92 / 83.98 | ARMS_GAVE_OUT 82, PEEKED 48, REFUSED 87, SABOTAGE 10, UNLOCKED 114 | ARRIVED 227, LOOK 51, MOVE 47, TIMER 16 |
| 5 | 1.94 | 19.00 | 9.02 | 0.42 | 0.88 | 0.30 | 0.09 | 0.40 | 0.00 | 0.95 | 70.00 / 83.73 / 97.03 / 91.88 / 90.00 / 86.67 | ARMS_GAVE_OUT 35, PEEKED 5, REFUSED 113, SABOTAGE 5, UNLOCKED 239 | ARRIVED 210, LOOK 109, MOVE 70, TIMER 8 |

32 location claims went unscored because dawn ended the approach before its target was revealed.
