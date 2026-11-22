import { artUrl, hasArt } from "../art";

export function renderName(screen: HTMLElement, confirm: (name: string) => void): void {
  screen.dataset.screen = "name";
  screen.innerHTML = `
    <div class="name-plate" aria-hidden="true"></div>
    <form class="name-prompt" autocomplete="off">
      <label for="keeper-name">What should I call you, keeper?</label>
      <input id="keeper-name" type="text" maxlength="24" spellcheck="false" />
    </form>`;
  if (hasArt("intro")) screen.querySelector<HTMLElement>(".name-plate")!.style.backgroundImage = `url("${artUrl("intro")}")`;
  const input = screen.querySelector<HTMLInputElement>("#keeper-name")!;
  input.form!.addEventListener("submit", (event) => {
    event.preventDefault();
    confirm(input.value.trim() || "Keeper");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    input.form!.requestSubmit();
  });
  input.focus();
}
