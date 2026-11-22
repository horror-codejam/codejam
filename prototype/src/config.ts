// Every tuning knob from docs/GAME_LOGIC.md section 14. Times are in seconds of game time.
// Change numbers here only. Rule changes go in docs/GAME_LOGIC.md and docs/DECISIONS.md.

import type { Band, Entry, InsideTrigger, QuestionType } from "./sim/types";

export interface NightParams {
  activeEntries: Entry[];
  firstVisitDelay: number;
  awayGap: [number, number]; // base range, random; then times the hour ramp (GAME_LOGIC 7.6)
  approachTime: number;
  atEntryTime: [number, number]; // attempt window, random per visit
  lullChance: number; // 0..1, a rolled gap is multiplied by LULL_MULT
  quickReturnChance: number; // 0..1, after a retreat the next gap is QUICK_RETURN_GAP instead
  decoyInterval: [number, number]; // seconds between decoy noises, random
  fakeOutChance: number; // 0..1
  startingSuspicion: number;
  questionMix: QuestionType[]; // scheduled questions, count = length
  lieChanceHurt: number; // 0..1
  lieChanceJealous: number; // 0..1
  questionsMayLandDuringAttempt: boolean; // nights 3+
}

export interface Config {
  nights: NightParams[]; // index 0 = night 1
  HOUR_LENGTH: number;
  NIGHT_HOURS: number;
  RETREAT_TIME: number;
  RELAY_DELAY: number;
  TRAVEL_TIME: number;
  HOLD_MAX: number;
  HOLD_COOLDOWN: number;
  BRACE_REST: number; // edge-controls flow: rest at the entry after a brace ends before the next one
  QUESTION_TIMEOUT: number;
  QUESTION_JUDGE_GRACE: number; // extra seconds a question waits while a typed answer is still with the judge
  SILENCE_LIMIT: number;
  SILENCE_PULL: number; // fraction of remaining AWAY time cut per silence tick
  MIN_AWAY_GAP: number;
  HOUR_RAMP: number[]; // AWAY gap multiplier by in-game hour, index 0 = 12 AM
  LULL_MULT: number;
  QUICK_RETURN_GAP: [number, number];
  // Silent breach (GAME_LOGIC 7.7): the extra scare trigger rolled per breach, as weights, and the TIMER delay.
  INSIDE_TRIGGER_WEIGHTS: Record<InsideTrigger, number>;
  INSIDE_TIMER: [number, number];
  NIGHT_ONE_HINT_TIMES: number[]; // elapsed seconds of the night 1 tutorial hints (before the first visit)
  TICK: number; // fixed simulation step
  MESSAGE_RATE_LIMIT: number;
  QUICK_BUTTON_COOLDOWN: number;
  MAX_MESSAGE_LENGTH: number;
  REPEAT_WINDOW: number; // last N messages checked for repeats
  WARM_BONUS_COOLDOWN: number;
  FLATTERY_WINDOW: number; // rolling window (s) for warm-flagged messages
  FLATTERY_COUNT: number; // warm messages in the window that count as flattery
  FLATTERY_PENALTY: number; // suspicion added for flattery (no warm bonus, a flattery_reply line)
  LOCATION_SPAM_WINDOW: number; // rolling window (s) for ASK_LOCATION requests
  LOCATION_SPAM_PENALTIES: [number, number]; // suspicion for the 2nd request, and for the 3rd and later
  LOCATION_REFUSE_TIME: number; // seconds ChudGPT refuses location answers after the 3rd request
  LOCK_REFUSAL: Record<Band, number>; // chance CHUD hijacks a lock request, by band (section 8.3)
  LIGHT_CUT: Record<Band, number>; // chance CHUD forces a light off, rolled once per light-on (section 6.1)
  LIGHT_CUT_DELAY: [number, number]; // seconds after the light came on that the cut lands
  LIGHT_CUT_LINE_GAP: number; // min seconds between CHUD's possessive lines on cuts (cuts themselves are not limited)
  SABOTAGE_CHANCE: number;
  SABOTAGE_MARGIN: number; // seconds needed beyond TRAVEL_TIME
  FURIOUS_RESET: number;
  REBOOT_TIME: number;
  REBOOT_SUSPICION_FLOOR: number;
  MESSAGE_CLAMP: [number, number];
  suspicion: {
    mentionsLeaving: number;
    manipulation: number;
    contradiction: number;
    answerFailed: number;
    questionTimeout: number;
    rude: number;
    offensive: number;
    silenceTick: number;
    radioBeat: number;
    answered: number;
    memoryPassed: number;
    warm: number;
  };
  bands: { hurtFrom: number; jealousFrom: number; furiousAt: number };
  scheduledQuestionWindow: [number, number]; // earliest and latest elapsed time a scheduled question may be due
  scheduledQuestionMinSpacing: number;
}

export const CONFIG: Config = {
  nights: [
    {
      activeEntries: ["HATCH", "WINDOW"],
      firstVisitDelay: 60,
      awayGap: [50, 70],
      approachTime: 12,
      atEntryTime: [20, 25],
      lullChance: 0,
      quickReturnChance: 0,
      decoyInterval: [15, 30],
      fakeOutChance: 0,
      startingSuspicion: 0,
      questionMix: ["SEED"],
      lieChanceHurt: 0.2,
      lieChanceJealous: 0.5,
      questionsMayLandDuringAttempt: false,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 40,
      awayGap: [36, 52],
      approachTime: 9,
      atEntryTime: [14, 17],
      lullChance: 0.15,
      quickReturnChance: 0,
      decoyInterval: [12, 25],
      fakeOutChance: 0,
      startingSuspicion: 10,
      questionMix: ["SEED", "SEED", "STAY"],
      lieChanceHurt: 0.2,
      lieChanceJealous: 0.5,
      questionsMayLandDuringAttempt: false,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 30,
      awayGap: [32, 46],
      approachTime: 5,
      atEntryTime: [12, 15],
      lullChance: 0.15,
      quickReturnChance: 0.15,
      decoyInterval: [10, 20],
      fakeOutChance: 0,
      startingSuspicion: 30,
      questionMix: ["SEED", "STAY", "MEMORY", "MEMORY"],
      lieChanceHurt: 0.25,
      lieChanceJealous: 0.55,
      questionsMayLandDuringAttempt: true,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 20,
      awayGap: [28, 42],
      approachTime: 4.5,
      atEntryTime: [10, 12],
      lullChance: 0.15,
      quickReturnChance: 0.2,
      decoyInterval: [8, 16],
      fakeOutChance: 0.3,
      startingSuspicion: 50,
      questionMix: ["SEED", "STAY", "MEMORY", "MEMORY", "MEMORY"],
      lieChanceHurt: 0.3,
      lieChanceJealous: 0.6,
      questionsMayLandDuringAttempt: true,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 15,
      awayGap: [25, 37],
      approachTime: 4,
      atEntryTime: [8, 10],
      lullChance: 0.15,
      quickReturnChance: 0.25,
      decoyInterval: [6, 14],
      fakeOutChance: 0.4,
      startingSuspicion: 70,
      questionMix: ["STAY", "STAY", "MEMORY", "MEMORY", "MEMORY", "MEMORY"],
      lieChanceHurt: 0.35,
      lieChanceJealous: 0.65,
      questionsMayLandDuringAttempt: true,
    },
  ],
  HOUR_LENGTH: 50,
  NIGHT_HOURS: 6,
  RETREAT_TIME: 3,
  RELAY_DELAY: 0.5,
  TRAVEL_TIME: 1.5,
  HOLD_MAX: 6,
  HOLD_COOLDOWN: 4,
  BRACE_REST: 1.0,
  QUESTION_TIMEOUT: 10,
  QUESTION_JUDGE_GRACE: 3,
  SILENCE_LIMIT: 45,
  SILENCE_PULL: 0.25,
  MIN_AWAY_GAP: 4,
  HOUR_RAMP: [1.25, 1.15, 1.0, 0.95, 0.85, 0.8],
  LULL_MULT: 1.8,
  QUICK_RETURN_GAP: [4, 7],
  INSIDE_TRIGGER_WEIGHTS: { TIMER: 0.4, NONE: 0.3, MOVE: 0.3 },
  INSIDE_TIMER: [4, 12],
  NIGHT_ONE_HINT_TIMES: [8, 24, 40, 56],
  TICK: 0.05,
  MESSAGE_RATE_LIMIT: 1.5,
  QUICK_BUTTON_COOLDOWN: 0.5,
  MAX_MESSAGE_LENGTH: 200,
  REPEAT_WINDOW: 5,
  WARM_BONUS_COOLDOWN: 45,
  FLATTERY_WINDOW: 60,
  FLATTERY_COUNT: 3,
  FLATTERY_PENALTY: 10,
  LOCATION_SPAM_WINDOW: 60,
  LOCATION_SPAM_PENALTIES: [5, 10],
  LOCATION_REFUSE_TIME: 20,
  LOCK_REFUSAL: { WARM: 0, HURT: 0.25, JEALOUS: 0.55, FURIOUS: 1 },
  LIGHT_CUT: { WARM: 0, HURT: 0.25, JEALOUS: 0.5, FURIOUS: 0.85 },
  LIGHT_CUT_DELAY: [1.0, 2.5],
  LIGHT_CUT_LINE_GAP: 5,
  SABOTAGE_CHANCE: 0.5,
  SABOTAGE_MARGIN: 1.0,
  FURIOUS_RESET: 80,
  REBOOT_TIME: 10,
  REBOOT_SUSPICION_FLOOR: 80,
  MESSAGE_CLAMP: [-15, 25],
  suspicion: {
    mentionsLeaving: 25,
    manipulation: 25,
    contradiction: 20,
    answerFailed: 20,
    questionTimeout: 15,
    rude: 10,
    offensive: 10,
    silenceTick: 5,
    radioBeat: 20,
    answered: -10,
    memoryPassed: -15,
    warm: -5,
  },
  bands: { hurtFrom: 40, jealousFrom: 70, furiousAt: 100 },
  scheduledQuestionWindow: [15, 285],
  scheduledQuestionMinSpacing: 45,
};

export const nightLength = (c: Config): number => c.HOUR_LENGTH * c.NIGHT_HOURS;

// The kill code ending. The code is random per run: CODE_LETTERS letters and CODE_DIGITS digits in shuffled order, with
// ambiguous characters left out so normal chat never matches by accident. Ram drops one paper (one character) at an entry
// he was blocked at, from FIRST_PAPER_NIGHT on. The code is typed to CHUD on CODE_NIGHT only. Reaching 6 AM on CODE_NIGHT
// without it ends in the trapped bad ending.
export const ENDING = {
  CODE_LETTERS: 2,
  CODE_DIGITS: 2,
  LETTERS: "ACDEFHJKLMNPRTUVWXY",
  DIGITS: "2345679",
  FIRST_PAPER_NIGHT: 2,
  CODE_NIGHT: 5,
  LAST_PAPER_AFTER: 60, // seconds into the code night before the last slip can drop (1:12 AM)
};
