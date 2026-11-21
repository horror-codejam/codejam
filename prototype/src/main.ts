// Playable loop: engine (src/sim) + PixiJS scene (src/ui/scene) + DOM HUD + synthesized sound.
// The UI only reads engine.state and calls engine methods. All rules live in the engine.

import { Application } from "pixi.js";
import { judge, lastJudgeSource } from "./chud/judgeClient";
import { checkLlm, llm, VOICED, voiceRemote } from "./chud/llmClient";
import { CONFIG } from "./config";
import { GameEngine } from "./sim/engine";
import type { Entry, GameEvent, LossInfo, Phase, PowerSlot, QuickCommand, RejectReason, View } from "./sim/types";
import { loadArt } from "./ui/art";
import { Sound } from "./ui/audio";
import { H, W } from "./ui/layout";
import { Scene } from "./ui/scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const engine = new GameEngine({ seed: Date.now() % 2147483647 });
const sound = new Sound();
let scene: Scene;
if (import.meta.env.DEV) Object.assign(window, { engine }); // console access while developing

const ui = {
  hud: $("hud"),
  clock: $("clock"),
  power: $("power"),
  chudStatus: $("chud-status"),
  hint: $("hint"),
  desk: $("desk-panel"),
  log: $("log"),
  question: $("question"),
  questionLabel: $("question-label"),
  questionBar: $("question-bar"),
  chatForm: $<HTMLFormElement>("chat-form"),
  chat: $<HTMLInputElement>("chat"),
  chatNote: $("chat-note"),
  kill: $<HTMLButtonElement>("kill"),
  nav: $("nav"),
  navLeft: $<HTMLButtonElement>("nav-left"),
  navRight: $<HTMLButtonElement>("nav-right"),
  navDown: $<HTMLButtonElement>("nav-down"),
  holds: $("holds"),
  holdPanel: $("hold-panel"),
  armsBar: $("arms-bar"),
  back: $<HTMLButtonElement>("back"),
  subtitle: $("subtitle"),
  screen: $("screen"),
  dev: $("dev"),
  devText: $("dev-text"),
  devBtns: $("dev-btns"),
};

const NAME: Record<Entry, string> = { WINDOW: "window", HATCH: "hatch", BALCONY: "balcony" };

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
let devOpen = false;
let devNextAt = 0;
let nightToken = 0; // drops LLM replies that arrive after a night restarts
let convo: string[] = []; // recent "Keeper: ..." / "CHUD: ..." lines, context for the voice
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
  fit();
  window.addEventListener("resize", fit);
  wireInput();
  buildDevButtons();
  app.ticker.add((tk) => frame(tk.deltaMS / 1000));
}

function fit(): void {
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  const f = $("frame");
  f.style.transformOrigin = "0 0";
  f.style.transform = `scale(${k}) translate(-50%, -50%)`;
}

// ---------------------------------------------------------------------------
// Frame

function frame(dt: number): void {
  const t = now();
  // Clamp so a hidden tab (no frames) does not fast-forward the night.
  engine.tick(Math.min(dt, 0.1) * speed);
  for (const ev of engine.drainEvents()) onEvent(ev, t);
  const phase = engine.state.phase;
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase !== "BREACH") showScreen(phase);
  }
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
      showScreen("NIGHT_CARD"); // also covers retry and dev jumps within the same phase
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

  // desk controls
  const deskOn = deskView;
  show(ui.desk, deskOn);
  if (deskOn) {
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

  // looking around and holding
  show(ui.nav, playing && atDesk);
  if (playing && atDesk) {
    const cooling = s.clock.elapsed < s.player.holdCooldownUntil;
    const onDesk = view === "DESK";
    show(ui.navLeft, onDesk);
    show(ui.navRight, onDesk);
    setText(ui.navLeft, "◀ WINDOW (A)");
    setText(ui.navRight, "HATCH (D) ▶");
    setText(ui.navDown, onDesk ? "▼ BEHIND: BALCONY (S)" : "▼ BACK TO DESK (S)");
    ui.holds.classList.toggle("single", !onDesk);
    for (const b of ui.holds.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
      const e = b.dataset.hold as Entry;
      show(b, onDesk || view === e);
      b.disabled = cooling;
      setText(b, cooling ? "Arms resting..." : onDesk ? `Hold ${NAME[e]} (${"123"[["WINDOW", "HATCH", "BALCONY"].indexOf(e)]})` : `Hold ${NAME[e]} (Space)`);
    }
  }

  show(ui.holdPanel, playing && pos.kind === "HOLDING");
  if (pos.kind === "HOLDING") {
    const left = 1 - (s.clock.elapsed - pos.since) / CONFIG.HOLD_MAX;
    ui.armsBar.style.width = `${Math.max(0, left) * 100}%`;
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

function card(html: string, cls = ""): void {
  ui.screen.innerHTML = `<div class="card ${cls}">${html}</div>`;
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
        <p class="small">Headphones on. Sound tells you where he is.</p>`);
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
        <p class="small">At the desk: type to CHUD (Enter to focus, Esc to leave) or use the buttons.<br />A / D / S: look at the window, hatch, balcony. 1 2 3 or Space: hold an entry. \` : dev panel.</p>
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
        <button id="go">Play again</button>`);
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
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    b.addEventListener("click", () => engine.startHold(b.dataset.hold as Entry));
  }
  ui.kill.addEventListener("click", () => engine.toggleGenerator());
  ui.back.addEventListener("click", () => engine.backToDesk());
  ui.navLeft.addEventListener("click", () => engine.turn("WINDOW"));
  ui.navRight.addEventListener("click", () => engine.turn("HATCH"));
  ui.navDown.addEventListener("click", () => engine.turn(engine.state.player.view === "DESK" ? "BALCONY" : "DESK"));

  window.addEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (e.code === "Backquote") {
    e.preventDefault();
    devOpen = !devOpen;
    show(ui.dev, devOpen);
    return;
  }
  if (e.target === ui.chat) {
    if (e.key === "Escape") ui.chat.blur();
    return;
  }
  if (e.target instanceof HTMLInputElement) return;
  const s = engine.state;
  if (s.phase !== "PLAYING") return;
  const pos = s.player.position;
  const k = e.key.toLowerCase();
  const turn = (v: View): void => {
    e.preventDefault();
    engine.turn(v);
  };

  if (pos.kind === "HOLDING") {
    if (k === " ") {
      e.preventDefault();
      engine.backToDesk();
    }
    return;
  }
  if (pos.kind !== "DESK") return;

  if (s.player.view === "DESK") {
    if (k === "a" || k === "arrowleft") turn("WINDOW");
    else if (k === "d" || k === "arrowright") turn("HATCH");
    else if (k === "s" || k === "arrowdown") turn("BALCONY");
    else if (k === "1") engine.startHold("WINDOW");
    else if (k === "2") engine.startHold("HATCH");
    else if (k === "3") engine.startHold("BALCONY");
    else if (k === "enter" || k === "t" || k === "/") {
      e.preventDefault();
      ui.chat.focus();
    }
  } else {
    const v = s.player.view;
    if (k === "s" || k === "arrowdown" || (v === "WINDOW" && (k === "d" || k === "arrowright")) || (v === "HATCH" && (k === "a" || k === "arrowleft"))) turn("DESK");
    else if (k === " ") {
      e.preventDefault();
      engine.startHold(v);
    }
  }
}

// ---------------------------------------------------------------------------
// Dev panel (backtick)

function buildDevButtons(): void {
  const add = (label: string, fn: () => void): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", fn);
    ui.devBtns.appendChild(b);
  };
  for (let n = 1; n <= CONFIG.nights.length; n++) add(`N${n}`, () => engine.jumpToNight(n));
  add("x1", () => (speed = 1));
  add("x3", () => (speed = 3));
  add("x8", () => (speed = 8));
  add("LLM on/off", () => (llm.enabled = !llm.enabled));
}

function renderDev(): void {
  const s = engine.state;
  const r = s.ram;
  const q = s.chud.pendingQuestion;
  const lines = [
    `phase ${s.phase}  speed x${speed}`,
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
}

void boot();
