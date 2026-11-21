// Every tuning knob from docs/GAME_LOGIC.md section 14. Times are in seconds of game time.
// Change numbers here only. Rule changes go in docs/GAME_LOGIC.md and docs/DECISIONS.md.

import type { Entry, QuestionType } from "./sim/types";

export interface NightParams {
  activeEntries: Entry[];
  firstVisitDelay: number;
  awayGap: [number, number]; // random, inclusive range
  approachTime: number;
  atEntryTime: number; // attempt window
  fakeOutChance: number; // 0..1
  startingSuspicion: number;
  questionMix: QuestionType[]; // scheduled questions, count = length
  lieChanceHurt: number; // 0..1
  lieChanceJealous: number; // 0..1
  autoWarnAtApproach: boolean; // WARM only
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
  SILENCE_LIMIT: number;
  SILENCE_PULL: number; // fraction of remaining AWAY time cut per silence tick
  MIN_AWAY_GAP: number;
  TICK: number; // fixed simulation step
  MESSAGE_RATE_LIMIT: number;
  QUICK_BUTTON_COOLDOWN: number;
  MAX_MESSAGE_LENGTH: number;
  REPEAT_WINDOW: number; // last N messages checked for repeats
  WARM_BONUS_COOLDOWN: number;
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
      firstVisitDelay: 25,
      awayGap: [35, 55],
      approachTime: 6,
      atEntryTime: 5,
      fakeOutChance: 0,
      startingSuspicion: 0,
      questionMix: ["SEED"],
      lieChanceHurt: 0.2,
      lieChanceJealous: 0.5,
      autoWarnAtApproach: true,
      questionsMayLandDuringAttempt: false,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 20,
      awayGap: [22, 34],
      approachTime: 5,
      atEntryTime: 4.5,
      fakeOutChance: 0,
      startingSuspicion: 10,
      questionMix: ["SEED", "SEED", "STAY"],
      lieChanceHurt: 0.2,
      lieChanceJealous: 0.5,
      autoWarnAtApproach: false,
      questionsMayLandDuringAttempt: false,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 15,
      awayGap: [14, 24],
      approachTime: 4.5,
      atEntryTime: 4,
      fakeOutChance: 0,
      startingSuspicion: 30,
      questionMix: ["SEED", "STAY", "MEMORY", "MEMORY"],
      lieChanceHurt: 0.25,
      lieChanceJealous: 0.55,
      autoWarnAtApproach: false,
      questionsMayLandDuringAttempt: true,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 12,
      awayGap: [9, 15],
      approachTime: 4,
      atEntryTime: 3.5,
      fakeOutChance: 0.3,
      startingSuspicion: 50,
      questionMix: ["SEED", "STAY", "MEMORY", "MEMORY", "MEMORY"],
      lieChanceHurt: 0.3,
      lieChanceJealous: 0.6,
      autoWarnAtApproach: false,
      questionsMayLandDuringAttempt: true,
    },
    {
      activeEntries: ["HATCH", "WINDOW", "BALCONY"],
      firstVisitDelay: 10,
      awayGap: [6, 11],
      approachTime: 3.5,
      atEntryTime: 3,
      fakeOutChance: 0.4,
      startingSuspicion: 70,
      questionMix: ["STAY", "STAY", "MEMORY", "MEMORY", "MEMORY", "MEMORY"],
      lieChanceHurt: 0.35,
      lieChanceJealous: 0.65,
      autoWarnAtApproach: false,
      questionsMayLandDuringAttempt: true,
    },
  ],
  HOUR_LENGTH: 40,
  NIGHT_HOURS: 6,
  RETREAT_TIME: 3,
  RELAY_DELAY: 0.5,
  TRAVEL_TIME: 1.5,
  HOLD_MAX: 6,
  HOLD_COOLDOWN: 4,
  BRACE_REST: 1.0,
  QUESTION_TIMEOUT: 10,
  SILENCE_LIMIT: 20,
  SILENCE_PULL: 0.25,
  MIN_AWAY_GAP: 4,
  TICK: 0.05,
  MESSAGE_RATE_LIMIT: 1.5,
  QUICK_BUTTON_COOLDOWN: 0.5,
  MAX_MESSAGE_LENGTH: 200,
  REPEAT_WINDOW: 5,
  WARM_BONUS_COOLDOWN: 15,
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
  scheduledQuestionWindow: [15, 225],
  scheduledQuestionMinSpacing: 25,
};

export const nightLength = (c: Config): number => c.HOUR_LENGTH * c.NIGHT_HOURS;
