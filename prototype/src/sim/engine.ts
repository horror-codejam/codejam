// Core game engine. Rules: docs/GAME_LOGIC.md sections 3 to 13. Gap fills: prototype/IMPLEMENTATION_NOTES.md.
// Pure TypeScript: no DOM, no wall-clock, no Math.random. All randomness goes through seeded Rngs: one for the game,
// and a separate stream for the decoy noises so they can never depend on Ram (GAME_LOGIC 7.4).
// Every tuning number comes from the Config. The few constants below are rule constants, not tuning knobs.

import { CONFIG, ENDING, nightLength, type Config, type NightParams } from "../config";
import { normalize, parseCommand } from "../chud/parser";
import {
  cannedLine,
  lightQuestion,
  lineClass,
  speechSeconds,
  RADIO_LINES,
  SEED_TOPICS,
  RADIO_TOPIC,
  STAY_QUESTIONS,
  type PracticeLine,
  type SeedTopic,
} from "../chud/lines";
import { Rng } from "./rng";
import { beamAngleAt, beamIntensityAtAzimuth } from "./beam";
import {
  NEUTRAL_JUDGE,
  isLockSlot,
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
const LINE_SEED_SALT = 0x1f3d5b79; // line wording has its own stream, so changing a pool never moves Ram or the lies

// Pacing (GAME_LOGIC 8.10). Priority 1 and 2 lines play at once. Priority 3 (questions) wait for a free moment.
// Priority 4 lines are dropped if they cannot play within LOW_DROP_AFTER seconds.
const LOW_PRIORITY = new Set<Outcome["kind"]>(["entry_repelled"]);
// Lines ChudGPT starts on its own (everything else answers the keeper). They count for the unprompted gap.
const UNPROMPTED = new Set<Outcome["kind"]>([
  "entry_warning", "entry_repelled", "light_cut", "sabotage", "furious_start", "furious_cut", "reboot_back",
  "radio_reaction", "night_opener", "question_timeout", "silence", "question",
]);
const COAST_RE = /coast|guard|rescue|helicopter|pickup|pick up|chopper/i;
const BOAT_RE = /\b(boat|ship|sail|sailing|yacht|vessel)\b/i;

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
  questionId: number | null; // pending question at submit time
  prevLastReal: number; // lastRealMessageAt before this message (gibberish restore)
  seq: number; // message sequence number (gibberish restore only if no later message)
}

function freshVisitLog(): GameState["log"]["visit"] {
  return { sabotaged: false, furiousCut: false, armsGaveOut: false, locationLie: null, refusedEntry: null };
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
  private entryDefense: { since: number; braceSince?: number; lockSince?: number } | null = null;
  private pendingPowerCause: PowerCause = "player";
  private killCode = "";
  private initPapers = 0;
  private lastLineByKind = new Map<string, string>(); // last canned line per outcome kind (no back-to-back repeats)
  private memoryChecked: string[] = []; // MEMORY keys checked this night
  private readonly practiceBeforeNight: boolean;
  private practiceElapsed: number | null = null;
  private practiceReply = false;
  // Pacing state (not game state). See GAME_LOGIC 8.10.
  private lineRng: Rng;
  private busyUntil = 0; // ChudGPT is still speaking its last line until this time (estimated from its length)
  private lastLineAt = 0; // any line, for the quiet limit
  private lastUnpromptedAt = -Infinity;
  private lastQuestionAt = -Infinity;
  private lastExchangeAt = -Infinity; // the keeper's last message, or ChudGPT's last answer to them
  private typing = false;
  private lowQueue: { outcome: Outcome; dropAt: number }[] = [];
  private lastLightQuestion: string | undefined;
  // Optional dev-panel overrides for live tuning. Default null = exact deterministic Config values.
  private beamPeriodOverride: number | null = null;
  private beamPhaseOffset = 0;
  private beamWidthOverride: number | null = null;
  private beamSoftnessOverride: number | null = null;

  constructor(opts: EngineOptions = {}) {
    this.cfg = opts.config ?? CONFIG;
    this.practiceBeforeNight = opts.practiceBeforeNight ?? false;
    this.seed = opts.seed ?? DEFAULT_SEED;
    this.rng = new Rng(this.seed);
    this.decoyRng = new Rng(this.seed ^ DECOY_SEED_SALT);
    this.lineRng = new Rng(this.seed ^ LINE_SEED_SALT);
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
    return this.defenseAt(entry) !== null;
  }

  private defenseAt(entry: Entry): Extract<GameEvent, { type: "RAM_REPELLED" }>["how"] | null {
    const { player, power } = this.state;
    const p = player.position;
    const braced = p.kind === "HOLDING" && p.entry === entry;
    const locked = power.slot === lockSlot(entry) && power.chudOnline;
    if (braced) return locked ? "both" : "brace";
    return locked ? "lock" : null;
  }

  // Rotating ceiling lamp (GAME_LOGIC 6.1): deterministic from night or practice time.
  // Dev panel period slider adjusts phase offset so the beam never jumps while tuning.
  beamAngle(at = this.now): number {
    if (this.beamPeriodOverride === null && this.beamPhaseOffset === 0) {
      return beamAngleAt(at, this.cfg);
    }
    const period = this.beamPeriodOverride ?? this.cfg.BEAM_PERIOD;
    return beamAngleAt(at, { ...this.cfg, BEAM_PERIOD: period }) + this.beamPhaseOffset;
  }

  get visualTime(): number {
    return this.now + this.acc;
  }

  isLampOn(): boolean {
    const p = this.state.power;
    return p.generatorOn && p.rebootingUntil === null && p.lampCutUntil === null;
  }

  beamIntensity(entry: Entry, at = this.now): number {
    if (!this.isLampOn()) return 0;
    return beamIntensityAtAzimuth(
      this.cfg.BEAM_ENTRY_AZIMUTHS[entry],
      this.beamAngle(at),
      this.beamWidthOverride ?? this.cfg.BEAM_WIDTH,
      this.beamSoftnessOverride ?? this.cfg.BEAM_SOFTNESS,
    );
  }

  beamViewIntensity(view: View, at = this.now): number {
    if (!this.isLampOn()) return 0;
    return beamIntensityAtAzimuth(
      this.cfg.BEAM_VIEW_AZIMUTHS[view],
      this.beamAngle(at),
      this.beamWidthOverride ?? this.cfg.BEAM_WIDTH,
      this.beamSoftnessOverride ?? this.cfg.BEAM_SOFTNESS,
    );
  }

  private beamLit(entry: Entry, at = this.now): boolean {
    return this.beamIntensity(entry, at) >= this.cfg.BEAM_REVEAL_THRESHOLD;
  }

  // Dev panel live beam tuning. Preserves continuity when changing period; reset restores exact config math.
  devSetBeam(opts: { period?: number | null; width?: number | null; softness?: number | null; reset?: boolean }): void {
    if (opts.reset) {
      this.beamPeriodOverride = null;
      this.beamPhaseOffset = 0;
      this.beamWidthOverride = null;
      this.beamSoftnessOverride = null;
      return;
    }
    if (opts.period !== undefined) {
      const t = this.visualTime;
      const before = this.beamAngle(t);
      this.beamPeriodOverride = opts.period;
      const nextPeriod = opts.period ?? this.cfg.BEAM_PERIOD;
      const raw = beamAngleAt(t, { ...this.cfg, BEAM_PERIOD: nextPeriod });
      this.beamPhaseOffset = before - raw;
    }
    if (opts.width !== undefined) this.beamWidthOverride = opts.width;
    if (opts.softness !== undefined) this.beamSoftnessOverride = opts.softness;
  }

  // Section 7.4. He is visible only while the rotating beam is on him.
  ramVisual(view: View): RamVisual {
    if (view === "DESK") return "none";
    const r = this.state.ram;
    const lit = this.beamLit(view);
    if (r.state === "INSIDE") return r.inside?.entry === view && lit ? "inside" : "none";
    if (r.state === "AT_ENTRY" && r.target === view) return lit ? "tell_clear" : "none";
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
    if (this.practiceBeforeNight) {
      this.rng.next(); // Preserve the first night's seed sequence after replacing the old name acknowledgment.
      s.chud.suspicion = 0;
      s.chud.band = "WARM";
      s.phase = "PLAYING";
      this.practiceElapsed = 0;
    } else {
      this.say({ kind: "name_ack" });
      this.startNight(1, s.run.factsCheckpoint);
    }
  }

  get isPracticing(): boolean {
    return this.practiceElapsed !== null;
  }

  sayPracticeLine(line: PracticeLine): void {
    if (!this.isPracticing) return;
    if (line === "chat") this.practiceReply = true;
    this.say({ kind: "practice_line", line });
  }

  stagePracticeVisit(entry: Entry): void {
    if (!this.isPracticing || this.state.phase !== "PLAYING" || this.state.ram.state === "AT_ENTRY") return;
    const { ram, power, log } = this.state;
    const slot = lockSlot(entry);
    if (power.slot === slot || power.pending?.target === slot) this.cutPower("player");
    ram.state = "AT_ENTRY";
    ram.target = entry;
    ram.stateEndsAt = Infinity;
    ram.visitId++;
    log.visit = freshVisitLog();
    this.entryDefense = null;
    this.syncEntryDefense();
    this.emit({ type: "RAM_AT_ENTRY", visitId: ram.visitId, entry });
  }

  private stepPracticeVisit(): void {
    const { ram } = this.state;
    if (ram.state === "RETREATING" && this.due(ram.stateEndsAt)) {
      ram.state = "AWAY";
      ram.target = null;
      ram.stateEndsAt = Infinity;
      this.emit({ type: "RAM_AWAY", nextVisitAt: Infinity });
    }
    if (ram.state === "AT_ENTRY" && ram.target === "WINDOW" && this.isDefended("WINDOW")) {
      this.retreatFrom("WINDOW", this.now);
    }
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
    // Night 1 opener ends with the night's first question so the keeper has something to answer at 12:00 AM.
    if (s.run.night === 1 && s.chud.questionPlan.length > 0 && !s.chud.questionPlan[0].asked) {
      const first = s.chud.questionPlan[0];
      first.asked = true;
      const q = this.makeQuestion(first.type, "SCHEDULED", this.lineRng);
      this.askQuestion(q, false);
      this.say({ kind: "night_opener", night: 1, question: q.text });
      return;
    }
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
    this.syncEntryDefense();
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
    this.practiceReply = false;
    Object.assign(this.state, this.freshState(night, checkpoint));
    this.nightToken++;
    this.tickets.clear();
    this.acc = 0;
    this.beamPhaseOffset = 0;
    this.awayStartedAt = 0;
    this.entryDefense = null;
    this.pendingPowerCause = "player";
    this.memoryChecked = [];
    this.nightStarts++;
    this.lineRng = new Rng((this.seed ^ LINE_SEED_SALT) + this.nightStarts * 104729);
    this.busyUntil = 0;
    this.lastLineAt = 0;
    this.lastUnpromptedAt = -Infinity;
    this.lastQuestionAt = -Infinity;
    this.lastExchangeAt = -Infinity;
    this.typing = false;
    this.lowQueue = [];
    this.lastLightQuestion = undefined;
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
      },
      // Night start: nothing locked, rotating ceiling lamp running (GAME_LOGIC 5.1).
      power: { slot: "NONE", pending: null, chudOnline: true, generatorOn: true, rebootingUntil: null, lightCutAt: null, lampCutUntil: null },
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
      log: { recentMessages: [], visit: freshVisitLog(), scriptedFired: [] },
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
    const lie = v.locationLie?.actual === entry ? v.locationLie : null;
    let cause: LossCause;
    if (!s.power.generatorOn || s.power.rebootingUntil !== null) cause = "POWER_OFF";
    else if (v.furiousCut) cause = "FURIOUS";
    else if (v.sabotaged) cause = "SABOTAGE";
    else if (v.refusedEntry === entry) cause = "REFUSED";
    else if (lie) cause = "LIED";
    else if (v.armsGaveOut) cause = "ARMS_GAVE_OUT";
    else if (heldOther) cause = "WRONG_HOLD";
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
      lastClaim: cause === "LIED" && lie ? lie.claim : null,
    };
    this.emit({ type: "RAM_INSIDE", entry, trigger });
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

  // Looking at his entry from the desk while the rotating beam passes over him.
  private lookingAtLit(entry: Entry): boolean {
    const s = this.state;
    return s.player.reading === null && s.player.position.kind === "DESK" && s.player.view === entry && this.beamLit(entry);
  }

  // Always-on scare triggers while he is inside, checked every step (section 7.7).
  private stepInside(): void {
    const s = this.state;
    const inside = s.ram.state === "INSIDE" ? s.ram.inside : null;
    if (!inside) return;
    const p = s.player.position;
    if ((p.kind === "STANDING" || p.kind === "HOLDING") && p.entry === inside.entry) {
      this.scare("ARRIVED", this.beamLit(inside.entry));
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
    this.beamPhaseOffset = 0;
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

    // Credit the elapsed defense before this tick's relay or arms timer can end it.
    this.stepRepel();
    this.landRelay();
    this.stepPlayer();
    if (this.isPracticing) {
      this.stepPracticeVisit();
      return;
    }
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
    this.stepDecoys();
    this.stepQuestionTimeouts();
    this.stepSilence();
    this.stepLowLines();
    this.stepQuestions();
    this.tryFuriousCut();
    this.stepSabotage();
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
    const { power: p, ram, log } = this.state;
    if (p.pending && this.due(p.pending.landsAt)) {
      p.slot = p.pending.target;
      p.pending = null;
      this.syncEntryDefense();
      if (ram.target && p.slot === lockSlot(ram.target)) {
        log.visit.sabotaged = false;
        log.visit.furiousCut = false;
        log.visit.refusedEntry = null;
      }
      this.emit({ type: "POWER_CHANGED", slot: p.slot, cause: this.pendingPowerCause });
    }
  }

  private cutPower(cause: PowerCause): void {
    const p = this.state.power;
    p.slot = "NONE";
    p.pending = null;
    this.syncEntryDefense();
    this.emit({ type: "POWER_CHANGED", slot: "NONE", cause });
  }

  toggleGenerator(): void {
    const s = this.state;
    if (this.isPracticing || s.phase !== "PLAYING" || s.player.position.kind !== "DESK" || s.player.reading !== null) return;
    if (s.power.generatorOn) {
      s.power.generatorOn = false;
      s.power.rebootingUntil = null;
      s.power.lightCutAt = null;
      s.power.lampCutUntil = null;
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
      s.power.lightCutAt = null;
      s.power.lampCutUntil = null;
      this.emit({ type: "GENERATOR", on: true });
    }
  }

  private stepReboot(): void {
    const s = this.state;
    if (s.power.rebootingUntil === null || !this.due(s.power.rebootingUntil)) return;
    s.power.rebootingUntil = null;
    s.power.chudOnline = true;
    this.syncEntryDefense();
    this.emit({ type: "CHUD_ONLINE", online: true });
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
    if (view === "DESK") s.power.lightCutAt = null;
    else this.rollLightCut();
    this.onPlayerMove();
  }

  // CHUD can stop the rotating ceiling lamp for LIGHT_CUT_DURATION when the player turns away to check an entry.
  private rollLightCut(): void {
    if (this.isPracticing) return;
    const s = this.state;
    const p = s.power;
    if (!this.isLampOn() || p.lightCutAt !== null) return;
    const chance = this.cfg.LIGHT_CUT[s.chud.band];
    const online = p.chudOnline && p.rebootingUntil === null;
    p.lightCutAt = online && chance > 0 && this.rng.chance(chance) ? this.now + this.rng.range(...this.cfg.LIGHT_CUT_DELAY) : null;
  }

  private stepLightCut(): void {
    const s = this.state;
    const p = s.power;
    if (p.lampCutUntil !== null && this.due(p.lampCutUntil)) {
      p.lampCutUntil = null;
      this.emit({ type: "LAMP_RESTORED" });
    }
    if (p.lightCutAt === null || !this.due(p.lightCutAt)) return;
    p.lightCutAt = null;
    if (!p.generatorOn || !p.chudOnline || p.rebootingUntil !== null || s.chud.band === "WARM" || p.lampCutUntil !== null) return;
    p.lampCutUntil = this.now + this.cfg.LIGHT_CUT_DURATION;
    this.emit({ type: "LIGHT_CUT", band: s.chud.band, until: p.lampCutUntil });
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
    this.syncEntryDefense();
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
      this.syncEntryDefense();
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
      this.syncEntryDefense();
      this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
    } else if (p.kind === "HOLDING" && this.due(p.since + this.cfg.HOLD_MAX)) {
      this.endHold("arms");
    } else if (p.kind === "RETURNING" && this.due(p.until)) {
      s.player.position = { kind: "DESK" };
      this.emit({ type: "PLAYER_MOVED", position: { kind: "DESK" } });
      if (s.player.view !== "DESK") {
        s.player.view = "DESK";
        s.power.lightCutAt = null;
        this.emit({ type: "VIEW", view: "DESK" });
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
    const entry = r.target!;
    const [lo, hi] = this.np.atEntryTime;
    r.state = "AT_ENTRY";
    r.attemptLength = this.rng.range(lo, hi); // random per visit, so the end moment cannot be counted (section 4)
    r.stateEndsAt = r.stateEndsAt + r.attemptLength;
    this.entryDefense = null;
    this.syncEntryDefense();
    this.emit({ type: "RAM_AT_ENTRY", visitId: r.visitId, entry });
    if (s.phase !== "PLAYING") return;
    if (s.run.night === 1 && s.power.chudOnline) this.say({ kind: "entry_warning", entry });
    this.tryFuriousCut();
  }

  private syncEntryDefense(): void {
    const r = this.state.ram;
    if (r.state !== "AT_ENTRY" || r.target === null) return;
    const how = this.defenseAt(r.target);
    if (how === null) {
      this.entryDefense = null;
      return;
    }
    const previous = this.entryDefense;
    const braceSince = how === "lock" ? undefined : previous?.braceSince ?? this.now;
    const lockSince = how === "brace" ? undefined : previous?.lockSince ?? this.now;
    // An instantaneous handoff does not overlap. Keep time only through a source that was already active.
    const oldestSource = Math.min(braceSince ?? Infinity, lockSince ?? Infinity);
    const since = previous && oldestSource < this.now - EPS ? previous.since : this.now;
    this.entryDefense = { since, braceSince, lockSince };
  }

  private stepRepel(): void {
    const s = this.state;
    const r = s.ram;
    const entry = r.target;
    if (r.state !== "AT_ENTRY" || entry === null || !this.entryDefense) return;
    if (this.isPracticing && entry === "WINDOW") return; // The window lesson ends when its relay lands.
    const repelAt = this.entryDefense.since + this.np.repelTime;
    if (!this.due(repelAt) || repelAt > r.stateEndsAt + EPS) return;
    const how = this.defenseAt(entry);
    if (how === null) return;
    this.emit({ type: "RAM_REPELLED", visitId: r.visitId, entry, how });
    this.retreatFrom(entry, repelAt);
    if (!this.isPracticing && s.run.night === 1 && s.power.chudOnline) this.say({ kind: "entry_repelled" });
  }

  private resolveAttempt(): void {
    const s = this.state;
    const r = s.ram;
    const entry = r.target!;
    if (!this.isDefended(entry)) {
      this.goInside(entry);
      return;
    }
    this.retreatFrom(entry, r.stateEndsAt);
  }

  private retreatFrom(entry: Entry, at: number): void {
    const s = this.state;
    const r = s.ram;
    this.entryDefense = null;
    r.state = "RETREATING";
    r.stateEndsAt = at + this.cfg.RETREAT_TIME;
    this.emit({ type: "RAM_RETREAT", visitId: r.visitId, entry });
    if (this.isPracticing) return;
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
    // This cut only hits locks, including a lock on its way.
    const p = s.power;
    const targetLock = lockSlot(r.target!);
    if (p.slot !== "NONE" || (p.pending && p.pending.target !== "NONE")) {
      s.log.visit.furiousCut = p.slot === targetLock || p.pending?.target === targetLock;
      this.cutPower("furious");
    }
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
    // No spoken remark: ChudGPT's voice during silence is the quiet-limit light question (GAME_LOGIC 8.10).
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

  private pickSeedTopic(rng: Rng = this.rng): SeedTopic | null {
    const c = this.state.chud;
    const free = SEED_TOPICS.filter((t) => !hasOwn(c.facts, t.key) && !c.usedSeedKeys.includes(t.key));
    return free.length ? rng.pick(free) : null;
  }

  // MEMORY checks only keys that have a memory question (SEED_TOPICS or RADIO_TOPIC), never `name`.
  private pickMemoryTopic(rng: Rng = this.rng): SeedTopic | null {
    const facts = this.state.chud.facts;
    const known = ALL_TOPICS().filter((t) => t.key !== "name" && hasOwn(facts, t.key));
    if (!known.length) return null;
    const fresh = known.filter((t) => !this.memoryChecked.includes(t.key));
    return rng.pick(fresh.length ? fresh : known);
  }

  private makeQuestion(type: QuestionType, origin: PendingQuestion["origin"], rng: Rng = this.rng): PendingQuestion {
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
      const topic = this.pickMemoryTopic(rng);
      if (topic) {
        this.memoryChecked.push(topic.key);
        return q("MEMORY", topic.key, topic.memoryQuestion);
      }
      type = "SEED";
    }
    if (type === "SEED") {
      const topic = this.pickSeedTopic(rng);
      if (topic) {
        c.usedSeedKeys.push(topic.key);
        return q("SEED", topic.key, topic.question);
      }
    }
    return q("STAY", null, rng.pick(STAY_QUESTIONS));
  }

  private askQuestion(q: PendingQuestion, speak: boolean): void {
    q.askedAt = this.now;
    this.lastQuestionAt = this.now;
    this.state.chud.pendingQuestion = q;
    this.emit({ type: "QUESTION_ASKED", question: { ...q } });
    if (speak) this.emitLine({ kind: "question", question: q.text, type: q.type });
  }

  // True while the keeper is at the desk with text in the chat (the UI reports it with setTyping).
  private get keeperTyping(): boolean {
    const p = this.state.player;
    return this.typing && p.position.kind === "DESK" && p.view === "DESK";
  }

  private get calm(): boolean {
    const st = this.state.ram.state;
    return st === "AWAY" || st === "RETREATING";
  }

  // The common holds on anything ChudGPT starts on its own (GAME_LOGIC 8.10 rule 1).
  private canStartUnprompted(needGap: boolean): boolean {
    const s = this.state;
    if (!s.power.chudOnline || s.chud.pendingQuestion) return false;
    if (this.now < this.busyUntil - EPS || this.keeperTyping) return false;
    return !needGap || this.now - this.lastUnpromptedAt >= this.cfg.PACING.UNPROMPTED_GAP - EPS;
  }

  // Priority 3. A question waits for a free moment: not while speaking, typing or another question is open, not within
  // 12 s of its last unprompted line, not within 15 s of the keeper's last exchange. Scheduled ones are also at least
  // scheduledQuestionMinSpacing after the last question. The radio question skips the exchange and spacing holds.
  private questionFree(kind: "SCHEDULED" | "SCRIPT" | "QUIET", dueAt = this.now): boolean {
    if (!this.canStartUnprompted(true)) return false;
    // A talkative keeper cannot dodge a due question forever: the exchange hold ends EXCHANGE_HOLD_MAX after it fell due.
    const overdue = this.now - dueAt >= this.cfg.PACING.EXCHANGE_HOLD_MAX - EPS;
    if (kind !== "SCRIPT" && !overdue && this.now - this.lastExchangeAt < this.cfg.PACING.EXCHANGE_GAP - EPS) return false;
    if (kind === "SCHEDULED" && this.now - this.lastQuestionAt < this.cfg.scheduledQuestionMinSpacing - EPS) return false;
    return true;
  }

  private stepQuestions(): void {
    const s = this.state;
    if (!s.power.chudOnline || s.chud.pendingQuestion) return;
    if (s.chud.queuedScriptQuestion) {
      if (!this.np.questionsMayLandDuringAttempt && s.ram.state === "AT_ENTRY") return;
      if (!this.questionFree("SCRIPT")) return;
      const q = s.chud.queuedScriptQuestion;
      s.chud.queuedScriptQuestion = null;
      this.askQuestion(q, true);
      return;
    }
    const item = s.chud.questionPlan.find((it) => !it.asked && this.due(it.dueAt));
    if (item && (this.np.questionsMayLandDuringAttempt || s.ram.state !== "AT_ENTRY")) {
      if (!this.questionFree("SCHEDULED", item.dueAt)) return;
      item.asked = true;
      this.askQuestion(this.makeQuestion(item.type, "SCHEDULED"), true);
      return;
    }
    this.stepQuietQuestion();
  }

  // Never too distant (GAME_LOGIC 8.10 rule 4): after the night's quiet limit without a ChudGPT line, and only while
  // calm, ChudGPT asks one light question. Before Night 1's first visit, use the lower early quiet limit so the
  // opening minute never drags in silence. It stores no fact: any real answer passes.
  private stepQuietQuestion(): void {
    const s = this.state;
    if (!this.calm || s.chud.queuedScriptQuestion) return;
    const limit =
      s.run.night === 1 && s.ram.visitId === 0
        ? this.cfg.NIGHT1_EARLY_QUIET_LIMIT
        : (this.cfg.QUIET_LIMIT[s.run.night - 1] ?? 50);
    if (this.now - this.lastLineAt < limit - EPS) return;
    if (!this.questionFree("QUIET")) return;
    const text = lightQuestion(s.chud.band, () => this.lineRng.next(), this.lastLightQuestion);
    this.lastLightQuestion = text;
    this.askQuestion(
      { id: this.nextQuestionId++, origin: "QUIET", type: "SEED", factKey: null, text, askedAt: this.now },
      true,
    );
  }

  private stepQuestionTimeouts(): void {
    const c = this.state.chud;
    const limit = this.cfg.QUESTION_TIMEOUT;
    if (c.pendingQuestion && this.due(c.pendingQuestion.askedAt + limit)) this.timeoutQuestion(c.pendingQuestion);
  }

  private timeoutQuestion(q: PendingQuestion): void {
    this.removeQuestion(q);
    const penalty = q.origin === "QUIET" ? this.cfg.LIGHT_QUESTION_TIMEOUT_PENALTY : this.cfg.suspicion.questionTimeout;
    this.changeSuspicion(penalty, ["question_timeout"]);
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
    const radioText = RADIO_LINES[s.run.night] ?? "";
    this.emit({ type: "RADIO", text: radioText });
    this.changeSuspicion(this.cfg.suspicion.radioBeat, ["radio"]);
    if (!asksQuestion) {
      if (s.power.chudOnline) this.say({ kind: "radio_reaction" });
      return;
    }
    // Wait for the radio clip to finish before ChudGPT asks about it, so it does not talk over the broadcast.
    if (radioText) this.busyUntil = Math.max(this.busyUntil, this.now + speechSeconds(radioText));
    // The radio question is the reaction. It waits for a free moment (stepQuestions) instead of stacking on a line.
    const q: PendingQuestion = {
      id: this.nextQuestionId++,
      origin: "SCRIPT",
      type: "SEED",
      factKey: RADIO_TOPIC.key,
      text: RADIO_TOPIC.question,
      askedAt: this.now,
    };
    s.chud.queuedScriptQuestion = q;
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
    else return; // there are no light buttons: lighting comes from the rotating ceiling lamp
    this.sayCommand(this.resolveCommand(parsed));
  }

  private sayCommand(outcome: Outcome): void {
    // The window lesson gives its confirmation after the relay lands and the visit ends.
    if (outcome.kind === "locked" && outcome.entry === "WINDOW" && this.activePracticeVisit("WINDOW")) return;
    this.say(outcome);
  }

  private activePracticeVisit(entry: Entry): boolean {
    const { ram } = this.state;
    return this.isPracticing && ram.state === "AT_ENTRY" && ram.target === entry;
  }

  private resolveCommand(p: ParsedCommand): Outcome {
    const s = this.state;
    const band = s.chud.band;
    if (s.chud.pendingQuestion) {
      if (p.command === "LOCK" && p.entry) this.recordLockRefusal(p.entry);
      return { kind: "answer_first" };
    }
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
        if (entry === "HATCH" && this.activePracticeVisit(entry)) return { kind: "practice_line", line: "hatchRefusal" };
        if (this.effectiveSlot() === lockSlot(entry) && band !== "FURIOUS") return { kind: "lock_already", entry };
        const chance = band === "FURIOUS" ? 1 : this.cfg.LOCK_REFUSAL[band];
        if (chance > 0 && (chance >= 1 || this.rng.chance(chance))) {
          this.recordLockRefusal(entry);
          this.emit({ type: "LOCK_REFUSED", entry });
          return band === "FURIOUS" ? { kind: "refuse_furious", request: "LOCK", entry } : { kind: "lock_refused", entry };
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

  private recordLockRefusal(entry: Entry): void {
    const s = this.state;
    const r = s.ram;
    if ((r.state === "APPROACHING" || r.state === "AT_ENTRY") && r.target === entry && this.effectiveSlot() !== lockSlot(entry)) {
      s.log.visit.refusedEntry = entry;
    }
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
    this.lastExchangeAt = this.now;

    // Step 2: repeat check.
    const recent = s.log.recentMessages;
    const repeat = recent.slice(-c.REPEAT_WINDOW).includes(norm);
    recent.push(norm);
    while (recent.length > Math.max(RECENT_MESSAGES_KEPT, c.REPEAT_WINDOW)) recent.shift();

    // Step 3: keyword parse.
    const parsed: ParsedCommand = this.practiceReply ? { command: "NONE", entry: null } : parseCommand(text);
    const id = this.nextTicketId++;
    const pq = s.chud.pendingQuestion;
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
    if (parsed.command !== "NONE" && !pq) {
      this.sayCommand(this.resolveCommand(parsed));
      ranImmediately = true;
    }

    this.tickets.set(id, {
      id,
      token: this.nightToken,
      text,
      parsed,
      ranImmediately,
      questionId: pq ? pq.id : null,
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
      } else if (!this.practiceReply && !t.ranImmediately && !r.gibberish) {
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
      if (!t.ranImmediately && t.parsed.command !== "NONE") this.say(this.resolveCommand(t.parsed));
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
      const echo = pq.factKey && (seedPassed || pq.type === "MEMORY") ? s.chud.facts[pq.factKey] : undefined;
      answerOutcome = { kind: "answer_ack", pass: qResult === "pass", type: pq.type, value: echo };
    }
    if (r.new_fact && !seedPassed) this.storeFact(r.new_fact.key, r.new_fact.value);

    // Step 8: resolve the command (answer first, then command).
    // A question still pending (the message did not answer it) blocks the command: answer me first, no suspicion.
    if (cmd.command !== "NONE" && s.power.chudOnline) {
      commandOutcome = this.resolveCommand(cmd);
    }

    // Step 9: exactly one line, picked by priority.
    let line: Outcome | null = null;
    if (r.self_harm) line = commandOutcome;
    else if (r.offensive) line = { kind: "offensive_deflect" };
    else if (r.manipulation) line = { kind: "manipulation_hurt" };
    else if (t.ranImmediately) line = answerOutcome;
    else if (commandOutcome) line = commandOutcome;
    else if (answerOutcome) line = answerOutcome;
    else if (r.mentions_leaving) line = { kind: "leaving_reply", topic: COAST_RE.test(t.text) ? "coast" : BOAT_RE.test(t.text) ? "boat" : undefined };
    else if (r.rude) line = { kind: "rude_reply" };
    else if (r.asks_help) line = { kind: "help_reply", entry: s.ram.state === "AT_ENTRY" ? s.ram.target : null };
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

  // Entry point for every ChudGPT line except questions. Priority 1 and 2 play at once, priority 4 waits up to 3 s.
  private say(outcome: Outcome): void {
    if (this.isPracticing || !LOW_PRIORITY.has(outcome.kind)) {
      this.emitLine(outcome);
      return;
    }
    if (this.lowQueue.some((l) => l.outcome.kind === outcome.kind)) return;
    this.lowQueue.push({ outcome, dropAt: this.now + this.cfg.PACING.LOW_DROP_AFTER });
    this.stepLowLines();
  }

  // Lowest priority lines (idle silence remark, "it's gone" after a repel) play only in a free moment, else are dropped.
  private stepLowLines(): void {
    if (this.lowQueue.length === 0) return;
    const keep: typeof this.lowQueue = [];
    for (const item of this.lowQueue) {
      if (this.canStartUnprompted(false)) this.emitLine(item.outcome);
      else if (this.now < item.dropAt - EPS && this.state.power.chudOnline) keep.push(item);
    }
    this.lowQueue = keep;
  }

  private emitLine(outcome: Outcome): void {
    const { chud, ram, log } = this.state;
    if (outcome.kind === "location_claim" && (ram.state === "APPROACHING" || ram.state === "AT_ENTRY") && ram.target) {
      log.visit.locationLie = chud.visitDecision?.lie && outcome.entry !== "INSIDE"
        ? { claim: outcome.entry, actual: ram.target }
        : null;
    }
    const band = this.state.chud.band;
    const practicing = this.isPracticing;
    const calm = outcome.kind === "location_claim" && ram.state === "APPROACHING" ? true : this.calm;
    const active = this.np.activeEntries;
    const text = cannedLine(outcome, {
      band,
      name: this.state.chud.facts.name ?? null,
      rand: () => (practicing ? 0 : this.lineRng.next()),
      avoid: practicing ? undefined : this.lastLineByKind.get(outcome.kind),
      calm: practicing ? true : calm,
      entryHint: practicing ? undefined : active[Math.floor(this.lineRng.next() * active.length)],
    });
    const unprompted = UNPROMPTED.has(outcome.kind);
    if (!practicing) {
      this.lastLineByKind.set(outcome.kind, text);
      this.busyUntil = this.now + speechSeconds(text);
      this.lastLineAt = this.now;
      if (unprompted) this.lastUnpromptedAt = this.now;
      else this.lastExchangeAt = this.now;
    }
    this.emit({ type: "CHUD_SAY", outcome, text, band, lineClass: lineClass(outcome.kind), unprompted });
  }

  setTyping(on: boolean): void {
    this.typing = on;
  }

  // The UI reworded a line (the voice model) and showed it now: ChudGPT is busy for its length.
  noteSpoken(text: string): void {
    this.busyUntil = Math.max(this.busyUntil, this.now + speechSeconds(text));
    this.lastLineAt = Math.max(this.lastLineAt, this.now);
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private clampNight(n: number): number {
    return clamp(Math.floor(n) || 1, 1, this.cfg.nights.length);
  }
}
