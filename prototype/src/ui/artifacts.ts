import "./artifacts.css";
import type { GameEngine } from "../sim/engine";
import { ARTIFACTS } from "../uiConfig";
import { artUrl } from "./art";
import type { Scene } from "./scene";

const paperFiles = import.meta.glob<string>([
  "../../../scenes/03-watch-room/chud_launch_newspaper_clipping_v2.png",
  "../../../scenes/03-watch-room/daniel_vale_notebook.jpg",
  "../../../scenes/03-watch-room/leaving_calendar_aged_pen.png",
], { eager: true, import: "default", query: "?url" });
const paperSources: Record<string, string> = {
  artifact_clipping: "chud_launch_newspaper_clipping_v2.png",
  artifact_notebook: "daniel_vale_notebook.jpg",
  artifact_calendar: "leaving_calendar_aged_pen.png",
};

function paperUrl(slot: string): string | undefined {
  return artUrl(slot) ?? Object.entries(paperFiles).find(([file]) => file.endsWith(paperSources[slot]))?.[1];
}

export function createArtifacts(root: HTMLElement, scene: Scene, getEngine: () => GameEngine) {
  const hotspots = document.createElement("div");
  hotspots.id = "artifacts";
  const reader = document.createElement("div");
  reader.id = "reader";
  reader.className = "hidden";
  const image = document.createElement("img");
  image.alt = "";
  const placeholder = document.createElement("div");
  placeholder.className = "ph";
  reader.append(image, placeholder);

  const buttons = ARTIFACTS.map((artifact) => {
    const button = document.createElement("button");
    button.title = artifact.label;
    button.setAttribute("aria-label", "Read " + artifact.label);
    const url = paperUrl(artifact.slot);
    if (url) button.style.backgroundImage = `url("${url}")`;
    else button.textContent = artifact.label;
    button.addEventListener("click", () => {
      getEngine().pickUpArtifact(artifact.id);
      button.blur();
    });
    hotspots.append(button);
    return { artifact, button };
  });

  reader.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    getEngine().putDownArtifact();
  });
  reader.addEventListener("contextmenu", (event) => event.preventDefault());
  root.prepend(hotspots, reader);

  return {
    render(on: boolean) {
      hotspots.classList.toggle("hidden", !on);
      if (!on) return;
      for (const { artifact, button } of buttons) {
        const r = scene.plateRect(artifact.rect);
        button.style.transform = `translate(${r.x}px, ${r.y}px) rotate(${artifact.tilt}deg)`;
        button.style.width = `${r.w}px`;
        button.style.height = `${r.h}px`;
      }
    },
    read(id: string | null) {
      reader.classList.toggle("hidden", id === null);
      if (id === null) return;
      const artifact = ARTIFACTS.find((item) => item.id === id);
      const url = artifact && paperUrl(artifact.slot);
      image.classList.toggle("hidden", !url);
      placeholder.classList.toggle("hidden", !!url);
      if (url) image.src = url;
      else placeholder.textContent = artifact?.label ?? id;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    pause(on: boolean) {
      hotspots.inert = reader.inert = on;
    },
  };
}
