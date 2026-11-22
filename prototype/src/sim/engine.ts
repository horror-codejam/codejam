// Core game engine. Rules: docs/GAME_LOGIC.md sections 3 to 13. Gap fills: prototype/IMPLEMENTATION_NOTES.md.
// Pure TypeScript: no DOM, no wall-clock, no Math.random. All randomness goes through seeded Rngs: one for the game,
// and a separate stream for the decoy noises so they can never depend on Ram (GAME_LOGIC 7.4).
// Every tuning number comes from the Config. The few constants below are rule constants, not tuning knobs.

import { CONFIG, ENDING, nightLength, type Config, type NightParams } from "../config";
import { normalize, parseCommand } from "../chud/parser";
import {
  cannedLine,
  RADIO_LINES,
  SEED_TOPICS,
  RADIO_TOPIC,
  STAY_QUESTIONS,
  NIGHT_ONE_HINTS,
  type SeedTopic,
} from "../chud/lines";
import { Rng } from "./rng";
import {
  NEUTRAL_JUDGE,
  isLightSlot,
  isLockSlot,
  lightSlot,
  lockSlot,
  slotEntry,
  type Band,
  type DecoySound,
  type EngineOptions,
  type Entry,
  type Facts,
  type GameEvent,
  type GameState,
  type IGameEngine,
  type InsideTrigger,
  type LocationClaim,
  type JudgeResult,
  type LossCause,
  type MessageTicket,
  type Outcome,
  type ParsedCommand,
  type PendingQuestion,
  type PowerCause,
  type PowerSlot,
  type QuestionPlanItem,
  type QuestionType,
  type QuickCommand,
  type RamVisual,
  type RejectReason,
  type ScareReason,
  type SubmitResult,
  type View,
} from "./types";

const NIGHT_ARTIFACTS = ["clipping", "calendar", "notebook"] as const;
export type DeskArtifact = (typeof NIGHT_ARTIFACTS)[number];

// ---------------------------------------------------------------------------
// Rule constants (not tuning)
// ---------------------------------------------------------------------------

const EPS = 1e-6; // float tolerance for "due at" comparisons
const DEFAULT_SEED = 1337;
const SUSPICION_MIN = 0;
const SUSPICION_MAX = 100; // section 8.1
const RECENT_MESSAGES_KEPT = 10; // section 3 log: last 10 player messages
const KILL_CODE_SEED_SALT = 0x5eed1e55;
const FACT_VALUE_MAX = 60; // IMPLEMENTATION_NOTES Questions: raw-text fact fallback
const NO_REPEAT_TARGET_NIGHT = 1; // section 7.2
const DECOY_SOUNDS: DecoySound[] = ["creak", "knock", "metal", "glass"];
const INSIDE_TRIGGERS: InsideTrigger[] = ["TIMER", "NONE", "MOVE"];
const DECOY_SEED_SALT = 0x5bd1e995; // the decoy stream is seeded apart from the game stream

// Section 10 radio beats. The text comes from RADIO_LINES.
const RADIO_BEATS: { night: number; hour: number; asksQuestion: boolean }[] = [
  { night: 2, hour: 3, asksQuestion: true },
  { night: 5, hour: 5, asksQuestion: false },
];

const ALL_TOPICS = (): SeedTopic[] => [...SEED_TOPICS, RADIO_TOPIC];
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Ticket {
  id: number;
  token: number; // night attempt the message belongs to
  text: string;
  parsed: ParsedCommand;
  ranImmediately: boolean;
  questionId: number | null; // pending question at submit time (one this message may answer)
  blockedBy: number | null; // question that blocked ChudGPT commands at submit time (live, even during the judge grace)
  prevLastReal: number; // lastRealMessageAt before this message (gibberish restore)
  seq: number; // message sequence number (gibberish restore only if no later message)
}

function freshVisitLog(): GameState["log"]["visit"] {
  return { sabotaged: false, furiousCut: false, armsGaveOut: false, claimThisVisit: null, peekedFrom: null, refusedEntry: null };
}

export class GameEngine implements IGameEngine {
  readonly state: GameState;

  private readonly cfg: Config;
  private readonly seed: number;
  private readonly rng: Rng;
  // Decoy noises only (GAME_LOGIC 7.4). Reseeded at every night start from the seed and a start counter, never from
  // the game stream, and read only by stepDecoys, which never looks at Ram.
  private decoyRng: Rng;
  private nightStarts = 0;
  private events: GameEvent[] = [];

  // Engine bookkeeping that is not game state (tickets in flight, ids, the fixed-step accumulator).
  private tickets = new Map<number, Ticket>();
  private nextTicketId = 1;
  private nextQuestionId = 1;
  private nightToken = 0;
  private messageSeq = 0;
  private acc = 0;
  private awayStartedAt = 0; // for the 4 s AWAY floor on silence pulls
  private pendingPowerCause: PowerCause = "player";
  private killCode = "";
  private initPapers = 0;
  private lastLineByKind = new Map<string, string>(); // last canned line per outcome kind (no back-to-back repeats)
  private memoryChecked: string[] = []; // MEMORY keys checked this night
  private readonly practiceBeforeNight: boolean;
  private practiceElapsed: number | null = null;

  constructor(opts: EngineOptions = {}) {
    this.cfg = opts.config ?? CONFIG;
    this.practiceBeforeNight = opts.practiceBeforeNight ?? false;
    this.seed = opts.seed ?? DEFAULT_SEED;
    this.rng = new Rng(this.seed);
    this.decoyRng = new Rng(this.seed ^ DECOY_SEED_SALT);
    this.state = {} as GameState;
    this.initPapers = clamp(Math.floor(opts.papersCheckpoint ?? 0) || 0, 0, ENDING.CODE_LETTERS + ENDING.CODE_DIGITS);
    this.killCode = this.validCode(opts.killCode) ? opts.killCode!.toUpperCase() : this.makeKillCode();
    const night = this.clampNight(opts.startNight ?? 1);
    const facts: Facts = { ...(opts.facts ?? {}) };
    if (opts.skipNamePrompt || night > 1) {
      this.startNight(night, facts);
    } else {
      Object.assign(this.state, this.freshState(night, facts));
      this.state.phase = "NAME_PROMPT";
    }
  }

  private validCode(c: string | undefined): boolean {
    return !!c && c.length === ENDING.CODE_LETTERS + ENDING.CODE_DIGITS && /^[A-Za-z0-9]+$/.test(c);
  }

  // Two letters and two digits in shuffled order, from their own seeded stream so the game stream is untouched.
  private makeKillCode(): string {
    const r = new Rng((this.seed ^ KILL_CODE_SEED_SALT) >>> 0);
    const chars: string[] = [];
    for (let i = 0; i < ENDING.CODE_LETTERS; i++) chars.push(r.pick([...ENDING.LETTERS]));
    for (let i = 0; i < ENDING.CODE_DIGITS; i++) chars.push(r.pick([...ENDING.DIGITS]));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
  }

  // =========================================================================
  // Queries
  // =========================================================================

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  isDefended(entry: Entry): boolean {
    const s = this.state;
    const p = s.player.position;
    return (s.power.slot === lockSlot(entry) && s.power.chudOnline) || (p.kind === "HOLDING" && p.entry === entry);
  }

  // Section 7.4. A light only lights its own entry view. Locked = blind: the locked entry shows nothing at all.
  // Without its light an entry's tell is faint. The desk is lit only by CHUD's screen.
  ramVisual(view: View): RamVisual {
    if (view === "DESK") return "none";
    const r = this.state.ram;
    const slot = this.state.power.slot;
    const lit = slot === lightSlot(view);
    if (r.state === "INSIDE") return r.inside?.entry === view && lit ? "inside" : "none";
    if (r.state === "AT_ENTRY" && r.target === view) {
      if (lit) return "tell_clear";
      return slot === lockSlot(view) ? "none" : "tell_faint";
    }
    if (r.state === "APPROACHING" && r.target === view && lit) return "approach_silhouette";
    return "none";
  }

  // =========================================================================
  // Flow (section 5)
  // =========================================================================

  setName(name: string): void {
    const s = this.state;
    if (s.phase !== "NAME_PROMPT") return;
    const value = name.trim().slice(0, FACT_VALUE_MAX);
    if (!value) return;
    s.run.factsCheckpoint = { ...s.run.factsCheckpoint, name: value };
    s.chud.facts = { ...s.chud.facts, name: value };
    this.emit({ type: "FACT_STORED", key: "name", value });
    this.say({ kind: "name_ack" });
    if (this.practiceBeforeNight) {
      s.chud.suspicion = 0;
      s.chud.band = "WARM";
      s.phase = "PLAYING";
      this.practiceElapsed = 0;
    } else {
      this.startNight(1, s.run.factsCheckpoint);
    }
  }

  get isPracticing(): boolean {
    return this.practiceElapsed !== null;
  }

  finishPractice(): void {
    if (!this.isPracticing) return;
    this.events.length = 0;
    this.startNight(1, this.state.run.factsCheckpoint);
  }

  beginNight(): void {
    const s = this.state;
    if (s.phase !== "NIGHT_CARD") return;
    s.phase = "PLAYING";
    s.timers.lastRealMessageAt = this.now;
    this.emit({ type: "NIGHT_START", night: s.run.night });
    this.say({ kind: "night_opener", night: s.run.night });
  }

  // Used by the dev panel to restart from the current night checkpoint.
  retryNight(): void {
    const s = this.state;
    if (s.phase !== "BREACH" && s.phase !== "PLAYING" && s.phase !== "TRAPPED") return;
    this.startNight(s.run.night, s.run.factsCheckpoint);
  }

  nextNight(): void {
    const s = this.state;
    if (s.phase !== "NIGHT_WON") return;
    // The last night never ends in NIGHT_WON: it ends by the kill code, TRAPPED or a loss.
    if (s.run.night >= this.cfg.nights.length) return;
    this.startNight(s.run.night + 1, s.run.factsCheckpoint);
  }

  jumpToNight(n: number): void {
    this.startNight(this.clampNight(n), { ...this.state.chud.facts });
  }

  // ---- Dev methods (dev panel only, never called by the game rules). Pure state edits: no DOM, no clock, no Math.random.

  // Advances the clock through normal ticks until 1 s before 6 AM. Ram is held away during the skip (any visit is cancelled)
  // so nobody is breached for not defending skipped minutes; CHUD, questions and radio still run. Ram is due again after the skip.
  devSkipToLastSecond(): void {
    if (this.isPracticing) return;
    const target = nightLength(this.cfg) - 1;
    if (this.state.phase !== "PLAYING" || this.now >= target - EPS) return;
    this.devRamAway();
    this.state.ram.stateEndsAt = Infinity;
    while (this.state.phase === "PLAYING" && this.now < target - EPS) this.tick(this.cfg.TICK);
    if (this.state.phase === "PLAYING") this.state.ram.stateEndsAt = this.now + this.np.awayGap[0];
  }

  // Ends the night as a win right now (NIGHT_WON, or TRAPPED on the kill code night).
  devWinNight(): void {
    if (!this.isPracticing && this.state.phase === "PLAYING") this.winNight();
  }

  // Starts a Ram visit to `entry` now, with the night's normal approach time. Only while Ram is AWAY. Returns false otherwise.
  devSendRam(entry: Entry): boolean {
    const s = this.state;
    if (this.isPracticing || s.phase !== "PLAYING" || s.ram.state !== "AWAY") return false;
    s.ram.stateEndsAt = this.now;
    this.startApproach(entry);
    return true;
  }

  // Cancels the current visit (no breach) and sends Ram away for the night's shortest away gap.
  devRamAway(): void {
    const s = this.state;
    const r = s.ram;
    if (s.phase !== "PLAYING") return;
    if (s.chud.furiousActive && s.chud.furiousVisitId === r.visitId && r.state !== "AWAY") this.endFurious(false);
    r.state = "AWAY";
    r.target = null;
    r.inside = null;
    r.fakeOutAt = null;
    r.pendingPull = 0;
    r.stateEndsAt = this.now + this.np.awayGap[0];
    this.awayStartedAt = this.now;
    this.emit({ type: "RAM_AWAY", nextVisitAt: r.stateEndsAt });
  }

  // Forces a silent breach now (dev panel, to test the scare): Ram is INSIDE at `entry` (his current target, else a
  // random active entry) with the given extra trigger, or a rolled one. Returns false if not PLAYING or already inside.
  devForceBreach(entry?: Entry, trigger?: InsideTrigger): boolean {
    const s = this.state;
    const r = s.ram;
    if (this.isPracticing || s.phase !== "PLAYING" || r.state === "INSIDE") return false;
    const at = entry ?? r.target ?? this.rng.pick(this.np.activeEntries);
    if (r.state === "AWAY") {
      r.visitId++;
      s.log.visit = freshVisitLog();
    }
    r.target = at;
    r.lastTarget = at;
    r.fakeOutAt = null;
    this.goInside(at, trigger);
    return true;
  }

  // Sets the power slot at once (dev panel): no relay delay, no CHUD rules.
  devSetPower(slot: PowerSlot): void {
    const p = this.state.power;
    if (this.state.phase !== "PLAYING" || !p.generatorOn) return;
    p.pending = null;
    p.slot = slot;
    this.emit({ type: "POWER_CHANGED", slot, cause: "player" });
  }

  // Sets suspicion (clamped) and refreshes the band. Setting it below the Furious threshold ends an active episode.
  devSetSuspicion(value: number): void {
    const c = this.state.chud;
    if (c.furiousActive && value < this.cfg.bands.furiousAt) this.endFurious(false);
    this.changeSuspicion(value - c.suspicion, ["dev"]);
  }

  resumeFromSafetyPause(): void {
    if (this.state.phase !== "SAFETY_PAUSE") return;
    this.state.phase = "PLAYING";
  }

  private startNight(night: number, checkpoint: Facts): void {
    this.practiceElapsed = null;
    Object.assign(this.state, this.freshState(night, checkpoint));
    this.nightToken++;
    this.tickets.clear();
    this.acc = 0;
    this.awayStartedAt = 0;
    this.pendingPowerCause = "player";
    this.memoryChecked = [];
    this.nightStarts++;
    this.decoyRng = new Rng((this.seed ^ DECOY_SEED_SALT) + this.nightStarts * 7919);
    this.state.decoy = { nextAt: this.rollDecoyInterval(), count: 0 };
    this.emit({ type: "NIGHT_CARD", night });
  }

  private freshState(night: number, checkpoint: Facts): GameState {
    const np = this.cfg.nights[night - 1];
    const suspicion = clamp(np.startingSuspicion, SUSPICION_MIN, SUSPICION_MAX);
    return {
      phase: "NIGHT_CARD",
      run: {
        night,
        factsCheckpoint: { ...checkpoint },
        seed: this.seed,
        killCode: this.killCode,
        papersCheckpoint: this.state.run?.papersCheckpoint ?? this.initPapers,
      },
      papers: { collected: this.state.run?.papersCheckpoint ?? this.initPapers, floor: null },
      clock: { elapsed: 0, hour: 0 },
      player: {
        view: "DESK",
        position: { kind: "DESK" },
        holdCooldownUntil: 0,
        lastMessageAt: -Infinity,
        lastQuickAt: -Infinity,
        reading: null,
        lightHeld: false,
      },
      // Night start: dark. Nothing powered (GAME_LOGIC 5.1).
      power: { slot: "NONE", pending: null, chudOnline: true, generatorOn: true, rebootingUntil: null, lightCutAt: null },
      ram: {
        state: "AWAY",
        target: null,
        stateEndsAt: np.firstVisitDelay,
        visitId: 0,
        fakedThisVisit: false,
        fakeOutAt: null,
        pendingPull: 0,
        lastTarget: null,
        attemptLength: 0,
        lastGap: { length: np.firstVisitDelay, kind: "first" },
        inside: null,
      },
      chud: {
        suspicion,
        band: this.bandFor(suspicion, false),
        pendingQuestion: null,
        queuedScriptQuestion: null,
        facts: { ...checkpoint },
        lastLocationClaim: null,
        visitDecision: null,
        lastSabotageHour: null,
        sabotageRolledVisit: null,
        furiousActive: false,
        furiousCutDone: false,
        lastLightCutLineAt: -1e9,
        furiousVisitId: null,
        questionPlan: this.planQuestions(np),
        usedSeedKeys: [],
      },
      timers: { lastRealMessageAt: 0, lastWarmBonusAt: -Infinity, silenceTicks: 0, locationRequests: [], locationRefusedUntil: -Infinity, warmTimes: [] },
      log: { recentMessages: [], visit: freshVisitLog(), scriptedFired: [], nightOneHintsShown: 0, paperHintShown: false },
      decoy: { nextAt: Infinity, count: 0 }, // set by startNight from the decoy stream
      loss: null,
      ending: null,
    };
  }

  private winNight(): void {
    const s = this.state;
    if (s.chud.furiousActive) this.endFurious(true);
    const trapped = s.run.night === ENDING.CODE_NIGHT;
    if (!trapped) {
      s.run.factsCheckpoint = { ...s.chud.facts };
      s.run.papersCheckpoint = s.papers.collected;
    }
    // The tide wins: any visit in progress is cancelled with no breach.
    s.ram.state = "AWAY";
    s.ram.target = null;
    s.ram.inside = null;
    s.player.reading = null;
    // Keep the seeded sequence for the next night after removing the morning line.
    this.rng.next();
    if (trapped) {
      s.phase = "TRAPPED";
      this.emit({ type: "TRAPPED" });
    } else {
      s.phase = "NIGHT_WON";
      this.emit({ type: "NIGHT_WON", night: s.run.night });
    }
  }

  // Section 7.5 / 7.7: the attempt ended undefended. Ram is now INSIDE, silent. The loss cause is decided now
  // (it describes this moment), the extra scare trigger is rolled now, and the scare itself comes later.
  private goInside(entry: Entry, forced?: InsideTrigger): void {
    const s = this.state;
    const r = s.ram;
    const p = s.player.position;
    // STANDING at another entry (edge-controls flow) also counts: the player was away from E, at another entry.
    const heldOther =
      p.kind === "TRAVELING" || p.kind === "HOLDING" || p.kind === "STANDING"
        ? p.entry !== entry
          ? p.entry
          : null
        : p.kind === "RETURNING" && p.from !== entry
          ? p.from
          : null;
    const v = s.log.visit;
    const claim = v.claimThisVisit;
    let cause: LossCause;
    if (!s.power.generatorOn || s.power.rebootingUntil !== null) cause = "POWER_OFF";
    else if (v.furiousCut) cause = "FURIOUS";
    else if (v.sabotaged) cause = "SABOTAGE";
    else if (v.peekedFrom === entry) cause = "PEEKED";
    else if (v.armsGaveOut) cause = "ARMS_GAVE_OUT";
    else if (heldOther) cause = "WRONG_HOLD";
    else if (v.refusedEntry === entry) cause = "REFUSED";
    else if (claim !== null && claim !== entry) cause = "LIED";
    else cause = "UNLOCKED";
    const trigger = forced ?? this.rollInsideTrigger();
    const [lo, hi] = this.cfg.INSIDE_TIMER;
    r.state = "INSIDE";
    r.target = entry;
    r.stateEndsAt = Infinity;
    r.inside = {
      entry,
      since: this.now,
      trigger,
      timerAt: trigger === "TIMER" ? this.now + this.rng.range(lo, hi) : null,
      cause,
      heldEntry: cause === "WRONG_HOLD" ? heldOther : null,
      lastClaim: s.chud.lastLocationClaim,
    };
    this.emit({ type: "RAM_INSIDE", entry, trigger });
    // Section 8.9: the episode ends when its visit resolves, and getting inside resolves it.
    if (s.chud.furiousActive && s.chud.furiousVisitId === r.visitId) this.endFurious(true);
  }

  private rollInsideTrigger(): InsideTrigger {
    const w = this.cfg.INSIDE_TRIGGER_WEIGHTS;
    const total = INSIDE_TRIGGERS.reduce((sum, k) => sum + Math.max(0, w[k]), 0);
    if (total <= 0) return "NONE";
    let x = this.rng.next() * total;
    for (const k of INSIDE_TRIGGERS) {
      x -= Math.max(0, w[k]);
      if (x < 0) return k;
    }
    return "NONE";
  }

  // The scare: the night is lost now (section 5 step 4). Decided only by code.
  private scare(reason: ScareReason, flash: boolean): void {
    const s = this.state;
    const inside = s.ram.inside;
    if (!inside || s.phase !== "PLAYING") return;
    s.phase = "BREACH";
    s.player.reading = null;
    s.loss = {
      night: s.run.night,
      entry: inside.entry,
      cause: inside.cause,
      lastClaim: inside.lastClaim,
      heldEntry: inside.heldEntry,
      reason,
      flash,
      insideFor: Math.max(0, this.now - inside.since),
    };
    this.emit({ type: "BREACH", loss: { ...s.loss } });
  }

  // Looking at his entry with its light on: at the desk, not reading, facing that entry, its light landed.
  private lookingAtLit(entry: Entry): boolean {
    const s = this.state;
    return (
      s.player.reading === null && s.player.position.kind === "DESK" && s.player.view === entry && s.power.slot === lightSlot(entry)
    );
  }

  // Always-on scare triggers while he is inside, checked every step (section 7.7).
  private stepInside(): void {
    const s = this.state;
    const inside = s.ram.state === "INSIDE" ? s.ram.inside : null;
    if (!inside) return;
    const p = s.player.position;
    if ((p.kind === "STANDING" || p.kind === "HOLDING") && p.entry === inside.entry) {
      this.scare("ARRIVED", s.power.slot === lightSlot(inside.entry));
    } else if (this.lookingAtLit(inside.entry)) {
      this.scare("LOOK", true);
    } else if (inside.timerAt !== null && this.due(inside.timerAt)) {
      this.scare("TIMER", false);
    }
  }

  // The rolled MOVE trigger: the player's next turn of view or trip from or to the desk.
  private onPlayerMove(): void {
    const inside = this.state.ram.state === "INSIDE" ? this.state.ram.inside : null;
    if (!inside) return;
    if (this.lookingAtLit(inside.entry)) this.scare("LOOK", true);
    else if (inside.trigger === "MOVE") this.scare("MOVE", false);
  }

  // =========================================================================
  // Time: fixed steps (IMPLEMENTATION_NOTES "Time")
  // =========================================================================

  tick(dt: number): void {
    if (this.state.phase !== "PLAYING" || !(dt > 0)) return;
    const T = this.cfg.TICK;
    this.acc += dt;
    while (this.acc >= T - EPS) {
      this.acc -= T;
      this.step();
      if (this.state.phase !== "PLAYING") {
        this.acc = 0;
        break;
      }
    }
  }

  get now(): number {
    return this.practiceElapsed ?? this.state.clock.elapsed;
  }

  private get np(): NightParams {
    return this.cfg.nights[this.state.run.night - 1];
  }

  private due(t: number): boolean {
    return t <= this.now + EPS;
  }

  private step(): void {
    const s = this.state;
    const T = this.cfg.TICK;
    const elapsed = (Math.round(this.now / T) + 1) * T;
    if (this.isPracticing) this.practiceElapsed = elapsed;
    else s.clock.elapsed = elapsed;

    // Other state moves, before the section 13 list.
    this.landRelay();
    this.stepPlayer();
    if (this.isPracticing) return;
    this.stepRam();
    this.stepReboot();
    this.stepHour();

    // Section 13 order.
    if (s.ram.state === "AT_ENTRY" && this.due(s.ram.stateEndsAt)) this.resolveAttempt();
    this.stepInside();
    if (s.phase !== "PLAYING") return;
    this.stepLightCut();
    if (this.now >= nightLength(this.cfg) - EPS) {
      // 6:00 AM wins, unless he is inside: then the scare comes instead (section 5 step 3).
      if (s.ram.state === "INSIDE") this.scare("DAWN", false);
      else this.winNight();
      return;
    }
    this.stepHints();
    this.stepDecoys();
    this.stepQuestionTimeouts();
    this.stepSilence();
    this.stepQuestions();
    this.tryFuriousCut();
    this.stepSabotage();
  }

  // Night 1 tutorial hints at fixed times before the first visit (section 10). Never tied to Ram.
  private stepHints(): void {
    const s = this.state;
    const times = this.cfg.NIGHT_ONE_HINT_TIMES;
    if (s.run.night !== 1) return;
    while (s.log.nightOneHintsShown < Math.min(times.length, NIGHT_ONE_HINTS.length) && this.due(times[s.log.nightOneHintsShown])) {
      this.emit({ type: "HINT", text: NIGHT_ONE_HINTS[s.log.nightOneHintsShown] });
      s.log.nightOneHintsShown++;
    }
  }

  // Decoy noises (section 7.4). Reads only the clock, the night's interval and the decoy stream. Never Ram.
  private stepDecoys(): void {
    const d = this.state.decoy;
    for (let guard = 0; guard < 8 && this.due(d.nextAt); guard++) {
      this.emit({ type: "DECOY", sound: this.decoyRng.pick(DECOY_SOUNDS), pan: this.decoyRng.range(-1, 1) });
      d.count++;
      d.nextAt += this.rollDecoyInterval();
    }
  }

  private rollDecoyInterval(): number {
    const [lo, hi] = this.np.decoyInterval;
    return this.decoyRng.range(lo, hi);
  }

  private stepHour(): void {
    const s = this.state;
    const hour = Math.min(this.cfg.NIGHT_HOURS, Math.floor((this.now + EPS) / this.cfg.HOUR_LENGTH));
    while (s.clock.hour < hour) {
      s.clock.hour++;
      this.emit({ type: "HOUR", hour: s.clock.hour });
      for (const beat of RADIO_BEATS) {
        if (beat.night === s.run.night && beat.hour === s.clock.hour) this.fireRadio(beat.asksQuestion);
      }
    }
  }

  // =========================================================================
  // Power (section 6.5, 8.3)
  // =========================================================================

  private effectiveSlot(): PowerSlot {
    const p = this.state.power;
    return p.pending ? p.pending.target : p.slot;
  }

  private requestPower(target: PowerSlot, cause: PowerCause): void {
    const landsAt = this.now + this.cfg.RELAY_DELAY;
    this.state.power.pending = { target, landsAt };
    this.pendingPowerCause = cause;
    this.emit({ type: "POWER_REQUESTED", target, landsAt });
  }

  private landRelay(): void {
    const p = this.state.power;
    if (p.pending && this.due(p.pending.landsAt)) {
      p.slot = p.pending.target;
      p.pending = null;
      if (isLockSlot(p.slot)) this.state.player.lightHeld = false; // a landed lock wins; press Shift again to look
      this.emit({ type: "POWER_CHANGED", slot: p.slot, cause: this.pendingPowerCause });
    }
  }

  private cutPower(cause: PowerCause): void {
    const p = this.state.power;
    p.slot = "NONE";
    p.pending = null;
    this.emit({ type: "POWER_CHANGED", slot: "NONE", cause });
  }

  toggleGenerator(): void {
    const s = this.state;
    if (this.isPracticing || s.phase !== "PLAYING" || s.player.position.kind !== "DESK" || s.player.reading !== null) return;
    if (s.power.generatorOn) {
      s.power.generatorOn = false;
      s.power.rebootingUntil = null;
      this.emit({ type: "GENERATOR", on: false });
      this.cutPower("kill_switch");
      if (s.power.chudOnline) {
        s.power.chudOnline = false;
        this.emit({ type: "CHUD_ONLINE", online: false });
        this.tickets.clear();
        const q = s.chud.pendingQuestion;
        if (q) {
          s.chud.pendingQuestion = null;
          this.emit({ type: "QUESTION_RESOLVED", questionId: q.id, result: "cancelled" });
        }
        if (s.chud.furiousActive) this.endFurious(false);
      }
    } else {
      s.power.generatorOn = true;
      s.power.rebootingUntil = this.now + this.cfg.REBOOT_TIME;
      this.emit({ type: "GENERATOR", on: true });
      this.syncLight();
    }
  }

  private stepReboot(): void {
    const s = this.state;
    if (s.power.rebootingUntil === null || !this.due(s.power.rebootingUntil)) return;
    s.power.rebootingUntil = null;
    s.power.chudOnline = true;
    this.emit({ type: "CHUD_ONLINE", online: true });
    this.syncLight();
    const floor = Math.max(s.chud.suspicion, this.cfg.REBOOT_SUSPICION_FLOOR);
    this.changeSuspicion(floor - s.chud.suspicion, ["reboot_floor"]);
    this.say({ kind: "reboot_back" });
    s.timers.lastRealMessageAt = this.now;
  }

  // =========================================================================
  // Player (section 6)
  // =========================================================================

  turn(view: View): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.position.kind !== "DESK" || s.player.reading !== null) return;
    if (s.player.view === view) return;
    s.player.view = view;
    this.emit({ type: "VIEW", view });
    this.syncLight();
    this.onPlayerMove();
  }

  // Lights (section 6.1): the player's, never CHUD's. Hold Shift: the light of the entry you are looking at is on,
  // instantly, and it takes the one power slot (any lock drops at once). Release: the slot goes to NONE.
  setLight(on: boolean): void {
    const s = this.state;
    if (s.phase !== "PLAYING") return;
    s.player.lightHeld = on;
    this.syncLight();
  }

  // Keeps the slot in line with the held light: on the viewed entry while held and powered, off otherwise.
  private syncLight(): void {
    const s = this.state;
    const p = s.power;
    const v = s.player.view;
    const powered = p.generatorOn && p.rebootingUntil === null;
    const want: PowerSlot | null = s.player.lightHeld && powered && v !== "DESK" && s.player.reading === null ? lightSlot(v) : null;
    if (want) {
      if (p.slot === want && !p.pending) return;
      // PEEKED (section 11): a lock on Ram's entry dropped for a light while he is on his way or at it.
      const r = s.ram;
      const from = slotEntry(p.slot);
      if (isLockSlot(p.slot) && (r.state === "APPROACHING" || r.state === "AT_ENTRY") && r.target === from) s.log.visit.peekedFrom = from;
      p.pending = null;
      p.slot = want;
      this.emit({ type: "POWER_CHANGED", slot: want, cause: "light" });
      this.rollLightCut();
    } else if (isLightSlot(p.slot)) {
      p.slot = "NONE";
      p.lightCutAt = null;
      this.emit({ type: "POWER_CHANGED", slot: "NONE", cause: "light" });
    }
  }

  // CHUD can never stop a light coming on, but it can force it off (section 6.1). One roll per light-on, by band.
  private rollLightCut(): void {
    const s = this.state;
    const chance = this.cfg.LIGHT_CUT[s.chud.band];
    const online = s.power.chudOnline && s.power.rebootingUntil === null;
    s.power.lightCutAt = online && chance > 0 && this.rng.chance(chance) ? this.now + this.rng.range(...this.cfg.LIGHT_CUT_DELAY) : null;
  }

  private stepLightCut(): void {
    const s = this.state;
    const p = s.power;
    if (p.lightCutAt === null || !this.due(p.lightCutAt)) return;
    p.lightCutAt = null;
    if (!isLightSlot(p.slot) || !p.chudOnline || p.rebootingUntil !== null || s.chud.band === "WARM") return;
    const entry = slotEntry(p.slot)!;
    p.slot = "NONE";
    // Holding Shift through the cut stays dark: the player has to release and press again.
    s.player.lightHeld = false;
    this.emit({ type: "POWER_CHANGED", slot: "NONE", cause: "light_cut" });
    this.emit({ type: "LIGHT_CUT", entry, band: s.chud.band });
    if (this.now - s.chud.lastLightCutLineAt >= this.cfg.LIGHT_CUT_LINE_GAP - EPS) {
      s.chud.lastLightCutLineAt = this.now;
      this.say({ kind: "light_cut" });
    }
  }

  // Desk artifacts (section 6.6): reading is full-screen, the night keeps running, and nothing else can be done.
  get deskArtifact(): DeskArtifact | undefined {
    return this.isPracticing ? undefined : NIGHT_ARTIFACTS[this.state.run.night - 1];
  }

  pickUpArtifact(id: string): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.reading !== null) return;
    if (s.player.position.kind !== "DESK" || s.player.view !== "DESK") return;
    // Kill-code papers (paperN) are readable once collected; the night's desk artifact only on its night.
    const m = /^paper(\d+)$/.exec(id);
    if (m ? !this.papersOnDesk().includes(Number(m[1])) : id !== this.deskArtifact) return;
    s.player.reading = id;
    this.emit({ type: "ARTIFACT", id });
  }

  papersOnDesk(): number[] {
    return Array.from({ length: this.state.papers.collected }, (_, i) => i);
  }

  paperChar(i: number): string {
    return this.state.run.killCode[i] ?? "";
  }

  floorPaper(): { entry: Entry; index: number } | null {
    const f = this.state.papers.floor;
    return f ? { entry: f.entry, index: f.index } : null;
  }

  // Picks up the paper Ram left at an entry: the player must be standing (or bracing) there. Opens the reader.
  pickUpFloorPaper(): boolean {
    const s = this.state;
    const f = s.papers.floor;
    if (s.phase !== "PLAYING" || !f || s.player.reading !== null) return false;
    let p = s.player.position;
    if ((p.kind !== "STANDING" && p.kind !== "HOLDING") || p.entry !== f.entry) return false;
    if (p.kind === "HOLDING") {
      if (!p.stay) return false;
      this.endHold("manual");
      p = s.player.position;
      if (p.kind !== "STANDING") return false;
    }
    s.papers.collected += 1;
    s.papers.floor = null;
    this.emit({ type: "PAPER_COLLECTED", index: f.index });
    s.player.reading = `paper${f.index}`;
    this.emit({ type: "ARTIFACT", id: s.player.reading });
    return true;
  }

  // The player typed the kill code into CHUD's chat. Killing the AI frees Ram, so this wins even if he is inside.
  private acceptKillCode(): void {
    const s = this.state;
    if (s.chud.furiousActive) this.endFurious(true);
    const pq = s.chud.pendingQuestion;
    if (pq) this.emit({ type: "QUESTION_RESOLVED", questionId: pq.id, result: "cancelled" });
    s.chud.pendingQuestion = null;
    s.chud.queuedScriptQuestion = null;
    s.ram.state = "AWAY";
    s.ram.target = null;
    s.ram.inside = null;
    s.ram.fakeOutAt = null;
    s.ram.pendingPull = 0;
    s.ram.stateEndsAt = Infinity;
    s.papers.floor = null;
    s.power.pending = null;
    s.player.reading = null;
    s.ending = "KILL_CODE";
    s.phase = "GAME_WON";
    this.nightToken++;
    this.tickets.clear();
    this.emit({ type: "KILL_CODE_ACCEPTED" });
    this.emit({ type: "GAME_WON" });
  }

  putDownArtifact(): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.reading === null) return;
    s.player.reading = null;
    this.emit({ type: "ARTIFACT", id: null });
    if (s.ram.state === "INSIDE") this.scare("ARTIFACT", false);
  }

  startHold(entry: Entry): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.position.kind !== "DESK" || s.player.reading !== null) return;
    if (this.now < s.player.holdCooldownUntil - EPS) return;
    if (s.player.view !== "DESK" && s.player.view !== entry) return;
    s.player.position = { kind: "TRAVELING", entry, until: this.now + this.cfg.TRAVEL_TIME };
    this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
  }

  backToDesk(): void {
    const s = this.state;
    if (s.phase !== "PLAYING") return;
    const p = s.player.position;
    if (p.kind === "STANDING" || (p.kind === "HOLDING" && p.stay)) this.returnToDesk();
    else if (p.kind === "HOLDING") this.endHold("manual");
  }

  private endHold(reason: "manual" | "arms"): void {
    const s = this.state;
    const p = s.player.position;
    if (p.kind !== "HOLDING") return;
    const t = reason === "arms" ? p.since + this.cfg.HOLD_MAX : this.now;
    if (reason === "arms" && s.ram.state === "AT_ENTRY" && s.ram.target === p.entry) s.log.visit.armsGaveOut = true;
    if (p.stay) {
      // edge-controls flow: the brace ends, the player stays at the entry and rests before the next brace
      s.player.position = { kind: "STANDING", entry: p.entry, restUntil: t + this.cfg.BRACE_REST };
    } else {
      s.player.holdCooldownUntil = t + this.cfg.HOLD_COOLDOWN;
      s.player.position = { kind: "RETURNING", from: p.entry, until: t + this.cfg.TRAVEL_TIME };
    }
    this.emit({ type: "HOLD_ENDED", entry: p.entry, reason });
    this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
  }

  // ---- Edge-controls flow (docs/CONTROLS_PROPOSAL.md, IMPLEMENTATION_NOTES "Edge controls") ----

  goToEntry(entry: Entry): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.position.kind !== "DESK") return;
    if (this.now < s.player.holdCooldownUntil - EPS) return;
    if (s.player.view !== entry) return; // look first, then go
    s.player.position = { kind: "TRAVELING", entry, until: this.now + this.cfg.TRAVEL_TIME, stay: true, braceOnArrival: false };
    this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
    this.onPlayerMove();
  }

  startBrace(): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.reading !== null) return;
    const p = s.player.position;
    if (p.kind === "TRAVELING" && p.stay) {
      p.braceOnArrival = true;
    } else if (p.kind === "STANDING" && this.now >= p.restUntil - EPS) {
      s.player.position = { kind: "HOLDING", entry: p.entry, since: this.now, stay: true };
      this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
    }
  }

  endBrace(): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.reading !== null) return;
    const p = s.player.position;
    if (p.kind === "TRAVELING" && p.stay) p.braceOnArrival = false;
    else if (p.kind === "HOLDING" && p.stay) this.endHold("manual");
  }

  returnToDesk(): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.reading !== null) return;
    const p = s.player.position;
    if (p.kind === "HOLDING" && p.stay) this.endHold("manual");
    const q = s.player.position;
    if (q.kind !== "STANDING") return;
    // HOLD_COOLDOWN runs from the start of the return, as in GAME_LOGIC 6.4 (so 2.5 s of it remain at the desk)
    s.player.holdCooldownUntil = this.now + this.cfg.HOLD_COOLDOWN;
    s.player.position = { kind: "RETURNING", from: q.entry, until: this.now + this.cfg.TRAVEL_TIME };
    this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
    this.onPlayerMove();
  }

  private stepPlayer(): void {
    const s = this.state;
    const p = s.player.position;
    if (p.kind === "TRAVELING" && this.due(p.until)) {
      if (p.stay && !p.braceOnArrival) s.player.position = { kind: "STANDING", entry: p.entry, restUntil: p.until };
      else s.player.position = { kind: "HOLDING", entry: p.entry, since: p.until, ...(p.stay ? { stay: true } : {}) };
      this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
    } else if (p.kind === "HOLDING" && this.due(p.since + this.cfg.HOLD_MAX)) {
      this.endHold("arms");
    } else if (p.kind === "RETURNING" && this.due(p.until)) {
      s.player.position = { kind: "DESK" };
      this.emit({ type: "PLAYER_MOVED", position: { kind: "DESK" } });
      if (s.player.view !== "DESK") {
        s.player.view = "DESK";
        this.emit({ type: "VIEW", view: "DESK" });
        this.syncLight();
      }
    }
  }

  // =========================================================================
  // Ram (section 7)
  // =========================================================================

  private stepRam(): void {
    for (let guard = 0; guard < 4; guard++) {
      const r = this.state.ram;
      if (r.state === "AWAY" && this.due(r.stateEndsAt)) this.startApproach();
      else if (r.state === "APPROACHING" && !r.fakedThisVisit && r.fakeOutAt !== null && this.due(r.fakeOutAt)) this.fakeOut();
      else if (r.state === "APPROACHING" && this.due(r.stateEndsAt)) this.arriveAtEntry();
      else if (r.state === "RETREATING" && this.due(r.stateEndsAt)) this.goAway();
      else break;
    }
  }

  private startApproach(forced?: Entry): void {
    const s = this.state;
    const r = s.ram;
    const np = this.np;
    const base = r.stateEndsAt;
    let choices = np.activeEntries;
    if (s.run.night === NO_REPEAT_TARGET_NIGHT && r.lastTarget) {
      const filtered = choices.filter((e) => e !== r.lastTarget);
      if (filtered.length) choices = filtered;
    }
    const target = forced ?? this.rng.pick(choices);
    r.visitId++;
    r.state = "APPROACHING";
    r.target = target;
    r.lastTarget = target;
    r.fakedThisVisit = false;
    r.fakeOutAt =
      np.fakeOutChance > 0 && np.activeEntries.length > 1 && this.rng.chance(np.fakeOutChance) ? base + np.approachTime / 2 : null;
    r.stateEndsAt = base + np.approachTime;
    s.log.visit = freshVisitLog();
    this.emit({ type: "RAM_APPROACH", visitId: r.visitId });
  }

  private fakeOut(): void {
    const r = this.state.ram;
    const from = r.target!;
    const others = this.np.activeEntries.filter((e) => e !== from);
    const to = this.rng.pick(others);
    r.target = to;
    r.lastTarget = to;
    r.fakedThisVisit = true;
    this.emit({ type: "RAM_FAKE_OUT", visitId: r.visitId, from, to });
  }

  private arriveAtEntry(): void {
    const s = this.state;
    const r = s.ram;
    const [lo, hi] = this.np.atEntryTime;
    r.state = "AT_ENTRY";
    r.attemptLength = this.rng.range(lo, hi); // random per visit, so the end moment cannot be counted (section 4)
    r.stateEndsAt = r.stateEndsAt + r.attemptLength;
    this.emit({ type: "RAM_AT_ENTRY", visitId: r.visitId, entry: r.target! });
    if (s.phase !== "PLAYING") return;
    this.tryFuriousCut();
  }

  private resolveAttempt(): void {
    const s = this.state;
    const r = s.ram;
    const entry = r.target!;
    if (!this.isDefended(entry)) {
      this.goInside(entry);
      return;
    }
    r.state = "RETREATING";
    r.stateEndsAt = r.stateEndsAt + this.cfg.RETREAT_TIME;
    this.emit({ type: "RAM_RETREAT", visitId: r.visitId, entry });
    this.maybeDropPaper(entry);
    if (s.chud.furiousActive && s.chud.furiousVisitId === r.visitId) this.endFurious(true);
  }

  // A defended attempt may leave a kill code paper at the entry. At most one new paper per night, catch-up allowed.
  private maybeDropPaper(entry: Entry): void {
    const s = this.state;
    const pp = s.papers;
    const night = s.run.night;
    if (night < ENDING.FIRST_PAPER_NIGHT || pp.floor !== null) return;
    const total = ENDING.CODE_LETTERS + ENDING.CODE_DIGITS;
    if (pp.collected >= total || pp.collected >= night - ENDING.FIRST_PAPER_NIGHT + 1) return;
    // The code night's last slip waits for LAST_PAPER_AFTER, so the final night is more than one visit long.
    if (night === ENDING.CODE_NIGHT && pp.collected === total - 1 && this.now < ENDING.LAST_PAPER_AFTER) return;
    pp.floor = { entry, index: pp.collected, droppedAt: this.now };
    this.emit({ type: "PAPER_DROPPED", entry, index: pp.collected });
    // Each night's first drop says where it is, so a slip is never missed by not looking (a missed slip blocks night 5).
    if (!s.log.paperHintShown) {
      s.log.paperHintShown = true;
      this.emit({ type: "HINT", text: `He left something at the ${entry.toLowerCase()}.` });
    }
  }

  // Section 7.6: quick return first; else the base range times the hour ramp, then the lull roll; then silence pulls.
  private goAway(): void {
    const r = this.state.ram;
    const c = this.cfg;
    const np = this.np;
    const base = r.stateEndsAt;
    let kind: "normal" | "lull" | "quick" = "normal";
    let original: number;
    if (np.quickReturnChance > 0 && this.rng.chance(np.quickReturnChance)) {
      kind = "quick";
      original = this.rng.range(c.QUICK_RETURN_GAP[0], c.QUICK_RETURN_GAP[1]);
    } else {
      const hour = clamp(Math.floor((base + EPS) / c.HOUR_LENGTH), 0, c.HOUR_RAMP.length - 1);
      original = this.rng.range(np.awayGap[0], np.awayGap[1]) * (c.HOUR_RAMP[hour] ?? 1);
      if (np.lullChance > 0 && this.rng.chance(np.lullChance)) {
        kind = "lull";
        original *= c.LULL_MULT;
      }
    }
    let gap = original;
    for (let i = 0; i < r.pendingPull; i++) gap *= 1 - c.SILENCE_PULL;
    gap = Math.max(gap, Math.min(c.MIN_AWAY_GAP, original));
    r.pendingPull = 0;
    r.state = "AWAY";
    r.target = null;
    r.stateEndsAt = base + gap;
    r.lastGap = { length: gap, kind };
    this.awayStartedAt = base;
    this.emit({ type: "RAM_AWAY", nextVisitAt: r.stateEndsAt });
  }

  // Section 7.3: each silence tick cuts the remaining AWAY time by SILENCE_PULL, never below MIN_AWAY_GAP total.
  private silencePull(): void {
    const r = this.state.ram;
    const c = this.cfg;
    if (r.state === "AWAY") {
      const remaining = Math.max(0, r.stateEndsAt - this.now);
      const floor = c.MIN_AWAY_GAP - (this.now - this.awayStartedAt);
      const next = Math.min(remaining, Math.max(remaining * (1 - c.SILENCE_PULL), floor, 0));
      r.stateEndsAt = this.now + next;
      this.emit({ type: "SILENCE_PULL", newEndsAt: r.stateEndsAt });
    } else {
      r.pendingPull++;
      this.emit({ type: "SILENCE_PULL", newEndsAt: null });
    }
  }

  // =========================================================================
  // Suspicion and bands (section 8.1, 8.2)
  // =========================================================================

  private bandFor(v: number, furious: boolean): Band {
    const b = this.cfg.bands;
    if (furious) return "FURIOUS";
    if (v < b.hurtFrom) return "WARM";
    if (v < b.jealousFrom) return "HURT";
    return "JEALOUS";
  }

  private updateBand(): void {
    const c = this.state.chud;
    const band = this.bandFor(c.suspicion, c.furiousActive);
    if (band !== c.band) {
      c.band = band;
      this.emit({ type: "BAND", band });
    }
  }

  private changeSuspicion(delta: number, reasons: string[]): void {
    const c = this.state.chud;
    const from = c.suspicion;
    const to = clamp(Math.round(from + delta), SUSPICION_MIN, SUSPICION_MAX);
    if (to !== from) {
      c.suspicion = to;
      this.emit({ type: "SUSPICION", from, to, reasons });
    }
    if (delta > 0 && to >= this.cfg.bands.furiousAt && !c.furiousActive && this.state.power.chudOnline) {
      this.startFurious();
    }
    this.updateBand();
  }

  // =========================================================================
  // Furious episode (section 8.9)
  // =========================================================================

  private startFurious(): void {
    const s = this.state;
    const r = s.ram;
    s.chud.furiousActive = true;
    s.chud.furiousCutDone = false;
    if (r.state === "APPROACHING") s.chud.furiousVisitId = r.visitId;
    else if (r.state === "AT_ENTRY")
      s.chud.furiousVisitId = this.windowLeft() >= this.cutMargin() - EPS ? r.visitId : r.visitId + 1;
    else s.chud.furiousVisitId = r.visitId + 1;
    this.emit({ type: "FURIOUS_START" });
    this.updateBand();
    this.say({ kind: "furious_start" });
    this.tryFuriousCut();
  }

  private tryFuriousCut(): void {
    const s = this.state;
    const r = s.ram;
    if (!s.chud.furiousActive || s.chud.furiousCutDone || !s.power.chudOnline) return;
    if (r.state !== "AT_ENTRY" || s.chud.furiousVisitId !== r.visitId) return;
    if (this.windowLeft() < this.cutMargin() - EPS) return;
    s.chud.furiousCutDone = true;
    // The cut only hits a lock (engaged or on its way). The player's light is not CHUD's to cut.
    // With nothing to cut it stays silent: the line would otherwise announce that he just reached an entry.
    const p = s.power;
    if (!isLockSlot(p.slot) && !(p.pending && isLockSlot(p.pending.target))) return;
    p.pending = null;
    if (isLockSlot(p.slot)) p.slot = "NONE";
    this.emit({ type: "POWER_CHANGED", slot: p.slot, cause: "furious" });
    s.log.visit.furiousCut = true;
    this.emit({ type: "FURIOUS_CUT", entry: r.target! });
    this.say({ kind: "furious_cut" });
  }

  private endFurious(reset: boolean): void {
    const c = this.state.chud;
    c.furiousActive = false;
    c.furiousCutDone = false;
    c.furiousVisitId = null;
    this.emit({ type: "FURIOUS_END" });
    if (reset) this.changeSuspicion(this.cfg.FURIOUS_RESET - c.suspicion, ["furious_reset"]);
    this.updateBand();
  }

  private windowLeft(): number {
    return this.state.ram.stateEndsAt - this.now;
  }

  private cutMargin(): number {
    return this.cfg.TRAVEL_TIME + this.cfg.SABOTAGE_MARGIN;
  }

  // =========================================================================
  // Sabotage (section 8.8)
  // =========================================================================

  private stepSabotage(): void {
    const s = this.state;
    const r = s.ram;
    if (r.state !== "AT_ENTRY" || !r.target) return;
    if (!s.power.chudOnline || s.chud.band !== "JEALOUS") return;
    if (s.power.slot !== lockSlot(r.target)) return;
    if (this.windowLeft() < this.cutMargin() - EPS) return;
    if (s.chud.lastSabotageHour === s.clock.hour) return;
    if (s.chud.sabotageRolledVisit === r.visitId) return;
    s.chud.sabotageRolledVisit = r.visitId;
    if (!this.rng.chance(this.cfg.SABOTAGE_CHANCE)) return;
    s.chud.lastSabotageHour = s.clock.hour;
    s.log.visit.sabotaged = true;
    this.emit({ type: "SABOTAGE", entry: r.target });
    this.cutPower("sabotage");
    this.say({ kind: "sabotage" });
  }

  // =========================================================================
  // Silence (section 8.4)
  // =========================================================================

  private stepSilence(): void {
    const s = this.state;
    if (!s.power.chudOnline) return;
    if (this.now - s.timers.lastRealMessageAt < this.cfg.SILENCE_LIMIT - EPS) return;
    s.timers.lastRealMessageAt = this.now;
    s.timers.silenceTicks++;
    this.changeSuspicion(this.cfg.suspicion.silenceTick, ["silence"]);
    this.silencePull();
    this.say({ kind: "silence" });
  }

  // =========================================================================
  // Questions (section 8.5)
  // =========================================================================

  private planQuestions(np: NightParams): QuestionPlanItem[] {
    const mix = [...np.questionMix];
    for (let i = mix.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [mix[i], mix[j]] = [mix[j], mix[i]];
    }
    const [lo, hi] = this.cfg.scheduledQuestionWindow;
    const gap = this.cfg.scheduledQuestionMinSpacing;
    const times = mix.map(() => this.rng.range(lo, hi)).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1] + gap);
    const last = times.length - 1;
    if (last >= 0 && times[last] > hi) {
      times[last] = hi;
      for (let i = last - 1; i >= 0; i--) times[i] = Math.min(times[i], times[i + 1] - gap);
    }
    return mix.map((type, i) => ({ type, dueAt: times[i], asked: false }));
  }

  private pickSeedTopic(): SeedTopic | null {
    const c = this.state.chud;
    const free = SEED_TOPICS.filter((t) => !hasOwn(c.facts, t.key) && !c.usedSeedKeys.includes(t.key));
    return free.length ? this.rng.pick(free) : null;
  }

  // MEMORY checks only keys that have a memory question (SEED_TOPICS or RADIO_TOPIC), never `name`.
  private pickMemoryTopic(): SeedTopic | null {
    const facts = this.state.chud.facts;
    const known = ALL_TOPICS().filter((t) => t.key !== "name" && hasOwn(facts, t.key));
    if (!known.length) return null;
    const fresh = known.filter((t) => !this.memoryChecked.includes(t.key));
    return this.rng.pick(fresh.length ? fresh : known);
  }

  private makeQuestion(type: QuestionType, origin: PendingQuestion["origin"]): PendingQuestion {
    const c = this.state.chud;
    const q = (t: QuestionType, factKey: string | null, text: string): PendingQuestion => ({
      id: this.nextQuestionId++,
      origin,
      type: t,
      factKey,
      text,
      askedAt: this.now,
    });
    if (type === "MEMORY") {
      const topic = this.pickMemoryTopic();
      if (topic) {
        this.memoryChecked.push(topic.key);
        return q("MEMORY", topic.key, topic.memoryQuestion);
      }
      type = "SEED";
    }
    if (type === "SEED") {
      const topic = this.pickSeedTopic();
      if (topic) {
        c.usedSeedKeys.push(topic.key);
        return q("SEED", topic.key, topic.question);
      }
    }
    return q("STAY", null, this.rng.pick(STAY_QUESTIONS));
  }

  private askQuestion(q: PendingQuestion, speak: boolean): void {
    q.askedAt = this.now;
    this.state.chud.pendingQuestion = q;
    this.emit({ type: "QUESTION_ASKED", question: { ...q } });
    if (speak) this.say({ kind: "question", question: q.text, type: q.type });
  }

  private stepQuestions(): void {
    const s = this.state;
    if (!s.power.chudOnline || s.chud.pendingQuestion) return;
    if (s.chud.queuedScriptQuestion) {
      const q = s.chud.queuedScriptQuestion;
      s.chud.queuedScriptQuestion = null;
      this.askQuestion(q, true);
      return;
    }
    const item = s.chud.questionPlan.find((it) => !it.asked && this.due(it.dueAt));
    if (!item) return;
    if (!this.np.questionsMayLandDuringAttempt && s.ram.state === "AT_ENTRY") return;
    item.asked = true;
    this.askQuestion(this.makeQuestion(item.type, "SCHEDULED"), true);
  }

  private stepQuestionTimeouts(): void {
    const c = this.state.chud;
    const limit = this.cfg.QUESTION_TIMEOUT;
    const q = c.pendingQuestion;
    if (!q || !this.due(q.askedAt + limit)) return;
    // A message typed before the timeout is still with the judge: wait for its verdict (up to the grace) before penalizing.
    const inFlight = [...this.tickets.values()].some((t) => t.questionId === q.id && t.token === this.nightToken);
    if (inFlight && !this.due(q.askedAt + limit + this.cfg.QUESTION_JUDGE_GRACE)) return;
    this.timeoutQuestion(q);
  }

  private timeoutQuestion(q: PendingQuestion): void {
    this.removeQuestion(q);
    this.changeSuspicion(this.cfg.suspicion.questionTimeout, ["question_timeout"]);
    this.emit({ type: "QUESTION_RESOLVED", questionId: q.id, result: "timeout" });
    this.say({ kind: "question_timeout" });
  }

  private removeQuestion(q: PendingQuestion): void {
    const c = this.state.chud;
    if (c.pendingQuestion?.id === q.id) c.pendingQuestion = null;
  }

  private storeFact(key: string, value: string): void {
    const facts = this.state.chud.facts;
    if (!key || key === "__proto__" || hasOwn(facts, key)) return;
    facts[key] = value;
    this.emit({ type: "FACT_STORED", key, value });
  }

  // =========================================================================
  // Scripted beats (section 10)
  // =========================================================================

  private fireRadio(asksQuestion: boolean): void {
    const s = this.state;
    const id = `radio_n${s.run.night}`;
    if (s.log.scriptedFired.includes(id)) return;
    s.log.scriptedFired.push(id);
    this.emit({ type: "RADIO", text: RADIO_LINES[s.run.night] ?? "" });
    this.changeSuspicion(this.cfg.suspicion.radioBeat, ["radio"]);
    if (s.power.chudOnline) this.say({ kind: "radio_reaction" });
    if (!asksQuestion) return;
    const q: PendingQuestion = {
      id: this.nextQuestionId++,
      origin: "SCRIPT",
      type: "SEED",
      factKey: RADIO_TOPIC.key,
      text: RADIO_TOPIC.question,
      askedAt: this.now,
    };
    if (s.power.chudOnline && !s.chud.pendingQuestion) this.askQuestion(q, true);
    else s.chud.queuedScriptQuestion = q;
  }

  // =========================================================================
  // Commands (section 8.3), location claims (section 8.7)
  // =========================================================================

  pressQuick(cmd: QuickCommand): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || !s.power.chudOnline || s.player.reading !== null) return;
    if (s.player.position.kind !== "DESK" || s.player.view !== "DESK") return;
    if (this.now - s.player.lastQuickAt < this.cfg.QUICK_BUTTON_COOLDOWN - EPS) return;
    s.player.lastQuickAt = this.now;
    let parsed: ParsedCommand;
    if (cmd === "ASK_LOCATION" || cmd === "POWER_OFF") parsed = { command: cmd, entry: null };
    else if (isLockSlot(cmd)) parsed = { command: "LOCK", entry: slotEntry(cmd) };
    else return; // there are no light buttons: lights are the player's own (Shift)
    if (s.chud.pendingQuestion) {
      this.say({ kind: "answer_first" }); // a pending question blocks every ChudGPT command (no suspicion)
      return;
    }
    this.say(this.resolveCommand(parsed));
  }

  private resolveCommand(p: ParsedCommand): Outcome {
    const s = this.state;
    const band = s.chud.band;
    switch (p.command) {
      case "POWER_OFF":
        if (this.effectiveSlot() !== "NONE") this.requestPower("NONE", "player");
        return { kind: "power_off" };
      case "ASK_LOCATION":
        if (this.locationSpam()) return { kind: "location_refused" };
        return { kind: "location_claim", entry: this.locationClaim() };
      case "LOCK": {
        // Section 8.3: a lock request is never gated. CHUD rolls a refusal by its band at this moment (the hijack:
        // a malicious smile and no lock). Re-locking the entry already locked is always confirmed.
        const entry = p.entry!;
        if (this.effectiveSlot() === lockSlot(entry) && band !== "FURIOUS") return { kind: "lock_already", entry };
        const chance = band === "FURIOUS" ? 1 : this.cfg.LOCK_REFUSAL[band];
        if (chance > 0 && (chance >= 1 || this.rng.chance(chance))) {
          this.refuseLock(entry);
          return band === "FURIOUS" ? { kind: "refuse_furious", request: "LOCK" } : { kind: "lock_refused", entry };
        }
        this.requestPower(lockSlot(entry), "player");
        return { kind: "locked", entry };
      }
      default:
        return { kind: "small_talk" };
    }
  }

  // Counts a processed location request in the rolling window. 2nd: small penalty, 3rd and later: bigger penalty,
  // and the 3rd starts a refusal. Returns true when ChudGPT refuses to answer this one.
  private locationSpam(): boolean {
    if (this.isPracticing) return false;
    const t = this.state.timers;
    const c = this.cfg;
    t.locationRequests = t.locationRequests.filter((x) => this.now - x < c.LOCATION_SPAM_WINDOW - EPS);
    t.locationRequests.push(this.now);
    const n = t.locationRequests.length;
    const refusing = this.now < t.locationRefusedUntil - EPS;
    if (n >= 2) this.changeSuspicion(n === 2 ? c.LOCATION_SPAM_PENALTIES[0] : c.LOCATION_SPAM_PENALTIES[1], ["location_spam"]);
    if (n === 3 && !refusing) t.locationRefusedUntil = this.now + c.LOCATION_REFUSE_TIME;
    return refusing || n === 3;
  }

  private refuseLock(entry: Entry): void {
    const s = this.state;
    const r = s.ram;
    if ((r.state === "APPROACHING" || r.state === "AT_ENTRY") && r.target === entry) s.log.visit.refusedEntry = entry;
    this.emit({ type: "LOCK_REFUSED", entry });
  }

  // Section 8.7. One truth-or-lie decision per visit, re-rolled once after a fake-out and once when he gets inside.
  // A lie names another active entry or "no one" (so "he's gone" can be a lie). WARM never lies.
  private locationClaim(): LocationClaim {
    const s = this.state;
    const r = s.ram;
    const band = s.chud.band;
    const active = this.np.activeEntries;
    if (r.state === "AWAY" || r.state === "RETREATING" || !r.target) {
      const claim: LocationClaim = band === "FURIOUS" ? this.rng.pick(active) : "NONE";
      s.chud.lastLocationClaim = claim;
      return claim;
    }
    const inside = r.state === "INSIDE";
    const truth: LocationClaim = inside ? "INSIDE" : r.target;
    let d = s.chud.visitDecision;
    const reusable =
      d !== null &&
      d.visitId === r.visitId &&
      (!r.fakedThisVisit || d.rolledAfterFake) &&
      (!inside || d.rolledInside) &&
      !(band === "FURIOUS" && !d.lie) &&
      !(band === "WARM" && d.lie);
    if (!reusable) {
      const np = this.np;
      const chance = band === "WARM" ? 0 : band === "HURT" ? np.lieChanceHurt : band === "JEALOUS" ? np.lieChanceJealous : 1;
      const others: LocationClaim[] = [...active.filter((e) => e !== truth), "NONE"];
      const lie = chance > 0 && this.rng.chance(chance);
      d = {
        visitId: r.visitId,
        lie,
        entry: lie ? this.rng.pick(others) : truth,
        rolledAfterFake: r.fakedThisVisit,
        rolledInside: inside,
      };
      s.chud.visitDecision = d;
    }
    s.chud.lastLocationClaim = d!.entry;
    if (!inside) s.log.visit.claimThisVisit = d!.entry;
    return d!.entry;
  }

  // =========================================================================
  // Message pipeline (section 9)
  // =========================================================================

  submitMessage(text: string): SubmitResult {
    const s = this.state;
    const c = this.cfg;
    const reject = (reason: RejectReason): SubmitResult => {
      this.emit({ type: "MESSAGE_REJECTED", reason });
      return { ok: false, reason };
    };
    // Step 1: gate checks.
    if (s.phase !== "PLAYING") return reject("NOT_PLAYING");
    if (s.player.reading !== null) return reject("READING");
    if (!s.power.chudOnline) return reject("CHUD_OFFLINE");
    if (s.player.position.kind !== "DESK" || s.player.view !== "DESK") return reject("NOT_AT_DESK");
    if (this.now - s.player.lastMessageAt < c.MESSAGE_RATE_LIMIT - EPS) return reject("RATE_LIMIT");
    if (text.length > c.MAX_MESSAGE_LENGTH) return reject("TOO_LONG");
    const norm = normalize(text);
    if (!norm) return reject("EMPTY");
    // The kill code, typed to CHUD on the last night: checked by code, before the judge or any voice model sees it.
    if (s.run.night === ENDING.CODE_NIGHT && text.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(s.run.killCode)) {
      this.acceptKillCode();
      const ticket: MessageTicket = {
        id: this.nextTicketId++,
        judgeInput: { text: "", pendingQuestion: null, facts: {}, band: s.chud.band },
        repeat: true, // no judge needed, applyJudge is a no-op
        parsed: { command: "NONE", entry: null },
        commandRanImmediately: false,
      };
      return { ok: true, ticket };
    }
    s.player.lastMessageAt = this.now;

    // Step 2: repeat check.
    const recent = s.log.recentMessages;
    const repeat = recent.slice(-c.REPEAT_WINDOW).includes(norm);
    recent.push(norm);
    while (recent.length > Math.max(RECENT_MESSAGES_KEPT, c.REPEAT_WINDOW)) recent.shift();

    // Step 3: keyword parse.
    const parsed = parseCommand(text);
    const id = this.nextTicketId++;
    // Past its 10 s deadline a question only waits for answers already with the judge: a new message cannot answer it.
    const open = s.chud.pendingQuestion;
    const pq = open && this.now < open.askedAt + this.cfg.QUESTION_TIMEOUT - EPS ? open : null;
    const judgeInput = { text, pendingQuestion: pq ? { ...pq } : null, facts: { ...s.chud.facts }, band: s.chud.band };
    if (repeat) {
      const ticket: MessageTicket = { id, judgeInput, repeat: true, parsed, commandRanImmediately: false };
      return { ok: true, ticket };
    }

    // Provisional real message (restored if the judge says gibberish).
    const prevLastReal = s.timers.lastRealMessageAt;
    s.timers.lastRealMessageAt = this.now;
    const seq = ++this.messageSeq;

    // Command timing: run now if the parser found one and no question is pending.
    let ranImmediately = false;
    // The live question decides blocking (as for the map buttons), even during the judge grace when it can no longer be answered.
    if (parsed.command !== "NONE" && !open) {
      this.say(this.resolveCommand(parsed));
      ranImmediately = true;
    }

    this.tickets.set(id, {
      id,
      token: this.nightToken,
      text,
      parsed,
      ranImmediately,
      questionId: pq ? pq.id : null,
      blockedBy: open ? open.id : null,
      prevLastReal,
      seq,
    });
    return { ok: true, ticket: { id, judgeInput, repeat: false, parsed, commandRanImmediately: ranImmediately } };
  }

  applyJudge(ticketId: number, result: JudgeResult | null): void {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    this.tickets.delete(ticketId);
    const s = this.state;
    if (t.token !== this.nightToken || s.phase !== "PLAYING" || !s.power.chudOnline) return;
    const r = result ?? NEUTRAL_JUDGE;
    if (this.isPracticing) {
      if (r.self_harm) {
        s.phase = "SAFETY_PAUSE";
        this.emit({ type: "SAFETY_PAUSE" });
      } else if (!t.ranImmediately && !r.gibberish) {
        this.say({ kind: "small_talk" });
      }
      return;
    }
    const c = this.cfg;
    const S = c.suspicion;

    // The question this message can answer: the one pending at submit, if it is still open.
    let pq: PendingQuestion | null = null;
    if (t.questionId !== null) {
      if (s.chud.pendingQuestion?.id === t.questionId) pq = s.chud.pendingQuestion;
    }

    // Gibberish: no social effects, not a real message. A code-parsed command still runs.
    if (r.gibberish) {
      if (t.seq === this.messageSeq) s.timers.lastRealMessageAt = t.prevLastReal;
      if (!t.ranImmediately && t.parsed.command !== "NONE") this.say(s.chud.pendingQuestion || t.blockedBy !== null ? { kind: "answer_first" } : this.resolveCommand(t.parsed));
      return;
    }

    // Step 5: merge command (code parser wins).
    let cmd: ParsedCommand = { command: "NONE", entry: null };
    if (!t.ranImmediately) {
      if (t.parsed.command !== "NONE") cmd = t.parsed;
      else if (r.command_hint !== "NONE" && (r.command_hint !== "LOCK" || r.entry_hint !== null)) {
        cmd = { command: r.command_hint, entry: r.command_hint === "LOCK" ? r.entry_hint : null };
      }
    }

    // Question result (needed for step 6 deltas).
    let qResult: "pass" | "fail" | null = null;
    if (pq) {
      if (pq.type === "STAY") qResult = r.mentions_leaving ? "fail" : r.answered_question ? "pass" : null;
      else if (pq.type === "SEED") qResult = r.answered_question ? "pass" : null;
      else qResult = r.answered_question ? (r.contradiction ? "fail" : "pass") : null;
    }

    // Step 6: suspicion, clamped per message.
    let delta = 0;
    const reasons: string[] = [];
    const add = (cond: boolean, amount: number, reason: string) => {
      if (!cond) return;
      delta += amount;
      reasons.push(reason);
    };
    add(r.mentions_leaving, S.mentionsLeaving, "leaving");
    add(r.manipulation, S.manipulation, "manipulation");
    add(r.contradiction, S.contradiction, "contradiction");
    add(r.rude, S.rude, "rude");
    add(r.offensive, S.offensive, "offensive");
    if (pq && qResult === "fail") add(pq.type === "MEMORY", S.answerFailed, "answer_failed");
    if (pq && qResult === "pass") {
      if (pq.type === "MEMORY") add(true, S.memoryPassed, "memory_passed");
      else add(!r.contradiction, S.answered, "answered");
    }
    let flattery = false;
    if (r.warm) {
      const wt = s.timers;
      wt.warmTimes = wt.warmTimes.filter((x) => this.now - x < c.FLATTERY_WINDOW - EPS);
      wt.warmTimes.push(this.now);
      if (wt.warmTimes.length >= c.FLATTERY_COUNT) {
        flattery = true;
        add(true, c.FLATTERY_PENALTY, "flattery");
      } else if (this.now - wt.lastWarmBonusAt >= c.WARM_BONUS_COOLDOWN - EPS) {
        add(true, S.warm, "warm");
        wt.lastWarmBonusAt = this.now;
      }
    }
    if (reasons.length) this.changeSuspicion(clamp(delta, c.MESSAGE_CLAMP[0], c.MESSAGE_CLAMP[1]), reasons);

    // Step 7: resolve the question, store facts.
    let commandOutcome: Outcome | null = null;
    let answerOutcome: Outcome | null = null;
    const seedPassed = pq !== null && qResult === "pass" && pq.type === "SEED";
    if (pq && qResult) {
      this.removeQuestion(pq);
      this.emit({ type: "QUESTION_RESOLVED", questionId: pq.id, result: qResult });
      if (seedPassed && pq.factKey) {
        this.storeFact(pq.factKey, r.new_fact?.value ?? t.text.trim().slice(0, FACT_VALUE_MAX));
      }
      answerOutcome = { kind: "answer_ack", pass: qResult === "pass", type: pq.type };
    }
    if (r.new_fact && !seedPassed) this.storeFact(r.new_fact.key, r.new_fact.value);

    // Step 8: resolve the command (answer first, then command).
    // A question still pending (the message did not answer it) blocks the command: answer me first, no suspicion.
    // So does a question that blocked it when it was sent, even if that question cleared while the judge was out:
    // a late verdict must never run a stale command over a lock the player set since.
    if (cmd.command !== "NONE" && s.power.chudOnline) {
      const blocked = s.chud.pendingQuestion !== null || (t.blockedBy !== null && answerOutcome === null);
      commandOutcome = blocked ? { kind: "answer_first" } : this.resolveCommand(cmd);
    }

    // Step 9: exactly one line, picked by priority.
    let line: Outcome | null = null;
    if (r.self_harm) line = commandOutcome;
    else if (r.offensive) line = { kind: "offensive_deflect" };
    else if (r.manipulation) line = { kind: "manipulation_hurt" };
    else if (t.ranImmediately) line = answerOutcome;
    else if (commandOutcome) line = commandOutcome;
    else if (answerOutcome) line = answerOutcome;
    else if (r.mentions_leaving) line = { kind: "leaving_reply" };
    else if (r.rude) line = { kind: "rude_reply" };
    else if (r.warm) line = { kind: flattery ? "flattery_reply" : "warm_reply" };
    else line = { kind: "small_talk" };
    if (line) this.say(line);

    // Step 10: safety pause.
    if (r.self_harm) {
      s.phase = "SAFETY_PAUSE";
      this.emit({ type: "SAFETY_PAUSE" });
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private say(outcome: Outcome): void {
    const band = this.state.chud.band;
    const text = cannedLine(outcome, {
      band,
      name: this.state.chud.facts.name ?? null,
      rand: () => this.isPracticing ? 0 : this.rng.next(),
      avoid: this.isPracticing ? undefined : this.lastLineByKind.get(outcome.kind),
    });
    this.lastLineByKind.set(outcome.kind, text);
    this.emit({ type: "CHUD_SAY", outcome, text, band });
    // A blocked command repeats the pending question, so it is on screen again even if it scrolled away (timer unchanged).
    const pq = this.state.chud.pendingQuestion;
    if (outcome.kind === "answer_first" && pq) this.say({ kind: "question", question: pq.text, type: pq.type });
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private clampNight(n: number): number {
    return clamp(Math.floor(n) || 1, 1, this.cfg.nights.length);
  }
}
