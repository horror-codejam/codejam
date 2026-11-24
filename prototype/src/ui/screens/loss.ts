import type { LossInfo } from "../../sim/types";
import { after } from "./timing";

const BLACK_HOLD = 350;
const REASON_HOLD = 4000;

export function lossLine(loss: LossInfo): string {
  const entry = loss.entry.toLowerCase();
  const breach = `He came in through the ${entry}.`;
  switch (loss.cause) {
    case "POWER_OFF":
      return `The power was off. ${breach}`;
    case "FURIOUS":
    case "SABOTAGE":
      return `ChudGPT cut the lock on the ${entry}.`;
    case "REFUSED":
      return `ChudGPT refused to lock the ${entry}.`;
    case "LIED":
      if (loss.lastClaim === "NONE") return `ChudGPT lied. He was at the ${entry} when it said no one was there.`;
      if (loss.lastClaim) return `ChudGPT lied. He was at the ${entry}, not the ${loss.lastClaim.toLowerCase()}.`;
      return `ChudGPT lied about where he was. ${breach}`;
    case "ARMS_GAVE_OUT":
      return `Your arms gave out. ${breach}`;
    case "WRONG_HOLD":
      return loss.heldEntry ? `${breach} You were at the ${loss.heldEntry.toLowerCase()}.` : breach;
    case "UNLOCKED":
      if (loss.reason === "DAWN" || (loss.insideFor > 0 && (loss.reason === "LOOK" || loss.reason === "ARRIVED"))) {
        return `He was already inside. He got in through the ${entry} earlier.`;
      }
      return `${breach} Nothing was holding it shut.`;
  }
}

export function renderLoss(screen: HTMLElement, loss: LossInfo | null, title: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "loss";
  screen.replaceChildren();
  after(BLACK_HOLD, signal, () => {
    const reason = document.createElement("p");
    reason.className = "loss-reason";
    // The dev screen preview can open without a breach.
    reason.textContent = loss ? lossLine(loss) : "He came in through the hatch. Nothing was holding it shut.";
    screen.append(reason);
    const skip = (event: Event): void => {
      if (event instanceof KeyboardEvent && event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      title();
    };
    screen.addEventListener("click", skip, { signal });
    window.addEventListener("keydown", skip, { capture: true, signal });
    after(REASON_HOLD, signal, title);
  });
}
