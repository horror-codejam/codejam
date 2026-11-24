// Kill-code papers (desk, reader and the slip at an entry). HTML overlays only; all rules live in the engine.
import "./codeDesk.css";
import { CONFIG } from "../config";
import type { GameEngine } from "../sim/engine";
import type { Entry } from "../sim/types";
import { CODE_PAPERS, FLOOR_PAPER } from "../uiConfig";
import type { Scene } from "./scene";


function jitter(i: number, n: number): number {
  const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}

function scrawl(text: string, seed: number): DocumentFragment {
  // Letters jitter one by one, but each word is kept whole (nowrap) so a line only breaks between words.
  const frag = document.createDocumentFragment();
  let i = 0;
  text.split(" ").forEach((word, w) => {
    if (w > 0) {
      frag.append(" ");
      i++;
    }
    const group = document.createElement("span");
    group.style.whiteSpace = "nowrap";
    for (const ch of word) {
      const span = document.createElement("span");
      span.textContent = ch;
      span.style.display = "inline-block";
      span.style.transform = `translateY(${(jitter(i, seed) * 5).toFixed(1)}px) rotate(${(jitter(i, seed + 9) * 9).toFixed(1)}deg)`;
      group.append(span);
      i++;
    }
    frag.append(group);
  });
  return frag;
}

export function createCodeDesk(root: HTMLElement, scene: Scene, getEngine: () => GameEngine) {
  const hotspots = document.createElement("div");
  hotspots.id = "code-desk";

  const paperButtons = CODE_PAPERS.map((paper) => {
    const button = document.createElement("button");
    button.className = "code-paper";
    button.title = paper.label;
    button.setAttribute("aria-label", "Read " + paper.label);
    const ch = document.createElement("span");
    button.append(ch);
    button.addEventListener("click", () => {
      getEngine().pickUpArtifact(paper.id);
      button.blur();
    });
    hotspots.append(button);
    return { paper, button };
  });

  // Paper reader
  const reader = document.createElement("div");
  reader.id = "code-reader";
  reader.className = "hidden";
  reader.innerHTML =
    '<svg width="0" height="0" aria-hidden="true"><filter id="code-shake"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter></svg>' +
    '<div class="sheet"><span class="idx"></span><div class="glyph"></div><div class="note"></div></div>';
  const sheet = reader.querySelector<HTMLElement>(".sheet")!;
  const idx = reader.querySelector<HTMLElement>(".idx")!;
  const glyph = reader.querySelector<HTMLElement>(".glyph")!;
  const note = reader.querySelector<HTMLElement>(".note")!;
  reader.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    getEngine().putDownArtifact();
  });
  reader.addEventListener("contextmenu", (e) => e.preventDefault());

  // The slip Ram leaves at an entry. Clicks are handled here and never reach the brace handler.
  const floor = document.createElement("button");
  floor.id = "floor-paper";
  floor.className = "hidden";
  floor.title = "A slip of paper";
  floor.setAttribute("aria-label", "Pick up the slip of paper");
  floor.textContent = "~";
  floor.addEventListener("mousedown", (e) => e.stopPropagation());
  floor.addEventListener("click", (e) => {
    e.stopPropagation();
    getEngine().pickUpFloorPaper();
    floor.blur();
  });

  root.prepend(hotspots, floor, reader);
  let current: string | null = null;

  const place = (el: HTMLElement, rect: { x: number; y: number; w: number; h: number }, tilt: number): void => {
    const r = scene.plateRect(rect);
    el.style.transform = `translate(${r.x}px, ${r.y}px) rotate(${tilt}deg)`;
    el.style.width = `${r.w}px`;
    el.style.height = `${r.h}px`;
    el.style.fontSize = `${Math.max(8, r.h * 0.5)}px`;
  };

  return {
    // on: desk view with nothing open. Papers shown are the collected ones, in order.
    render(on: boolean) {
      hotspots.classList.toggle("hidden", !on);
      if (!on) return;
      const engine = getEngine();
      const shown = engine.papersOnDesk();
      for (let i = 0; i < paperButtons.length; i++) {
        const { paper, button } = paperButtons[i];
        const visible = shown.includes(i);
        button.classList.toggle("hidden", !visible);
        if (visible) {
          place(button, paper.rect, paper.tilt);
          button.firstElementChild!.textContent = engine.paperChar(i);
        }
      }
    },
    // The slip at an entry: seen from the desk facing that entry (not clickable) and when standing or bracing there
    // (clickable). `lit` is that entry's light being on.
    renderFloor(playing: boolean) {
      const engine = getEngine();
      const s = engine.state;
      const fp = playing && s.player.reading === null ? engine.floorPaper() : null;
      const pos = s.player.position;
      const atEntry = !!fp && (pos.kind === "STANDING" || pos.kind === "HOLDING") && pos.entry === fp.entry;
      const deskFacing = !!fp && pos.kind === "DESK" && s.player.view === fp.entry;
      if (!fp || (!atEntry && !deskFacing)) {
        floor.classList.add("hidden");
        return;
      }
      const spot = FLOOR_PAPER[fp.entry as Entry];
      const r = atEntry ? spot.hold : spot.view;
      floor.classList.remove("hidden");
      place(floor, r, r.tilt);
      floor.classList.toggle("passive", !atEntry);
      floor.classList.toggle("lit", engine.beamIntensity(fp.entry) >= CONFIG.BEAM_REVEAL_THRESHOLD);
      floor.textContent = "~";
    },
    // Mirrors state.player.reading every frame, so any engine close (scare, dawn, night change) closes the overlay.
    sync(reading: string | null) {
      if (reading === current) return;
      current = reading;
      const paperIndex = reading ? CODE_PAPERS.findIndex((p) => p.id === reading) : -1;
      reader.classList.toggle("hidden", paperIndex < 0);
      if (paperIndex >= 0) {
        const paper = CODE_PAPERS[paperIndex];
        idx.textContent = `${paperIndex + 1}/${CODE_PAPERS.length}`;
        glyph.textContent = getEngine().paperChar(paperIndex);
        note.replaceChildren(scrawl(paper.line, paperIndex + 1));
        sheet.style.setProperty("--tilt", `${(jitter(paperIndex, 3) * 5).toFixed(1)}deg`);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
    },
    pause(on: boolean) {
      hotspots.inert = reader.inert = floor.inert = on;
    },
  };
}
