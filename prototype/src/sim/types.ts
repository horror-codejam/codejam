// Shared contract for the game engine, CHUD text modules, UI and tests.
// Rules come from docs/GAME_LOGIC.md. Interpretations of gaps are in prototype/IMPLEMENTATION_NOTES.md.
// Times are seconds of game time (state.clock.elapsed), never wall-clock.

export type Entry = "WINDOW" | "HATCH" | "BALCONY";
export const ENTRIES: Entry[] = ["WINDOW", "HATCH", "BALCONY"];
export type View = "DESK" | Entry;
export type PowerSlot = "NONE" | "LOCK_WINDOW" | "LOCK_HATCH" | "LOCK_BALCONY" | "BEAM";
export const lockSlot = (e: Entry): PowerSlot => `LOCK_${e}` as PowerSlot;
export type Band = "WARM" | "HURT" | "JEALOUS" | "FURIOUS";
export type RamState = "AWAY" | "APPROACHING" | "AT_ENTRY" | "RETREATING";
export type QuestionType = "SEED" | "STAY" | "MEMORY";
export type Command = "ASK_LOCATION" | "LOCK" | "BEAM" | "POWER_OFF" | "NONE";

export type Phase =
  | "NAME_PROMPT" // fresh game, CHUD asks the player's name (setName)
  | "NIGHT_CARD" // card + voice log showing, clock stopped (beginNight)
  | "PLAYING"
  | "SAFETY_PAUSE" // self-harm flag, clock stopped (resumeFromSafetyPause)
  | "BREACH" // night lost, loss screen (retryNight)
  | "NIGHT_WON" // 6 AM screen (nextNight)
  | "GAME_WON"; // after night 5

export type PlayerPosition =
  | { kind: "DESK" }
  | { kind: "TRAVELING"; entry: Entry; until: number }
  | { kind: "HOLDING"; entry: Entry; since: number }
  | { kind: "RETURNING"; from: Entry; until: number };

export interface PendingQuestion {
  id: number;
  origin: "SCHEDULED" | "GATE" | "SCRIPT";
  type: QuestionType;
  factKey: string | null; // SEED: key the answer will be stored under. MEMORY: key being checked.
  text: string;
  askedAt: number;
  gateFor: Entry | null; // GATE only: the lock request waiting on this answer
}

export type Facts = Record<string, string>;

export interface QuestionPlanItem {
  type: QuestionType;
  dueAt: number; // elapsed seconds
  asked: boolean;
}

export interface GameState {
  phase: Phase;
  run: { night: number; factsCheckpoint: Facts; seed: number };
  clock: { elapsed: number; hour: number }; // hour 0..6, 0 = 12 AM
  player: {
    view: View;
    position: PlayerPosition;
    holdCooldownUntil: number;
    lastMessageAt: number; // -Infinity if none, for the rate limit
    lastQuickAt: number;
  };
  power: {
    slot: PowerSlot;
    pending: { target: PowerSlot; landsAt: number } | null;
    chudOnline: boolean;
    generatorOn: boolean; // kill switch position
    rebootingUntil: number | null;
  };
  ram: {
    state: RamState;
    target: Entry | null;
    stateEndsAt: number;
    visitId: number; // increments at each APPROACHING start
    fakedThisVisit: boolean;
    fakeOutAt: number | null; // elapsed time of the planned switch, null if none
    pendingPull: number; // silence pulls owed to the next AWAY gap (count)
    lastTarget: Entry | null; // night 1 no-repeat rule
  };
  chud: {
    suspicion: number;
    band: Band;
    pendingQuestion: PendingQuestion | null;
    // A scheduled or script question set aside while a gate question is pending (section 13:
    // "the scheduled question keeps its timer"). Restored as pendingQuestion when the gate resolves.
    suspendedQuestion?: PendingQuestion | null;
    queuedScriptQuestion: PendingQuestion | null; // radio question waiting for a free slot
    facts: Facts;
    lastLocationClaim: Entry | "NONE" | null; // null = never asked
    visitDecision: { visitId: number; lie: boolean; entry: Entry | "NONE"; rolledAfterFake: boolean } | null;
    lastSabotageHour: number | null;
    sabotageRolledVisit: number | null;
    furiousActive: boolean;
    furiousCutDone: boolean;
    furiousVisitId: number | null; // visit the episode covers
    questionPlan: QuestionPlanItem[];
    usedSeedKeys: string[];
  };
  timers: {
    lastRealMessageAt: number;
    lastWarmBonusAt: number;
    silenceTicks: number;
  };
  log: {
    recentMessages: string[]; // normalized, newest last, max REPEAT_WINDOW... keep 10
    visit: {
      // per-visit record for the loss screen
      sabotaged: boolean;
      furiousCut: boolean;
      armsGaveOut: boolean; // a hold of the target entry ended by HOLD_MAX during AT_ENTRY
      claimThisVisit: Entry | "NONE" | null;
    };
    scriptedFired: string[];
    nightOneHintsShown: boolean;
  };
  loss: LossInfo | null;
}

export type LossCause = "UNLOCKED" | "LIED" | "SABOTAGE" | "FURIOUS" | "WRONG_HOLD" | "ARMS_GAVE_OUT" | "POWER_OFF";

export interface LossInfo {
  night: number;
  entry: Entry;
  cause: LossCause;
  lastClaim: Entry | "NONE" | null;
  heldEntry: Entry | null; // for WRONG_HOLD
}

// What the judge (LLM or offline) returns. Exactly the schema in GAME_LOGIC.md section 9 step 4.
export interface JudgeResult {
  answered_question: boolean;
  contradiction: boolean;
  mentions_leaving: boolean;
  rude: boolean;
  manipulation: boolean;
  warm: boolean;
  gibberish: boolean;
  offensive: boolean;
  self_harm: boolean;
  new_fact: { key: string; value: string } | null;
  command_hint: Command;
  entry_hint: Entry | null;
}

export const NEUTRAL_JUDGE: JudgeResult = {
  answered_question: false,
  contradiction: false,
  mentions_leaving: false,
  rude: false,
  manipulation: false,
  warm: false,
  gibberish: false,
  offensive: false,
  self_harm: false,
  new_fact: null,
  command_hint: "NONE",
  entry_hint: null,
};

// Everything the judge needs for one message. Built by the engine in submitMessage.
export interface JudgeInput {
  text: string; // raw player text, untrusted
  pendingQuestion: PendingQuestion | null;
  facts: Facts;
  band: Band;
}

export interface ParsedCommand {
  command: Command;
  entry: Entry | null; // only for LOCK
}

// What CHUD must say. Code decides the outcome, the voice (canned or LLM) only words it.
export type Outcome =
  | { kind: "name_ack" }
  | { kind: "night_opener"; night: number }
  | { kind: "locked"; entry: Entry } // lock request accepted (lands after RELAY_DELAY)
  | { kind: "lock_already"; entry: Entry }
  | { kind: "beam_on" }
  | { kind: "power_off" } // unlock / power off request
  | { kind: "gate_question"; entry: Entry; question: string }
  | { kind: "gate_failed"; entry: Entry }
  | { kind: "gate_timeout"; entry: Entry } // "Fine. Do it yourself."
  | { kind: "refuse_furious"; request: "LOCK" | "BEAM" }
  | { kind: "location_claim"; entry: Entry | "NONE" } // never told whether it is a lie
  | { kind: "question"; question: string; type: QuestionType }
  | { kind: "answer_ack"; pass: boolean; type: QuestionType }
  | { kind: "question_timeout" }
  | { kind: "manipulation_hurt" }
  | { kind: "offensive_deflect" }
  | { kind: "rude_reply" }
  | { kind: "leaving_reply" } // player mentioned leaving outside a question
  | { kind: "warm_reply" }
  | { kind: "small_talk" }
  | { kind: "silence" }
  | { kind: "sabotage" } // "Oops. The generator's acting up."
  | { kind: "furious_start" }
  | { kind: "furious_cut" } // "If I can't keep you, nobody will. Hold it yourself."
  | { kind: "approach_warning"; entry: Entry } // night 1, WARM
  | { kind: "radio_reaction" }
  | { kind: "reboot_back" }
  | { kind: "morning" }
  | { kind: "busy_holding" }; // never spoken by CHUD, reserved

export type Shout = string;

export type PowerCause = "player" | "gate_pass" | "sabotage" | "furious" | "kill_switch" | "reboot";

export type GameEvent =
  | { type: "NIGHT_CARD"; night: number; voiceLog: string }
  | { type: "NIGHT_START"; night: number }
  | { type: "HOUR"; hour: number }
  | { type: "RAM_APPROACH"; visitId: number } // splashing on rock, same for every target
  | { type: "RAM_FAKE_OUT"; visitId: number; from: Entry; to: Entry } // silent, dev panel only
  | { type: "RAM_AT_ENTRY"; visitId: number; entry: Entry } // entry audio cue starts
  | { type: "RAM_RETREAT"; visitId: number; entry: Entry; shout: Shout }
  | { type: "RAM_AWAY"; nextVisitAt: number }
  | { type: "SILENCE_PULL"; newEndsAt: number | null }
  | { type: "POWER_REQUESTED"; target: PowerSlot; landsAt: number }
  | { type: "POWER_CHANGED"; slot: PowerSlot; cause: PowerCause }
  | { type: "CHUD_SAY"; outcome: Outcome; text: string; band: Band }
  | { type: "QUESTION_ASKED"; question: PendingQuestion }
  | { type: "QUESTION_RESOLVED"; questionId: number; result: "pass" | "fail" | "timeout" | "cancelled" }
  | { type: "FACT_STORED"; key: string; value: string }
  | { type: "SUSPICION"; from: number; to: number; reasons: string[] }
  | { type: "BAND"; band: Band }
  | { type: "PLAYER_MOVED"; position: PlayerPosition }
  | { type: "HOLD_ENDED"; entry: Entry; reason: "manual" | "arms" }
  | { type: "VIEW"; view: View }
  | { type: "RADIO"; text: string }
  | { type: "HINT"; text: string }
  | { type: "SABOTAGE"; entry: Entry }
  | { type: "FURIOUS_START" }
  | { type: "FURIOUS_CUT"; entry: Entry }
  | { type: "FURIOUS_END" }
  | { type: "GENERATOR"; on: boolean }
  | { type: "CHUD_ONLINE"; online: boolean }
  | { type: "MESSAGE_REJECTED"; reason: RejectReason }
  | { type: "SAFETY_PAUSE" }
  | { type: "BREACH"; loss: LossInfo }
  | { type: "NIGHT_WON"; night: number }
  | { type: "GAME_WON" };

export type RejectReason =
  | "CHUD_OFFLINE"
  | "NOT_AT_DESK"
  | "RATE_LIMIT"
  | "TOO_LONG"
  | "EMPTY"
  | "NOT_PLAYING";

export type QuickCommand = "ASK_LOCATION" | "LOCK_WINDOW" | "LOCK_HATCH" | "LOCK_BALCONY" | "BEAM" | "POWER_OFF";

// Returned by submitMessage. The caller runs the judge (LLM or offline) on `judgeInput`,
// then calls applyJudge(ticket.id, result or null). null means the judge failed or timed out.
export type SubmitResult =
  | { ok: false; reason: RejectReason }
  | { ok: true; ticket: MessageTicket };

export interface MessageTicket {
  id: number;
  judgeInput: JudgeInput;
  repeat: boolean; // repeat of a recent message: no judge needed, applyJudge is a no-op
  parsed: ParsedCommand; // code parser result (step 3)
  commandRanImmediately: boolean; // see IMPLEMENTATION_NOTES "Command timing"
}

// What a view shows of Ram right now. Pure function of state, used by the UI and tests.
export type RamVisual = "none" | "approach_silhouette" | "tell_faint" | "tell_clear";

export interface EngineOptions {
  seed?: number;
  config?: import("../config").Config;
  startNight?: number; // 1..5, default 1. If > 1 the name prompt is skipped and facts may be passed
  facts?: Facts;
  skipNamePrompt?: boolean; // tests and dev panel
}

export interface IGameEngine {
  readonly state: GameState;

  // Time
  tick(dt: number): void; // advance game time by dt seconds in fixed TICK steps. No-op unless phase is PLAYING

  // Flow
  setName(name: string): void; // NAME_PROMPT -> NIGHT_CARD (night 1). Stores fact "name", CHUD says name_ack
  beginNight(): void; // NIGHT_CARD -> PLAYING
  retryNight(): void; // BREACH -> NIGHT_CARD, same night, facts from checkpoint
  nextNight(): void; // NIGHT_WON -> NIGHT_CARD (next night) or GAME_WON
  jumpToNight(n: number): void; // dev panel: any phase -> NIGHT_CARD for night n, keeps current facts
  resumeFromSafetyPause(): void;

  // Player
  turn(view: View): void; // only when position is DESK
  startHold(entry: Entry): void;
  backToDesk(): void; // only while HOLDING
  pressQuick(cmd: QuickCommand): void;
  toggleGenerator(): void;
  submitMessage(text: string): SubmitResult;
  applyJudge(ticketId: number, result: JudgeResult | null): void;

  // Queries
  ramVisual(view: View): RamVisual;
  isDefended(entry: Entry): boolean; // section 7.5 rule at this instant
  drainEvents(): GameEvent[];
}
