// Core game engine. Rules: docs/GAME_LOGIC.md sections 3 to 13. Gap fills: prototype/IMPLEMENTATION_NOTES.md.
// Pure TypeScript: no DOM, no wall-clock, no Math.random. All randomness goes through one seeded Rng.
// Every tuning number comes from the Config. The few constants below are rule constants, not tuning knobs.

import { CONFIG, nightLength, type Config, type NightParams } from "../config";
import { normalize, parseCommand } from "../chud/parser";
import {
  cannedLine,
  ramShout,
  voiceLog,
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
  lockSlot,
  type Band,
  type EngineOptions,
  type Entry,
  type Facts,
  type GameEvent,
  type GameState,
  type IGameEngine,
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
  type SubmitResult,
  type View,
} from "./types";

// ---------------------------------------------------------------------------
// Rule constants (not tuning)
// ---------------------------------------------------------------------------

const EPS = 1e-6; // float tolerance for "due at" comparisons
const DEFAULT_SEED = 1337;
const SUSPICION_MIN = 0;
const SUSPICION_MAX = 100; // section 8.1
const RECENT_MESSAGES_KEPT = 10; // section 3 log: last 10 player messages
const FACT_VALUE_MAX = 60; // IMPLEMENTATION_NOTES Questions: raw-text fact fallback
const NO_REPEAT_TARGET_NIGHT = 1; // section 7.2

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
  return { sabotaged: false, furiousCut: false, armsGaveOut: false, claimThisVisit: null };
}

export class GameEngine implements IGameEngine {
  readonly state: GameState;

  private readonly cfg: Config;
  private readonly seed: number;
  private readonly rng: Rng;
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
  private memoryChecked: string[] = []; // MEMORY keys checked this night

  constructor(opts: EngineOptions = {}) {
    this.cfg = opts.config ?? CONFIG;
    this.seed = opts.seed ?? DEFAULT_SEED;
    this.rng = new Rng(this.seed);
    this.state = {} as GameState;
    const night = this.clampNight(opts.startNight ?? 1);
    const facts: Facts = { ...(opts.facts ?? {}) };
    if (opts.skipNamePrompt || night > 1) {
      this.startNight(night, facts);
    } else {
      Object.assign(this.state, this.freshState(night, facts));
      this.state.phase = "NAME_PROMPT";
    }
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

  ramVisual(view: View): RamVisual {
    if (view === "DESK") return "none";
    const r = this.state.ram;
    const beam = this.state.power.slot === "BEAM";
    if (r.state === "AT_ENTRY" && r.target === view) return beam ? "tell_clear" : "tell_faint";
    if (r.state === "APPROACHING" && r.target === view && beam) return "approach_silhouette";
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
    this.startNight(1, s.run.factsCheckpoint);
  }

  beginNight(): void {
    const s = this.state;
    if (s.phase !== "NIGHT_CARD") return;
    s.phase = "PLAYING";
    s.timers.lastRealMessageAt = this.now;
    this.emit({ type: "NIGHT_START", night: s.run.night });
    this.say({ kind: "night_opener", night: s.run.night });
  }

  // From the loss screen, or "Restart night" in the UI pause menu (phase PLAYING).
  retryNight(): void {
    const s = this.state;
    if (s.phase !== "BREACH" && s.phase !== "PLAYING") return;
    this.startNight(s.run.night, s.run.factsCheckpoint);
  }

  nextNight(): void {
    const s = this.state;
    if (s.phase !== "NIGHT_WON") return;
    if (s.run.night >= this.cfg.nights.length) {
      s.phase = "GAME_WON";
      this.emit({ type: "GAME_WON" });
      return;
    }
    this.startNight(s.run.night + 1, s.run.factsCheckpoint);
  }

  jumpToNight(n: number): void {
    this.startNight(this.clampNight(n), { ...this.state.chud.facts });
  }

  // ---- Dev methods (dev panel only, never called by the game rules). Pure state edits: no DOM, no clock, no Math.random.

  // Advances the clock through normal ticks until 1 s before 6 AM. Ram is held away during the skip (any visit is cancelled)
  // so nobody is breached for not defending skipped minutes; CHUD, questions and radio still run. Ram is due again after the skip.
  devSkipToLastSecond(): void {
    const target = nightLength(this.cfg) - 1;
    if (this.state.phase !== "PLAYING" || this.now >= target - EPS) return;
    this.devRamAway();
    this.state.ram.stateEndsAt = Infinity;
    while (this.state.phase === "PLAYING" && this.now < target - EPS) this.tick(this.cfg.TICK);
    if (this.state.phase === "PLAYING") this.state.ram.stateEndsAt = this.now + this.np.awayGap[0];
  }

  // Ends the night as a win right now (NIGHT_WON, or GAME_WON on the last night).
  devWinNight(): void {
    if (this.state.phase === "PLAYING") this.winNight();
  }

  // Starts a Ram visit to `entry` now, with the night's normal approach time. Only while Ram is AWAY. Returns false otherwise.
  devSendRam(entry: Entry): boolean {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.ram.state !== "AWAY") return false;
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
    r.fakeOutAt = null;
    r.pendingPull = 0;
    r.stateEndsAt = this.now + this.np.awayGap[0];
    this.awayStartedAt = this.now;
    this.emit({ type: "RAM_AWAY", nextVisitAt: r.stateEndsAt });
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
    Object.assign(this.state, this.freshState(night, checkpoint));
    this.nightToken++;
    this.tickets.clear();
    this.acc = 0;
    this.awayStartedAt = 0;
    this.pendingPowerCause = "player";
    this.memoryChecked = [];
    this.emit({ type: "NIGHT_CARD", night, voiceLog: voiceLog(night) });
  }

  private freshState(night: number, checkpoint: Facts): GameState {
    const np = this.cfg.nights[night - 1];
    const suspicion = clamp(np.startingSuspicion, SUSPICION_MIN, SUSPICION_MAX);
    return {
      phase: "NIGHT_CARD",
      run: { night, factsCheckpoint: { ...checkpoint }, seed: this.seed },
      clock: { elapsed: 0, hour: 0 },
      player: {
        view: "DESK",
        position: { kind: "DESK" },
        holdCooldownUntil: 0,
        lastMessageAt: -Infinity,
        lastQuickAt: -Infinity,
      },
      power: { slot: "BEAM", pending: null, chudOnline: true, generatorOn: true, rebootingUntil: null },
      ram: {
        state: "AWAY",
        target: null,
        stateEndsAt: np.firstVisitDelay,
        visitId: 0,
        fakedThisVisit: false,
        fakeOutAt: null,
        pendingPull: 0,
        lastTarget: null,
      },
      chud: {
        suspicion,
        band: this.bandFor(suspicion, false),
        pendingQuestion: null,
        suspendedQuestion: null,
        queuedScriptQuestion: null,
        facts: { ...checkpoint },
        lastLocationClaim: null,
        visitDecision: null,
        lastSabotageHour: null,
        sabotageRolledVisit: null,
        furiousActive: false,
        furiousCutDone: false,
        furiousVisitId: null,
        questionPlan: this.planQuestions(np),
        usedSeedKeys: [],
      },
      timers: { lastRealMessageAt: 0, lastWarmBonusAt: -Infinity, silenceTicks: 0 },
      log: { recentMessages: [], visit: freshVisitLog(), scriptedFired: [], nightOneHintsShown: false },
      loss: null,
    };
  }

  private winNight(): void {
    const s = this.state;
    if (s.chud.furiousActive) this.endFurious(true);
    s.run.factsCheckpoint = { ...s.chud.facts };
    // The tide wins: any visit in progress is cancelled with no breach.
    s.ram.state = "AWAY";
    s.ram.target = null;
    this.say({ kind: "morning" });
    if (s.run.night >= this.cfg.nights.length) {
      s.phase = "GAME_WON";
      this.emit({ type: "GAME_WON" });
    } else {
      s.phase = "NIGHT_WON";
      this.emit({ type: "NIGHT_WON", night: s.run.night });
    }
  }

  private breach(entry: Entry): void {
    const s = this.state;
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
    const claim = s.log.visit.claimThisVisit;
    let cause: LossCause;
    if (!s.power.generatorOn || s.power.rebootingUntil !== null) cause = "POWER_OFF";
    else if (s.log.visit.furiousCut) cause = "FURIOUS";
    else if (s.log.visit.sabotaged) cause = "SABOTAGE";
    else if (s.log.visit.armsGaveOut) cause = "ARMS_GAVE_OUT";
    else if (heldOther) cause = "WRONG_HOLD";
    else if (claim !== null && claim !== entry) cause = "LIED";
    else cause = "UNLOCKED";
    s.phase = "BREACH";
    s.loss = {
      night: s.run.night,
      entry,
      cause,
      lastClaim: s.chud.lastLocationClaim,
      heldEntry: cause === "WRONG_HOLD" ? heldOther : null,
    };
    this.emit({ type: "BREACH", loss: { ...s.loss } });
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

  private get now(): number {
    return this.state.clock.elapsed;
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
    s.clock.elapsed = (Math.round(s.clock.elapsed / T) + 1) * T;

    // Other state moves, before the section 13 list.
    this.landRelay();
    this.stepPlayer();
    this.stepRam();
    this.stepReboot();
    this.stepHour();

    // Section 13 order.
    if (s.ram.state === "AT_ENTRY" && this.due(s.ram.stateEndsAt)) {
      this.resolveAttempt();
      if (s.phase !== "PLAYING") return;
    }
    if (this.now >= nightLength(this.cfg) - EPS) {
      this.winNight();
      return;
    }
    this.stepQuestionTimeouts();
    this.stepSilence();
    this.stepQuestions();
    this.tryFuriousCut();
    this.stepSabotage();
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
    if (s.phase !== "PLAYING" || s.player.position.kind !== "DESK") return;
    if (s.power.generatorOn) {
      s.power.generatorOn = false;
      s.power.rebootingUntil = null;
      this.emit({ type: "GENERATOR", on: false });
      this.cutPower("kill_switch");
      if (s.power.chudOnline) {
        s.power.chudOnline = false;
        this.emit({ type: "CHUD_ONLINE", online: false });
        this.tickets.clear();
        for (const slot of ["pendingQuestion", "suspendedQuestion"] as const) {
          const q = s.chud[slot];
          if (q) {
            s.chud[slot] = null;
            this.emit({ type: "QUESTION_RESOLVED", questionId: q.id, result: "cancelled" });
          }
        }
        if (s.chud.furiousActive) this.endFurious(false);
      }
    } else {
      s.power.generatorOn = true;
      s.power.rebootingUntil = this.now + this.cfg.REBOOT_TIME;
      this.emit({ type: "GENERATOR", on: true });
    }
  }

  private stepReboot(): void {
    const s = this.state;
    if (s.power.rebootingUntil === null || !this.due(s.power.rebootingUntil)) return;
    s.power.rebootingUntil = null;
    s.power.chudOnline = true;
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
    if (s.phase !== "PLAYING" || s.player.position.kind !== "DESK") return;
    if (s.player.view === view) return;
    s.player.view = view;
    this.emit({ type: "VIEW", view });
  }

  startHold(entry: Entry): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || s.player.position.kind !== "DESK") return;
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
  }

  startBrace(): void {
    const s = this.state;
    if (s.phase !== "PLAYING") return;
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
    if (s.phase !== "PLAYING") return;
    const p = s.player.position;
    if (p.kind === "TRAVELING" && p.stay) p.braceOnArrival = false;
    else if (p.kind === "HOLDING" && p.stay) this.endHold("manual");
  }

  returnToDesk(): void {
    const s = this.state;
    if (s.phase !== "PLAYING") return;
    const p = s.player.position;
    if (p.kind === "HOLDING" && p.stay) this.endHold("manual");
    const q = s.player.position;
    if (q.kind !== "STANDING") return;
    // HOLD_COOLDOWN runs from the start of the return, as in GAME_LOGIC 6.4 (so 2.5 s of it remain at the desk)
    s.player.holdCooldownUntil = this.now + this.cfg.HOLD_COOLDOWN;
    s.player.position = { kind: "RETURNING", from: q.entry, until: this.now + this.cfg.TRAVEL_TIME };
    this.emit({ type: "PLAYER_MOVED", position: { ...s.player.position } });
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

    if (s.run.night === 1 && !s.log.nightOneHintsShown) this.emit({ type: "HINT", text: NIGHT_ONE_HINTS.approach });

    if (np.autoWarnAtApproach && s.power.chudOnline && s.chud.band === "WARM") {
      s.chud.visitDecision = { visitId: r.visitId, lie: false, entry: target, rolledAfterFake: false };
      s.chud.lastLocationClaim = target;
      s.log.visit.claimThisVisit = target;
      this.say({ kind: "approach_warning", entry: target });
    }
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
    r.state = "AT_ENTRY";
    r.stateEndsAt = r.stateEndsAt + this.np.atEntryTime;
    this.emit({ type: "RAM_AT_ENTRY", visitId: r.visitId, entry: r.target! });
    if (s.run.night === 1 && !s.log.nightOneHintsShown) {
      this.emit({ type: "HINT", text: NIGHT_ONE_HINTS.atEntry });
      s.log.nightOneHintsShown = true;
    }
    this.tryFuriousCut();
  }

  private resolveAttempt(): void {
    const s = this.state;
    const r = s.ram;
    const entry = r.target!;
    if (!this.isDefended(entry)) {
      this.breach(entry);
      return;
    }
    r.state = "RETREATING";
    r.stateEndsAt = r.stateEndsAt + this.cfg.RETREAT_TIME;
    this.emit({ type: "RAM_RETREAT", visitId: r.visitId, entry, shout: ramShout(() => this.rng.next()) });
    if (s.chud.furiousActive && s.chud.furiousVisitId === r.visitId) this.endFurious(true);
  }

  private goAway(): void {
    const r = this.state.ram;
    const c = this.cfg;
    const base = r.stateEndsAt;
    const original = this.rng.range(this.np.awayGap[0], this.np.awayGap[1]);
    let gap = original;
    for (let i = 0; i < r.pendingPull; i++) gap *= 1 - c.SILENCE_PULL;
    gap = Math.max(gap, Math.min(c.MIN_AWAY_GAP, original));
    r.pendingPull = 0;
    r.state = "AWAY";
    r.target = null;
    r.stateEndsAt = base + gap;
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
    this.cutPower("furious");
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

  private makeQuestion(type: QuestionType, origin: PendingQuestion["origin"], gateFor: Entry | null): PendingQuestion {
    const c = this.state.chud;
    const q = (t: QuestionType, factKey: string | null, text: string): PendingQuestion => ({
      id: this.nextQuestionId++,
      origin,
      type: t,
      factKey,
      text,
      askedAt: this.now,
      gateFor,
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
    this.askQuestion(this.makeQuestion(item.type, "SCHEDULED", null), true);
  }

  private stepQuestionTimeouts(): void {
    const c = this.state.chud;
    const limit = this.cfg.QUESTION_TIMEOUT;
    if (c.pendingQuestion && this.due(c.pendingQuestion.askedAt + limit)) this.timeoutQuestion(c.pendingQuestion);
    if (c.suspendedQuestion && this.due(c.suspendedQuestion.askedAt + limit)) this.timeoutQuestion(c.suspendedQuestion);
  }

  private timeoutQuestion(q: PendingQuestion): void {
    this.removeQuestion(q);
    this.changeSuspicion(this.cfg.suspicion.questionTimeout, ["question_timeout"]);
    this.emit({ type: "QUESTION_RESOLVED", questionId: q.id, result: "timeout" });
    if (q.origin === "GATE" && q.gateFor) this.say({ kind: "gate_timeout", entry: q.gateFor });
    else this.say({ kind: "question_timeout" });
  }

  // Clears q from whichever slot holds it. If the pending one goes, a suspended question comes back.
  private removeQuestion(q: PendingQuestion): void {
    const c = this.state.chud;
    if (c.pendingQuestion?.id === q.id) {
      c.pendingQuestion = c.suspendedQuestion ?? null;
      c.suspendedQuestion = null;
    } else if (c.suspendedQuestion?.id === q.id) {
      c.suspendedQuestion = null;
    }
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
      gateFor: null,
    };
    if (s.power.chudOnline && !s.chud.pendingQuestion) this.askQuestion(q, true);
    else s.chud.queuedScriptQuestion = q;
  }

  // =========================================================================
  // Commands (section 8.3), location claims (section 8.7)
  // =========================================================================

  pressQuick(cmd: QuickCommand): void {
    const s = this.state;
    if (s.phase !== "PLAYING" || !s.power.chudOnline) return;
    if (s.player.position.kind !== "DESK" || s.player.view !== "DESK") return;
    if (this.now - s.player.lastQuickAt < this.cfg.QUICK_BUTTON_COOLDOWN - EPS) return;
    s.player.lastQuickAt = this.now;
    let parsed: ParsedCommand;
    if (cmd === "LOCK_WINDOW") parsed = { command: "LOCK", entry: "WINDOW" };
    else if (cmd === "LOCK_HATCH") parsed = { command: "LOCK", entry: "HATCH" };
    else if (cmd === "LOCK_BALCONY") parsed = { command: "LOCK", entry: "BALCONY" };
    else parsed = { command: cmd, entry: null };
    this.say(this.resolveCommand(parsed));
  }

  private resolveCommand(p: ParsedCommand): Outcome {
    const s = this.state;
    const band = s.chud.band;
    switch (p.command) {
      case "POWER_OFF":
        if (this.effectiveSlot() !== "NONE") this.requestPower("NONE", "player");
        return { kind: "power_off" };
      case "BEAM":
        if (band === "FURIOUS") return { kind: "refuse_furious", request: "BEAM" };
        if (this.effectiveSlot() !== "BEAM") this.requestPower("BEAM", "player");
        return { kind: "beam_on" };
      case "ASK_LOCATION":
        return { kind: "location_claim", entry: this.locationClaim() };
      case "LOCK": {
        const entry = p.entry!;
        if (band === "FURIOUS") return { kind: "refuse_furious", request: "LOCK" };
        if (this.effectiveSlot() === lockSlot(entry)) return { kind: "lock_already", entry };
        if (band === "WARM") {
          this.requestPower(lockSlot(entry), "player");
          return { kind: "locked", entry };
        }
        return this.gateLock(entry);
      }
      default:
        return { kind: "small_talk" };
    }
  }

  private gateLock(entry: Entry): Outcome {
    const c = this.state.chud;
    const pending = c.pendingQuestion;
    if (pending && pending.origin === "GATE") {
      pending.gateFor = entry; // replaces the waiting request, same question and timer
      return { kind: "gate_question", entry, question: pending.text };
    }
    const q = this.makeQuestion(c.band === "JEALOUS" ? "MEMORY" : "SEED", "GATE", entry);
    if (pending) c.suspendedQuestion = pending;
    this.askQuestion(q, false);
    return { kind: "gate_question", entry, question: q.text };
  }

  private gatePassed(entry: Entry): Outcome {
    if (this.state.chud.band === "FURIOUS") return { kind: "refuse_furious", request: "LOCK" };
    if (this.effectiveSlot() === lockSlot(entry)) return { kind: "lock_already", entry };
    this.requestPower(lockSlot(entry), "gate_pass");
    return { kind: "locked", entry };
  }

  private locationClaim(): Entry | "NONE" {
    const s = this.state;
    const r = s.ram;
    const band = s.chud.band;
    const active = this.np.activeEntries;
    if (r.state === "AWAY" || r.state === "RETREATING" || !r.target) {
      const claim: Entry | "NONE" = band === "FURIOUS" ? this.rng.pick(active) : "NONE";
      s.chud.lastLocationClaim = claim;
      return claim;
    }
    const target = r.target;
    let d = s.chud.visitDecision;
    const reusable =
      d !== null &&
      d.visitId === r.visitId &&
      (!r.fakedThisVisit || d.rolledAfterFake) &&
      !(band === "FURIOUS" && !d.lie);
    if (!reusable) {
      const np = this.np;
      const chance = band === "WARM" ? 0 : band === "HURT" ? np.lieChanceHurt : band === "JEALOUS" ? np.lieChanceJealous : 1;
      const others = active.filter((e) => e !== target);
      const lie = chance > 0 && others.length > 0 && this.rng.chance(chance);
      d = { visitId: r.visitId, lie, entry: lie ? this.rng.pick(others) : target, rolledAfterFake: r.fakedThisVisit };
      s.chud.visitDecision = d;
    }
    s.chud.lastLocationClaim = d!.entry;
    s.log.visit.claimThisVisit = d!.entry;
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
    if (!s.power.chudOnline) return reject("CHUD_OFFLINE");
    if (s.player.position.kind !== "DESK" || s.player.view !== "DESK") return reject("NOT_AT_DESK");
    if (this.now - s.player.lastMessageAt < c.MESSAGE_RATE_LIMIT - EPS) return reject("RATE_LIMIT");
    if (text.length > c.MAX_MESSAGE_LENGTH) return reject("TOO_LONG");
    const norm = normalize(text);
    if (!norm) return reject("EMPTY");
    s.player.lastMessageAt = this.now;

    // Step 2: repeat check.
    const recent = s.log.recentMessages;
    const repeat = recent.slice(-c.REPEAT_WINDOW).includes(norm);
    recent.push(norm);
    while (recent.length > Math.max(RECENT_MESSAGES_KEPT, c.REPEAT_WINDOW)) recent.shift();

    // Step 3: keyword parse.
    const parsed = parseCommand(text);
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
    const c = this.cfg;
    const S = c.suspicion;

    // The question this message can answer: the one pending at submit, if it is still open.
    let pq: PendingQuestion | null = null;
    if (t.questionId !== null) {
      if (s.chud.pendingQuestion?.id === t.questionId) pq = s.chud.pendingQuestion;
      else if (s.chud.suspendedQuestion?.id === t.questionId) pq = s.chud.suspendedQuestion ?? null;
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
    if (pq && qResult === "fail") add(pq.origin === "GATE" || pq.type === "MEMORY", S.answerFailed, "answer_failed");
    if (pq && qResult === "pass") {
      if (pq.type === "MEMORY") add(true, S.memoryPassed, "memory_passed");
      else add(!r.contradiction, S.answered, "answered");
    }
    if (r.warm && this.now - s.timers.lastWarmBonusAt >= c.WARM_BONUS_COOLDOWN - EPS) {
      add(true, S.warm, "warm");
      s.timers.lastWarmBonusAt = this.now;
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
      if (pq.origin === "GATE" && pq.gateFor) {
        commandOutcome = qResult === "pass" ? this.gatePassed(pq.gateFor) : { kind: "gate_failed", entry: pq.gateFor };
      } else {
        answerOutcome = { kind: "answer_ack", pass: qResult === "pass", type: pq.type };
      }
    }
    if (r.new_fact && !seedPassed) this.storeFact(r.new_fact.key, r.new_fact.value);

    // Step 8: resolve the command (answer first, then command).
    if (cmd.command !== "NONE" && s.power.chudOnline) commandOutcome = this.resolveCommand(cmd);

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
    else if (r.warm) line = { kind: "warm_reply" };
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
      rand: () => this.rng.next(),
    });
    this.emit({ type: "CHUD_SAY", outcome, text, band });
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private clampNight(n: number): number {
    return clamp(Math.floor(n) || 1, 1, this.cfg.nights.length);
  }
}
