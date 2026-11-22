import { writeFileSync } from "node:fs";
import { offlineJudge } from "../../src/chud/offlineJudge";
import { CONFIG, nightLength, type NightParams } from "../../src/config";
import { GameEngine } from "../../src/sim/engine";
import { Rng } from "../../src/sim/rng";
import {
  isLockSlot, lockSlot, slotEntry, type Entry, type GameEvent, type GameState,
  type IGameEngine, type LocationClaim, type LossCause, type PendingQuestion,
  type PowerSlot, type QuickCommand, type ScareReason, type View,
} from "../../src/sim/types";
import { CONTROLS } from "../../src/uiConfig";

type Range = readonly [number, number];
interface Persona {
  reaction: Range;
  scan?: Range;
  answers: number;
  answerBy: number;
  talk?: Range;
  peekLocked?: number;
}

const AVERAGE = { reaction: [1.2, 2.5], scan: [8, 14], answers: 0.7, answerBy: 6, talk: [40, 70], peekLocked: 0.2 } satisfies Persona;
const PERSONAS = {
  oracle: { reaction: [0.1, 0.2], answers: 1, answerBy: 1, talk: [32, 38] },
  skilled: { reaction: [0.6, 1], scan: [4, 6], answers: 1, answerBy: 3, talk: [32, 38] },
  average: AVERAGE,
  careless: { reaction: [2, 4], scan: [18, 30], answers: 0.3, answerBy: 10, talk: [90, 145] },
  spammer: { reaction: [1.2, 2.5], answers: 0.5, answerBy: 6 },
  flatterer: { ...AVERAGE, talk: [10, 10] },
  silent: { ...AVERAGE, answers: 0, talk: undefined },
} satisfies Record<string, Persona>;

type PersonaName = keyof typeof PERSONAS;
const NAMES = Object.keys(PERSONAS) as PersonaName[];
const FACTS = { name: "Sam", home_port: "Halifax", ship: "Marigold" };
const CHAT = [
  "The storm sounds steady.", "I can hear the wind again.", "The sea sounds rough tonight.",
  "The spray is hitting the glass.", "The waves sound close tonight.", "It's cold in this room.",
  "Thanks for the company.", "I've settled in for the night.", "The rain is getting heavier.",
  "I'm getting used to the sound of the wind.", "I like your company.", "I can feel the floor vibrating.",
];
const PRAISE = [
  "You're the best, ChudGPT.", "Thank you for keeping me company.", "You're a good friend.",
  "I'm glad you're here.", "I trust you.", "You're so helpful.", "I like it here.",
  "You're wonderful company.", "Thanks for watching over the room.", "You're doing a great job.",
];
const ANSWERS: readonly (readonly [RegExp, string])[] = [
  [/sail from|sail out of/i, "I sailed from Halifax"],
  [/ship called|ship's name/i, "The Marigold"],
  [/many crew|many sailors/i, "Eight sailors"],
  [/first mate/i, "My first mate was Elise"],
  [/many years|long did you say you've been sailing/i, "Twelve years at sea"],
  [/waiting for you/i, "My sister Nora"],
  [/carrying|cargo/i, "Crates of apples"],
  [/scar/i, "A rope caught my wrist"],
  [/love[d]?.*the sea/i, "The sunrise on calm water"],
  [/meal|eat after a voyage/i, "A bowl of fish stew"],
  [/radio/i, "A voice through the static"],
];
const ANSWER_SUFFIXES = ["", ". I remember it clearly.", ". That's right.", ". I'm certain.", ". I remember.", ". That's what I recall."];
const EPS = 1e-7;

function questionAnswer(question: PendingQuestion): string {
  if (question.type === "STAY") return "Yes, I'll stay";
  const answer = ANSWERS.find(([pattern]) => pattern.test(question.text));
  if (!answer) throw new Error(`Add a bot answer for this question: ${question.text}`);
  return answer[1];
}

type Controls = Pick<IGameEngine, "turn" | "setLight" | "goToEntry" | "startBrace" | "endBrace" |
  "returnToDesk" | "pressQuick" | "submitMessage" | "applyJudge" | "ramVisual">;
type Player = Pick<GameState["player"], "view" | "position" | "holdCooldownUntil">;
type OracleRam = Readonly<Pick<GameState["ram"], "state" | "target" | "visitId" | "stateEndsAt">>;
type Perception = Extract<GameEvent, { type: "CHUD_SAY" | "QUESTION_ASKED" | "LOCK_REFUSED" | "LIGHT_CUT" | "SABOTAGE" | "FURIOUS_CUT" }>;
interface Intent {
  entry: Entry;
  ready: number;
  until: number;
  kind: "lock" | "brace" | "restore";
  approachUntil?: number;
}
interface Scan {
  entries: Entry[];
  light: boolean;
  restore: Entry | null;
  peekUntil: number | null;
  returning: boolean;
  sighting: Intent | null;
}

class Bot {
  private readonly persona: Persona;
  private nextScan: number;
  private nextTalk: number;
  private nextAsk = 0;
  private quickReady = 0;
  private relayReady = 0;
  private textReady = 0;
  private turnReady = 0;
  private edge: { view: View; ready: number } | null = null;
  private scan: Scan | null = null;
  private intent: Intent | null = null;
  private threat: Intent | null = null;
  private lastLock: { intent: Intent; at: number } | null = null;
  private visitUntil = 0;
  private askedThisVisit = false;
  private askForVisit = false;
  private questionUntil = 0;
  private answer: { text: string; ready: number; deadline: number } | null = null;
  private answersSent = 0;
  private recentChat: string[] = [];
  private oracleVisit = 0;
  private brace: { approachUntil: number; returnAt: number } | null = null;

  constructor(
    private readonly name: PersonaName,
    private readonly controls: Controls,
    private readonly rng: Rng,
    private readonly night: NightParams,
  ) {
    this.persona = PERSONAS[name];
    this.nextScan = this.interval(this.persona.scan);
    this.nextTalk = this.interval(this.persona.talk);
  }

  private interval(range?: Range): number {
    return range ? this.rng.range(...range) : Infinity;
  }

  private react(now: number): number {
    return now + this.interval(this.persona.reaction);
  }

  perceive(event: Perception, now: number): void {
    switch (event.type) {
      case "QUESTION_ASKED": {
        if (this.name === "silent") return;
        this.questionUntil = now + CONFIG.QUESTION_TIMEOUT;
        if (!this.rng.chance(this.persona.answers)) return;
        const text = questionAnswer(event.question) + ANSWER_SUFFIXES[this.answersSent % ANSWER_SUFFIXES.length];
        this.answer = { text, ready: this.react(now), deadline: now + this.persona.answerBy };
        return;
      }
      case "CHUD_SAY": {
        const { outcome } = event;
        if (outcome.kind === "answer_ack" || outcome.kind === "question_timeout") {
          this.answer = null;
          this.questionUntil = 0;
        } else if (outcome.kind === "locked") {
          this.relayReady = now + CONFIG.RELAY_DELAY;
        } else if (outcome.kind === "location_claim" && this.name === "spammer" && outcome.entry !== "NONE" && outcome.entry !== "INSIDE") {
          this.intent = { entry: outcome.entry, ready: this.react(now), until: now + 5, kind: "lock" };
        } else if (outcome.kind === "answer_first" && this.lastLock?.at === now) {
          const lock = this.lastLock.intent;
          if (this.answer && this.answer.deadline >= now) this.intent = { ...lock, ready: this.answer.ready };
          else this.fallBackToBrace(lock, now);
        }
        return;
      }
      case "LOCK_REFUSED":
        if (this.lastLock?.at === now && this.lastLock.intent.entry === event.entry) {
          this.fallBackToBrace(this.lastLock.intent, now);
        }
        return;
      case "SABOTAGE":
        if (this.threat?.entry === event.entry) this.fallBackToBrace(this.threat, now);
        return;
      case "FURIOUS_CUT":
        // The subtitle gives no location. React only to an entry we already know about.
        if (this.threat) this.fallBackToBrace(this.threat, now);
        return;
      case "LIGHT_CUT": {
        const sighting = this.scan?.sighting;
        const threat = sighting ?? this.threat;
        if (threat?.entry === event.entry) this.fallBackToBrace(threat, now);
        return;
      }
    }
  }

  private fallBackToBrace(threat: Intent, now: number): void {
    if (this.name === "spammer" || this.brace || threat.kind === "restore" || threat.until <= now || this.intent?.kind === "brace") return;
    this.intent = { ...threat, kind: "brace", ready: Math.max(threat.ready, this.react(now)) };
  }

  step(now: number, player: Player, slot: PowerSlot, ram?: OracleRam): void {
    if (this.intent && this.intent.until <= now) this.intent = null;
    if (this.answer && this.answer.deadline < now - EPS) this.answer = null;
    if (ram?.state === "AT_ENTRY" && ram.target && ram.visitId !== this.oracleVisit) {
      this.oracleVisit = ram.visitId;
      this.intent = this.threat = { entry: ram.target, ready: this.react(now), until: ram.stateEndsAt, kind: "lock" };
    }

    if (player.position.kind !== "DESK") {
      this.atEntry(now, player, ram);
      return;
    }
    if (this.scan && this.continueScan(now, player.view)) return;

    const intent = this.intent;
    const ready = intent && now >= intent.ready - EPS;
    if (ready && intent.kind === "brace") {
      // The oracle can time a single brace against the true deadline. Other bots rebrace after the visible rest.
      const dashAt = ram ? intent.until - CONFIG.TRAVEL_TIME - 2 : now;
      if (now >= dashAt - EPS && this.face(intent.entry, player.view, now) && now >= player.holdCooldownUntil - EPS) {
        this.brace = {
          approachUntil: intent.approachUntil ?? 0,
          returnAt: Infinity,
        };
        this.controls.goToEntry(intent.entry);
        this.controls.startBrace();
        this.intent = null;
        return;
      }
      if (!ram || player.view !== "DESK" || now >= dashAt - EPS) return;
    }
    if (!this.face("DESK", player.view, now)) return;

    if (this.answer && now >= this.answer.ready - EPS && now >= this.textReady - EPS) {
      if (this.say(this.answer.text, now)) this.answersSent++;
      return;
    }
    if (ready && intent.kind !== "brace" && now >= this.quickReady - EPS) {
      this.intent = null;
      if (slot !== lockSlot(intent.entry)) {
        this.lastLock = { intent, at: now };
        this.quick(`LOCK_${intent.entry}`, now);
        return;
      }
    }
    if (this.name === "spammer" && now >= this.nextAsk - EPS && now >= this.quickReady - EPS) {
      this.nextAsk = now + 5;
      this.quick("ASK_LOCATION", now);
      return;
    }
    if (this.askForVisit && now < this.visitUntil && now >= this.quickReady - EPS) {
      this.askForVisit = false;
      this.askedThisVisit = true;
      this.quick("ASK_LOCATION", now);
      return;
    }
    if (now >= this.nextTalk - EPS && now >= this.textReady - EPS && now >= this.questionUntil - EPS) {
      const pool = this.name === "flatterer" ? PRAISE : CHAT;
      const message = this.rng.pick(pool.filter((text) => !this.recentChat.includes(text)));
      if (this.say(message, now)) {
        this.recentChat.push(message);
        if (this.recentChat.length > CONFIG.REPEAT_WINDOW) this.recentChat.shift();
        this.nextTalk = now + this.interval(this.persona.talk);
      }
      return;
    }
    if (this.intent || this.answer) return;
    if (this.scan) this.continueScan(now, player.view, true);
    else if (now >= Math.max(this.nextScan, this.relayReady) - EPS) this.beginScan(now, slot);
  }

  private face(goal: View, view: View, now: number): boolean {
    if (now < this.turnReady - EPS) return false;
    if (goal === view) {
      this.edge = null;
      return true;
    }
    // All of the real edge routes between two entries go through DESK.
    const next = view === "DESK" ? goal : "DESK";
    if (this.edge?.view !== next) this.edge = { view: next, ready: now + CONTROLS.EDGE_DWELL };
    if (now >= this.edge.ready - EPS) {
      this.controls.turn(next);
      this.edge = null;
      this.turnReady = now + (next === "BALCONY" || view === "BALCONY" ? CONTROLS.TURN_TIME_BALCONY : CONTROLS.TURN_TIME);
    }
    return false;
  }

  private beginScan(now: number, slot: PowerSlot): void {
    this.nextScan = now + this.interval(this.persona.scan);
    const locked = isLockSlot(slot) ? slotEntry(slot) : null;
    const peekLocked = locked !== null && this.rng.chance(this.persona.peekLocked ?? 0);
    // Check the other entries for faint tells without dropping a lock that may still be defending.
    const light = peekLocked || locked === null || locked !== this.threat?.entry || now >= this.threat.until;
    const entries = this.night.activeEntries.filter((entry) => entry !== locked || peekLocked || (light && this.name === "skilled"));
    const first = Math.floor(this.rng.next() * entries.length);
    this.scan = {
      entries: [...entries.slice(first), ...entries.slice(0, first)], light, restore: light ? locked : null,
      peekUntil: null, returning: false, sighting: null,
    };
  }

  private continueScan(now: number, view: View, allowNext = false): boolean {
    const scan = this.scan!;
    if (scan.returning) {
      if (!this.face("DESK", view, now)) return true;
      scan.returning = false;
      if (scan.sighting || this.intent || scan.entries.length === 0) {
        if (scan.sighting) this.remember(scan.sighting, now);
        else if (!this.intent && scan.restore) this.intent = { entry: scan.restore, ready: now, until: now + 5, kind: "restore" };
        this.scan = null;
      }
      return false;
    }
    if (view === "DESK" && scan.peekUntil === null && !allowNext && !this.edge) return false;
    const entry = scan.entries[0];
    if (!this.face(entry, view, now)) return true;
    if (scan.peekUntil === null) {
      if (scan.light) this.controls.setLight(true);
      scan.peekUntil = now + this.rng.range(0.45, 0.7);
    }
    const visual = this.controls.ramVisual(entry);
    if (!scan.sighting && (visual === "approach_silhouette" || visual === "tell_clear" || visual === "tell_faint")) {
      const approachUntil = visual === "approach_silhouette" ? now + this.night.approachTime : undefined;
      const ready = this.react(now);
      scan.sighting = { entry, ready, until: (approachUntil ?? now) + this.night.atEntryTime[1], kind: "lock", approachUntil };
      scan.peekUntil = Math.max(scan.peekUntil, Math.min(ready, now + 1.5));
    } else if (scan.sighting && (visual === "tell_clear" || visual === "tell_faint")) {
      scan.sighting.approachUntil = undefined;
    }
    if (now >= scan.peekUntil - EPS || this.intent?.kind === "brace") {
      if (scan.light) this.controls.setLight(false);
      scan.entries.shift();
      scan.peekUntil = null;
      scan.returning = true;
      this.face("DESK", view, now);
    }
    return true;
  }

  private remember(sighting: Intent, now: number): void {
    if (now >= this.visitUntil) this.askedThisVisit = false;
    this.visitUntil = sighting.until;
    this.askForVisit = this.name === "skilled" && !this.askedThisVisit;
    this.threat = sighting;
    if (this.intent?.kind !== "brace" || (this.intent.entry !== sighting.entry && !sighting.approachUntil)) this.intent = sighting;
  }

  private atEntry(now: number, player: Player, ram?: OracleRam): void {
    const position = player.position;
    const brace = this.brace;
    if (!brace || (position.kind !== "STANDING" && position.kind !== "HOLDING")) return;
    const visual = this.controls.ramVisual(position.entry);
    const tell = visual === "tell_faint" || visual === "tell_clear";
    if (tell) brace.approachUntil = 0;
    const there = tell || now < brace.approachUntil ||
      (ram !== undefined && ram.state === "AT_ENTRY" && ram.target === position.entry);
    if (there) {
      brace.returnAt = Infinity;
      if (position.kind === "STANDING" && now >= position.restUntil - EPS) this.controls.startBrace();
      return;
    }
    if (brace.returnAt === Infinity) brace.returnAt = this.react(now) + CONTROLS.EDGE_DWELL;
    if (now >= brace.returnAt - EPS) {
      this.controls.endBrace();
      this.controls.returnToDesk();
      this.brace = null;
      this.threat = null;
      this.askForVisit = false;
    }
  }

  private quick(command: QuickCommand, now: number): void {
    this.quickReady = now + CONFIG.QUICK_BUTTON_COOLDOWN;
    this.controls.pressQuick(command);
  }

  private say(text: string, now: number): boolean {
    this.textReady = now + CONFIG.MESSAGE_RATE_LIMIT;
    const result = this.controls.submitMessage(text);
    if (!result.ok) return false;
    if (!result.ticket.repeat) this.controls.applyJudge(result.ticket.id, offlineJudge(result.ticket.judgeInput));
    return true;
  }
}

const CHECKPOINTS = [0, 60, 120, 180, 240, 300];
const COUNTERS = {
  visits: 0, answerFirst: 0, refusals: 0, lightCuts: 0, sabotages: 0, furious: 0, lies: 0, silence: 0,
};
type Counter = keyof typeof COUNTERS;

function tally<K extends string>(counts: Partial<Record<K, number>>, key: K): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

// This collector never sends its data back to a bot. The silent events supply the true
// location, with early claims buffered until an arrival or fake-out reveals the target.
class Metrics {
  readonly counts = { ...COUNTERS };
  readonly causes: Partial<Record<LossCause, number>> = {};
  readonly reasons: Partial<Record<ScareReason, number>> = {};
  readonly suspicion = CHECKPOINTS.map(() => ({ sum: 0, samples: 0 }));
  survived = 0;
  firstArrivalSum = 0;
  firstArrivalSamples = 0;
  attemptSum = 0;
  attempts = 0;
  unscoredClaims = 0;
  emptyFuriousCuts = 0;
  firstEmptyCut: { seed: number; at: number } | null = null;
  firstFuriousInside: { seed: number; since: number; at: number } | null = null;
}

class NightTelemetry {
  private truth: LocationClaim | null = "NONE";
  private claims: LocationClaim[] = [];
  private arrival: number | null = null;
  private arrived = false;
  private checkpoint = 0;
  private priorWasFuriousPowerChange = false;
  private furiousCutThisVisit = false;
  private insideUnderFuriousAt: number | null = null;

  constructor(private readonly metrics: Metrics, private readonly seed: number) {}

  event(event: GameEvent, now: number): void {
    const cutPower = this.priorWasFuriousPowerChange;
    this.priorWasFuriousPowerChange = event.type === "POWER_CHANGED" && event.cause === "furious";
    const m = this.metrics;
    switch (event.type) {
      case "RAM_APPROACH":
        m.counts.visits++;
        this.truth = null;
        this.furiousCutThisVisit = false;
        break;
      case "RAM_FAKE_OUT":
        this.reveal(event.from);
        this.truth = event.to;
        break;
      case "RAM_AT_ENTRY":
        this.reveal(event.entry);
        this.arrival = now;
        if (!this.arrived) {
          this.arrived = true;
          m.firstArrivalSum += now;
          m.firstArrivalSamples++;
        }
        break;
      case "RAM_RETREAT":
      case "RAM_INSIDE":
        if (this.arrival !== null) {
          m.attemptSum += now - this.arrival;
          m.attempts++;
          this.arrival = null;
        }
        this.truth = event.type === "RAM_INSIDE" ? "INSIDE" : "NONE";
        if (event.type === "RAM_INSIDE" && this.furiousCutThisVisit) this.insideUnderFuriousAt = now;
        break;
      case "CHUD_SAY":
        if (event.band === "FURIOUS" && this.insideUnderFuriousAt !== null && now >= this.insideUnderFuriousAt + 1) {
          m.firstFuriousInside ??= { seed: this.seed, since: this.insideUnderFuriousAt, at: now };
        }
        if (event.outcome.kind === "answer_first") m.counts.answerFirst++;
        else if (event.outcome.kind === "silence") m.counts.silence++;
        else if (event.outcome.kind === "location_claim") {
          if (this.truth === null) this.claims.push(event.outcome.entry);
          else if (event.outcome.entry !== this.truth) m.counts.lies++;
        }
        break;
      case "LOCK_REFUSED": m.counts.refusals++; break;
      case "LIGHT_CUT": m.counts.lightCuts++; break;
      case "SABOTAGE": m.counts.sabotages++; break;
      case "FURIOUS_START": m.counts.furious++; break;
      case "FURIOUS_END": this.insideUnderFuriousAt = null; break;
      case "FURIOUS_CUT":
        this.furiousCutThisVisit = true;
        if (!cutPower) {
          m.emptyFuriousCuts++;
          m.firstEmptyCut ??= { seed: this.seed, at: now };
        }
        break;
      case "BREACH":
        tally(m.causes, event.loss.cause);
        tally(m.reasons, event.loss.reason);
        break;
    }
  }

  sample(now: number, suspicion: number): void {
    if (this.checkpoint < CHECKPOINTS.length && now >= CHECKPOINTS[this.checkpoint] - EPS) {
      const bucket = this.metrics.suspicion[this.checkpoint++];
      bucket.sum += suspicion;
      bucket.samples++;
    }
  }

  finish(phase: GameState["phase"]): void {
    if (phase === "NIGHT_WON" || phase === "TRAPPED") this.metrics.survived++;
    else if (phase !== "BREACH") throw new Error(`Unexpected end phase for seed ${this.seed}: ${phase}`);
    this.metrics.unscoredClaims += this.claims.length;
  }

  private reveal(truth: LocationClaim): void {
    this.truth = truth;
    for (const claim of this.claims) if (claim !== truth) this.metrics.counts.lies++;
    this.claims.length = 0;
  }
}

function runNight(name: PersonaName, night: number, seed: number, metrics: Metrics): void {
  const engine: IGameEngine = new GameEngine({ seed, skipNamePrompt: true, startNight: night, facts: night === 1 ? undefined : FACTS });
  // Keep decisions on a separate stream from the game and stable across CLI filters.
  const salt = Math.imul(night * NAMES.length + NAMES.indexOf(name), 0x9e3779b1);
  const bot = new Bot(name, engine, new Rng(seed ^ salt), CONFIG.nights[night - 1]);
  const telemetry = new NightTelemetry(metrics, seed);
  const state = engine.state;
  const oracle = name === "oracle";

  function drain(): void {
    for (const event of engine.drainEvents()) {
      const now = state.clock.elapsed;
      telemetry.event(event, now);
      switch (event.type) {
        case "CHUD_SAY": case "QUESTION_ASKED": case "LOCK_REFUSED":
        case "LIGHT_CUT": case "SABOTAGE": case "FURIOUS_CUT":
          bot.perceive(event, now);
          break;
      }
    }
  }

  engine.beginNight();
  drain();
  while (state.phase === "PLAYING") {
    const now = state.clock.elapsed;
    if (now >= nightLength(CONFIG) + EPS) throw new Error(`Night ${night} did not end for ${name}, seed ${seed}`);
    const { player } = state;
    const slot = player.position.kind === "DESK" && player.view === "DESK" ? state.power.slot : "NONE";
    bot.step(now, player, slot, oracle ? state.ram : undefined);
    drain();
    telemetry.sample(now, state.chud.suspicion);
    if (state.phase !== "PLAYING") break;
    engine.tick(CONFIG.TICK);
    drain();
  }
  telemetry.sample(state.clock.elapsed, state.chud.suspicion);
  telemetry.finish(state.phase);
}

const ALL_NIGHTS = [1, 2, 3, 4, 5];
const USAGE = "npx vite-node tools/playtest/bots.ts -- --seeds 200 [--personas a,b] [--nights 1,2]";

function parseArgs(args: string[]): { seeds: number; names: PersonaName[]; nights: number[] } {
  let seeds = 200;
  let names = NAMES;
  let nights = ALL_NIGHTS;
  const flags = args.filter((arg) => arg !== "--");
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i];
    const value = flags[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case "--seeds":
        seeds = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(seeds) || seeds < 1) throw new Error("--seeds must be a positive integer");
        break;
      case "--personas": {
        const selected = value.split(",").map((name) => name.trim());
        if (selected.some((name) => !NAMES.includes(name as PersonaName))) throw new Error(`Choose personas from ${NAMES.join(", ")}`);
        names = NAMES.filter((name) => selected.includes(name));
        break;
      }
      case "--nights": {
        const selected = value.split(",").map((night) => night.trim());
        if (selected.some((night) => !/^[1-5]$/.test(night))) throw new Error("--nights must list nights 1 through 5");
        nights = ALL_NIGHTS.filter((night) => selected.includes(String(night)));
        break;
      }
      default: throw new Error(`Unknown argument ${flag}`);
    }
  }
  return { seeds, names, nights };
}

function mean(sum: number, samples: number): string {
  return samples ? (sum / samples).toFixed(2) : "n/a";
}

function breakdown(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key} ${value}`).join(", ") || "none";
}

function report(seeds: number, names: PersonaName[], nights: number[]): string {
  const results = names.map((name) => nights.map((night) => {
    const metrics = new Metrics();
    for (let seed = 1; seed <= seeds; seed++) runNight(name, night, seed, metrics);
    return metrics;
  }));
  const rows = [
    "# R.A.M. seeded bot playtest", "",
    `${seeds} seeds per persona and night (1 to ${seeds}). Night 5 dawn with TRAPPED counts as survival.`, "",
    `| Persona | ${nights.map((night) => `Night ${night}`).join(" | ")} |`,
    `| --- | ${nights.map(() => "---:").join(" | ")} |`,
  ];
  for (const [i, name] of names.entries()) {
    rows.push(`| ${name} | ${results[i].map((m) => `${(100 * m.survived / seeds).toFixed(1)}%`).join(" | ")} |`);
  }
  rows.push("",
    "Behavior counts are means per run. Visits count approaches. First arrival averages runs with an arrival. Attempt windows are measured on 0.05 s ticks from arrival to retreat or entry into the room, excluding dawn-cancelled attempts.", "",
    "Suspicion means include only runs that reached each checkpoint, in seconds. Death breakdowns are totals. Skilled bots ask once per visit inferred from visual cues. Scans use faint tells if Shift would drop a lock still defending a suspected visit, except for deliberate locked peeks.",
  );
  const counters: Counter[] = ["answerFirst", "refusals", "lightCuts", "sabotages", "furious", "lies", "silence"];
  let unscoredClaims = 0;
  let emptyFuriousCuts = 0;
  let firstEmptyCut = "";
  let firstFuriousInside = "";
  for (const [i, name] of names.entries()) {
    rows.push("", `## ${name}`, "",
      "| Night | Visits | First arrival (s) | Attempt (s) | Answer first | Refusals | Light cuts | Sabotages | Furious | Lies | Silence | Suspicion at 0 / 60 / 120 / 180 / 240 / 300 s | Death causes | Scare reasons |",
      "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |");
    for (const [j, night] of nights.entries()) {
      const m = results[i][j];
      const cells = [night, mean(m.counts.visits, seeds), mean(m.firstArrivalSum, m.firstArrivalSamples), mean(m.attemptSum, m.attempts),
        ...counters.map((key) => mean(m.counts[key], seeds)),
        m.suspicion.map(({ sum, samples }) => mean(sum, samples)).join(" / "), breakdown(m.causes), breakdown(m.reasons)];
      rows.push(`| ${cells.join(" | ")} |`);
      unscoredClaims += m.unscoredClaims;
      emptyFuriousCuts += m.emptyFuriousCuts;
      if (!firstEmptyCut && m.firstEmptyCut) {
        firstEmptyCut = `${name}, Night ${night}, seed ${m.firstEmptyCut.seed} at ${m.firstEmptyCut.at.toFixed(2)} s`;
      }
      if (!firstFuriousInside && m.firstFuriousInside) {
        const { seed, since, at } = m.firstFuriousInside;
        firstFuriousInside = `${name}, Night ${night}, seed ${seed}. Ram entered at ${since.toFixed(2)} s; CHUD was still speaking in FURIOUS at ${at.toFixed(2)} s.`;
      }
    }
  }
  if (unscoredClaims) rows.push("", `${unscoredClaims} location claims went unscored because dawn ended the approach before its target was revealed.`);
  if (emptyFuriousCuts) rows.push("", `FURIOUS_CUT fired ${emptyFuriousCuts} times without a corresponding power change. First observed on ${firstEmptyCut}.`);
  if (firstFuriousInside) rows.push("", `FURIOUS persisted after Ram got inside. First observed on ${firstFuriousInside}`);
  return rows.join("\n") + "\n";
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const { seeds, names, nights } = parseArgs(args);
  const markdown = report(seeds, names, nights);
  writeFileSync(new URL("./last-report.md", import.meta.url), markdown, "utf8");
  process.stdout.write(markdown);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
  process.exitCode = 1;
}
