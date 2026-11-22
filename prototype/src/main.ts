// Playable loop: engine (src/sim) + PixiJS scene (src/ui/scene) + DOM HUD + Web Audio.
// The UI only reads engine.state and calls engine methods. All rules live in the engine.

import { Application } from "pixi.js";
import { judge, lastJudgeSource } from "./chud/judgeClient";
import { checkLlm, llm, VOICED, voiceRemote } from "./chud/llmClient";
import { offlineJudge } from "./chud/offlineJudge";
import { CONFIG } from "./config";
import { GameEngine } from "./sim/engine";
import type { Band, Entry, GameEvent, InsideTrigger, LossInfo, Phase, PowerSlot, QuickCommand } from "./sim/types";
import { loadArt } from "./ui/art";
import type { Sound } from "./ui/audio";
import { EdgeTurner } from "./ui/edges";
import { playIntro } from "./ui/intro";
import { H, W } from "./ui/layout";
import { Scene } from "./ui/scene";
import { Terminal } from "./ui/terminal";
import { EveningTutorial } from "./ui/tutorial";
import { renderMorning, renderNightCard } from "./ui/screens/clock";
import { renderEnding } from "./ui/screens/credits";
import { preloadScreens } from "./ui/screens/loading";
import { renderLoss } from "./ui/screens/loss";
import { renderName } from "./ui/screens/name";
import { renderSafetyPause } from "./ui/screens/safety";
import { clearSave, readSave, writeSave, type SavedRun } from "./ui/screens/save";
import { GAME_TITLE, renderTitle } from "./ui/screens/title";
import type { createArtifacts } from "./ui/artifacts";
import { MALICE, RING, SCARE } from "./uiConfig";

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
let sound: Sound;
const app = new Application();
let scene: Scene;
let artifacts: ReturnType<typeof createArtifacts> | undefined;
if (import.meta.env.DEV) Object.assign(window, { engine }); // console access while developing

const ui = {
  hud: $("hud"),
  clock: $("clock"),
  night: $("hud-night"),
  ring: $("ring"),
  subtitle: $("subtitle"),
  screen: $("screen"),
  dev: $("dev"),
  devBadge: $("dev-badge"),
  devText: $("dev-text"),
  devBtns: $("dev-btns"),
  pause: $("pause"),
};

const NAME: Record<Entry, string> = { WINDOW: "window", HATCH: "hatch", BALCONY: "balcony" };

const terminal = new Terminal($("terminal"));
const tutorial = new EveningTutorial($("tutorial"), terminal.root, finishPractice);

// UI-only state
let lastPhase: Phase | null = null;
let frontScreen: "title" | "intro" | null = null; // presentation before the engine flow
let screenAbort = new AbortController();
let devRun = deepNight !== null;
let breachShown = false;
type Caption = { text: string; until: number };
let chudCaption: Caption | undefined;
let radioCaption: Caption | undefined;
let hintCaption: Caption | undefined;
let powerAlarmUntil = 0;
let powerAlarmEntry: Entry | null = null;
let previousPowerSlot: PowerSlot = "NONE";
let powerFlicker = false;
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
let convo: string[] = []; // recent "Keeper: ..." / "ChudGPT: ..." lines, context for the voice
let edges: EdgeTurner;
let lastTypedAt = -Infinity;
const TYPING_TAIL = 0.45; // keep the hands moving between keystrokes
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
  const audio = import("./ui/audio");
  await app.init({
    width: W, height: H, background: "#000000", antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoStart: false,
  });
  const { Sound } = await audio;
  sound = new Sound();
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
  const { createArtifacts } = await import("./ui/artifacts");
  artifacts = createArtifacts($("ui"), scene, () => engine);
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
  if (deepNight) wake();
  $("loading").classList.add("loaded");
}

// Menus and pause have no per-frame work. Their callbacks wake the renderer when the engine can progress.
function wake(): void {
  if (app.ticker.started) return;
  skipDt = true;
  app.ticker.start();
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
  if (frontScreen || previewing) {
    scene.pauseMedia();
    app.ticker.stop();
    return;
  }
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
      sound.setGeneratorPowered(engine.state.power.generatorOn);
      sound.setAmbientPlaying(true);
      if (engine.state.player.position.kind === "HOLDING") sound.braceStart();
      if (document.hidden) setPaused(true);
    }
  }
  edgeTurn(t);
  const animateStage = phase === "PLAYING" || (phase === "BREACH" && !breachShown);
  const typing = document.activeElement === terminal.chat && t - lastTypedAt < TYPING_TAIL;
  if (!paused && animateStage) scene.update(engine, t, typing);
  else scene.pauseMedia();
  renderHud(t);
  if (paused || !animateStage) app.ticker.stop();
}

function onEvent(ev: GameEvent, t: number): void {
  switch (ev.type) {
    case "NIGHT_CARD":
      if (!devRun) writeSave(engine.state.run);
      sound.stopCues();
      sound.setGeneratorPowered(true);
      sound.fadeStorm(1, 0.9);
      if (engine.state.phase === "NIGHT_CARD") sound.nightStart();
      terminal.clear();
      convo = [];
      chudCaption = radioCaption = hintCaption = undefined;
      breachShown = false;
      endScare();
      artifacts?.read(null);
      maliciousUntil = 0;
      lightCutUntil = 0;
      powerAlarmUntil = 0;
      powerAlarmEntry = null;
      previousPowerSlot = "NONE";
      powerFlicker = false;
      // Also handles dev jumps within the same phase, including those that skip the card.
      showScreen(engine.state.phase);
      break;
    // Ram makes no sound and never speaks (GAME_LOGIC 7.4): RAM_* events have no cue here on purpose.
    case "DECOY":
      sound.decoy(ev.sound, ev.pan);
      break;
    case "POWER_CHANGED": {
      const previous = previousPowerSlot;
      previousPowerSlot = ev.slot;
      if (engine.isPracticing) tutorial.powerChanged(previous, ev.slot);
      powerFlicker ||= previous !== ev.slot;
      if ((ev.cause === "sabotage" || ev.cause === "furious") && previous.startsWith("LOCK_")) {
        powerAlarmEntry = previous.slice(5) as Entry;
        powerAlarmUntil = t + 2.5;
      }
      if (ev.cause === "light") {
        if (previous !== ev.slot) sound.relay(false);
        sound.lightClick(ev.slot !== "NONE");
        break;
      }
      if (ev.cause === "light_cut") break; // LIGHT_CUT plays the tick
      sound.relay(ev.cause === "sabotage" || ev.cause === "furious" || ev.cause === "kill_switch");
      if (previous !== ev.slot && ev.slot.startsWith("LOCK_")) sound.lockEngage();
      if (ev.cause === "sabotage") maliciousUntil = Math.max(maliciousUntil, t + MALICE.SABOTAGE_TIME);
      break;
    }
    case "LOCK_REFUSED":
      maliciousUntil = t + MALICE.REFUSE_TIME;
      break;
    case "LIGHT_CUT":
      sound.relay(false);
      sound.lightTick();
      powerAlarmEntry = ev.entry;
      lightCutUntil = powerAlarmUntil = t + 0.9;
      scene.lightFlickerUntil = t + 0.18;
      if (ev.band === "JEALOUS" || ev.band === "FURIOUS") maliciousUntil = Math.max(maliciousUntil, t + MALICE.LIGHT_CUT_TIME);
      break;
    case "ARTIFACT":
      sound.paper();
      artifacts?.read(ev.id);
      break;
    case "CHUD_ONLINE":
      powerFlicker = true;
      if (!ev.online) stopChudSpeech();
      break;
    case "GENERATOR":
      sound.generator(ev.on);
      powerFlicker = true;
      break;
    case "CHUD_SAY": {
      if (!ev.text) break;
      const o = ev.outcome;
      if (engine.isPracticing) tutorial.reply(o);
      if (engine.isPracticing || !llm.on || !VOICED.has(o.kind)) {
        showChud(ev.text, ev.band, t);
        break;
      }
      // Code already decided the outcome; the LLM only words it. Canned line if it fails or is slow.
      const token = dialogueToken;
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
        if (token === dialogueToken && engine.state.phase === "PLAYING" && engine.state.power.chudOnline) {
          showChud(text ?? ev.text, ev.band, now());
        }
      });
      break;
    }
    case "RADIO":
      sound.radio(ev.text);
      radioCaption = { text: ev.text, until: t + 4 };
      break;
    case "HINT":
      if (engine.state.run.night === 1) hintCaption = { text: ev.text, until: t + 6 };
      break;
    case "PLAYER_MOVED":
      if (ev.position.kind === "TRAVELING" || ev.position.kind === "RETURNING") sound.footsteps(CONFIG.TRAVEL_TIME);
      if (ev.position.kind === "HOLDING") sound.braceStart();
      break;
    case "HOLD_ENDED":
      sound.braceEnd(ev.reason === "arms");
      break;
    case "BREACH":
      stopChudSpeech();
      sound.stopCues();
      resetScreen();
      show(ui.screen, false);
      artifacts?.read(null);
      startScare(ev.loss);
      break;
    case "SAFETY_PAUSE":
      stopChudSpeech();
      sound.stopCues();
      break;
    case "NIGHT_WON":
    case "GAME_WON": {
      // Record the unlocked night even if the browser closes during dawn.
      if (!devRun) {
        const { night, factsCheckpoint } = engine.state.run;
        writeSave({ night: ev.type === "NIGHT_WON" ? night + 1 : night, factsCheckpoint });
      }
      artifacts?.read(null);
      stopChudSpeech();
      sound.stopCues();
      sound.setAmbientPlaying(false);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// HUD

function stopChudSpeech(): void {
  dialogueToken++;
  sound.stopSpeech();
}

function showChud(text: string, band: Band, t: number): void {
  chudCaption = { text, until: t + Math.max(3, text.length * 0.06) };
  terminal.addLine("chud", text, t);
  convo.push(`ChudGPT: ${text}`);
  sound.chime();
  if (engine.state.power.chudOnline) sound.speak(text, band);
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
  const practicing = engine.isPracticing;
  const pos = s.player.position;
  const atDesk = pos.kind === "DESK";
  const view = s.player.view;

  const clock = practicing ? "Evening" : clockText();
  show(ui.hud, playing && !practicing);
  setText(ui.clock, clock);
  setText(ui.night, "Night " + s.run.night);

  const p = s.power;

  const deskView = playing && atDesk && view === "DESK";
  const caption = playing
    ? [radioCaption, deskView ? undefined : chudCaption, hintCaption].find((line) => line && line.until > t)
    : undefined;
  if (caption) setText(ui.subtitle, caption.text);
  ui.subtitle.classList.toggle("visible", !!caption);

  show(terminal.root, deskView);
  terminal.root.inert = paused || s.player.reading !== null;
  if (deskView) {
    terminal.root.style.transform = scene.deskScreenTransform();
    terminal.root.style.opacity = String(scene.transitionVisible ? 0 : 1 - scene.fadeAlpha);
    terminal.render(s, clock, t, {
      malicious: p.chudOnline && t < maliciousUntil,
      flicker: powerFlicker,
      alertEntry: powerAlarmEntry,
      alert: t < powerAlarmUntil,
      lightCut: t < lightCutUntil,
    });
  } else if (document.activeElement === terminal.chat) {
    terminal.chat.blur();
  }
  powerFlicker = false;
  artifacts?.render(deskView && s.player.reading === null && ui.screen.classList.contains("hidden") && !scene.transitionVisible);
  if (practicing && playing && !paused) tutorial.render(s);
  else tutorial.hide();
  renderRing();
}

// One small ring on the pointer for whichever timer is running: edge dwell (fills), arms left while bracing
// (drains, red near the end), faint progress for the brace rest and HOLD_COOLDOWN. Hidden while walking (the
// dash to an entry and back) and otherwise.
function renderRing(): void {
  const s = engine.state;
  const pos = s.player.position;
  const now = engine.now;
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
  tutorial.hide();
  artifacts?.read(null);
  artifacts?.render(false);
  resetScreen();
  frontScreen = "title";
  scene.pauseMedia();
  app.ticker.stop();
  stopChudSpeech();
  sound.stopCues();
  sound.setAmbientPlaying(false);
  sound.fadeStorm(0, 0.9);
  sound.setTitlePlaying(true);
  const saved = readSave();
  renderTitle(ui.screen, {
    start: () => {
      clearSave();
      startRun();
    },
    resume: saved ? { night: saved.night, start: () => startRun(saved) } : undefined,
    activateAudio: () => sound.unlock(),
  });
  show(ui.screen, true);
}

function startRun(saved?: SavedRun): void {
  tutorial.reset();
  sound.setTitlePlaying(false);
  resetScreen();
  show(ui.screen, false);
  engine = new GameEngine({
    seed: Date.now() % 2147483647,
    startNight: saved?.night,
    facts: saved?.factsCheckpoint,
    skipNamePrompt: !!saved,
    practiceBeforeNight: !saved,
  });
  if (import.meta.env.DEV) Object.assign(window, { engine });
  frontScreen = null;
  lastPhase = null;
  previousPowerSlot = "NONE";
  devRun = false;
  terminal.chat.value = "";
  terminal.clear();
  chudCaption = radioCaption = hintCaption = undefined;
  sound.unlock();

  if (!saved && !params.has("nointro")) {
    frontScreen = "intro";
    setDevOpen(false);
    sound.fadeStorm(0, 0.15);
    playIntro({
      root: $("ui"),
      onDone: () => { frontScreen = null; wake(); },
    });
  } else wake();
}

function finishPractice(): void {
  if (!engine.isPracticing || paused) return;
  sound.menuTick();
  engine.finishPractice();
  tutorial.hide();
  terminal.chat.value = "";
  lastTypedAt = -Infinity;
  shiftDown = braceDown = pressSpent = wasBracing = false;
  wake();
}

function showScreen(phase: Phase): void {
  if (phase === "PLAYING" && ui.screen.classList.contains("night-card-fading")) return;
  resetScreen();
  show(ui.screen, phase !== "PLAYING");
  const signal = screenAbort.signal;
  const title = previewing ? endPreview : showTitle;
  const dawn = previewing ? undefined : () => {
    sound.dawn();
    sound.fadeStorm(0, 1.5);
  };
  switch (phase) {
    case "NAME_PROMPT":
      renderName(ui.screen, (name) => {
        sound.unlock();
        engine.setName(name);
        wake();
      });
      break;
    case "NIGHT_CARD":
      renderNightCard(ui.screen, engine.state.run.night, () => { engine.beginNight(); wake(); }, signal);
      break;
    case "BREACH":
      renderLoss(ui.screen, title, signal);
      break;
    case "NIGHT_WON":
      renderMorning(ui.screen, previewing ? endPreview : () => { engine.nextNight(); wake(); }, signal, dawn);
      break;
    case "GAME_WON":
      renderMorning(ui.screen, () => renderEnding(ui.screen, title, signal), signal, dawn);
      break;
    case "SAFETY_PAUSE":
      renderSafetyPause(ui.screen, () => { engine.resumeFromSafetyPause(); wake(); });
      break;
    case "PLAYING":
      break;
  }
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
  const snap = scene.prepareScare(l.entry, l.flash, now());
  if (l.flash) {
    if (snap) after(snap, () => sound.flashSting());
    else sound.flashSting();
  }
  after(snap + (l.flash ? SCARE.FLASH_TIME : 0), () => {
    const duration = scene.playScare(l.entry, now());
    sound.jumpscare(l.entry);
    after(duration, () => {
      scene.clearScare();
      if (engine.state.phase === "BREACH" && !breachShown) {
        breachShown = true;
        sound.setAmbientPlaying(false);
        sound.fadeStorm(0, 0.65);
        sound.lossStatic();
        showScreen("BREACH");
      }
    });
  });
}

function endScare(): void {
  for (const id of scareTimers) window.clearTimeout(id);
  scareTimers = [];
  scene?.clearScare();
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
  terminal.root.inert = on || engine.state.player.reading !== null;
  artifacts?.pause(on);
  if (on) {
    tutorial.hide();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    scene.pauseMedia();
    app.ticker.stop();
    sound.suspend();
    show(ui.ring, false);
  } else {
    skipDt = true;
    if (!shiftDown) engine.setLight(false);
    sound.resume();
    wake();
  }
  show(ui.pause, on);
}

// ---------------------------------------------------------------------------
// Input

function wireInput(): void {
  const menuClick = (ev: MouseEvent): void => {
    if (ev.target instanceof Element && ev.target.closest("button:not(:disabled)")) sound.menuTick();
  };
  ui.screen.addEventListener("click", menuClick, { capture: true });
  terminal.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = terminal.chat.value;
    const res = engine.submitMessage(text);
    if (!res.ok) return;
    terminal.addLine("me", text, now());
    convo.push(`Keeper: ${text}`);
    terminal.chat.value = "";
    lastTypedAt = -Infinity;
    const ticket = res.ticket;
    if (engine.isPracticing) {
      tutorial.messageSent();
      terminal.chat.blur();
      if (!ticket.repeat) engine.applyJudge(ticket.id, offlineJudge(ticket.judgeInput));
      return;
    }
    if (ticket.repeat) return;
    const run = engine;
    void judge(ticket.judgeInput).then((r) => {
      run.applyJudge(ticket.id, r);
      if (run === engine && frontScreen === null && !previewing) wake();
    });
  });
  terminal.chat.addEventListener("input", () => {
    lastTypedAt = now();
    sound.keyboard();
  });
  terminal.chat.addEventListener("blur", () => { lastTypedAt = -Infinity; });
  terminal.chat.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    terminal.form.requestSubmit();
  });
  for (const ev of ["paste", "drop"]) terminal.chat.addEventListener(ev, (e) => e.preventDefault());

  for (const b of terminal.quick) {
    b.addEventListener("click", () => engine.pressQuick(b.dataset.quick as QuickCommand));
  }
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
  if (e.target === terminal.chat) {
    if (e.key === "Escape") terminal.chat.blur();
    return;
  }
  if (e.target instanceof HTMLInputElement) return;
  if ((e.key === "Enter" || e.key === " ") && e.target instanceof Element && e.target.closest("#tutorial button")) return;
  const s = engine.state;
  if (s.phase !== "PLAYING") return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (!e.repeat) {
      if (engine.isPracticing) tutorial.pauseChanged(!paused);
      setPaused(!paused);
    }
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
  if (s.player.position.kind !== "DESK" || s.player.view !== "DESK" || terminal.chat.disabled) return;
  if (e.key === "Enter") {
    e.preventDefault();
    terminal.chat.focus();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault(); // also keeps Space or Enter from clicking a focused quick button
    terminal.chat.focus();
    if (terminal.chat.value.length < terminal.chat.maxLength) {
      terminal.chat.value += e.key;
      lastTypedAt = now();
      sound.keyboard();
    }
    const end = terminal.chat.value.length;
    terminal.chat.setSelectionRange(end, end);
  }
}

// ---------------------------------------------------------------------------
// Edge controls (docs/CONTROLS_PROPOSAL.md): mouse edges turn, press and hold the left button to brace

function edgeTurn(t: number): void {
  const s = engine.state;
  const pos = s.player.position;
  // At an entry (standing or bracing) only the return edge exists: it runs back to the desk.
  const atEntry = pos.kind === "STANDING" || (pos.kind === "HOLDING" && !!pos.stay);
  const enabled = !paused && s.phase === "PLAYING" && s.player.reading === null && (pos.kind === "DESK" || atEntry);
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
    sound.setTitlePlaying(false);
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
  sound.stopCues();
  for (const ev of evs) if (!mute.has(ev.type)) onEvent(ev, t);
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
  else {
    showScreen(engine.state.phase);
    wake();
  }
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
      wake();
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
