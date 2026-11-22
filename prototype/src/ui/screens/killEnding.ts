// Night 5 endings: the kill code (CHUD dies, the hatch opens, then the exit scene) and the trapped ending. Text beats on black.
import cageHall from "../../../../art/end-cutscene/01-cage-hall.webp?url";
import rescueBoat from "../../../../art/end-cutscene/02-rescue-boat.webp?url";
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

// The exit scene: Vidush's two Blender stills (art/end-cutscene/), each with a slow push-in and a caption per beat.
// A click skips to the next caption. Calls `done` at the end to roll the credits.
interface Shot {
  src: string;
  alt: string;
  captions: string[];
}

const EXIT_SHOTS: Shot[] = [
  {
    src: cageHall,
    alt: "A hall of cages under the lighthouse",
    captions: [
      "Under the hatch, a hall of cages. Every keeper before you.",
      "The doors stand open. The thing at the bars does not move. It has nothing telling it to.",
    ],
  },
  {
    src: rescueBoat,
    alt: "The lighthouse from the deck of a rescue boat",
    captions: ["At the end of the tunnel, the sea. A coast guard boat, its engine running.", "Behind you, the lamp keeps turning. Nobody is keeping it."],
  },
];

const CAPTION_MS = 5200;
const SHOT_FADE_MS = 1400;

export function renderExitScene(screen: HTMLElement, done: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "exit-scene";
  const steps = EXIT_SHOTS.flatMap((shot, s) => shot.captions.map((text, c) => ({ s, text, first: c === 0 })));
  const frame = document.createElement("div");
  frame.className = "exit-frame";
  const caption = document.createElement("p");
  caption.className = "exit-caption";
  screen.replaceChildren(frame, caption);
  let i = 0;
  let stepAbort: AbortController | null = null;
  const next = (): void => {
    stepAbort?.abort();
    if (signal.aborted) return;
    if (i >= steps.length) {
      screen.onpointerdown = null;
      frame.classList.add("out");
      caption.remove();
      after(SHOT_FADE_MS, signal, done);
      return;
    }
    const step = steps[i++];
    if (step.first) {
      const shot = EXIT_SHOTS[step.s];
      const img = document.createElement("img");
      img.className = "exit-shot";
      img.src = shot.src;
      img.alt = shot.alt;
      img.style.setProperty("--shot-ms", `${shot.captions.length * CAPTION_MS + SHOT_FADE_MS}ms`);
      const old = frame.querySelector(".exit-shot");
      frame.append(img);
      if (old) after(SHOT_FADE_MS, signal, () => old.remove());
    }
    caption.textContent = step.text;
    caption.style.animation = "none";
    void caption.offsetWidth; // restart the fade for each caption
    caption.style.animation = "";
    stepAbort = new AbortController();
    after(CAPTION_MS, stepAbort.signal, next);
  };
  caption.style.setProperty("--beat-ms", `${CAPTION_MS}ms`);
  signal.addEventListener("abort", () => stepAbort?.abort(), { once: true });
  screen.onpointerdown = next;
  next();
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
