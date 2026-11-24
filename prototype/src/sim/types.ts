// Shared contract for the game engine, CHUD text modules, UI and tests.
// Rules come from docs/GAME_LOGIC.md. Interpretations of gaps are in prototype/IMPLEMENTATION_NOTES.md.
// Times are simulation seconds. Practice uses its own elapsed time before the night clock starts.

export type Entry = "WINDOW" | "HATCH" | "BALCONY";
export const ENTRIES: Entry[] = ["WINDOW", "HATCH", "BALCONY"];
export type View = "DESK" | Entry;
// The power slot holds one magnetic lock at a time (GAME_LOGIC 2).
type LockSlot = `LOCK_${Entry}`;
export type PowerSlot = "NONE" | LockSlot;
export const lockSlot = (e: Entry): LockSlot => `LOCK_${e}`;
export const slotEntry = (slot: LockSlot): Entry => slot.slice(5) as Entry;
export const isLockSlot = (slot: string): slot is LockSlot => slot.startsWith("LOCK_");
export type Band = "WARM" | "HURT" | "JEALOUS" | "FURIOUS";
// INSIDE: the attempt ended undefended and he is in the room, silent, until the scare (GAME_LOGIC 7.7).
export type RamState = "AWAY" | "APPROACHING" | "AT_ENTRY" | "RETREATING" | "INSIDE";
export type QuestionType = "SEED" | "STAY" | "MEMORY";
export type Command = "ASK_LOCATION" | "LOCK" | "POWER_OFF" | "NONE";

// What CHUD can claim about Ram's whereabouts: an entry, no one, or in the room with you.
export type LocationClaim = Entry | "NONE" | "INSIDE";

// The extra scare trigger rolled at each silent breach (GAME_LOGIC 7.7). Looking at him with his entry's light on,
// putting down an artifact, walking up to his entry and 6:00 AM always trigger the scare as well.
export type InsideTrigger = "TIMER" | "NONE" | "MOVE";
// What actually set off the scare.
export type ScareReason = "LOOK" | "ARTIFACT" | "TIMER" | "MOVE" | "ARRIVED" | "DAWN";

// Decoy noises (GAME_LOGIC 7.4): random room sounds that never depend on Ram.
export type DecoySound = "creak" | "knock" | "metal" | "glass";

export type Phase =
  | "NAME_PROMPT" // fresh game, CHUD asks the player's name (setName)
  | "NIGHT_CARD" // midnight card showing, clock stopped (beginNight)
  | "PLAYING"
  | "SAFETY_PAUSE" // self-harm flag, clock stopped (resumeFromSafetyPause)
  | "BREACH" // night lost, loss screen (retryNight)
  | "NIGHT_WON" // 6 AM screen (nextNight)
  | "GAME_WON" // the kill code was accepted on night 5 (the true ending)
  | "TRAPPED"; // night 5 reached 6 AM without the kill code: bad ending, then Title. Retry restarts night 5

// `stay` marks the edge-controls flow (docs/CONTROLS_PROPOSAL.md, goToEntry): the dash ends in STANDING, a brace
// is a HOLDING that ends back in STANDING, and the player leaves with returnToDesk. Without it (startHold, the
// GAME_LOGIC 6.4 flow) the dash ends in HOLDING and the hold ends in RETURNING.
export type PlayerPosition =
  | { kind: "DESK" }
  | { kind: "TRAVELING"; entry: Entry; until: number; stay?: boolean; braceOnArrival?: boolean }
  | { kind: "STANDING"; entry: Entry; restUntil: number } // at the entry, not bracing; a brace may start at restUntil
  | { kind: "HOLDING"; entry: Entry; since: number; stay?: boolean }
  | { kind: "RETURNING"; from: Entry; until: number };

export interface PendingQuestion {
  id: number;
  origin: "SCHEDULED" | "SCRIPT";
  type: QuestionType;
  factKey: string | null; // SEED: key the answer will be stored under. MEMORY: key being checked.
  text: string;
  askedAt: number;
}

export type Facts = Record<string, string>;

export interface QuestionPlanItem {
  type: QuestionType;
  dueAt: number; // elapsed seconds
  asked: boolean;
}

export interface GameState {
  phase: Phase;
  run: { night: number; factsCheckpoint: Facts; seed: number; killCode: string; papersCheckpoint: number };
  // Kill code papers: collected so far this night, and the one Ram left at an entry (null if none).
  papers: { collected: number; floor: { entry: Entry; index: number; droppedAt: number } | null };
  clock: { elapsed: number; hour: number }; // hour 0..6, 0 = 12 AM
  player: {
    view: View;
    position: PlayerPosition;
    holdCooldownUntil: number;
    lastMessageAt: number; // -Infinity if none, for the rate limit
    lastQuickAt: number;
    reading: string | null; // id of the desk artifact being read (full-screen), null if none
    lightHeld: boolean; // Shift light input, cleared by a forced cut until the next press
    lightEntry: Entry | null; // the currently lit entry, independent of the lock slot (section 6.1)
  };
  power: {
    slot: PowerSlot;
    pending: { target: PowerSlot; landsAt: number } | null;
    chudOnline: boolean;
    generatorOn: boolean; // kill switch position
    rebootingUntil: number | null;
    lightCutAt: number | null; // CHUD will force the current light off at this time (rolled at light-on)
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
    attemptLength: number; // the current (or last) attempt window, rolled per visit
    lastGap: { length: number; kind: "first" | "normal" | "lull" | "quick" } | null; // for the dev panel
    inside: InsideInfo | null; // set while state is INSIDE
  };
  chud: {
    suspicion: number;
    band: Band;
    pendingQuestion: PendingQuestion | null;
    queuedScriptQuestion: PendingQuestion | null; // radio question waiting for a free slot
    facts: Facts;
    lastLocationClaim: LocationClaim | null; // null = never asked
    visitDecision: { visitId: number; lie: boolean; entry: LocationClaim; rolledAfterFake: boolean; rolledInside: boolean } | null;
    lastSabotageHour: number | null;
    sabotageRolledVisit: number | null;
    furiousActive: boolean;
    furiousCutDone: boolean;
    lastLightCutLineAt: number; // rate limit for the light_cut line
    furiousVisitId: number | null; // visit the episode covers
    questionPlan: QuestionPlanItem[];
    usedSeedKeys: string[];
  };
  timers: {
    lastRealMessageAt: number;
    lastWarmBonusAt: number;
    silenceTicks: number;
    locationRequests: number[]; // times of processed ASK_LOCATION requests inside the rolling window
    locationRefusedUntil: number; // ChudGPT refuses location answers until this time
    warmTimes: number[]; // times of warm-flagged messages inside the rolling window
  };
  log: {
    recentMessages: string[]; // normalized, newest last, max REPEAT_WINDOW... keep 10
    visit: {
      // per-visit record for the loss screen
      sabotaged: boolean;
      furiousCut: boolean;
      armsGaveOut: boolean; // a hold of the target entry ended by HOLD_MAX during AT_ENTRY
      claimThisVisit: LocationClaim | null;
      refusedEntry: Entry | null; // CHUD refused to lock this entry (his target) during this visit
    };
    scriptedFired: string[];
  };
  decoy: { nextAt: number; count: number }; // decoy noise schedule (own RNG stream, never reads Ram)
  loss: LossInfo | null;
  ending: "KILL_CODE" | null; // set when the kill code is accepted
}

export type LossCause = "UNLOCKED" | "LIED" | "SABOTAGE" | "FURIOUS" | "WRONG_HOLD" | "REFUSED" | "ARMS_GAVE_OUT" | "POWER_OFF";

// Ram in the room after a silent breach. The cause is decided at the breach moment; the scare comes later.
export interface InsideInfo {
  entry: Entry;
  since: number; // elapsed time he got in
  trigger: InsideTrigger; // the rolled extra trigger
  timerAt: number | null; // TIMER: when the scare fires wherever the player is
  cause: LossCause;
  heldEntry: Entry | null;
  lastClaim: LocationClaim | null; // CHUD's last location claim at the breach moment (loss screen)
}

export interface LossInfo {
  night: number;
  entry: Entry;
  cause: LossCause;
  lastClaim: LocationClaim | null;
  heldEntry: Entry | null; // for WRONG_HOLD
  reason: ScareReason; // what set off the scare
  flash: boolean; // the player saw him first: the creepy still before the jumpscare
  insideFor: number; // seconds he was in the room before the scare
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
  | { kind: "power_off" } // unlock / power off request
  | { kind: "lock_refused"; entry: Entry } // CHUD hijacks the lock: a malicious smile, no lock
  | { kind: "light_cut" } // CHUD forced the player's light off: a short possessive line
  | { kind: "refuse_furious"; request: "LOCK" }
  | { kind: "location_claim"; entry: LocationClaim } // never told whether it is a lie
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
  | { kind: "radio_reaction" }
  | { kind: "reboot_back" }
  | { kind: "location_refused" } // location spam: ChudGPT will not answer for a while
  | { kind: "flattery_reply" } // too many warm messages in a row
  | { kind: "answer_first" } // a command was blocked by a pending question
  | { kind: "busy_holding" }; // never spoken by CHUD, reserved

export type PowerCause = "player" | "sabotage" | "furious" | "kill_switch" | "reboot";

export type GameEvent =
  | { type: "NIGHT_CARD"; night: number }
  | { type: "NIGHT_START"; night: number }
  | { type: "HOUR"; hour: number }
  // Ram events are silent by rule (GAME_LOGIC 7.4): the UI must never play a sound or show text for them.
  | { type: "RAM_APPROACH"; visitId: number }
  | { type: "RAM_FAKE_OUT"; visitId: number; from: Entry; to: Entry }
  | { type: "RAM_AT_ENTRY"; visitId: number; entry: Entry }
  | { type: "RAM_RETREAT"; visitId: number; entry: Entry }
  | { type: "RAM_AWAY"; nextVisitAt: number }
  | { type: "RAM_INSIDE"; entry: Entry; trigger: InsideTrigger }
  | { type: "DECOY"; sound: DecoySound; pan: number } // pan -1 (left) .. 1 (right)
  | { type: "ARTIFACT"; id: string | null } // picked up (id) or put down (null)
  | { type: "LOCK_REFUSED"; entry: Entry } // CHUD hijacked a lock request: the malicious smile
  | { type: "LIGHT_CHANGED"; entry: Entry | null }
  | { type: "LIGHT_CUT"; entry: Entry; band: Band } // CHUD forced the light off: flicker, tick, smile in JEALOUS/FURIOUS
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
  | { type: "GAME_WON" }
  | { type: "PAPER_DROPPED"; entry: Entry; index: number }
  | { type: "PAPER_COLLECTED"; index: number }
  | { type: "KILL_CODE_ACCEPTED" }
  | { type: "TRAPPED" };

export type RejectReason =
  | "CHUD_OFFLINE"
  | "NOT_AT_DESK"
  | "RATE_LIMIT"
  | "TOO_LONG"
  | "EMPTY"
  | "NOT_PLAYING"
  | "READING";

export type QuickCommand =
  | "ASK_LOCATION"
  | "LOCK_WINDOW"
  | "LOCK_HATCH"
  | "LOCK_BALCONY"
  | "POWER_OFF";

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
// "inside": he is in the room at that entry and its light is on (the creepy flash, then the scare).
export type RamVisual = "none" | "approach_silhouette" | "tell_faint" | "tell_clear" | "inside";

export interface EngineOptions {
  seed?: number;
  config?: import("../config").Config;
  killCode?: string; // from the save; a missing or invalid one gets a fresh code
  papersCheckpoint?: number; // papers collected at the start of startNight, from the save (default 0)
  startNight?: number; // 1..5, default 1. If > 1 the name prompt is skipped and facts may be passed
  facts?: Facts;
  skipNamePrompt?: boolean; // tests and dev panel
  practiceBeforeNight?: boolean; // New Game only
}

export interface IGameEngine {
  readonly state: GameState;

  // Time
  tick(dt: number): void; // advance game time by dt seconds in fixed TICK steps. No-op unless phase is PLAYING

  // Flow
  setName(name: string): void; // NAME_PROMPT -> practice or NIGHT_CARD. Stores fact "name", CHUD says name_ack
  beginNight(): void; // NIGHT_CARD -> PLAYING
  retryNight(): void; // BREACH or TRAPPED -> NIGHT_CARD, same night, facts from checkpoint
  nextNight(): void; // NIGHT_WON -> NIGHT_CARD (next night). No-op on the last night (it ends by kill code, TRAPPED or a loss)
  jumpToNight(n: number): void; // dev panel: any phase -> NIGHT_CARD for night n, keeps current facts
  resumeFromSafetyPause(): void;

  // Player
  turn(view: View): void; // only when position is DESK
  setLight(on: boolean): void; // Shift held or released: the light of the viewed entry (the player's, not CHUD's)
  pickUpArtifact(id: string): void; // DESK position and view: read a desk artifact full-screen (the night keeps running)
  papersOnDesk(): number[]; // [0 .. collected-1]: collected papers, re-readable from the desk
  paperChar(i: number): string; // run.killCode[i]
  floorPaper(): { entry: Entry; index: number } | null; // the paper Ram left at an entry, if any
  pickUpFloorPaper(): boolean; // STANDING or braced at that entry: collects it and opens the reader
  putDownArtifact(): void; // put it down; if Ram is inside, the scare fires now
  startHold(entry: Entry): void; // GAME_LOGIC 6.4 flow: dash, then HOLDING, then RETURNING when the hold ends
  backToDesk(): void; // while HOLDING (either flow) or STANDING; in the edge flow same as returnToDesk
  // Edge-controls flow (docs/CONTROLS_PROPOSAL.md): click to go, hold to brace, edge to return
  goToEntry(entry: Entry): void; // DESK, looking at that entry, after HOLD_COOLDOWN: TRAVELING (stay), then STANDING
  startBrace(): void; // STANDING after its rest: HOLDING (stay). While TRAVELING (stay): brace on arrival
  endBrace(): void; // HOLDING (stay): back to STANDING with BRACE_REST. While TRAVELING (stay): cancels brace on arrival
  returnToDesk(): void; // STANDING or HOLDING (stay): RETURNING, then DESK. Starts HOLD_COOLDOWN
  pressQuick(cmd: QuickCommand): void;
  toggleGenerator(): void;
  submitMessage(text: string): SubmitResult;
  applyJudge(ticketId: number, result: JudgeResult | null): void;

  // Queries
  ramVisual(view: View): RamVisual;
  isDefended(entry: Entry): boolean; // section 7.5 rule at this instant
  drainEvents(): GameEvent[];
}
