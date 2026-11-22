// Playable loop: engine (src/sim) + PixiJS scene (src/ui/scene) + DOM HUD + synthesized sound.
// The UI only reads engine.state and calls engine methods. All rules live in the engine.

import { Application } from "pixi.js";
import { judge, lastJudgeSource } from "./chud/judgeClient";
import { checkLlm, llm, VOICED, voiceRemote } from "./chud/llmClient";
import { CONFIG } from "./config";
import { GameEngine } from "./sim/engine";
import type { Band, Entry, GameEvent, InsideTrigger, LossInfo, Phase, PowerSlot, QuickCommand, RejectReason, View } from "./sim/types";
import { artUrl, loadArt } from "./ui/art";
import { Sound } from "./ui/audio";
import { EDGE_TARGET, EdgeTurner, EDGES } from "./ui/edges";
import { playIntro } from "./ui/intro";
import { H, W } from "./ui/layout";
import { Scene } from "./ui/scene";
import { renderMorning, renderNightCard } from "./ui/screens/clock";
import { renderEnding } from "./ui/screens/credits";
import { preloadScreens } from "./ui/screens/loading";
import { renderLoss } from "./ui/screens/loss";
import { renderName } from "./ui/screens/name";
import { renderSafetyPause } from "./ui/screens/safety";
import { clearSave, readSave, writeSave, type SavedRun } from "./ui/screens/save";
import { GAME_TITLE, renderTitle } from "./ui/screens/title";
import { ARTIFACTS, MALICE, RING, SCARE } from "./uiConfig";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// URL params: ?dev (dev mode on, ?dev=0 off) and ?night=N (start straight at that night's card as "Keeper").
const params = new URLSearchParams(window.location.search);
const deepNight = ((): number | null => {
  const raw = params.get("night");
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= CONFIG.nights.length ? n : null;
})();
let engine = new GameEngine({
  seed: Date.now() % 2147483647,
  ...(deepNight ? { startNight: deepNight, skipNamePrompt: true, facts: { name: "Keeper" } } : {}),
});
const sound = new Sound();
let scene: Scene;
if (import.meta.env.DEV) Object.assign(window, { engine }); // console access while developing

const ui = {
  hud: $("hud"),
  clock: $("clock"),
  night: $("hud-night"),
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
  pause: $("pause"),
  artifacts: $("artifacts"),
  reader: $("reader"),
  readerImg: $<HTMLImageElement>("reader-img"),
};

const NAME: Record<Entry, string> = { WINDOW: "window", HATCH: "hatch", BALCONY: "balcony" };

// CHUD's face: Vidush's four-mood sheet (2172 x 724, WARM HURT JEALOUS FURIOUS left to right),
// one 540 px square frame per band, shown through CSS background-position.
const FACE_URL = artUrl("chud_faces");
const FACE_SHEET = { w: 2172, h: 724, frame: 540, top: 90, left: [20, 550, 1080, 1610] };
const BAND_INDEX: Record<Band, number> = { WARM: 0, HURT: 1, JEALOUS: 2, FURIOUS: 3 };
const FACE_GLYPH: Record<Band, string> = { WARM: "( ^_^ )", HURT: "( ._. )", JEALOUS: "( >_< )", FURIOUS: "( X_X )" };
// The malicious smile (lock hijack, sabotage, forced light cuts): `chud_face_malicious` art, else a coded grin.
const MALICIOUS_URL = artUrl("chud_face_malicious");
const MALICIOUS_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#ff4a3a" stroke-width="3"/><path d="M26 38 L42 44" stroke="#ff4a3a" stroke-width="5" stroke-linecap="round"/><path d="M74 38 L58 44" stroke="#ff4a3a" stroke-width="5" stroke-linecap="round"/><path d="M20 58 Q50 92 80 58 Q50 74 20 58 Z" fill="#ff4a3a"/><path d="M30 63 L34 69 M40 67 L42 74 M50 68 L50 76 M60 67 L58 74 M70 63 L66 69" stroke="#1a0000" stroke-width="2.5"/></svg>`;

// UI-only state
let lastPhase: Phase | null = null;
let frontScreen: "title" | "intro" | null = null; // presentation before the engine flow
let screenAbort = new AbortController();
let devRun = deepNight !== null;
let breachShown = false;
let subtitleUntil = 0;
let hintUntil = 0;
let noteUntil = 0;
let powerAlarmUntil = 0;
let maliciousUntil = 0; // real seconds: CHUD's malicious smile is up
let lightCutUntil = 0; // real seconds: the LIGHT cell flashes red after CHUD forced the light off
let shiftDown = false; // Shift held (the player's light)
let scareTimers: number[] = []; // the running flash and jumpscare sequence
let speed = 1;
const DEV_KEY = "chud.dev";
let devOn = false; // dev mode: badge visible, shortcuts live
let devOpen = false; // panel open
let devNextAt = 0;
let devSkipCard = false; // N buttons go straight into PLAYING
let previewing = false; // a dev screen preview is up: the night is frozen behind it
const devRefs: { speed: HTMLButtonElement[]; skip?: HTMLButtonElement; llm?: HTMLButtonElement } = { speed: [] };
let paused = false; // UI-level pause: engine.tick is skipped, audio suspended
let skipDt = false; // first frame after a resume gets dt 0
let dialogueToken = 0; // drops LLM replies from before a reset, power cut or interruption
let convo: string[] = []; // recent "Keeper: ..." / "CHUD: ..." lines, context for the voice
let edges: EdgeTurner;
let braceDown = false; // left mouse button held down (edge controls: holding it braces)
let pressSpent = false; // this press's brace already ended by HOLD_MAX: a new press is needed to brace again
let wasBracing = false; // position was a brace (HOLDING) at the last reconcile
let frameScale = 1; // stage px to screen px, for the cursor ring
const wallTime = (): number => performance.now() / 1000;
let pausedAt = 0;
let pauseDuration = 0;
const now = (): number => (paused ? pausedAt : wallTime()) - pauseDuration;

// ---------------------------------------------------------------------------
// Boot

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const app = new Application();
  await app.init({ width: W, height: H, background: "#000000", antialias: true });
  $("stage").appendChild(app.canvas);
  const art = await preloadScreens(loadArt, () => sound.preload());
  if (art.length) console.info("art slots loaded:", art.join(", "));
  void checkLlm().then((on) => console.info(on ? "CHUD: LLM judge and voice on" : "CHUD: offline judge and canned lines"));
  scene = new Scene(app);
  scene.onThunder = () => { if (engine.state.phase === "PLAYING") sound.thunder(); };
  if (import.meta.env.DEV) Object.assign(window, { scene });
  edges = new EdgeTurner($("stage"));
  fit();
  window.addEventListener("resize", fit);
  wireInput();
  buildArtifacts();
  buildDevButtons();
  initDev();
  if (!deepNight) showTitle();
  else {
    const unlock = (): void => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      sound.unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }
  app.ticker.add((tk) => frame(tk.deltaMS / 1000));
  $("loading").classList.add("loaded");
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
  if (devOpen && wallTime() > devNextAt) {
    devNextAt = wallTime() + 0.2;
    renderDev();
  }
  if (frontScreen || previewing) return;
  const t = now();
  // Anything that leaves PLAYING (a judge verdict that triggers the safety pause, a dev jump) ends the pause.
  if (paused && engine.state.phase !== "PLAYING") setPaused(false);
  if (skipDt) {
    dt = 0;
    skipDt = false;
  }
  // Paused: no tick, so the night clock, Ram, CHUD timers and silence all stand still. Replies still apply.
  // Clamp so a hidden tab (no frames) does not fast-forward the night.
  if (!paused) {
    engine.tick(Math.min(dt, 0.1) * speed);
    reconcileBrace();
  }
  sound.setSpeechView(engine.state.player.view);
  const events = engine.drainEvents();
  // The name acknowledgment and the first night card arrive together. Stop old audio before either is handled.
  if (events.some((ev) => ev.type === "NIGHT_CARD")) stopChudSpeech();
  for (const ev of events) onEvent(ev, t);
  const phase = engine.state.phase;
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase !== "BREACH" && phase !== "NIGHT_CARD") showScreen(phase);
    if (phase === "PLAYING") {
      sound.setAmbientPlaying(true);
      if (document.hidden) setPaused(true);
    }
    if (phase === "PLAYING" && engine.state.run.night === 1 && engine.state.clock.elapsed < 1) {
      ui.hint.textContent = "Push the mouse to the left, right or bottom edge to look around";
      hintUntil = t + 8;
    }
  }
  edgeTurn(t);
  if (!paused) scene.update(engine, t);
  renderHud(t);
}

function onEvent(ev: GameEvent, t: number): void {
  switch (ev.type) {
    case "NIGHT_CARD":
      if (!devRun) writeSave(engine.state.run);
      sound.stopCues();
      sound.fadeStorm(1, 0.9);
      sound.windowMask = ev.night >= 4 ? 0.55 : 1;
      ui.log.replaceChildren();
      convo = [];
      hintUntil = 0;
      subtitleUntil = 0;
      breachShown = false;
      endScare();
      showReader(null);
      maliciousUntil = 0;
      lightCutUntil = 0;
      powerAlarmUntil = 0;
      // Also handles dev jumps within the same phase, including those that skip the card.
      showScreen(engine.state.phase);
      break;
    // Ram makes no sound and never speaks (GAME_LOGIC 7.4): RAM_* events have no cue here on purpose.
    case "DECOY":
      sound.decoy(ev.sound, ev.pan);
      break;
    case "POWER_CHANGED":
      if (ev.cause === "light") {
        sound.lightClick(ev.slot !== "NONE");
        break;
      }
      if (ev.cause === "light_cut") break; // LIGHT_CUT plays the tick
      sound.relay(ev.cause === "sabotage" || ev.cause === "furious" || ev.cause === "kill_switch");
      if (ev.cause === "sabotage" || ev.cause === "furious") powerAlarmUntil = t + 2.5;
      if (ev.cause === "sabotage") maliciousUntil = Math.max(maliciousUntil, t + MALICE.SABOTAGE_TIME);
      break;
    case "LOCK_REFUSED":
      maliciousUntil = t + MALICE.REFUSE_TIME;
      break;
    case "LIGHT_CUT":
      sound.lightTick();
      lightCutUntil = t + 0.6;
      scene.lightFlickerUntil = t + 0.18;
      if (ev.band === "JEALOUS" || ev.band === "FURIOUS") maliciousUntil = Math.max(maliciousUntil, t + MALICE.LIGHT_CUT_TIME);
      break;
    case "ARTIFACT":
      sound.paper();
      showReader(ev.id);
      break;
    case "CHUD_ONLINE":
      if (!ev.online) stopChudSpeech();
      break;
    case "CHUD_SAY": {
      if (!ev.text) break;
      const o = ev.outcome;
      if (!llm.on || !VOICED.has(o.kind)) {
        showChud(ev.text, ev.band, t);
        break;
      }
      // Code already decided the outcome; the LLM only words it. Canned line if it fails or is slow.
      const token = dialogueToken;
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
        if (token === dialogueToken && engine.state.phase === "PLAYING" && engine.state.power.chudOnline) {
          showChud(text ?? ev.text, ev.band, now());
        }
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
      stopChudSpeech();
      resetScreen();
      show(ui.screen, false);
      showReader(null);
      startScare(ev.loss);
      break;
    case "SAFETY_PAUSE":
      stopChudSpeech();
      break;
    case "NIGHT_WON":
    case "GAME_WON": {
      // Record the unlocked night even if the browser closes during dawn.
      if (!devRun) {
        const { night, factsCheckpoint } = engine.state.run;
        writeSave({ night: ev.type === "NIGHT_WON" ? night + 1 : night, factsCheckpoint });
      }
      showReader(null);
      sound.stopCues();
      sound.setAmbientPlaying(false);
      sound.fadeStorm(0, 1.9);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// HUD

function say(text: string, kind: "chud" | "radio", t: number, secs?: number): void {
  ui.subtitle.textContent = text;
  ui.subtitle.className = kind;
  ui.subtitle.style.opacity = "1";
  subtitleUntil = t + (secs ?? Math.max(2.5, text.length * 0.06));
}

const LOG_PREFIX = { me: "> ", chud: "CHUD: ", radio: "RADIO: ", typing: "" };

function addLog(who: keyof typeof LOG_PREFIX, text: string): HTMLElement {
  const d = document.createElement("div");
  d.className = who;
  d.textContent = LOG_PREFIX[who] + text;
  ui.log.appendChild(d);
  while (ui.log.children.length > 7) ui.log.firstChild!.remove();
  return d;
}

function stopChudSpeech(): void {
  dialogueToken++;
  sound.stopSpeech();
}

function showChud(text: string, band: Band, t: number): void {
  say(text, "chud", t);
  addLog("chud", text);
  convo.push(`CHUD: ${text}`);
  sound.chime();
  if (engine.state.power.chudOnline) sound.speak(text, band);
  scene.speakingUntil = t + Math.min(3, 0.4 + text.length * 0.035);
}

const NOTE: Record<RejectReason, string> = {
  CHUD_OFFLINE: "CHUD is offline.",
  NOT_AT_DESK: "You have to be at the desk to type.",
  RATE_LIMIT: "Too fast. One message every 1.5 s.",
  TOO_LONG: "200 characters max.",
  EMPTY: "",
  NOT_PLAYING: "",
  READING: "",
};

function note(reason: RejectReason, t: number): void {
  ui.chatNote.textContent = NOTE[reason];
  noteUntil = t + 2;
}

function clockText(): string {
  const s = engine.state;
  const hl = CONFIG.HOUR_LENGTH;
  const hour = Math.min(6, Math.floor(s.clock.elapsed / hl));
  const min = hour >= 6 ? 0 : Math.floor(((s.clock.elapsed % hl) / hl) * 60);
  return `${hour === 0 ? 12 : hour}:${String(min).padStart(2, "0")} AM`;
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

  show(ui.hud, playing);
  setText(ui.clock, clockText());
  setText(ui.night, "Night " + s.run.night);

  const p = s.power;

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
      setText(ui.questionLabel, "CHUD is waiting for an answer");
    }
  } else if (document.activeElement === ui.chat) {
    ui.chat.blur();
  }
  renderArtifacts(deskOn && s.player.reading === null);

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
  ui.desk.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px) scale(${r.scale.toFixed(4)})`;
  ui.desk.style.opacity = String(1 - scene.fadeAlpha);

  // face by band; blank while offline, a reboot readout while rebooting
  const band = s.chud.band;
  const malicious = p.chudOnline && t < maliciousUntil;
  let key: string;
  if (malicious) key = "MALICIOUS";
  else if (p.chudOnline) key = band;
  else if (p.rebootingUntil !== null) key = `REBOOT ${Math.round((1 - Math.max(0, p.rebootingUntil - s.clock.elapsed) / CONFIG.REBOOT_TIME) * 100)}%`;
  else key = "OFFLINE";
  if (key !== faceKey) {
    faceKey = key;
    const f = ui.face;
    f.classList.toggle("off", !p.chudOnline);
    f.classList.toggle("furious", p.chudOnline && band === "FURIOUS" && !malicious);
    f.classList.toggle("malicious", malicious);
    f.classList.toggle("art", malicious && !!MALICIOUS_URL);
    if (!p.chudOnline) {
      f.style.backgroundImage = "";
      f.textContent = key;
    } else if (malicious) {
      if (MALICIOUS_URL) {
        f.textContent = "";
        f.style.backgroundImage = `url("${MALICIOUS_URL}")`;
        f.style.backgroundSize = "cover";
        f.style.backgroundPosition = "center";
      } else {
        f.style.backgroundImage = "";
        f.innerHTML = MALICIOUS_SVG;
      }
    } else if (FACE_URL) {
      const k = f.clientWidth / FACE_SHEET.frame || 120 / FACE_SHEET.frame;
      f.textContent = "";
      f.style.backgroundImage = `url("${FACE_URL}")`;
      f.style.backgroundSize = `${FACE_SHEET.w * k}px ${FACE_SHEET.h * k}px`;
      f.style.backgroundPosition = `${-FACE_SHEET.left[BAND_INDEX[band]] * k}px ${-FACE_SHEET.top * k}px`;
    } else {
      f.style.backgroundImage = "";
      f.textContent = FACE_GLYPH[band];
    }
    setText(ui.band, p.chudOnline ? band : "");
  }
  ui.face.classList.toggle("talking", p.chudOnline && t < scene.speakingUntil);

  setText(ui.tClock, clockText());

  // map: entries and lock state only, never Ram (a display only on this branch: holds start from the entry view)
  for (const g of ui.map.querySelectorAll<SVGGElement>(".entry")) {
    const lock = `LOCK_${g.dataset.entry}` as PowerSlot;
    g.classList.toggle("locked", p.slot === lock);
    g.classList.toggle("pending", p.pending?.target === lock);
  }

  // power bar: 4 cells, green = what the one slot feeds now (a lock, or the LIGHT cell for the Shift light on any
  // entry); all red = NONE; flashing red on a cut. The LIGHT cell flashes red when CHUD forces the light off.
  ui.powerCells.classList.toggle("cut", t < powerAlarmUntil && Math.floor(t * 6) % 2 === 0);
  const lit = p.slot.startsWith("LIGHT_");
  for (const c of ui.powerCells.querySelectorAll<HTMLElement>("i")) {
    const cell = c.dataset.cell!;
    if (cell === "LIGHT") {
      c.classList.toggle("on", lit);
      c.classList.toggle("cutoff", t < lightCutUntil);
      setText(c, lit ? "LIGHT " + p.slot.slice(6, 7) : "LIGHT");
      continue;
    }
    c.classList.toggle("on", p.slot === cell);
    c.classList.toggle("pending", p.pending?.target === cell);
  }
}

// ---------------------------------------------------------------------------
// Screens

function resetScreen(): void {
  screenAbort.abort();
  screenAbort = new AbortController();
  delete ui.screen.dataset.screen;
  ui.screen.classList.remove("night-card-fading");
  ui.screen.onpointerdown = null;
  ui.screen.onkeydown = null;
  ui.screen.querySelector("video")?.pause();
  ui.screen.replaceChildren();
}

function showTitle(): void {
  resetScreen();
  frontScreen = "title";
  stopChudSpeech();
  sound.stopCues();
  sound.setAmbientPlaying(false);
  sound.fadeStorm(0.65, 0.9);
  const saved = readSave();
  renderTitle(ui.screen, {
    start: () => {
      clearSave();
      startRun();
    },
    resume: saved ? { night: saved.night, start: () => startRun(saved) } : undefined,
    activateAudio: () => sound.unlock(),
    tick: () => sound.menuTick(),
  });
  show(ui.screen, true);
}

function startRun(saved?: SavedRun): void {
  resetScreen();
  show(ui.screen, false);
  engine = new GameEngine({
    seed: Date.now() % 2147483647,
    startNight: saved?.night,
    facts: saved?.factsCheckpoint,
    skipNamePrompt: !!saved,
  });
  if (import.meta.env.DEV) Object.assign(window, { engine });
  frontScreen = null;
  lastPhase = null;
  devRun = false;
  ui.chat.value = "";
  ui.log.replaceChildren();
  sound.unlock();

  if (!saved && !params.has("nointro")) {
    frontScreen = "intro";
    setDevOpen(false);
    sound.fadeStorm(0, 0.15);
    playIntro({
      root: $("ui"),
      onDone: () => { frontScreen = null; },
    });
  }
}

function showScreen(phase: Phase): void {
  if (phase === "PLAYING" && ui.screen.classList.contains("night-card-fading")) return;
  resetScreen();
  show(ui.screen, phase !== "PLAYING");
  const signal = screenAbort.signal;
  const title = previewing ? endPreview : showTitle;
  switch (phase) {
    case "NAME_PROMPT":
      renderName(ui.screen, (name) => {
        sound.unlock();
        engine.setName(name);
      });
      break;
    case "NIGHT_CARD":
      renderNightCard(ui.screen, engine.state.run.night, () => engine.beginNight(), signal);
      break;
    case "BREACH":
      renderLoss(ui.screen, title, signal);
      break;
    case "NIGHT_WON":
      renderMorning(ui.screen, previewing ? endPreview : () => engine.nextNight(), signal);
      break;
    case "GAME_WON":
      renderMorning(ui.screen, () => renderEnding(ui.screen, title, signal), signal);
      break;
    case "SAFETY_PAUSE":
      renderSafetyPause(ui.screen, () => engine.resumeFromSafetyPause());
      break;
    case "PLAYING":
      break;
  }
}

// ---------------------------------------------------------------------------
// Desk artifacts (GAME_LOGIC 6.6): hotspots on the desk render, the full-screen reader

function buildArtifacts(): void {
  for (const a of ARTIFACTS) {
    const b = document.createElement("button");
    b.dataset.artifact = a.id;
    b.title = a.label;
    b.setAttribute("aria-label", `Read: ${a.label}`);
    const url = artUrl(a.slot);
    if (url) b.style.backgroundImage = `url("${url}")`;
    else b.textContent = a.label;
    b.addEventListener("click", () => {
      engine.pickUpArtifact(a.id);
      b.blur();
    });
    ui.artifacts.appendChild(b);
  }
}

function renderArtifacts(on: boolean): void {
  show(ui.artifacts, on);
  if (!on) return;
  for (const b of ui.artifacts.querySelectorAll<HTMLButtonElement>("button")) {
    const a = ARTIFACTS.find((x) => x.id === b.dataset.artifact)!;
    const r = scene.plateRect(a.rect);
    b.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px) rotate(${a.tilt}deg)`;
    b.style.width = `${r.w.toFixed(1)}px`;
    b.style.height = `${r.h.toFixed(1)}px`;
  }
}

function showReader(id: string | null): void {
  show(ui.reader, id !== null);
  if (id === null) return;
  const a = ARTIFACTS.find((x) => x.id === id);
  const url = a ? artUrl(a.slot) : null;
  const ph = ui.reader.querySelector(".ph");
  ph?.remove();
  if (url) {
    ui.readerImg.src = url;
    show(ui.readerImg, true);
  } else {
    show(ui.readerImg, false);
    const d = document.createElement("div");
    d.className = "ph";
    d.textContent = a?.label ?? id;
    ui.reader.prepend(d);
  }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

// ---------------------------------------------------------------------------
// The scare (GAME_LOGIC 5.4 and 7.7). The engine already decided the loss; this only stages it: the creepy flash of
// him inside the lit entry (LOOK, or ARRIVED with the light on), then the jumpscare frames and jumpscare.wav, then the
// loss screen.

function startScare(l: LossInfo): void {
  endScare();
  const after = (secs: number, fn: () => void): void => {
    scareTimers.push(window.setTimeout(fn, secs * 1000));
  };
  let at = 0;
  if (l.flash) {
    scene.flashEntry = l.entry;
    scene.flashStartedAt = now();
    sound.flashSting();
    at = SCARE.FLASH_TIME;
  }
  after(at, () => {
    scene.flashEntry = null;
    sound.jumpscare();
    for (let n = 1; n <= 4; n++) after((n - 1) * SCARE.FRAME_TIME, () => (scene.jumpscare = n));
  });
  after(at + 3 * SCARE.FRAME_TIME + SCARE.HOLD_TIME, () => {
    scene.jumpscare = null;
    if (engine.state.phase === "BREACH" && !breachShown) {
      breachShown = true;
      sound.setAmbientPlaying(false);
      sound.fadeStorm(0, 0.65);
      showScreen("BREACH");
    }
  });
}

function endScare(): void {
  for (const id of scareTimers) window.clearTimeout(id);
  scareTimers = [];
  if (scene) {
    scene.flashEntry = null;
    scene.jumpscare = null;
  }
}

// ---------------------------------------------------------------------------
// Pause (UI only; the engine knows nothing about it)

function setPaused(on: boolean): void {
  if (on === paused) return;
  if (on && (frontScreen || previewing || engine.state.phase !== "PLAYING")) return;
  if (on) pausedAt = wallTime();
  else pauseDuration += wallTime() - pausedAt;
  paused = on;
  scene.paused = on;
  // Keep Tab and Space from reaching the terminal or the desk papers behind the overlay.
  for (const el of [ui.desk, ui.artifacts, ui.reader, ui.holdPanel]) el.toggleAttribute("inert", on);
  if (on) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    sound.suspend();
    show(ui.ring, false);
  } else {
    skipDt = true;
    if (!shiftDown) engine.setLight(false);
    sound.resume();
  }
  show(ui.pause, on);
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
    const run = engine;
    void judge(ticket.judgeInput).then((r) => run.applyJudge(ticket.id, r));
  });
  for (const ev of ["paste", "drop"]) ui.chat.addEventListener(ev, (e) => e.preventDefault());

  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-quick]")) {
    b.addEventListener("click", () => engine.pressQuick(b.dataset.quick as QuickCommand));
  }
  ui.kill.addEventListener("click", () => engine.toggleGenerator());
  wireBrace();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true); // the player resumes manually
  });
  window.addEventListener("keydown", onKey);
  // The player's light: hold Shift (GAME_LOGIC 6.1). Never typed into the chat; key repeats are ignored, so holding
  // through a forced cut stays dark until Shift is released and pressed again.
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") setShift(false);
  });
  window.addEventListener("blur", () => setShift(false));

  // the reader: click, right-click or Space puts the artifact down
  ui.reader.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    engine.putDownArtifact();
  });
  ui.reader.addEventListener("contextmenu", (e) => e.preventDefault());
}

function setShift(down: boolean): void {
  if (down === shiftDown) return;
  shiftDown = down;
  if (paused || frontScreen || previewing) return;
  engine.setLight(down);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Shift") {
    if (!e.repeat) setShift(true);
    return; // Shift alone never reaches the chat
  }
  // Dev mode shortcuts work everywhere, including in the chat and name inputs (Backquote is not typed there).
  if (e.code === "Backquote" || (e.code === "KeyD" && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)) {
    e.preventDefault();
    setDev(!devOn);
    return;
  }
  if (frontScreen) return;
  if (previewing) {
    if (e.key === "Escape") endPreview();
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
    if (!e.repeat) setPaused(!paused);
    return;
  }
  if (paused) return;
  if (s.player.reading !== null) {
    if (e.code === "Space") {
      e.preventDefault();
      engine.putDownArtifact();
    }
    return;
  }
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
// Dev mode. Backquote, Ctrl+Shift+D or ?dev toggles it
// (state kept in localStorage). Every action goes through the engine object (dev* methods or the normal flow methods).
const DEV_DEFAULT = false;

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

function enterDevRun(): boolean {
  if (frontScreen === "intro") return false;
  if (previewing) endPreview();
  if (frontScreen === "title") {
    resetScreen();
    show(ui.screen, false);
    frontScreen = null;
    lastPhase = null;
    sound.unlock();
  }
  devRun = true;
  return true;
}

// Gets the engine into PLAYING from phases the engine can start or retry.
function devEnsurePlaying(): boolean {
  if (!enterDevRun()) return false;
  if (engine.state.phase === "NAME_PROMPT") engine.setName("Keeper");
  if (engine.state.phase === "BREACH") engine.retryNight();
  if (engine.state.phase === "NIGHT_CARD") engine.beginNight();
  return engine.state.phase === "PLAYING";
}

function devJump(n: number): void {
  if (!enterDevRun()) return;
  if (engine.state.phase === "NAME_PROMPT") engine.setName("Keeper");
  engine.jumpToNight(n);
  if (devSkipCard) engine.beginNight();
}

function devNight(): number {
  return engine.state.run.night;
}

function devRestart(): void {
  if (!enterDevRun()) return;
  if (engine.state.phase === "BREACH" || engine.state.phase === "PLAYING") engine.retryNight();
  else devJump(devNight());
  if (devSkipCard) engine.beginNight();
}

// Skips the clock with normal ticks. The events of the skipped minutes are mostly dropped (no radio, decoy or line
// burst), except anything that ends or changes the night. Ram has no cues to replay: he is silent.
function devSkipClock(): void {
  if (!devEnsurePlaying()) return;
  engine.devSkipToLastSecond();
  const t = now();
  const evs = engine.drainEvents();
  const mute = new Set<GameEvent["type"]>([
    "CHUD_SAY", "RADIO", "RAM_APPROACH", "RAM_AT_ENTRY", "RAM_RETREAT", "RAM_FAKE_OUT", "RAM_AWAY", "RAM_INSIDE", "HINT", "SILENCE_PULL",
    "DECOY", "LIGHT_CUT", "LOCK_REFUSED", "POWER_CHANGED",
  ]);
  for (const ev of evs) if (!mute.has(ev.type)) onEvent(ev, t);
  sound.stopCues();
}

function devPreview(kind: "BREACH" | "NIGHT_WON" | "GAME_WON"): void {
  if (frontScreen === "intro" || paused || (engine.state.phase === "BREACH" && !breachShown)) return;
  previewing = true;
  showScreen(kind);
}

function endPreview(): void {
  if (!previewing) return;
  previewing = false;
  skipDt = true;
  if (frontScreen === "title") showTitle();
  else showScreen(engine.state.phase);
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

  const ram = group("Threat");
  for (const e of ["WINDOW", "HATCH", "BALCONY"] as const)
    add(ram, `Send ${NAME[e]}`, () => {
      if (devEnsurePlaying()) engine.devSendRam(e);
    }, "Only while the threat is away");
  add(ram, "Threat away", () => {
    if (devEnsurePlaying()) engine.devRamAway();
  });
  const breach = group("Breach");
  for (const tr of ["TIMER", "NONE", "MOVE"] as InsideTrigger[])
    add(breach, `Force ${tr}`, () => {
      if (devEnsurePlaying()) engine.devForceBreach(undefined, tr);
    }, "The threat silently gets in at a random entry with this extra trigger");
  add(breach, "Force (rolled)", () => {
    if (devEnsurePlaying()) engine.devForceBreach();
  }, "The threat silently gets in, trigger rolled by INSIDE_TRIGGER_WEIGHTS");

  const power = group("Power");
  for (const slot of ["NONE", "LOCK_WINDOW", "LOCK_HATCH", "LOCK_BALCONY", "LIGHT_WINDOW", "LIGHT_HATCH", "LIGHT_BALCONY"] as PowerSlot[])
    add(power, slot.replace("LOCK_", "L:").replace("LIGHT_", "*:"), () => {
      if (devEnsurePlaying()) engine.devSetPower(slot);
    }, `Set the slot to ${slot} (no relay delay)`);

  const chud = group("CHUD");
  for (const [label, v] of [["WARM", 0], ["HURT", 50], ["JEALOUS", 80], ["FURIOUS", 100]] as const) add(chud, label, () => engine.devSetSuspicion(v), `suspicion ${v}`);
  devRefs.llm = add(chud, "LLM", () => (llm.enabled = !llm.enabled));

  const screens = group("Screens");
  add(screens, "Loss", () => devPreview("BREACH"));
  add(screens, "Night won", () => devPreview("NIGHT_WON"));
  add(screens, "Game won", () => devPreview("GAME_WON"));
  add(screens, "Close preview", endPreview);
}

function renderDev(): void {
  const s = engine.state;
  const r = s.ram;
  const q = s.chud.pendingQuestion;
  const lines = [
    `phase ${s.phase}  night ${s.run.night}  speed x${speed}  skip card ${devSkipCard ? "on" : "off"}${previewing ? "  PREVIEW" : ""}`,
    `LLM ${!llm.available ? "unavailable (no key or server)" : llm.enabled ? "on" : "off"}  last judge: ${lastJudgeSource}`,
    `t ${s.clock.elapsed.toFixed(1)} / ${CONFIG.HOUR_LENGTH * CONFIG.NIGHT_HOURS}`,
    `THREAT ${r.state} ${r.target ?? ""} ends ${r.stateEndsAt.toFixed(1)} (in ${(r.stateEndsAt - s.clock.elapsed).toFixed(1)})`,
    `    visit ${r.visitId} fake ${r.fakedThisVisit ? "yes" : r.fakeOutAt !== null ? "planned" : "no"} pulls ${r.pendingPull}`,
    `SUSPICION ${s.chud.suspicion}  band ${s.chud.band}${s.chud.furiousActive ? " (episode)" : ""}`,
    `POWER ${s.power.slot}${s.power.pending ? " -> " + s.power.pending.target : ""}  online ${s.power.chudOnline}`,
    `LIGHT ${s.power.slot.startsWith("LIGHT_") ? "ON " + s.power.slot.slice(6) : "off"}  shift ${s.player.lightHeld ? "held" : "-"}  cut at ${s.power.lightCutAt === null ? "-" : s.power.lightCutAt.toFixed(1)}`,
    `CHUD odds (${s.chud.band}): refuse lock ${Math.round((s.chud.band === "FURIOUS" ? 1 : CONFIG.LOCK_REFUSAL[s.chud.band]) * 100)}%  cut light ${Math.round(CONFIG.LIGHT_CUT[s.chud.band] * 100)}%  refused this visit ${s.log.visit.refusedEntry ?? "-"}`,
    `LOSS ${s.loss ? s.loss.cause + " / " + s.loss.reason : "-"}`,
    `INSIDE ${r.inside ? `${r.inside.entry} since ${r.inside.since.toFixed(1)} cause ${r.inside.cause} trigger ${r.inside.trigger}${r.inside.timerAt !== null ? " at " + r.inside.timerAt.toFixed(1) : ""}` : "-"}`,
    `    last gap ${r.lastGap ? `${r.lastGap.kind} ${r.lastGap.length.toFixed(1)}` : "-"}  window ${r.attemptLength.toFixed(1)}  decoys ${s.decoy.count} next ${s.decoy.nextAt.toFixed(1)}`,
    `lie decision ${s.chud.visitDecision ? (s.chud.visitDecision.lie ? "LIE " : "truth ") + s.chud.visitDecision.entry : "-"}`,
    `question ${q ? `${q.origin} ${q.type}: ${q.text}` : "-"}`,
    `facts ${JSON.stringify(s.chud.facts)}`,
    `silence ticks ${s.timers.silenceTicks}  last real ${s.timers.lastRealMessageAt.toFixed(1)}`,
  ];
  ui.devText.textContent = lines.join("\n");
  devRefs.speed.forEach((b, i) => b.classList.toggle("on", speed === [1, 3, 8][i]));
  devRefs.skip?.classList.toggle("on", devSkipCard);
  devRefs.llm?.classList.toggle("on", llm.enabled);
}

void boot();
