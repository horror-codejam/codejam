import { after } from "./timing";

export function renderLoss(screen: HTMLElement, title: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "loss";
  screen.replaceChildren();
  after(1500, signal, () => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "text-option screen-reveal";
    option.textContent = "Title";
    option.addEventListener("click", title);
    screen.append(option);
  });
}
