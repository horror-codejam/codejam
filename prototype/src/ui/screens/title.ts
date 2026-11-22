import { artUrl, artVideoUrl, isFinal } from "../art";

export const GAME_TITLE = "R.A.M.";
export const GAME_SUBTITLE = "RANDOM ACCESS MONSTER";

const TITLE_PLATES = ["title_bg", "view_desk_off"];
type TitleActions = {
  start: () => void;
  resume?: { night: number; start: () => void };
  activateAudio: () => void;
};

export function renderTitle(screen: HTMLElement, actions: TitleActions): void {
  screen.dataset.screen = "title";
  screen.innerHTML = `
    <div class="title-plate" aria-hidden="true"></div>
    <div class="title-rain" aria-hidden="true"></div>
    <div class="title-grain" aria-hidden="true"></div>
    <div class="title-copy">
      <h1></h1>
      <p class="title-sub"></p>
      <nav aria-label="Title">
        <button type="button" class="text-option" data-new-game>New Game</button>
      </nav>
    </div>`;
  screen.querySelector("h1")!.textContent = GAME_TITLE;
  screen.querySelector(".title-sub")!.textContent = GAME_SUBTITLE;
  const slot = TITLE_PLATES.find(isFinal);
  const plate = slot ? artUrl(slot) : null;
  const background = screen.querySelector<HTMLElement>(".title-plate")!;
  if (plate) background.style.backgroundImage = `url("${plate}")`;
  const videoUrl = artVideoUrl("title_loop");
  if (videoUrl && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.src = videoUrl;
    video.addEventListener("playing", () => video.classList.add("playing"));
    video.addEventListener("error", () => video.remove());
    background.append(video);
    void video.play().catch(() => video.remove());
  }
  screen.querySelector<HTMLElement>(".title-rain")!.style.backgroundImage = `url("${rainTexture()}")`;
  screen.querySelector<HTMLElement>(".title-grain")!.style.backgroundImage = `url("${grainTexture()}")`;
  const start = screen.querySelector<HTMLButtonElement>("[data-new-game]")!;
  start.addEventListener("click", actions.start);
  if (actions.resume) {
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "text-option";
    resume.dataset.continue = "";
    resume.textContent = `Continue Night ${actions.resume.night}`;
    resume.addEventListener("click", actions.resume.start);
    screen.querySelector("nav")!.append(resume);
  }
  screen.onpointerdown = actions.activateAudio;
  screen.onkeydown = actions.activateAudio;
}

function rainTexture(): string {
  const tile = document.createElement("canvas");
  tile.width = 384;
  tile.height = 512;
  const ctx = tile.getContext("2d")!;
  for (let i = 0; i < 108; i++) {
    const x = Math.random() * tile.width;
    const y = Math.random() * tile.height;
    const length = 13 + Math.random() * 38;
    ctx.strokeStyle = `rgba(189, 207, 210, ${0.08 + Math.random() * 0.24})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - length * 0.2, y + length);
    ctx.stroke();
  }
  return tile.toDataURL();
}

function grainTexture(): string {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const ctx = tile.getContext("2d")!;
  const data = ctx.createImageData(tile.width, tile.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const value = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return tile.toDataURL();
}
