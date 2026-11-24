import type { Band, Entry, GameState } from "../sim/types";
import { CONFIG } from "../config";
import { artUrl, hasArt } from "./art";

const MOODS: Record<Band, { left: number; eyes: string[] }> = {
  WARM: { left: 20, eyes: ["37%", "63%", "42%"] },
  HURT: { left: 550, eyes: ["36%", "64%", "45%"] },
  JEALOUS: { left: 1080, eyes: ["37%", "66%", "43%"] },
  FURIOUS: { left: 1610, eyes: ["28%", "72%", "46%"] },
};
const FACE_GLYPH: Record<Band, string> = { WARM: "( ^_^ )", HURT: "( ._. )", JEALOUS: "( >_< )", FURIOUS: "( X_X )" };
const FACE_URL = artUrl("chud_faces");
const MALICIOUS_URL = artUrl("chud_face_malicious");
const MALICIOUS_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#ff4a3a" stroke-width="3"/><path d="M26 38 L42 44" stroke="#ff4a3a" stroke-width="5" stroke-linecap="round"/><path d="M74 38 L58 44" stroke="#ff4a3a" stroke-width="5" stroke-linecap="round"/><path d="M20 58 Q50 92 80 58 Q50 74 20 58 Z" fill="#ff4a3a"/><path d="M30 63 L34 69 M40 67 L42 74 M50 68 L50 76 M60 67 L58 74 M70 63 L66 69" stroke="#1a0000" stroke-width="2.5"/></svg>`;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const FACE_SIZE = 152;
const TYPE_RATE = 46;

export class Terminal {
  private face: HTMLElement;
  private log: HTMLElement;
  private question: HTMLElement;
  private map: HTMLButtonElement[];
  private cells: HTMLElement[];
  private clock: HTMLElement;
  private faceKey = "";
  private glitchUntil = 0;
  private typing?: { line: HTMLElement; text: string; since: number };

  readonly chat: HTMLInputElement;
  readonly form: HTMLFormElement;
  readonly quick: HTMLButtonElement[];

  constructor(readonly root: HTMLElement) {
    this.face = root.querySelector("#t-face")!;
    this.log = root.querySelector("#log")!;
    this.question = root.querySelector("#question")!;
    this.map = [...root.querySelectorAll<HTMLButtonElement>("#t-map [data-entry]")];
    this.cells = [...root.querySelectorAll<HTMLElement>("#t-power [data-cell]")];
    this.clock = root.querySelector("#t-clock")!;
    this.chat = root.querySelector("#chat")!;
    this.form = root.querySelector("#chat-form")!;
    this.quick = [...root.querySelectorAll<HTMLButtonElement>("[data-quick]")];
  }

  clear(): void {
    this.log.replaceChildren();
    this.typing = undefined;
    this.faceKey = "";
  }

  addLine(who: "me" | "chud", text: string, t: number): void {
    this.finishTyping();
    const line = document.createElement("div");
    line.className = who;
    if (who === "me") line.textContent = "> " + text;
    else if (REDUCED.matches) line.textContent = text;
    else {
      this.typing = { line, text, since: t };
      line.classList.add("typing");
    }
    this.log.append(line);
    while (this.log.children.length > 12) this.log.firstElementChild!.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  private finishTyping(): void {
    if (!this.typing) return;
    const { line, text } = this.typing;
    line.textContent = text;
    line.classList.remove("typing");
    this.typing = undefined;
  }

  render(
    state: GameState,
    clock: string,
    t: number,
    effects: { malicious: boolean; flicker: boolean; alertEntry: Entry | null; alert: boolean; lightCut: boolean },
  ): void {
    const { power, chud, player } = state;
    this.chat.disabled = !power.chudOnline;
    for (const button of this.quick) button.disabled = !power.chudOnline;
    this.root.classList.toggle("offline", !power.chudOnline);
    this.root.classList.toggle("flicker", effects.flicker && !REDUCED.matches);

    const question = chud.pendingQuestion;
    this.question.hidden = !power.chudOnline || !question;
    // A question is open: the face leans in and the chat cursor blinks faster (ChudGPT is waiting for the keeper).
    this.root.classList.toggle("awaiting", power.chudOnline && !!question);
    if (question && power.chudOnline) {
      const progress = Math.max(0, 1 - (state.clock.elapsed - question.askedAt) / CONFIG.QUESTION_TIMEOUT);
      this.question.style.transform = `scaleX(${progress})`;
    }
    if (this.typing && power.chudOnline) {
      const { line, text, since } = this.typing;
      const length = Math.floor((t - since) * TYPE_RATE) + 1;
      if (length >= text.length || REDUCED.matches) this.finishTyping();
      else updateText(line, text.slice(0, length));
    }
    this.renderFace(chud.band, power.chudOnline, effects.malicious, t, power.rebootingUntil !== null);
    updateText(this.clock, clock);

    const flash = REDUCED.matches || Math.floor(t * 6) % 2 === 0;
    const alert = effects.alert && flash;
    for (const marker of this.map) {
      const entry = marker.dataset.entry!;
      const locked = power.slot === `LOCK_${entry}`;
      marker.classList.toggle("locked", locked);
      marker.classList.toggle("lit", player.lightEntry === entry);
      marker.classList.toggle("pending", power.pending?.target === `LOCK_${entry}`);
      marker.classList.toggle("alert", alert && entry === effects.alertEntry);
      marker.setAttribute("aria-pressed", String(locked));
    }
    for (const cell of this.cells) {
      const key = cell.dataset.cell!;
      const light = key === "LIGHT";
      cell.classList.toggle("on", light ? player.lightEntry !== null : power.slot === key);
      cell.classList.toggle("pending", power.pending?.target === key);
      cell.classList.toggle("alert", light ? effects.lightCut && flash : alert && `LOCK_${effects.alertEntry}` === key);
    }
  }

  private renderFace(band: Band, online: boolean, malicious: boolean, t: number, rebooting: boolean): void {
    const key = !online ? (rebooting ? "BOOT" : "") : malicious ? "MALICIOUS" : band;
    const f = this.face;
    if (key !== this.faceKey) {
      this.glitchUntil = this.faceKey && online ? t + 0.2 : 0;
      this.faceKey = key;
      f.replaceChildren();
      f.style.backgroundImage = "";
      f.classList.toggle("malicious", online && malicious);
      const hasMoodSheet = hasArt("chud_faces") && !!FACE_URL;
      const hasMaliciousFace = hasArt("chud_face_malicious") && !!MALICIOUS_URL;
      f.classList.toggle("sprite", online && hasMoodSheet && !(malicious && hasMaliciousFace));
      if (!online) {
        f.textContent = key;
      } else if (malicious && hasMaliciousFace) {
        f.style.backgroundImage = `url("${MALICIOUS_URL}")`;
        f.style.backgroundSize = "contain";
        f.style.backgroundPosition = "center";
      } else if (hasMoodSheet) {
        const scale = FACE_SIZE / 540;
        const { left, eyes: [leftEye, rightEye, eyeY] } = MOODS[malicious ? "WARM" : band];
        f.style.backgroundImage = `url("${FACE_URL}")`;
        f.style.backgroundSize = `${2172 * scale}px ${724 * scale}px`;
        f.style.backgroundPosition = `${-left * scale}px ${-90 * scale}px`;
        f.style.setProperty("--eye-left", leftEye);
        f.style.setProperty("--eye-right", rightEye);
        f.style.setProperty("--eye-y", eyeY);
      } else if (malicious) {
        f.innerHTML = MALICIOUS_SVG;
      } else {
        f.textContent = FACE_GLYPH[band];
      }
    }
    const blink = t % 4.7 < 0.13;
    f.classList.toggle("blink", online && !malicious && hasArt("chud_faces") && blink && !REDUCED.matches);
    f.classList.toggle("glitch", online && t < this.glitchUntil && !REDUCED.matches);
  }
}

function updateText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
