// Playable loop: engine (src/sim) + PixiJS scene (src/ui/scene) + DOM HUD + Web Audio.
// The UI only reads engine.state and calls engine methods. All rules live in the engine.

import { Application } from "pixi.js";
import { judge, lastJudgeSource } from "./chud/judgeClient";
import { checkLlm, llm, VOICED, voiceRemote } from "./chud/llmClient";
import { offlineJudge } from "./chud/offlineJudge";
import { CONFIG } from "./config";
import { LONG_LINE_WORDS } from "./chud/lines";
import { GameEngine } from "./sim/engine";
import { defaultBeamParams, normalizeAngle } from "./sim/beam";
import { slotEntry, type Band, type Entry, type GameEvent, type InsideTrigger, type LossInfo, type Phase, type PowerSlot, type QuickCommand } from "./sim/types";
import { loadArt } from "./ui/art";
import type { Sound, SpeechPlayback } from "./ui/audio";
import { EdgeTurner } from "./ui/edges";
import { playIntro } from "./ui/intro";
import { H, W } from "./ui/layout";
import { Scene } from "./ui/scene";
import { Terminal } from "./ui/terminal";
import { EveningTutorial } from "./ui/tutorial";
import { renderMorning, renderNightCard } from "./ui/screens/clock";
import { renderKillCodeEnding, renderTrapped } from "./ui/screens/killEnding";
import { createCodeDesk } from "./ui/codeDesk";
import { preloadScreens } from "./ui/screens/loading";
import { renderLoss } from "./ui/screens/loss";
import { renderName } from "./ui/screens/name";
import { renderSafetyPause } from "./ui/screens/safety";
import { clearSave, readSave, writeSave, type SavedRun } from "./ui/screens/save";
import { GAME_TITLE, renderTitle } from "./ui/screens/title";
import type { createArtifacts } from "./ui/artifacts";
import { MALICE, PRACTICE_UI, RING, SCARE, type JumpscareVariant } from "./uiConfig";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// URL params: ?dev=0 hides the DEV badge and ?night=N (start straight at that night's card as "Keeper").
const params = new URLSearchParams(window.location.search);
const deepNight = ((): number | null => {
  const raw = params.get("night");
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= CONFIG.nights.length ? n : null;
})();
// ?papers=N (0..4) with ?night=N: start with N slips already collected (default: every slip owed before that night).
const deepPapers = ((): number => {
  const n = Number(params.get("papers"));
  return params.has("papers") && Number.isInteger(n) && n >= 0 && n <= 4 ? n : Math.max(0, Math.min(4, (deepNight ?? 1) - 1));
})();
let engine = new GameEngine({
  seed: Date.now() % 2147483647,
  ...(deepNight ? { startNight: deepNight, skipNamePrompt: true, facts: { name: "Keeper" }, papersCheckpoint: deepPapers } : {}),
});
let sound: Sound;
const app = new Application();
let scene: Scene;
let artifacts: ReturnType<typeof createArtifacts> | undefined;
let codeDesk: ReturnType<typeof createCodeDesk>;
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
const practiceControls = $("tutorial");
const practiceChip = $("practice-chip");
const practiceFinish = $<HTMLButtonElement>("practice-finish");
let tutorial = new EveningTutorial();

// UI-only state
let lastPhase: Phase | null = null;
let frontScreen: "title" | "intro" | null = null; // presentation before the engine flow
let screenAbort = new AbortController();
let devRun = deepNight !== null;
let breachShown = false;
type Caption = { text: string; until: number; playback?: SpeechPlayback };
let chudCaption: Caption | undefined;
let radioCaption: Caption | undefined;
let powerAlarmUntil = 0;
let powerAlarmEntry: Entry | null = null;
let lockRefusedUntil = 0;
let lockRefusedEntry: Entry | null = null;
let previousPowerSlot: PowerSlot = "NONE";
let powerFlicker = false;
let maliciousUntil = 0; // real seconds: CHUD's malicious smile is up
let scareTimers: number[] = []; // the running flash and jumpscare sequence
let speed = 1;
let devOn = false; // dev mode: badge visible, shortcuts live (default on)
let devOpen = false; // panel open
let devNextAt = 0;
let devSkipCard = false; // N buttons go straight into PLAYING
let previewing = false; // a dev screen preview is up: the night is frozen behind it
const devRefs: {
  speed: HTMLButtonElement[];
  skip?: HTMLButtonElement;
  llm?: HTMLButtonElement;
  scareSfx: Partial<Record<JumpscareVariant, HTMLButtonElement>>;
} = { speed: [], scareSfx: {} };
let paused = false; // UI-level pause: engine.tick is skipped, audio suspended
let skipDt = false; // first frame after a resume gets dt 0
let dialogueToken = 0; // drops LLM replies from before a reset, power cut or interruption
let convo: string[] = []; // recent "Keeper: ..." / "ChudGPT: ..." lines, context for the voice
let edges: EdgeTurner;
let lastTypedAt = -Infinity;
let lastKeyAt = -Infinity; // last key typed into the chat, for the typing state ChudGPT waits on (GAME_LOGIC 8.10)
let reportedTyping: { engine: unknown; on: boolean } = { engine: null, on: false };
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
    preference: "webgl", preferWebGLVersion: 2,
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoStart: false,
  });
  const { Sound } = await audio;
  sound = new Sound();
  $("stage").appendChild(app.canvas);
  const art = await preloadScreens(loadArt, () => sound.preload());
  if (art.length) console.info("art slots loaded:", art.join(", "));
  sound.warmSpeech();
  void checkLlm().then((on) => console.info(on ? "CHUD: LLM judge and voice on" : "CHUD: offline judge and canned lines"));
  scene = new Scene(app);
  scene.onThunder = () => { if (engine.state.phase === "PLAYING") sound.thunder(); };
  if (import.meta.env.DEV) Object.assign(window, { app, scene });
  edges = new EdgeTurner($("stage"));
  fit();
  window.addEventListener("resize", fit);
  wireInput();
  const { createArtifacts } = await import("./ui/artifacts");
  artifacts = createArtifacts($("ui"), scene, () => engine);
  codeDesk = createCodeDesk($("ui"), scene, () => engine);
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
    sound.setLampHum(false, 0);
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
  // Clear queued speech when leaving practice or starting a new night.
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
  if (!paused && engine.isPracticing && phase === "PLAYING") {
    tutorial.update(engine, t, (line) => showChud(line.text, line.band, t), clearPracticeSpeech);
  }
  const animateStage = phase === "PLAYING" || (phase === "BREACH" && !breachShown);
  if (phase === "PLAYING" && !paused) sound.keepSpeechWarm();
  const lampActive = phase === "PLAYING" && !paused && engine.isLampOn();
  sound.setLampHum(lampActive, lampActive ? engine.beamViewIntensity(engine.state.player.view, engine.visualTime) : 0);
  reportTyping(t);
  const typing = document.activeElement === terminal.chat && t - lastTypedAt < TYPING_TAIL;
  if (!paused && animateStage) scene.update(engine, t, typing);
  else scene.pauseMedia();
  renderHud(t);
  if (paused || !animateStage) app.ticker.stop();
}

// ChudGPT never talks over the keeper: tell the engine while the chat has text (up to 12 s after the last key) or a key
// was typed in the last 3 s.
function reportTyping(t: number): void {
  const sinceKey = t - lastKeyAt;
  const on = !paused && (sinceKey < CONFIG.PACING.TYPING_HOLD || (terminal.chat.value !== "" && sinceKey < 12));
  if (reportedTyping.engine === engine && reportedTyping.on === on) return;
  reportedTyping = { engine, on };
  engine.setTyping(on);
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
      chudCaption = radioCaption = undefined;
      breachShown = false;
      endScare();
      artifacts?.read(null);
      maliciousUntil = 0;
      powerAlarmUntil = 0;
      powerAlarmEntry = null;
      lockRefusedUntil = 0;
      lockRefusedEntry = null;
      previousPowerSlot = "NONE";
      powerFlicker = false;
      // Also handles dev jumps within the same phase, including those that skip the card.
      showScreen(engine.state.phase);
      break;
    // The lesson uses room sounds to cue the arrivals.
    case "RAM_AT_ENTRY":
      if (engine.isPracticing) sound.decoy(ev.entry === "WINDOW" ? "glass" : "knock", ev.entry === "WINDOW" ? -0.8 : 0.8);
      break;
    case "RAM_REPELLED":
      scene.repelImpact(ev.entry);
      sound.braceImpact();
      break;
    case "DECOY":
      sound.decoy(ev.sound, ev.pan);
      break;
    case "POWER_CHANGED": {
      const previous = previousPowerSlot;
      previousPowerSlot = ev.slot;
      powerFlicker ||= previous !== ev.slot;
      if ((ev.cause === "sabotage" || ev.cause === "furious") && previous !== "NONE") {
        powerAlarmEntry = slotEntry(previous);
        powerAlarmUntil = t + 2.5;
      }
      sound.relay(ev.cause === "sabotage" || ev.cause === "furious" || ev.cause === "kill_switch");
      if (previous !== ev.slot && ev.slot !== "NONE") sound.lockEngage();
      if (ev.cause === "sabotage") maliciousUntil = Math.max(maliciousUntil, t + MALICE.SABOTAGE_TIME);
      break;
    }
    case "LOCK_REFUSED":
      maliciousUntil = t + MALICE.REFUSE_TIME;
      lockRefusedEntry = ev.entry;
      lockRefusedUntil = t + 0.75;
      break;
    case "LIGHT_CUT":
      sound.lightTick();
      scene.lightFlickerUntil = t + 0.18;
      if (ev.band === "JEALOUS" || ev.band === "FURIOUS") maliciousUntil = Math.max(maliciousUntil, t + MALICE.LIGHT_CUT_TIME);
      break;
    case "LAMP_RESTORED":
      sound.lightClick(true);
      break;
    case "ARTIFACT":
      sound.paper();
      // Kill-code papers: the codeDesk overlay follows state.player.reading.
      if (ev.id === null || !ev.id.startsWith("paper")) artifacts?.read(ev.id);
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
      if (engine.isPracticing) {
        tutorial.hear(ev);
        break;
      }
      // Quick-button answer_first stays instant/canned; every typed-chat outcome goes through the LLM when available.
      const quickAnswerFirst = o.kind === "answer_first" && engine.state.player.lastQuickAt > engine.state.player.lastMessageAt;
      if (!llm.on || !VOICED.has(o.kind) || quickAnswerFirst) {
        showChud(ev.text, ev.band, t);
        break;
      }
      const atEntryNow = engine.state.ram.state === "AT_ENTRY";
      // Code already decided the outcome; the LLM only words it. Canned line only if it fails, times out, or is too long during AT_ENTRY.
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
          // During AT_ENTRY only short lines play (GAME_LOGIC 8.10); APPROACHING and calm always show the live LLM reply.
          const inAttempt = atEntryNow || engine.state.ram.state === "AT_ENTRY";
          const long = text !== null && text.trim().split(/\s+/).length > LONG_LINE_WORDS;
          const shown = text !== null && (!inAttempt || !long) ? text : ev.text;
          showChud(shown, ev.band, now());
          engine.noteSpoken(shown); // the engine counts it as speech, so nothing is asked over it
        }
      });
      break;
    }
    case "RADIO":
      sound.radio(ev.text);
      radioCaption = { text: ev.text, until: t + 4 };
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
    case "GAME_WON":
    case "TRAPPED": {
      // Record the unlocked night even if the browser closes during dawn.
      if (!devRun) {
        const { night, factsCheckpoint, killCode, papersCheckpoint } = engine.state.run;
        // NIGHT_WON moves on with the papers collected so far; GAME_WON and TRAPPED stay on the last night with its checkpoint.
        writeSave({
          night: ev.type === "NIGHT_WON" ? night + 1 : night,
          factsCheckpoint,
          killCode,
          papersCheckpoint: ev.type === "NIGHT_WON" ? engine.papersOnDesk().length : papersCheckpoint,
        });
      }
      artifacts?.read(null);
      stopChudSpeech();
      sound.stopCues();
      // The trapped sequence stays in the watch room until the player returns to Title.
      if (ev.type !== "TRAPPED") sound.setAmbientPlaying(false);
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

function clearPracticeSpeech(): void {
  stopChudSpeech();
  chudCaption = undefined;
}

function showChud(text: string, band: Band, t: number): SpeechPlayback | undefined {
  const display = Math.max(PRACTICE_UI.MIN_READ_TIME, text.length * PRACTICE_UI.READ_SECONDS_PER_CHARACTER);
  chudCaption = { text, until: t + display };
  terminal.addLine("chud", text, t);
  convo.push(`ChudGPT: ${text}`);
  sound.chime();
  // A new line cuts off the one still speaking and drops anything queued. Practice lines keep their own sequencing.
  if (!engine.isPracticing) sound.stopSpeech();
  const staleAt = engine.isPracticing ? undefined : performance.now() + display * 1000;
  const playback = engine.state.power.chudOnline ? sound.speak(text, band, staleAt) : undefined;
  if (engine.isPracticing) chudCaption.playback = playback;
  return playback;
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
  const monitorShowing = deskView && !scene.transitionVisible && s.player.reading === null;
  const activeRadio = playing && radioCaption && radioCaption.until > t ? radioCaption : undefined;
  const activeChud = playing && !monitorShowing && chudCaption && (chudCaption.until > t || chudCaption.playback?.state === "playing") ? chudCaption : undefined;
  const caption = activeRadio ?? activeChud;
  if (caption) setText(ui.subtitle, caption.text);
  ui.subtitle.classList.toggle("visible", !!caption);
  ui.subtitle.classList.toggle("desk-instant-hide", monitorShowing && !activeRadio);
  ui.subtitle.classList.toggle("desk", deskView); // sits on the bare desk above the keyboard, not over it
  ui.subtitle.classList.toggle("practice", practicing);
  ui.subtitle.classList.toggle("practice-hatch-close", practicing && view === "HATCH" && (pos.kind === "STANDING" || pos.kind === "HOLDING"));

  show(terminal.root, deskView);
  terminal.root.inert = paused || s.player.reading !== null || (practicing && tutorial.step === "story");
  if (deskView) {
    terminal.root.style.transform = scene.deskScreenTransform();
    terminal.root.style.opacity = String(scene.transitionVisible ? 0 : 1 - scene.fadeAlpha);
    terminal.render(s, clock, t, {
      malicious: p.chudOnline && t < maliciousUntil,
      flicker: powerFlicker,
      alertEntry: powerAlarmEntry,
      alert: t < powerAlarmUntil,
      refusedEntry: lockRefusedEntry,
      refused: t < lockRefusedUntil,
    });
  } else if (document.activeElement === terminal.chat) {
    terminal.chat.blur();
  }
  powerFlicker = false;
  const deskClear = deskView && s.player.reading === null && ui.screen.classList.contains("hidden") && !scene.transitionVisible;
  artifacts?.render(deskClear);
  codeDesk.sync(playing ? s.player.reading : null);
  codeDesk.render(deskClear);
  codeDesk.renderFloor(playing && !practicing);
  practiceControls.hidden = !practicing || !playing || paused;
  const prompt = practiceControls.hidden ? undefined : tutorial.prompt(s);
  if (prompt) {
    practiceControls.dataset.lesson = tutorial.step;
    setText(practiceChip, prompt.chip);
    practiceChip.hidden = !prompt.chip;
    setText(practiceFinish, tutorial.step === "ready" ? "Start Night 1" : "Skip practice");
  }
  if (deskView && practicing) {
    terminal.chat.disabled ||= tutorial.step !== "chat";
    for (const button of terminal.quick) button.disabled ||= !tutorial.allowsQuick(button.dataset.quick as QuickCommand);
  }
  terminal.form.classList.toggle("tutorial-target", prompt?.target === "chat");
  for (const button of terminal.quick) button.classList.toggle("tutorial-target", prompt?.target === button.dataset.quick);
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
  practiceControls.hidden = true;
  artifacts?.read(null);
  artifacts?.render(false);
  resetScreen();
  frontScreen = "title";
  scene.pauseMedia();
  app.ticker.stop();
  stopChudSpeech();
  sound.stopCues();
  sound.setLampHum(false, 0);
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
  tutorial = new EveningTutorial();
  sound.setTitlePlaying(false);
  resetScreen();
  show(ui.screen, false);
  engine = new GameEngine({
    seed: Date.now() % 2147483647,
    startNight: saved?.night,
    facts: saved?.factsCheckpoint,
    killCode: saved?.killCode,
    papersCheckpoint: saved?.papersCheckpoint,
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
  chudCaption = radioCaption = undefined;
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
  practiceControls.hidden = true;
  terminal.chat.value = "";
  lastTypedAt = -Infinity;
  braceDown = pressSpent = wasBracing = false;
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
        if (engine.isPracticing) tutorial.start(engine);
        wake();
      });
      break;
    case "NIGHT_CARD":
      renderNightCard(ui.screen, engine.state.run.night, () => { engine.beginNight(); wake(); }, signal);
      break;
    case "BREACH":
      renderLoss(ui.screen, engine.state.loss, title, signal);
      break;
    case "NIGHT_WON":
      renderMorning(ui.screen, previewing ? endPreview : () => { engine.nextNight(); wake(); }, signal, dawn);
      break;
    case "GAME_WON":
      if (engine.state.ending === "KILL_CODE") renderKillCodeEnding(ui.screen, title, signal);
      else renderMorning(ui.screen, () => renderKillCodeEnding(ui.screen, title, signal), signal, dawn);
      break;
    case "TRAPPED":
      renderTrapped(ui.screen, title, signal);
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
    sound.jumpscare(l.entry, duration);
    after(duration, () => {
      // Hard cut straight to black on the last frame with the jumpscare sound stopping at the same moment.
      sound.stopJumpscare();
      scene.clearScare();
      if (engine.state.phase === "BREACH" && !breachShown) {
        breachShown = true;
        sound.setAmbientPlaying(false);
        sound.fadeStorm(0, 0.04);
        showScreen("BREACH");
      }
    });
  });
}

function endScare(): void {
  for (const id of scareTimers) window.clearTimeout(id);
  scareTimers = [];
  sound?.stopJumpscare();
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
  codeDesk.pause(on);
  if (on) {
    practiceControls.hidden = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    scene.pauseMedia();
    app.ticker.stop();
    sound.suspend();
    show(ui.ring, false);
  } else {
    skipDt = true;
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
  practiceFinish.addEventListener("click", finishPractice);
  const skipStory = (event: Event): void => {
    if (!engine.isPracticing || tutorial.step !== "story" || paused || engine.state.phase !== "PLAYING") return;
    if (event.target === practiceFinish && (event.type === "click" || (event instanceof KeyboardEvent && ["Enter", " "].includes(event.key)))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event instanceof KeyboardEvent && event.repeat) return;
    clearPracticeSpeech();
    tutorial.skipStory(engine, now());
  };
  window.addEventListener("click", skipStory, { capture: true });
  window.addEventListener("keydown", skipStory, { capture: true });
  terminal.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (engine.isPracticing && tutorial.step !== "chat") return;
    const text = terminal.chat.value;
    const res = engine.submitMessage(text);
    if (!res.ok) return;
    terminal.addLine("me", text, now());
    convo.push(`Keeper: ${text}`);
    terminal.chat.value = "";
    lastTypedAt = -Infinity;
    lastKeyAt = -Infinity;
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
    lastKeyAt = lastTypedAt;
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
    b.addEventListener("click", () => {
      const command = b.dataset.quick as QuickCommand;
      if (!engine.isPracticing || tutorial.allowsQuick(command)) engine.pressQuick(command);
    });
  }
  wireBrace();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true); // the player resumes manually
  });
  window.addEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  // Dev mode shortcuts work everywhere, including in the chat and name inputs (Backquote is not typed there).
  if (e.code === "Backquote" || (e.code === "KeyD" && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)) {
    e.preventDefault();
    setDevOpen(!devOpen);
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
  const enabled = !paused && s.phase === "PLAYING" && s.player.reading === null && (pos.kind === "DESK" || atEntry)
    && (!engine.isPracticing || tutorial.step !== "story");
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
    if (engine.isPracticing && (tutorial.step !== "hatch" || s.player.view !== "HATCH")) return;
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
// Dev mode. The DEV badge shows on every load (production too); ?dev=0 hides it. Backquote, Ctrl+Shift+D or a badge click
// opens and closes the panel, which always starts closed. Nothing is persisted. Every action goes through the engine object.
function initDev(): void {
  const off = params.has("dev") && ["0", "false", "off", "no"].includes((params.get("dev") ?? "").toLowerCase());
  ui.devBadge.addEventListener("click", () => setDevOpen(!devOpen));
  setDev(!off);
}

function setDev(on: boolean): void {
  devOn = on;
  show(ui.devBadge, on);
  setDevOpen(false);
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
    "CHUD_SAY", "RADIO", "RAM_APPROACH", "RAM_AT_ENTRY", "RAM_REPELLED", "RAM_RETREAT", "RAM_FAKE_OUT", "RAM_AWAY", "RAM_INSIDE", "SILENCE_PULL",
    "DECOY", "LIGHT_CUT", "LAMP_RESTORED", "LOCK_REFUSED", "POWER_CHANGED",
  ]);
  sound.stopCues();
  for (const ev of evs) if (!mute.has(ev.type)) onEvent(ev, t);
}

function devPreview(kind: "BREACH" | "NIGHT_WON" | "GAME_WON" | "TRAPPED", ending: "KILL_CODE" | null = null): void {
  if (frontScreen === "intro" || paused || (engine.state.phase === "BREACH" && !breachShown)) return;
  previewing = true;
  if (ending) engine.state.ending = ending;
  showScreen(kind);
}

function endPreview(): void {
  if (!previewing) return;
  previewing = false;
  skipDt = true;
  if (engine.state.phase !== "GAME_WON") engine.state.ending = null; // undo the preview flag
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

  const scareSfx = group("Scare SFX");
  for (const [v, tip] of [
    ["A", "Pitched up and trimmed to 0.6 s"],
    ["B", "Variant A + harsh high screech layer (default)"],
    ["C", "Sharp attack, low rumble filtered out"],
  ] as const) {
    devRefs.scareSfx[v] = add(scareSfx, v, () => sound.setJumpscareVariant(v), tip);
  }
  add(scareSfx, "Play", () => sound.previewJumpscare(), "Hear the selected jumpscare SFX on the scare bus");

  const power = group("Power");
  for (const slot of ["NONE", "LOCK_WINDOW", "LOCK_HATCH", "LOCK_BALCONY"] as const)
    add(power, slot.replace("LOCK_", "L:"), () => {
      if (devEnsurePlaying()) engine.devSetPower(slot);
    }, `Set the slot to ${slot} (no relay delay)`);

  const chud = group("CHUD");
  for (const [label, v] of [["WARM", 0], ["HURT", 50], ["JEALOUS", 80], ["FURIOUS", 100]] as const) add(chud, label, () => engine.devSetSuspicion(v), `suspicion ${v}`);
  devRefs.llm = add(chud, "LLM", () => (llm.enabled = !llm.enabled));

  const screens = group("Screens");
  add(screens, "Loss", () => devPreview("BREACH"));
  add(screens, "Night won", () => devPreview("NIGHT_WON"));
  add(screens, "Game won", () => devPreview("GAME_WON"));
  add(screens, "Kill code end", () => devPreview("GAME_WON", "KILL_CODE"));
  add(screens, "Trapped end", () => devPreview("TRAPPED"));
  add(screens, "Close preview", endPreview);

  const beamGroup = group("Beam");
  const beamControls: { input: HTMLInputElement; output: HTMLOutputElement; reset: () => void }[] = [];
  const sliders = document.createElement("div");
  sliders.className = "dev-sliders";
  beamGroup.appendChild(sliders);
  const rad = Math.PI / 180;
  const addSlider = (
    label: string,
    initial: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    apply: (value: number) => void,
  ): void => {
    const row = document.createElement("label");
    row.className = "dev-slider";
    const head = document.createElement("span");
    const name = document.createElement("span");
    name.textContent = label;
    const out = document.createElement("output");
    out.value = `${initial}${unit}`;
    head.append(name, out);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    const sync = (): void => {
      out.value = `${input.value}${unit}`;
      apply(input.valueAsNumber);
      wake();
    };
    input.addEventListener("input", sync);
    row.append(head, input);
    sliders.appendChild(row);
    beamControls.push({
      input,
      output: out,
      reset: () => {
        input.value = String(initial);
        out.value = `${initial}${unit}`;
      },
    });
  };
  const defaults = defaultBeamParams(CONFIG);
  addSlider("Period", defaults.period, 4, 40, 0.5, " s", (v) => {
    if (scene.beamParams) scene.beamParams.period = v;
    engine.devSetBeam({ period: v });
  });
  addSlider("Width", Math.round(defaults.width / rad), 3, 70, 1, "°", (v) => {
    if (scene.beamParams) scene.beamParams.width = v * rad;
    engine.devSetBeam({ width: v * rad });
  });
  addSlider("Height", Math.round(defaults.height / rad), 8, 110, 1, "°", (v) => {
    if (scene.beamParams) scene.beamParams.height = v * rad;
  });
  addSlider("Tilt", Math.round(defaults.tilt / rad), -75, 20, 1, "°", (v) => {
    if (scene.beamParams) scene.beamParams.tilt = v * rad;
  });
  addSlider("Softness", Math.round(defaults.softness * 100), 5, 100, 1, "%", (v) => {
    if (scene.beamParams) scene.beamParams.softness = v / 100;
    engine.devSetBeam({ softness: v / 100 });
  });
  addSlider("Gain", defaults.gain, 0, 3, 0.05, "x", (v) => {
    if (scene.beamParams) scene.beamParams.gain = v;
  });
  addSlider("Darkness", Math.round((1 - defaults.darkGain) * 100), 0, 100, 1, "%", (v) => {
    if (scene.beamParams) scene.beamParams.darkGain = 1 - v / 100;
  });
  addSlider("Haze", defaults.haze, 0, 2, 0.05, "x", (v) => {
    if (scene.beamParams) scene.beamParams.haze = v;
  });
  add(beamGroup, "Reset beam", () => {
    if (scene.beamParams) Object.assign(scene.beamParams, defaultBeamParams(CONFIG));
    engine.devSetBeam({ reset: true });
    for (const c of beamControls) c.reset();
  });
}

function renderDev(): void {
  const s = engine.state;
  const r = s.ram;
  const q = s.chud.pendingQuestion;
  const beamDeg = (normalizeAngle(engine.beamAngle(engine.visualTime)) * 180) / Math.PI;
  const lampLabel = !s.power.generatorOn
    ? "off"
    : s.power.rebootingUntil !== null
      ? `reboot ${s.power.rebootingUntil.toFixed(1)}`
      : s.power.lampCutUntil !== null
        ? `CUT until ${s.power.lampCutUntil.toFixed(1)}`
        : "on";
  const lines = [
    `kill code ${s.run.killCode}  papers ${engine.papersOnDesk().length}  on floor ${JSON.stringify(engine.floorPaper())}`,
    `phase ${s.phase}  night ${s.run.night}  speed x${speed}  skip card ${devSkipCard ? "on" : "off"}${previewing ? "  PREVIEW" : ""}`,
    `LLM ${!llm.available ? "unavailable (no key or server)" : llm.enabled ? "on" : "off"}  last judge: ${lastJudgeSource}`,
    `t ${s.clock.elapsed.toFixed(1)} / ${CONFIG.HOUR_LENGTH * CONFIG.NIGHT_HOURS}`,
    `THREAT ${r.state} ${r.target ?? ""} ends ${r.stateEndsAt.toFixed(1)} (in ${(r.stateEndsAt - s.clock.elapsed).toFixed(1)})`,
    `    visit ${r.visitId} fake ${r.fakedThisVisit ? "yes" : r.fakeOutAt !== null ? "planned" : "no"} pulls ${r.pendingPull}`,
    `SUSPICION ${s.chud.suspicion}  band ${s.chud.band}${s.chud.furiousActive ? " (episode)" : ""}`,
    `POWER ${s.power.slot}${s.power.pending ? " -> " + s.power.pending.target : ""}  online ${s.power.chudOnline}`,
    `BEAM ${beamDeg.toFixed(1)} deg  lamp ${lampLabel}  cut at ${s.power.lightCutAt === null ? "-" : s.power.lightCutAt.toFixed(1)}  W:${engine.beamIntensity("WINDOW").toFixed(2)} H:${engine.beamIntensity("HATCH").toFixed(2)} B:${engine.beamIntensity("BALCONY").toFixed(2)}`,
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
  const activeVariant = sound.getJumpscareVariant();
  for (const v of ["A", "B", "C"] as const) devRefs.scareSfx[v]?.classList.toggle("on", activeVariant === v);
}

void boot();
