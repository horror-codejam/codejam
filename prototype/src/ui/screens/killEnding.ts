// Night 5 endings: the kill code (CHUD dies, the hatch opens, then the exit scene) and the trapped ending. Text beats on black.
// The exit scene itself (down through the dungeon, rescued by the coast guard) is a teammate's work: plug it into
// renderExitScene below. Until then it goes straight to the credits.
import { renderCredits } from "./credits";
import { after } from "./timing";

const BEAT_MS = 4600;

interface Beat {
  text: string;
  chud?: boolean; // CHUD's green terminal font
  ms?: number;
}

const KILL_BEATS: Beat[] = [
  { text: "The screen fills with static. Then nothing. The hum in the walls stops." },
  { text: "Under the floor, a bolt slides back. The hatch opens by itself." },
];

const TRAPPED_BEATS: Beat[] = [
  { text: "6:00 AM.", ms: 3200 },
  { text: "The boat rocks below the cliff. The hatch will not open. The door will not open.", ms: 5600 },
  { text: "You don't need to leave, keeper. You never did.", chud: true, ms: 5600 },
];

// Plays the beats one after another; a click skips to the next one.
function runBeats(screen: HTMLElement, beats: Beat[], signal: AbortSignal, done: () => void): void {
  let i = 0;
  let beatAbort: AbortController | null = null;
  screen.replaceChildren();
  const next = (): void => {
    beatAbort?.abort();
    if (signal.aborted) return;
    if (i >= beats.length) {
      screen.onpointerdown = null;
      done();
      return;
    }
    const beat = beats[i++];
    const ms = beat.ms ?? BEAT_MS;
    const p = document.createElement("p");
    p.className = "ending-beat" + (beat.chud ? " chud" : "");
    p.textContent = beat.text;
    p.style.setProperty("--beat-ms", `${ms}ms`);
    screen.replaceChildren(p);
    beatAbort = new AbortController();
    after(ms, beatAbort.signal, next);
  };
  signal.addEventListener("abort", () => beatAbort?.abort(), { once: true });
  screen.onpointerdown = next;
  next();
}

export function renderKillCodeEnding(screen: HTMLElement, title: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "kill-ending";
  runBeats(screen, KILL_BEATS, signal, () => {
    screen.onpointerdown = null;
    renderExitScene(screen, () => renderCredits(screen, title, signal), signal);
  });
}

// Hook for the exit scene (teammate): walk down through the dungeon, then the coast guard rescue. Call `done` when it
// ends to roll the credits. Placeholder: no scene yet, straight to the credits.
export function renderExitScene(_screen: HTMLElement, done: () => void, _signal: AbortSignal): void {
  done();
}

export function renderTrapped(screen: HTMLElement, title: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "trapped";
  runBeats(screen, TRAPPED_BEATS, signal, () => {
    screen.onpointerdown = null;
    screen.replaceChildren();
    after(1500, signal, () => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "text-option screen-reveal";
      option.textContent = "Title";
      option.addEventListener("click", title);
      screen.append(option);
    });
  });
}
