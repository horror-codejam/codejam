import type { Entry, GameState, Outcome, QuickCommand } from "../sim/types";

const views = [
  { entry: "WINDOW", label: "window", edge: "left" },
  { entry: "HATCH", label: "hatch", edge: "right" },
  { entry: "BALCONY", label: "balcony", edge: "bottom" },
] as const;

const steps = [
  "views", "light", "lock", "dash", "brace",
  "release-brace", "return", "location", "relock", "unlock", "chat", "pause", "ready",
] as const;
type Step = typeof steps[number];

type Prompt = {
  text: string;
  target?: QuickCommand | "chat";
};

function returnToDesk(state: GameState): string | undefined {
  const { position, view } = state.player;
  if (position.kind === "TRAVELING") return "Wait until you reach the entry.";
  if (position.kind === "RETURNING") return "Wait until you reach the desk.";
  if (view === "DESK") return;
  if (view === "BALCONY") return "Move your pointer away, then hold it at the bottom edge again to return to the desk.";
  const edge = view === "WINDOW" ? "right" : "left";
  return `Hold your pointer at the ${edge} edge to return to the desk.`;
}

export class EveningTutorial {
  private index = 0;
  private visited = new Set<Entry>();
  private highlighted?: HTMLElement;
  private usedLight = false;
  private askedLocation = false;
  private requestedUnlock = false;
  private wroteMessage = false;
  private pausedOnce = false;
  private resumed = false;
  private readonly instruction: HTMLElement;
  private readonly finish: HTMLButtonElement;

  constructor(private readonly root: HTMLElement, private readonly terminal: HTMLElement, onFinish: () => void) {
    this.instruction = root.querySelector("[data-instruction]")!;
    this.finish = root.querySelector("button")!;
    this.finish.addEventListener("click", onFinish);
  }

  private get step(): Step {
    return steps[this.index];
  }

  reset(): void {
    this.index = 0;
    this.visited.clear();
    this.usedLight = false;
    this.askedLocation = false;
    this.requestedUnlock = false;
    this.wroteMessage = false;
    this.pausedOnce = false;
    this.resumed = false;
    this.hide();
  }

  hide(): void {
    this.root.hidden = true;
    this.highlight();
  }

  usedEntryLight(): void {
    if (this.step === "light") this.usedLight = true;
  }

  reply(outcome: Outcome): void {
    if (this.step === "location" && outcome.kind === "location_claim") this.askedLocation = true;
    if (this.step === "unlock" && outcome.kind === "power_off") this.requestedUnlock = true;
  }

  messageSent(): void {
    if (this.step === "chat") this.wroteMessage = true;
  }

  pauseChanged(on: boolean): void {
    if (this.step !== "pause") return;
    if (on) this.pausedOnce = true;
    else if (this.pausedOnce) this.resumed = true;
  }

  render(state: GameState): void {
    const { position, view } = state.player;
    if (position.kind === "DESK" && view !== "DESK") this.visited.add(view);
    while (this.step !== "ready" && this.completed(state)) this.index++;
    const prompt = this.prompt(state);
    this.root.hidden = false;
    this.root.dataset.lesson = this.step;
    if (this.instruction.textContent !== prompt.text) this.instruction.textContent = prompt.text;
    const label = this.step === "ready" ? "Start Night 1" : "Skip practice";
    if (this.finish.textContent !== label) this.finish.textContent = label;
    this.highlight(prompt.target);
  }

  private completed(state: GameState): boolean {
    const { position, view, lightEntry } = state.player;
    const { slot } = state.power;
    const facingDesk = position.kind === "DESK" && view === "DESK";
    switch (this.step) {
      case "views": return this.visited.size === views.length && facingDesk;
      case "light": return this.usedLight || lightEntry !== null;
      case "lock":
      case "relock": return slot === "LOCK_HATCH";
      case "dash": return position.kind === "TRAVELING" || position.kind === "STANDING" || position.kind === "HOLDING";
      case "brace": return position.kind === "HOLDING";
      case "release-brace": return position.kind !== "HOLDING";
      case "return": return facingDesk;
      case "location": return this.askedLocation;
      case "unlock": return this.requestedUnlock && slot === "NONE";
      case "chat": return this.wroteMessage;
      case "pause": return this.resumed;
      case "ready": return false;
    }
  }

  private prompt(state: GameState): Prompt {
    const back = returnToDesk(state);
    const atHatchView = state.player.view === "HATCH" && state.player.position.kind === "DESK";
    const deskControl = (text: string, target: Prompt["target"]): Prompt => back ? { text: back } : { text, target };
    const approach = atHatchView ? "Left-click the hatch view to run to it. You can keep holding the button to brace on arrival." : back ?? "Look at the hatch using the right edge.";
    switch (this.step) {
      case "views": {
        const next = views.find(({ entry }) => !this.visited.has(entry));
        if (back) return { text: back };
        return { text: next ? `You're safe until midnight. Hold your pointer at the ${next.edge} edge to look at the ${next.label}.` : "Return to the desk." };
      }
      case "light":
        return { text: state.player.view === "DESK" ? "Look at an entry, then hold Shift to light it." : "Hold Shift to light the entry you're looking at." };
      case "lock":
        return deskControl("Click H on ChudGPT's map to lock the hatch. W is the window and B is the balcony.", "LOCK_HATCH");
      case "dash":
        return { text: approach };
      case "brace":
        if (state.player.position.kind === "DESK" || state.player.position.kind === "RETURNING") return { text: approach };
        return { text: state.player.position.kind === "TRAVELING" ? "Hold the left mouse button to brace as soon as you arrive." : "Hold the left mouse button to brace. Standing at an entry leaves it undefended." };
      case "release-brace":
        return { text: "Release the mouse button to rest. The ring shows how long your arms can hold." };
      case "return":
        return { text: back ?? "Head back to the desk." };
      case "location":
        return deskControl("Click “where is it” to ask ChudGPT which entry to check. Later it can mislead you or refuse a lock.", "ASK_LOCATION");
      case "relock":
        return deskControl("Click H to lock the hatch again.", "LOCK_HATCH");
      case "unlock":
        return deskControl("Click “unlock all” to clear the lock.", "POWER_OFF");
      case "chat":
        return deskControl("ChudGPT asks: “Are you ready for the night?” Type a reply in the chat box and press Enter.", "chat");
      case "pause":
        return { text: "Press Esc to pause. Press Esc again to resume." };
      case "ready":
        return { text: "Survive until 6:00 AM. House noises are decoys. Use the lights to check the entries and a lock or your hands to defend them." };
    }
  }

  private highlight(target?: Prompt["target"]): void {
    const selector = target === "chat" ? "#chat" : `[data-quick="${target}"]`;
    const next = target ? this.terminal.querySelector<HTMLElement>(selector) ?? undefined : undefined;
    if (next === this.highlighted) return;
    this.highlighted?.classList.remove("tutorial-target");
    next?.classList.add("tutorial-target");
    this.highlighted = next;
  }
}
