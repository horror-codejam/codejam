export function renderSafetyPause(screen: HTMLElement, resume: () => void): void {
  screen.dataset.screen = "safety";
  screen.innerHTML = `
    <div class="safety-message">
      <h1>PAUSED</h1>
      <p>This is only a game, and it is paused. If you are thinking about hurting yourself, you do not have to deal with it alone.</p>
      <p>In Canada, call or text 9-8-8 any time. Elsewhere, contact a local crisis line or emergency services.</p>
      <button type="button">Continue the game</button>
    </div>`;
  screen.querySelector("button")!.addEventListener("click", resume);
}
