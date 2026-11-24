import type { PracticeLine } from "../chud/lines";
import type { GameEngine } from "../sim/engine";
import type { Entry, GameEvent, GameState, QuickCommand, View } from "../sim/types";
import { PRACTICE_UI } from "../uiConfig";
import type { SpeechPlayback } from "./audio";
import { EDGE_TARGET } from "./edges";

const STORY = ["wreck", "rescue", "danger", "bargain"] as const;
const VIEWS = ["WINDOW", "HATCH", "BALCONY"] as const;
const NUDGES = {
  views: "nudgeViews",
  light: "nudgeLight",
  lock: "nudgeLock",
  hatch: "nudgeHatch",
  return: "nudgeReturn",
  location: "nudgeLocation",
  chat: "nudgeChat",
} as const;

type Step = "story" | keyof typeof NUDGES | "windowSafe" | "farewell" | "ready";
type Line = Extract<GameEvent, { type: "CHUD_SAY" }>;
type PlayLine = (line: Line) => SpeechPlayback | undefined;

function edgeChip(from: View, to: View): string {
  const edge = Object.entries(EDGE_TARGET[from]).find(([, target]) => target === to)?.[0];
  return edge ? `MOUSE TO THE ${edge.toUpperCase()} EDGE` : "";
}

export class EveningTutorial {
  step: Step = "story";
  private storyIndex = 0;
  private readonly visited = new Set<Entry>();
  private readonly queue: Line[] = [];
  private active?: { line: Line; playback?: SpeechPlayback; readUntil: number; nextAt?: number };
  private lastFinished?: PracticeLine;
  private enteredAt = 0;
  private nudged = false;
  private asked = false;
  private replied = false;

  start(engine: GameEngine): void {
    engine.sayPracticeLine(STORY[this.storyIndex]);
  }

  skipStory(engine: GameEngine, t: number): void {
    this.queue.length = 0;
    this.active = undefined;
    this.advanceStory(engine, t);
  }

  private advanceStory(engine: GameEngine, t: number): void {
    this.storyIndex++;
    if (this.storyIndex < STORY.length) this.start(engine);
    else this.enter(engine, "views", t);
  }

  hear(line: Line): void {
    const { outcome } = line;
    if (outcome.kind === "practice_line") {
      const storyIndex = STORY.findIndex((id) => id === outcome.line);
      if (storyIndex >= 0 && (this.step !== "story" || storyIndex !== this.storyIndex)) return;
    }
    this.queue.push(line);
  }

  messageSent(): void {
    if (this.step === "chat") this.replied = true;
  }

  allowsQuick(command: QuickCommand): boolean {
    return (this.step === "lock" && command === "LOCK_WINDOW")
      || (this.step === "hatch" && command === "LOCK_HATCH")
      || (this.step === "location" && command === "ASK_LOCATION");
  }

  update(engine: GameEngine, t: number, play: PlayLine): void {
    this.updateSpeech(t, play);
    const s = engine.state;
    const { position, view } = s.player;
    const facingDesk = position.kind === "DESK" && view === "DESK";
    switch (this.step) {
      case "story":
        if (this.lastFinished === STORY[this.storyIndex]) this.advanceStory(engine, t);
        return;
      case "views":
        if (position.kind === "DESK" && view !== "DESK") this.visited.add(view);
        if (facingDesk && this.visited.size === VIEWS.length) {
          engine.stagePracticeVisit("WINDOW");
          this.enter(engine, "light", t);
          return;
        }
        break;
      case "light":
        if (view === "WINDOW" && engine.ramVisual(view) === "tell_clear") {
          this.enter(engine, "lock", t);
          return;
        }
        break;
      case "lock":
        if (s.power.slot === "LOCK_WINDOW" && s.ram.state === "RETREATING") {
          this.enter(engine, "windowSafe", t);
          return;
        }
        break;
      case "windowSafe":
        if (this.lastFinished === "windowSafe") {
          engine.stagePracticeVisit("HATCH");
          this.enter(engine, "hatch", t);
        }
        return;
      case "hatch":
        if (s.ram.state === "RETREATING") {
          this.enter(engine, "return", t);
          return;
        }
        break;
      case "return":
        if (facingDesk) {
          this.enter(engine, "location", t);
          return;
        }
        break;
      case "location":
        if (this.asked) {
          this.enter(engine, "chat", t);
          return;
        }
        break;
      case "chat":
        if (this.replied) {
          this.enter(engine, "farewell", t);
          return;
        }
        break;
      case "farewell":
        if (this.lastFinished === "lonely") this.enter(engine, "ready", t);
        return;
      case "ready":
        return;
    }

    if (!this.nudged && t >= this.enteredAt + PRACTICE_UI.NUDGE_AFTER) {
      this.nudged = true;
      engine.sayPracticeLine(NUDGES[this.step]);
    }
  }

  private enter(engine: GameEngine, step: Exclude<Step, "story">, t: number): void {
    this.step = step;
    this.enteredAt = t;
    this.nudged = false;
    if (step === "farewell") {
      engine.sayPracticeLine("chatReply");
      engine.sayPracticeLine("lonely");
    } else {
      engine.sayPracticeLine(step);
    }
  }

  private updateSpeech(t: number, play: PlayLine): void {
    const active = this.active;
    if (active) {
      const status = active.playback?.state;
      if (status === "playing" || (status !== "finished" && t < active.readUntil)) return;
      active.playback?.cancelPending();
      active.nextAt ??= t + PRACTICE_UI.LINE_PAUSE;
      if (t < active.nextAt) return;
      const { outcome } = active.line;
      if (outcome.kind === "practice_line") this.lastFinished = outcome.line;
      this.active = undefined;
    }

    while (this.queue.length) {
      const line = this.queue.shift()!;
      const { outcome } = line;
      if (outcome.kind === "practice_line" && outcome.line.startsWith("nudge")
        && (!(this.step in NUDGES) || NUDGES[this.step as keyof typeof NUDGES] !== outcome.line)) continue;
      if (this.step === "location" && outcome.kind === "location_claim" && outcome.entry === "NONE") this.asked = true;
      this.active = {
        line,
        playback: play(line),
        readUntil: t + Math.max(PRACTICE_UI.MIN_READ_TIME, line.text.length * PRACTICE_UI.READ_SECONDS_PER_CHARACTER),
      };
      return;
    }
  }

  prompt(state: GameState): { chip: string; target?: QuickCommand | "chat" } {
    const { position, view } = state.player;
    const back = edgeChip(view, "DESK");
    switch (this.step) {
      case "views": {
        const next = VIEWS.find((entry) => !this.visited.has(entry));
        return { chip: back || (next ? edgeChip("DESK", next) : "") };
      }
      case "light":
        return { chip: view === "WINDOW" ? "HOLD SHIFT" : back || edgeChip("DESK", "WINDOW") };
      case "lock":
        return back ? { chip: back } : { chip: "CLICK W", target: "LOCK_WINDOW" };
      case "hatch":
        if (position.kind === "RETURNING") return { chip: "" };
        if (position.kind !== "DESK") return { chip: "HOLD MOUSE" };
        if (view === "HATCH") return { chip: "CLICK" };
        return { chip: back || edgeChip("DESK", "HATCH") };
      case "return":
        return { chip: position.kind === "RETURNING" ? "" : back };
      case "location":
        return back ? { chip: back } : { chip: "CLICK WHERE IS IT", target: "ASK_LOCATION" };
      case "chat":
        return back ? { chip: back } : { chip: "TYPE + ENTER", target: "chat" };
      default:
        return { chip: "" };
    }
  }
}
