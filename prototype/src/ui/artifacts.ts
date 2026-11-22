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
  reader.append(image);

  const papers = new Map(Object.entries(ARTIFACTS).flatMap(([id, artifact]) => {
    const url = paperUrl(artifact.slot);
    if (!url) return [];
    const button = document.createElement("button");
    button.type = "button";
    button.hidden = true;
    button.setAttribute("aria-label", "Read " + artifact.label);
    button.style.backgroundImage = `url("${url}")`;
    button.addEventListener("click", () => {
      getEngine().pickUpArtifact(id);
      button.blur();
    });
    hotspots.append(button);
    return [[id, { artifact, button, url }] as const];
  }));

  reader.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  reader.addEventListener("click", () => getEngine().putDownArtifact());
  reader.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    getEngine().putDownArtifact();
  });
  root.prepend(hotspots, reader);

  return {
    render(on: boolean) {
      const active = on ? getEngine().deskArtifact : undefined;
      for (const [id, { artifact, button }] of papers) {
        button.hidden = id !== active;
        if (button.hidden) continue;
        const r = scene.plateRect(artifact.paper);
        button.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%, -50%) perspective(${r.w * 3}px) rotateX(70deg) rotateZ(${artifact.tilt}deg)`;
        button.style.width = `${r.w}px`;
        button.style.height = `${r.h}px`;
      }
    },
    read(id: string | null) {
      const paper = id === null ? undefined : papers.get(id);
      reader.classList.toggle("hidden", !paper);
      if (!paper) return;
      image.src = paper.url;
      image.alt = paper.artifact.label;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    pause(on: boolean) {
      hotspots.inert = reader.inert = on;
    },
  };
}
