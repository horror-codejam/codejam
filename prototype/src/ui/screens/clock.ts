import { after } from "./timing";

const CARD_HOLD = 4000;
const CARD_FADE = 800;
const NIGHT_TIPS = [
  "Lock it, or hold it shut. Ask ChudGPT if you don't know where he is.",
  "The more ChudGPT thinks you'll leave, the more it lies and refuses.",
  "The noises aren't him. He makes no sound.",
  "Ask where he is too often and ChudGPT stops answering for a while.",
  "Too much flattery makes ChudGPT suspicious.",
];

export function renderNightCard(screen: HTMLElement, night: number, begin: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "night-card";
  screen.innerHTML = '<div class="screen-clock"><div>12:00 AM</div><p></p><p class="night-card-tip"></p></div>';
  screen.querySelector("p")!.textContent = `Night ${night}`;
  screen.querySelector(".night-card-tip")!.textContent = NIGHT_TIPS[night - 1];
  after(CARD_HOLD, signal, () => {
    screen.classList.add("night-card-fading");
    begin();
    after(CARD_FADE, signal, () => screen.classList.add("hidden"));
  });
}

export function renderMorning(screen: HTMLElement, next: () => void, signal: AbortSignal, dawn?: () => void): void {
  screen.dataset.screen = "morning";
  const time = document.createElement("div");
  time.className = "screen-clock";
  time.textContent = "5:59 AM";
  screen.replaceChildren(time);
  after(650, signal, () => {
    time.textContent = "6:00 AM";
    dawn?.();
  });
  after(2150, signal, next);
}
