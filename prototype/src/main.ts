// Playable loop: engine (src/sim) + PixiJS scene (src/ui/scene) + DOM HUD + synthesized sound.
// The UI only reads engine.state and calls engine methods. All rules live in the engine.

import { Application } from "pixi.js";
import { judge, lastJudgeSource } from "./chud/judgeClient";
import { checkLlm, llm, VOICED, voiceRemote } from "./chud/llmClient";
import { CONFIG } from "./config";
import { GameEngine } from "./sim/engine";
import type { Band, Entry, GameEvent, LossInfo, Phase, PowerSlot, QuickCommand, RejectReason, View } from "./sim/types";
import { artUrl, loadArt } from "./ui/art";
import { Sound } from "./ui/audio";
import { EDGE_TARGET, EdgeTurner, EDGES } from "./ui/edges";
import { H, W } from "./ui/layout";
import { Scene } from "./ui/scene";
import { RING } from "./uiConfig";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// URL params: ?dev (dev mode on, ?dev=0 off) and ?night=N (start straight at that night's card as "Keeper").
const params = new URLSearchParams(window.location.search);
const deepNight = ((): number | null => {
  const raw = params.get("night");
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= CONFIG.nights.length ? n : null;
})();
const engine = new GameEngine({
  seed: Date.now() % 2147483647,
  ...(deepNight ? { startNight: deepNight, skipNamePrompt: true, facts: { name: "Keeper" } } : {}),
});
const sound = new Sound();
let scene: Scene;
if (import.meta.env.DEV) Object.assign(window, { engine }); // console access while developing

const ui = {
  hud: $("hud"),
  clock: $("clock"),
  power: $("power"),
  chudStatus: $("chud-status"),
  hint: $("hint"),
  desk: $("terminal"),
  face: $("t-face"),
  band: $("t-band"),
  tClock: $("t-clock"),
  map: $("t-map"),
  powerCells: $("t-power"),
  log: $("log"),
  question: $("question"),
  questionLabel: $("question-label"),
  questionBar: $("question-bar"),
  chatForm: $<HTMLFormElement>("chat-form"),
  chat: $<HTMLInputElement>("chat"),
  chatNote: $("chat-note"),
  kill: $<HTMLButtonElement>("kill"),
  edges: $("edges"),
  braceHint: $("brace-hint"),
  holdPanel: $("hold-panel"),
  ring: $("ring"),
  subtitle: $("subtitle"),
  screen: $("screen"),
  dev: $("dev"),
  devBadge: $("dev-badge"),
  devText: $("dev-text"),
  devBtns: $("dev-btns"),
  pauseBtn: $<HTMLButtonElement>("pause-btn"),
  pause: $("pause"),
};

const NAME: Record<Entry, string> = { WINDOW: "window", HATCH: "hatch", BALCONY: "balcony" };

// CHUD's face: Vidush's four-mood sheet (2172 x 724, WARM HURT JEALOUS FURIOUS left to right),
// one 540 px square frame per band, shown through CSS background-position.
const FACE_URL = artUrl("chud_faces");
const FACE_SHEET = { w: 2172, h: 724, frame: 540, top: 90, left: [20, 550, 1080, 1610] };
const BAND_INDEX: Record<Band, number> = { WARM: 0, HURT: 1, JEALOUS: 2, FURIOUS: 3 };
const FACE_GLYPH: Record<Band, string> = { WARM: "( ^_^ )", HURT: "( ._. )", JEALOUS: "( >_< )", FURIOUS: "( X_X )" };

// UI-only state
let voiceLog = "";
let morningLine = "";
let loss: LossInfo | null = null;
let lastPhase: Phase | null = null;
let breachShown = false;
let subtitleUntil = 0;
let hintUntil = 0;
let noteUntil = 0;
let powerAlarmUntil = 0;
let speed = 1;
const DEV_KEY = "chud.dev";
let devOn = false; // dev mode: badge visible, shortcuts live
let devOpen = false; // panel open
let devNextAt = 0;
let devSkipCard = false; // N buttons go straight into PLAYING
let previewing = false; // a dev screen preview is up: the night is frozen behind it
let previewSaved: { loss: LossInfo | null; morningLine: string } | null = null;
const devRefs: { speed: HTMLButtonElement[]; skip?: HTMLButtonElement; llm?: HTMLButtonElement } = { speed: [] };
let paused = false; // UI-level pause: engine.tick is skipped, audio suspended
let skipDt = false; // first frame after a resume gets dt 0
let nightToken = 0; // drops LLM replies that arrive after a night restarts
let convo: string[] = []; // recent "Keeper: ..." / "CHUD: ..." lines, context for the voice
let edges: EdgeTurner;
let braceDown = false; // left mouse button held down (edge controls: holding it braces)
let pressSpent = false; // this press's brace already ended by HOLD_MAX: a new press is needed to brace again
let wasBracing = false; // position was a brace (HOLDING) at the last reconcile
let frameScale = 1; // stage px to screen px, for the cursor ring
const now = (): number => performance.now() / 1000;

// ---------------------------------------------------------------------------
// Boot

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ width: W, height: H, background: "#000000", antialias: true });
  $("stage").appendChild(app.canvas);
  const art = await loadArt();
  if (art.length) console.info("art slots loaded:", art.join(", "));
  void checkLlm().then((on) => console.info(on ? "CHUD: LLM judge and voice on" : "CHUD: offline judge and canned lines"));
  scene = new Scene(app);
  scene.onThunder = () => sound.thunder();
  scene.onRamPush = (entry) => sound.bracePush(entry);
  if (import.meta.env.DEV) Object.assign(window, { scene });
  edges = new EdgeTurner($("stage"));
  fit();
  window.addEventListener("resize", fit);
  wireInput();
  buildDevButtons();
  initDev();
  app.ticker.add((tk) => frame(tk.deltaMS / 1000));
}

function fit(): void {
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  frameScale = k;
  const f = $("frame");
  f.style.transformOrigin = "0 0";
  f.style.transform = `scale(${k}) translate(-50%, -50%)`;
}

// ---------------------------------------------------------------------------
// Frame

function frame(dt: number): void {
  const t = now();
  // Anything that leaves PLAYING (a judge verdict that triggers the safety pause, a dev jump) ends the pause.
  if (paused && engine.state.phase !== "PLAYING") setPaused(false);
  if (skipDt) {
    dt = 0;
    skipDt = false;
  }
  // Paused: no tick, so the night clock, Ram, CHUD timers and silence all stand still. Replies still apply.
  // Clamp so a hidden tab (no frames) does not fast-forward the night.
  if (!paused && !previewing) {
    engine.tick(Math.min(dt, 0.1) * speed);
    reconcileBrace();
  }
  for (const ev of engine.drainEvents()) onEvent(ev, t);
  const phase = engine.state.phase;
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase !== "BREACH") showScreen(phase);
    if (phase === "PLAYING" && engine.state.run.night === 1 && engine.state.clock.elapsed < 1) {
      ui.hint.textContent = "Push the mouse to the left, right or bottom edge to look around";
      hintUntil = t + 8;
    }
  }
  edgeTurn(t);
  scene.update(engine, t);
  renderHud(t);
  if (devOpen && t > devNextAt) {
    devNextAt = t + 0.2;
    renderDev();
  }
}

function onEvent(ev: GameEvent, t: number): void {
  switch (ev.type) {
    case "NIGHT_CARD":
      voiceLog = ev.voiceLog;
      sound.stopCues();
      sound.windowMask = ev.night >= 4 ? 0.55 : 1;
      ui.log.replaceChildren();
      nightToken++;
      convo = [];
      hintUntil = 0;
      breachShown = false;
      loss = null;
      // also covers retry and dev jumps within the same phase; a dev jump with "skip night card" is already PLAYING
      if (engine.state.phase === "PLAYING") show(ui.screen, false);
      else showScreen("NIGHT_CARD");
      break;
    case "RAM_APPROACH":
      sound.approachStart();
      break;
    case "RAM_AT_ENTRY":
      sound.entryStart(ev.entry);
      break;
    case "RAM_RETREAT":
      sound.retreat(ev.entry);
      say(`RAM: "${ev.shout}"`, "ram", t, 3);
      addLog("ram", ev.shout);
      break;
    case "POWER_CHANGED":
      sound.relay(ev.cause === "sabotage" || ev.cause === "furious" || ev.cause === "kill_switch");
      if (ev.cause === "sabotage" || ev.cause === "furious") powerAlarmUntil = t + 2.5;
      break;
    case "CHUD_SAY": {
      if (!ev.text) break;
      const o = ev.outcome;
      if (o.kind === "morning") morningLine = ev.text;
      if (!llm.on || !VOICED.has(o.kind)) {
        showChud(ev.text, t);
        break;
      }
      // Code already decided the outcome; the LLM only words it. Canned line if it fails or is slow.
      const token = nightToken;
      const typing = addLog("typing", "CHUD is typing...");
      void voiceRemote({
        kind: o.kind,
        pass: o.kind === "answer_ack" ? o.pass : undefined,
        qtype: o.kind === "answer_ack" ? o.type : undefined,
        canned: ev.text,
        band: ev.band,
        name: engine.state.chud.facts.name ?? "",
        night: engine.state.run.night,
        recent: convo.slice(-6),
      }).then((text) => {
        typing.remove();
        if (token === nightToken) showChud(text ?? ev.text, now());
      });
      break;
    }
    case "RADIO":
      sound.radio();
      say(`RADIO: "${ev.text}"`, "radio", t, 4);
      addLog("radio", ev.text);
      break;
    case "HINT":
      ui.hint.textContent = ev.text;
      hintUntil = t + 6;
      break;
    case "PLAYER_MOVED":
      if (ev.position.kind === "TRAVELING" || ev.position.kind === "RETURNING") sound.footsteps(CONFIG.TRAVEL_TIME);
      if (ev.position.kind === "HOLDING") sound.braceStart();
      break;
    case "HOLD_ENDED":
      sound.braceEnd(ev.reason === "arms");
      break;
    case "MESSAGE_REJECTED":
      note(ev.reason, t);
      break;
    case "BREACH":
      loss = ev.loss;
      sound.breach();
      scene.jumpscare = ev.loss.entry;
      window.setTimeout(() => {
        scene.jumpscare = null;
        if (engine.state.phase === "BREACH" && !breachShown) {
          breachShown = true;
          showScreen("BREACH");
        }
      }, 1100);
      break;
    case "NIGHT_WON":
    case "GAME_WON":
      sound.morning();
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// HUD

function say(text: string, kind: "chud" | "ram" | "radio", t: number, secs?: number): void {
  ui.subtitle.textContent = text;
  ui.subtitle.className = kind;
  ui.subtitle.style.opacity = "1";
  subtitleUntil = t + (secs ?? Math.max(2.5, text.length * 0.06));
}

const LOG_PREFIX = { me: "> ", chud: "CHUD: ", ram: "RAM (outside): ", radio: "RADIO: ", typing: "" };

function addLog(who: keyof typeof LOG_PREFIX, text: string): HTMLElement {
  const d = document.createElement("div");
  d.className = who;
  d.textContent = LOG_PREFIX[who] + text;
  ui.log.appendChild(d);
  while (ui.log.children.length > 7) ui.log.firstChild!.remove();
  return d;
}

function showChud(text: string, t: number): void {
  say(text, "chud", t);
  addLog("chud", text);
  convo.push(`CHUD: ${text}`);
  sound.chime();
  scene.speakingUntil = t + Math.min(3, 0.4 + text.length * 0.035);
}

const NOTE: Record<RejectReason, string> = {
  CHUD_OFFLINE: "CHUD is offline.",
  NOT_AT_DESK: "You have to be at the desk to type.",
  RATE_LIMIT: "Too fast. One message every 1.5 s.",
  TOO_LONG: "200 characters max.",
  EMPTY: "",
  NOT_PLAYING: "",
};

function note(reason: RejectReason, t: number): void {
  ui.chatNote.textContent = NOTE[reason];
  noteUntil = t + 2;
}

function slotLabel(slot: PowerSlot): string {
  if (slot === "NONE") return "NONE";
  if (slot === "BEAM") return "BEAM";
  return "LOCK " + slot.slice(5);
}

function clockText(): string {
  const s = engine.state;
  const hl = CONFIG.HOUR_LENGTH;
  const hour = Math.min(6, Math.floor(s.clock.elapsed / hl));
  const min = hour >= 6 ? 0 : Math.floor(((s.clock.elapsed % hl) / hl) * 60);
  return `NIGHT ${s.run.night} · ${hour === 0 ? 12 : hour}:${String(min).padStart(2, "0")} AM`;
}

function setText(el: HTMLElement, v: string): void {
  if (el.textContent !== v) el.textContent = v;
}

function show(el: HTMLElement, on: boolean): void {
  el.classList.toggle("hidden", !on);
}

function renderHud(t: number): void {
  const s = engine.state;
  const playing = s.phase === "PLAYING";
  const pos = s.player.position;
  const atDesk = pos.kind === "DESK";
  const view = s.player.view;

  show(ui.pauseBtn, playing && !paused);
  show(ui.pause, paused);
  show(ui.hud, s.phase !== "NAME_PROMPT");
  setText(ui.clock, clockText());

  const p = s.power;
  let power = !p.generatorOn ? "GENERATOR OFF" : `POWER: ${slotLabel(p.slot)}`;
  if (p.generatorOn && p.pending) power += ` → ${slotLabel(p.pending.target)}`;
  setText(ui.power, power);
  ui.power.classList.toggle("switching", !!p.pending);
  ui.power.classList.toggle("cut", t < powerAlarmUntil);

  const status = p.chudOnline ? `CHUD · ${s.chud.band}` : p.rebootingUntil !== null ? "CHUD · REBOOTING" : "CHUD · OFFLINE";
  setText(ui.chudStatus, status);

  // At the desk the log already shows every line, so subtitles only appear away from it.
  const deskView = playing && atDesk && view === "DESK";
  if (t > subtitleUntil || deskView) ui.subtitle.style.opacity = "0";
  show(ui.hint, playing && t < hintUntil);
  if (t > noteUntil) setText(ui.chatNote, "");

  // CHUD's terminal on the desk screen, following the camera pan
  const deskOn = deskView;
  show(ui.desk, deskOn);
  if (deskOn) {
    renderTerminal(t);
    ui.chat.disabled = !p.chudOnline;
    for (const b of ui.desk.querySelectorAll<HTMLButtonElement>("[data-quick]")) b.disabled = !p.chudOnline;
    ui.kill.classList.toggle("off", !p.generatorOn);
    ui.kill.querySelector("b")!.textContent = p.generatorOn ? "ON" : "OFF";
    const q = s.chud.pendingQuestion;
    show(ui.question, !!q && p.chudOnline);
    if (q) {
      const left = 1 - (s.clock.elapsed - q.askedAt) / CONFIG.QUESTION_TIMEOUT;
      ui.questionBar.style.width = `${Math.max(0, left) * 100}%`;
      setText(ui.questionLabel, q.gateFor ? `CHUD wants an answer before it locks the ${NAME[q.gateFor]}` : "CHUD is waiting for an answer");
    }
  } else if (document.activeElement === ui.chat) {
    ui.chat.blur();
  }

  // edge indicators, the brace hint and the cursor ring (edge controls)
  const atEntry = pos.kind === "STANDING" || (pos.kind === "HOLDING" && !!pos.stay);
  const canLook = playing && !paused && (atDesk || atEntry);
  show(ui.edges, canLook);
  if (canLook) {
    for (const el of ui.edges.querySelectorAll<HTMLElement>(".edge")) {
      const edge = el.dataset.edge as (typeof EDGES)[number];
      const to = EDGE_TARGET[view][edge];
      show(el, !!to);
      if (!to) continue;
      setText(el.querySelector("span")!, to === "DESK" ? "DESK" : to === "BALCONY" ? "BEHIND" : to);
      el.classList.toggle("on", edges.active === edge);
    }
  }
  const hint = !playing || paused ? null : braceHint(view);
  show(ui.braceHint, hint !== null);
  if (hint !== null) setText(ui.braceHint, hint);
  show(ui.holdPanel, playing && pos.kind === "HOLDING");
  renderRing();
}

function braceHint(view: View): string | null {
  const s = engine.state;
  const pos = s.player.position;
  const now = s.clock.elapsed;
  if (pos.kind === "DESK" && view !== "DESK") return now < s.player.holdCooldownUntil ? "Catching your breath..." : `Click to go to the ${NAME[view]}`;
  if (pos.kind === "STANDING") return now < pos.restUntil ? "Arms resting..." : "Hold left click to brace. Edge to go back.";
  return null;
}

// One small ring on the pointer for whichever timer is running: edge dwell (fills), arms left while bracing
// (drains, red near the end), faint progress for the brace rest and HOLD_COOLDOWN. Hidden while walking (the
// dash to an entry and back) and otherwise.
function renderRing(): void {
  const s = engine.state;
  const pos = s.player.position;
  const now = s.clock.elapsed;
  let k = -1;
  let color = RING.FAINT;
  if (s.phase === "PLAYING" && !paused && edges.pointer.inside) {
    if (edges.active !== null) {
      k = edges.progress;
      color = RING.DWELL;
    } else if (pos.kind === "HOLDING") {
      const left = Math.max(0, pos.since + CONFIG.HOLD_MAX - now);
      k = left / CONFIG.HOLD_MAX;
      color = left <= RING.BRACE_WARN ? RING.BRACE_LOW : RING.BRACE;
    } else if (pos.kind === "STANDING" && now < pos.restUntil) {
      k = 1 - (pos.restUntil - now) / CONFIG.BRACE_REST;
    } else if (pos.kind === "DESK" && s.player.view !== "DESK" && now < s.player.holdCooldownUntil) {
      k = 1 - (s.player.holdCooldownUntil - now) / CONFIG.HOLD_COOLDOWN;
    }
  }
  show(ui.ring, k >= 0);
  if (k < 0) return;
  const size = RING.SIZE / frameScale; // the ring lives in stage px; keep it the same size on screen
  const el = ui.ring;
  el.style.width = el.style.height = `${size}px`;
  el.style.transform = `translate(${(edges.pointer.x - size / 2).toFixed(1)}px, ${(edges.pointer.y - size / 2).toFixed(1)}px)`;
  const sw = String((RING.STROKE * 36) / RING.SIZE); // viewBox units
  const track = el.querySelector<SVGCircleElement>(".track")!;
  const arc = el.querySelector<SVGCircleElement>(".arc")!;
  track.setAttribute("stroke", RING.TRACK);
  track.setAttribute("stroke-width", sw);
  arc.setAttribute("stroke", color);
  arc.setAttribute("stroke-width", sw);
  arc.setAttribute("stroke-dasharray", `${Math.max(0, Math.min(1, k)).toFixed(4)} 1`);
}

let faceKey = "";

function renderTerminal(t: number): void {
  const s = engine.state;
  const p = s.power;

  const r = scene.deskScreenRect();
  ui.desk.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
  ui.desk.style.opacity = String(1 - scene.fadeAlpha);

  // face by band; blank while offline, a reboot readout while rebooting
  const band = s.chud.band;
  let key: string;
  if (p.chudOnline) key = band;
  else if (p.rebootingUntil !== null) key = `REBOOT ${Math.round((1 - Math.max(0, p.rebootingUntil - s.clock.elapsed) / CONFIG.REBOOT_TIME) * 100)}%`;
  else key = "OFFLINE";
  if (key !== faceKey) {
    faceKey = key;
    const f = ui.face;
    f.classList.toggle("off", !p.chudOnline);
    f.classList.toggle("furious", p.chudOnline && band === "FURIOUS");
    if (!p.chudOnline) {
      f.textContent = key;
    } else if (FACE_URL) {
      const k = f.clientWidth / FACE_SHEET.frame || 120 / FACE_SHEET.frame;
      f.textContent = "";
      f.style.backgroundImage = `url("${FACE_URL}")`;
      f.style.backgroundSize = `${FACE_SHEET.w * k}px ${FACE_SHEET.h * k}px`;
      f.style.backgroundPosition = `${-FACE_SHEET.left[BAND_INDEX[band]] * k}px ${-FACE_SHEET.top * k}px`;
    } else {
      f.textContent = FACE_GLYPH[band];
    }
    setText(ui.band, p.chudOnline ? band : "");
  }
  ui.face.classList.toggle("talking", p.chudOnline && t < scene.speakingUntil);

  setText(ui.tClock, clockText().split("· ")[1] ?? "");

  // map: entries and lock state only, never Ram (a display only on this branch: holds start from the entry view)
  for (const g of ui.map.querySelectorAll<SVGGElement>(".entry")) {
    const lock = `LOCK_${g.dataset.entry}` as PowerSlot;
    g.classList.toggle("locked", p.slot === lock);
    g.classList.toggle("pending", p.pending?.target === lock);
  }

  // power bar: 4 cells, green = what the one slot feeds now; all red = NONE; flashing red on a cut
  ui.powerCells.classList.toggle("cut", t < powerAlarmUntil && Math.floor(t * 6) % 2 === 0);
  for (const c of ui.powerCells.querySelectorAll<HTMLElement>("i")) {
    c.classList.toggle("on", p.slot === c.dataset.cell);
    c.classList.toggle("pending", p.pending?.target === c.dataset.cell);
  }
}

// ---------------------------------------------------------------------------
// Screens

const CAUSE: Record<LossInfo["cause"], (l: LossInfo) => string> = {
  UNLOCKED: () => "Nothing was locked or held.",
  LIED: (l) => (l.lastClaim === "NONE" || l.lastClaim === null ? "CHUD told you no one was there." : `CHUD told you: "the ${NAME[l.lastClaim]}."`),
  SABOTAGE: () => `CHUD cut the power to the lock. "Oops. The generator's acting up."`,
  FURIOUS: () => "CHUD cut the power on purpose.",
  WRONG_HOLD: (l) => `You were holding the ${l.heldEntry ? NAME[l.heldEntry] : "wrong entry"}.`,
  ARMS_GAVE_OUT: () => "Your arms gave out before he left.",
  POWER_OFF: () => "The generator was off.",
};

function card(html: string, cls = "", art: string | null = null): void {
  ui.screen.innerHTML = `<div class="card ${cls}">${html}</div>`;
  // a render behind the card (intro, endings); none means the plain dark overlay
  const url = art ? artUrl(art) : null;
  ui.screen.classList.toggle("art", !!url);
  ui.screen.style.backgroundImage = url ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url("${url}")` : "";
  show(ui.screen, true);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function showScreen(phase: Phase): void {
  const s = engine.state;
  const n = s.run.night;
  switch (phase) {
    case "NAME_PROMPT": {
      card(`
        <h1>CHUD</h1>
        <p>A storm. A lighthouse. A voice from the console.</p>
        <p style="color:var(--crt)">"Hello, keeper. What should I call you?"</p>
        <form id="name-form"><input id="name" maxlength="24" placeholder="Your name" autofocus /><br /><button>Begin</button></form>
        <p class="small">Headphones on. Sound tells you where he is.</p>`,
        "",
        "intro",
      );
      const form = $<HTMLFormElement>("name-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        sound.unlock();
        engine.setName($<HTMLInputElement>("name").value.trim() || "Keeper");
      });
      $<HTMLInputElement>("name").focus();
      break;
    }
    case "NIGHT_CARD":
      card(`
        <h1>NIGHT ${n}</h1>
        <p>12:00 AM. SURVIVE UNTIL 6 AM.</p>
        <p class="log">${esc(voiceLog)}</p>
        <p class="small">Look around: push the mouse to the left edge (window), right edge (hatch) or bottom edge (behind you). The opposite edge brings you back (the bottom again from behind).<br />Go to an entry: look at it and click. There, hold the left mouse button to brace it (your arms last a few seconds). Push the mouse to the same edge as before to run back to the desk.<br />At the desk, just start typing to talk to CHUD, Enter sends. Esc pauses.</p>
        <button id="go">Start night ${n}</button>`);
      $("go").addEventListener("click", () => {
        sound.unlock();
        engine.beginNight();
      });
      $("go").focus();
      break;
    case "BREACH": {
      const l = loss;
      if (!l) break;
      const claim = l.cause !== "LIED" && l.lastClaim ? `<p class="small">CHUD's last word on where he was: ${l.lastClaim === "NONE" ? "nobody" : "the " + NAME[l.lastClaim]}.</p>` : "";
      card(
        `<h1>NIGHT ${n} LOST</h1>
        <p>He came through the ${NAME[l.entry].toUpperCase()}.</p>
        <p>${esc(CAUSE[l.cause](l))}</p>${claim}
        <button id="go">Retry night ${n}</button>`,
        "lost",
        "ending_lose",
      );
      $("go").addEventListener("click", () => engine.retryNight());
      $("go").focus();
      break;
    }
    case "NIGHT_WON":
      card(`
        <h1>6:00 AM</h1>
        <p>NIGHT ${n} SURVIVED.</p>
        <p style="color:var(--crt)">${esc(morningLine)}</p>
        <button id="go">Night ${n + 1}</button>`);
      $("go").addEventListener("click", () => engine.nextNight());
      $("go").focus();
      break;
    case "GAME_WON":
      card(`
        <h1>FIRST LIGHT</h1>
        <p>The helicopter lifts you off the rock. Below, a man stands in the surf, staring up.</p>
        <p>The lamp blinks behind you. Long, short, long.</p>
        <button id="go">Play again</button>`,
        "",
        "ending_win",
      );
      $("go").addEventListener("click", () => window.location.reload());
      break;
    case "SAFETY_PAUSE":
      card(`
        <h1>PAUSED</h1>
        <p>This is only a game, and it is paused. If you are thinking about hurting yourself, you do not have to deal with it alone.</p>
        <p>In Canada, call or text 9-8-8 any time. Elsewhere, contact a local crisis line or emergency services.</p>
        <button id="go">Continue the game</button>`);
      $("go").addEventListener("click", () => engine.resumeFromSafetyPause());
      break;
    case "PLAYING":
      show(ui.screen, false);
      break;
  }
}

// ---------------------------------------------------------------------------
// Pause (UI only; the engine knows nothing about it)

function setPaused(on: boolean): void {
  if (on === paused) return;
  if (on && engine.state.phase !== "PLAYING") return;
  paused = on;
  scene.paused = on;
  // inert keeps Tab and Space from reaching the controls behind the overlay
  for (const id of ["terminal", "hold-panel"]) $(id).toggleAttribute("inert", on);
  if (on) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    sound.suspend();
    show(ui.pause, true);
    show(ui.pauseBtn, false);
    ui.pauseBtn.blur();
    ui.pause.querySelector<HTMLButtonElement>("#pause-resume")!.focus();
  } else {
    skipDt = true; // no giant dt on the first frame back
    sound.resume();
    show(ui.pause, false);
  }
}

// ---------------------------------------------------------------------------
// Input

function wireInput(): void {
  ui.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ui.chat.value;
    const res = engine.submitMessage(text);
    if (!res.ok) return; // MESSAGE_REJECTED event shows the note
    addLog("me", text);
    convo.push(`Keeper: ${text}`);
    ui.chat.value = "";
    const ticket = res.ticket;
    if (ticket.repeat) return;
    void judge(ticket.judgeInput).then((r) => engine.applyJudge(ticket.id, r));
  });
  for (const ev of ["paste", "drop"]) ui.chat.addEventListener(ev, (e) => e.preventDefault());

  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-quick]")) {
    b.addEventListener("click", () => engine.pressQuick(b.dataset.quick as QuickCommand));
  }
  ui.kill.addEventListener("click", () => engine.toggleGenerator());
  wireBrace();

  ui.pauseBtn.addEventListener("click", () => setPaused(true));
  $("pause-resume").addEventListener("click", () => setPaused(false));
  $("pause-restart").addEventListener("click", () => {
    if (!paused) return;
    setPaused(false);
    engine.retryNight(); // same path as the loss screen; emits NIGHT_CARD, which also drops late LLM replies
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true); // the player resumes manually
  });
  window.addEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  // Dev mode shortcuts work everywhere, including in the chat and name inputs (Backquote is not typed there).
  if (e.code === "Backquote" || (e.code === "KeyD" && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)) {
    e.preventDefault();
    setDev(!devOn);
    return;
  }
  if (e.target === ui.chat) {
    if (e.key === "Escape") ui.chat.blur();
    return;
  }
  if (e.target instanceof HTMLInputElement) return;
  const s = engine.state;
  if (s.phase !== "PLAYING") return;
  if (e.key === "Escape") {
    e.preventDefault();
    setPaused(!paused);
    return;
  }
  if (paused) return;
  // Keyboard is chat only (edge controls): at the desk, any printable key starts typing to CHUD.
  if (s.player.position.kind !== "DESK" || s.player.view !== "DESK" || ui.chat.disabled) return;
  if (e.key === "Enter") {
    e.preventDefault();
    ui.chat.focus();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault(); // also keeps Space or Enter from clicking a focused quick button
    ui.chat.focus();
    if (ui.chat.value.length < ui.chat.maxLength) ui.chat.value += e.key;
    const end = ui.chat.value.length;
    ui.chat.setSelectionRange(end, end);
  }
}

// ---------------------------------------------------------------------------
// Edge controls (docs/CONTROLS_PROPOSAL.md): mouse edges turn, press and hold the left button to brace

function edgeTurn(t: number): void {
  const s = engine.state;
  const pos = s.player.position;
  // At an entry (standing or bracing) only the return edge exists: it runs back to the desk.
  const atEntry = pos.kind === "STANDING" || (pos.kind === "HOLDING" && !!pos.stay);
  const enabled = !paused && s.phase === "PLAYING" && (pos.kind === "DESK" || atEntry);
  const from = s.player.view;
  const to = edges.update(from, enabled, t);
  if (!to) return;
  if (atEntry) {
    engine.returnToDesk();
    return;
  }
  engine.turn(to);
  sound.turn(from === "BALCONY" || to === "BALCONY");
}

// Click an entry view to go there, then hold the left button to brace (docs/CONTROLS_PROPOSAL.md).
function wireBrace(): void {
  window.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest("button, input, #screen, #pause, #dev")) return;
    const s = engine.state;
    if (paused || s.phase !== "PLAYING") return;
    const pos = s.player.position;
    if (pos.kind === "DESK" && s.player.view === "DESK") return; // the desk itself: no action
    if (pos.kind === "RETURNING") return;
    e.preventDefault(); // no text selection or focus change
    braceDown = true;
    pressSpent = false;
    if (pos.kind === "DESK") engine.goToEntry(s.player.view as Entry); // ignored during HOLD_COOLDOWN
    reconcileBrace();
  });
  // on window, so letting go outside the stage (or the browser) still counts
  const release = (): void => {
    braceDown = false;
    if (!paused) reconcileBrace();
  };
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) release();
  });
  window.addEventListener("mousemove", (e) => {
    if (braceDown && (e.buttons & 1) === 0) release(); // a mouseup we never saw
  });
  window.addEventListener("blur", release);
}

// Makes the brace follow the button. A press during the dash (including the click that started it, if still
// held) braces on arrival; letting go ends the brace and stays at the entry. When the arms give out (HOLD_MAX),
// that press is spent: let go and press again after BRACE_REST. A press during the rest braces when it ends.
// Called after each unpaused tick and on each press or release (not while paused: a release then applies on resume).
function reconcileBrace(): void {
  const p = engine.state.player.position;
  if (wasBracing && p.kind === "STANDING" && braceDown) pressSpent = true; // ended by HOLD_MAX while still held
  const want = braceDown && !pressSpent;
  if (p.kind === "TRAVELING" && p.stay) {
    if (want !== !!p.braceOnArrival) {
      if (want) engine.startBrace();
      else engine.endBrace();
    }
  } else if (p.kind === "STANDING" && want) {
    engine.startBrace(); // ignored during BRACE_REST, retried next frame
  } else if (p.kind === "HOLDING" && p.stay && !braceDown) {
    engine.endBrace();
  }
  wasBracing = engine.state.player.position.kind === "HOLDING";
}

// ---------------------------------------------------------------------------
// Dev mode. On by default while everyone playing is on the team; Backquote, Ctrl+Shift+D or ?dev=0 turns it off
// (state kept in localStorage). Every action goes through the engine object (dev* methods or the normal flow methods).
// To ship to players, flip DEV_DEFAULT to false.
const DEV_DEFAULT = true;

function initDev(): void {
  let on = DEV_DEFAULT;
  try {
    const saved = window.localStorage.getItem(DEV_KEY);
    if (saved === "1" || saved === "0") on = saved === "1";
  } catch {
    /* storage blocked: keep the default */
  }
  if (params.has("dev")) on = !["0", "false", "off", "no"].includes((params.get("dev") ?? "").toLowerCase());
  ui.devBadge.addEventListener("click", () => setDevOpen(!devOpen));
  setDev(on, false);
}

function setDev(on: boolean, remember = true): void {
  devOn = on;
  show(ui.devBadge, on);
  setDevOpen(on && (devOpen || remember)); // turning on with a key opens the panel; a page load only shows the badge
  if (!remember) return;
  try {
    window.localStorage.setItem(DEV_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function setDevOpen(open: boolean): void {
  devOpen = devOn && open;
  show(ui.dev, devOpen);
  ui.devBadge.classList.toggle("open", devOpen);
  if (devOpen) renderDev();
}

// Gets the engine into PLAYING from any phase so a time or Ram action can run. Returns false if it cannot.
function devEnsurePlaying(): boolean {
  if (previewing) endPreview();
  if (engine.state.phase === "NAME_PROMPT") engine.setName("Keeper");
  if (engine.state.phase === "BREACH") engine.retryNight();
  if (engine.state.phase === "NIGHT_WON" || engine.state.phase === "GAME_WON") return false;
  if (engine.state.phase === "NIGHT_CARD") engine.beginNight();
  return engine.state.phase === "PLAYING";
}

function devJump(n: number): void {
  if (previewing) endPreview();
  if (engine.state.phase === "NAME_PROMPT") engine.setName("Keeper");
  engine.jumpToNight(n);
  if (devSkipCard) engine.beginNight();
}

function devNight(): number {
  return engine.state.run.night;
}

function devRestart(): void {
  if (previewing) endPreview();
  if (engine.state.phase === "BREACH" || engine.state.phase === "PLAYING") engine.retryNight();
  else devJump(devNight());
  if (devSkipCard) engine.beginNight();
}

// Skips the clock with normal ticks. The events of the skipped minutes are mostly dropped (no radio and shout burst),
// except the Ram cue that matches where Ram is now and anything that ends or changes the night.
function devSkipClock(): void {
  if (!devEnsurePlaying()) return;
  engine.devSkipToLastSecond();
  const t = now();
  const evs = engine.drainEvents();
  const lastOf = (type: GameEvent["type"]): GameEvent | undefined => [...evs].reverse().find((e) => e.type === type);
  const ramState = engine.state.ram.state;
  const mute = new Set<GameEvent["type"]>(["CHUD_SAY", "RADIO", "RAM_APPROACH", "RAM_AT_ENTRY", "RAM_RETREAT", "RAM_FAKE_OUT", "RAM_AWAY", "HINT", "SILENCE_PULL"]);
  for (const ev of evs) if (!mute.has(ev.type)) onEvent(ev, t);
  sound.stopCues();
  if (ramState === "APPROACHING") {
    const a = lastOf("RAM_APPROACH");
    if (a) onEvent(a, t);
  } else if (ramState === "AT_ENTRY") {
    const a = lastOf("RAM_AT_ENTRY");
    if (a) onEvent(a, t);
  }
}

function devPreview(kind: "BREACH" | "NIGHT_WON" | "GAME_WON"): void {
  if (!previewing) previewSaved = { loss, morningLine };
  const n = devNight();
  if (kind === "BREACH") loss = { night: n, entry: "WINDOW", cause: "UNLOCKED", lastClaim: null, heldEntry: null };
  if (!morningLine) morningLine = "(preview) The tide held. Morning.";
  previewing = true;
  showScreen(kind);
  const go = $("go");
  const copy = go.cloneNode(true) as HTMLElement; // drops the real click handler
  copy.textContent = "Close preview";
  copy.addEventListener("click", endPreview);
  go.replaceWith(copy);
}

function endPreview(): void {
  if (!previewing) return;
  previewing = false;
  if (previewSaved) {
    loss = previewSaved.loss;
    morningLine = previewSaved.morningLine;
    previewSaved = null;
  }
  skipDt = true;
  showScreen(engine.state.phase);
}

function buildDevButtons(): void {
  const root = ui.devBtns;
  const group = (title: string): HTMLElement => {
    const g = document.createElement("div");
    g.className = "dev-grp";
    const h = document.createElement("span");
    h.className = "dev-title";
    h.textContent = title;
    g.appendChild(h);
    root.appendChild(g);
    return g;
  };
  const add = (g: HTMLElement, label: string, fn: () => void, title = ""): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener("click", () => {
      fn();
      b.blur();
      renderDev();
    });
    g.appendChild(b);
    return b;
  };

  const nights = group("Nights");
  for (let n = 1; n <= CONFIG.nights.length; n++) add(nights, `N${n}`, () => devJump(n));
  add(nights, "Prev", () => devJump(Math.max(1, devNight() - 1)));
  add(nights, "Next", () => devJump(Math.min(CONFIG.nights.length, devNight() + 1)));
  add(nights, "Restart night", devRestart);
  devRefs.skip = add(nights, "Skip night card", () => (devSkipCard = !devSkipCard), "N buttons go straight into play");

  const time = group("Time");
  for (const x of [1, 3, 8]) devRefs.speed.push(add(time, `x${x}`, () => (speed = x)));
  add(time, "Skip to 5:59 AM", devSkipClock, "Runs the clock with normal ticks; a loss on the way is possible");
  add(time, "Win night now", () => {
    if (devEnsurePlaying()) engine.devWinNight();
  });

  const ram = group("Ram");
  for (const e of ["WINDOW", "HATCH", "BALCONY"] as const)
    add(ram, `Send ${NAME[e]}`, () => {
      if (devEnsurePlaying()) engine.devSendRam(e);
    }, "Only while Ram is away");
  add(ram, "Ram away", () => {
    if (devEnsurePlaying()) engine.devRamAway();
  });

  const chud = group("CHUD");
  for (const [label, v] of [["WARM", 0], ["HURT", 50], ["JEALOUS", 80]] as const) add(chud, label, () => engine.devSetSuspicion(v), `suspicion ${v}`);
  devRefs.llm = add(chud, "LLM", () => (llm.enabled = !llm.enabled));

  const screens = group("Screens");
  add(screens, "Loss", () => devPreview("BREACH"));
  add(screens, "Night won", () => devPreview("NIGHT_WON"));
  add(screens, "Game won", () => devPreview("GAME_WON"));
}

function renderDev(): void {
  const s = engine.state;
  const r = s.ram;
  const q = s.chud.pendingQuestion;
  const lines = [
    `phase ${s.phase}  night ${s.run.night}  speed x${speed}  skip card ${devSkipCard ? "on" : "off"}${previewing ? "  PREVIEW" : ""}`,
    `LLM ${!llm.available ? "unavailable (no key or server)" : llm.enabled ? "on" : "off"}  last judge: ${lastJudgeSource}`,
    `t ${s.clock.elapsed.toFixed(1)} / ${CONFIG.HOUR_LENGTH * CONFIG.NIGHT_HOURS}`,
    `RAM ${r.state} ${r.target ?? ""} ends ${r.stateEndsAt.toFixed(1)} (in ${(r.stateEndsAt - s.clock.elapsed).toFixed(1)})`,
    `    visit ${r.visitId} fake ${r.fakedThisVisit ? "yes" : r.fakeOutAt !== null ? "planned" : "no"} pulls ${r.pendingPull}`,
    `SUSPICION ${s.chud.suspicion}  band ${s.chud.band}${s.chud.furiousActive ? " (episode)" : ""}`,
    `POWER ${s.power.slot}${s.power.pending ? " -> " + s.power.pending.target : ""}  online ${s.power.chudOnline}`,
    `lie decision ${s.chud.visitDecision ? (s.chud.visitDecision.lie ? "LIE " : "truth ") + s.chud.visitDecision.entry : "-"}`,
    `question ${q ? `${q.origin} ${q.type} ${q.gateFor ?? ""}: ${q.text}` : "-"}`,
    `facts ${JSON.stringify(s.chud.facts)}`,
    `silence ticks ${s.timers.silenceTicks}  last real ${s.timers.lastRealMessageAt.toFixed(1)}`,
  ];
  ui.devText.textContent = lines.join("\n");
  devRefs.speed.forEach((b, i) => b.classList.toggle("on", speed === [1, 3, 8][i]));
  devRefs.skip?.classList.toggle("on", devSkipCard);
  devRefs.llm?.classList.toggle("on", llm.enabled);
}

void boot();
