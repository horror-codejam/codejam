// Opening cutscene, scene 1 (the shipwreck). Self-contained: own DOM, own Web Audio synth, own timers.
// Usage: playIntro({ root: <stage overlay>, onDone }) -> { skip(), destroy() }. See prototype/INTRO_NOTES.md.
import "./intro.css";

export interface IntroOptions { root: HTMLElement; onDone: () => void; muted?: boolean }
export interface IntroHandle { skip(): void; destroy(): void }

// ---------------------------------------------------------------------------
// Frames (picked up automatically when scenes/01-shipwreck/intro/ is rendered)

const frameFiles = import.meta.glob("../../../scenes/01-shipwreck/intro/*.png", { eager: true, import: "default" }) as Record<string, string>;
const blockoutFiles = import.meta.glob("../../../scenes/01-shipwreck/render_blockout.png", { eager: true, import: "default" }) as Record<string, string>;
const faceFiles = import.meta.glob("../../../scenes/03-watch-room/chud_smiley_four_moods.png", { eager: true, import: "default" }) as Record<string, string>;

const find = (m: Record<string, string>, suffix: string): string | null => {
  const hit = Object.entries(m).find(([p]) => p.endsWith(suffix));
  return hit ? hit[1] : null;
};

// ---------------------------------------------------------------------------
// Script and pure helpers

export type Speaker = "YOU" | "MATE" | "COAST GUARD";
export interface Beat { n: number; speaker?: Speaker; line?: string; minMs: number }

export const BEATS: Beat[] = [
  { n: 1, minMs: 5500 },
  { n: 2, speaker: "YOU", line: "Report! What's happening back there?", minMs: 3600 },
  { n: 3, speaker: "MATE", line: "We're taking on water, Captain! The hull's cracked, she's going down!", minMs: 3600 },
  { n: 4, speaker: "YOU", line: "Get on the radio. Call the coast guard!", minMs: 3600 },
  { n: 5, speaker: "MATE", line: "Mayday, mayday, mayday! We're sinking, three souls aboard, we need help now!", minMs: 3600 },
  { n: 6, speaker: "COAST GUARD", line: "...copy your mayday. The storm has grounded every crew we have. Earliest we can reach you is five days. Repeat, five days.", minMs: 3600 },
  { n: 7, speaker: "YOU", line: "Five days? We won't last the night!", minMs: 3600 },
  { n: 8, speaker: "MATE", line: "Captain, wave, starboard side! Hold on...", minMs: 3600 },
  { n: 9, speaker: "YOU", line: "Hey? HEY! Answer me!", minMs: 3600 },
  { n: 10, minMs: 5600 },
  { n: 11, minMs: 8200 },
  { n: 12, minMs: 3200 },
];

// Reading time for a subtitle line.
export function readingMs(beat: Beat): number {
  const len = beat.line ? beat.line.length : 0;
  return Math.max(beat.minMs, beat.line ? 1800 + len * 52 : 0);
}

export function totalMs(): number {
  return BEATS.reduce((a, b) => a + readingMs(b), 0);
}

// Typed-in prefix of a line after elapsedMs at cps characters per second.
export function typedText(line: string, elapsedMs: number, cps = 38): string {
  return line.slice(0, Math.max(0, Math.min(line.length, Math.floor((elapsedMs / 1000) * cps))));
}

// ---------------------------------------------------------------------------
// Web Audio synth

class Synth {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private bed!: GainNode;
  private muffle!: GainNode;
  private noise!: AudioBuffer;
  private live: AudioScheduledSourceNode[] = [];
  private onGesture = (): void => { void this.ctx?.resume(); };

  constructor(muted: boolean) {
    if (muted) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(c.destination);
    this.bed = c.createGain();
    this.bed.gain.value = 0;
    this.bed.connect(this.master);
    this.muffle = c.createGain();
    this.muffle.gain.value = 0;
    this.muffle.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (c.state === "suspended") {
      void c.resume().catch(() => {});
      window.addEventListener("pointerdown", this.onGesture, true);
      window.addEventListener("keydown", this.onGesture, true);
    }
  }

  private src(loop: boolean): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    this.live.push(s);
    return s;
  }

  private osc(type: OscillatorType, f: number): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = f;
    this.live.push(o);
    return o;
  }

  // storm and rain bed, fades in
  startBed(): void {
    const c = this.ctx; if (!c) return;
    const rain = this.src(true);
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    const rg = c.createGain(); rg.gain.value = 0.35;
    rain.connect(hp).connect(rg).connect(this.bed);
    rain.start();
    const wind = this.src(true);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const wg = c.createGain(); wg.gain.value = 0.9;
    const lfo = this.osc("sine", 0.13); const lfoG = c.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG).connect(wg.gain);
    lfo.start();
    wind.connect(lp).connect(wg).connect(this.bed);
    wind.start();
    this.bed.gain.setTargetAtTime(0.55, c.currentTime, 1.2);
  }

  cutBed(tc = 0.02): void {
    const c = this.ctx; if (!c) return;
    this.bed.gain.cancelScheduledValues(c.currentTime);
    this.bed.gain.setTargetAtTime(0, c.currentTime, tc);
  }

  thunder(): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const s = this.src(false);
    const lp = c.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(70, t + 2.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    s.connect(lp).connect(g).connect(this.master);
    s.start(t); s.stop(t + 3.2);
  }

  creak(): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const o = this.osc("sawtooth", 70 + Math.random() * 40);
    o.frequency.linearRampToValueAtTime(o.frequency.value * (1.3 + Math.random() * 0.4), t + 0.9);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 380; bp.Q.value = 9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.25); g.gain.linearRampToValueAtTime(0.0001, t + 1);
    o.connect(bp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.1);
  }

  // radio static under the coast guard line
  static_(sec: number): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const s = this.src(true);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.1);
    for (let k = 0; k < sec * 8; k++) g.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.25, t + 0.1 + k / 8);
    g.gain.linearRampToValueAtTime(0.0001, t + sec);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t); s.stop(t + sec + 0.1);
    const b = this.osc("sine", 1000);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.07, t + 0.03); bg.gain.linearRampToValueAtTime(0.0001, t + 0.25);
    b.connect(bg).connect(this.master);
    b.start(t); b.stop(t + 0.3);
  }

  waveImpact(): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const s = this.src(false);
    const lp = c.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(90, t + 1.6);
    const g = c.createGain();
    g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    s.connect(lp).connect(g).connect(this.master);
    s.start(t); s.stop(t + 1.9);
    const o = this.osc("sine", 60);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const og = c.createGain();
    og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 1.5);
  }

  // low muffled underwater rumble for the blinks
  startMuffle(): void {
    const c = this.ctx; if (!c) return;
    const s = this.src(true);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 130;
    s.connect(lp).connect(this.muffle);
    s.start();
    const o = this.osc("sine", 41);
    o.connect(this.muffle);
    o.start();
    this.muffle.gain.setTargetAtTime(0.5, c.currentTime, 0.5);
  }

  heartbeat(): void {
    const c = this.ctx; if (!c) return;
    for (const [dt, a] of [[0, 1], [0.3, 0.7]] as const) {
      const t = c.currentTime + dt;
      const o = this.osc("sine", 62);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * a, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.25);
    }
  }

  fadeOut(sec: number): void {
    const c = this.ctx; if (!c) return;
    this.master.gain.setTargetAtTime(0, c.currentTime, sec / 3);
  }

  close(): void {
    window.removeEventListener("pointerdown", this.onGesture, true);
    window.removeEventListener("keydown", this.onGesture, true);
    for (const n of this.live) { try { n.stop(); } catch { /* not started or already stopped */ } }
    this.live = [];
    const c = this.ctx; this.ctx = null;
    if (c) void c.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Cutscene

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
};

export function playIntro(opts: IntroOptions): IntroHandle {
  const { root, onDone } = opts;
  const url = {
    helm: find(frameFiles, "intro_01_helm.png"),
    lightning: find(frameFiles, "intro_02_lightning.png"),
    wave: find(frameFiles, "intro_03_wave.png"),
    capsize: find(frameFiles, "intro_04_capsize.png"),
    blink: [1, 2, 3].map((i) => find(frameFiles, `intro_05_blink_${i}.png`)),
    blockout: find(blockoutFiles, "render_blockout.png"),
    face: find(faceFiles, "chud_smiley_four_moods.png"),
  };
  const bg = (u: string | null): string => (u ? `url("${u}")` : "none");

  // DOM
  const layer = el("div", "intro", root);
  const view = el("div", "view", layer);
  const helm = el("div", "pic", view);
  helm.style.backgroundImage = bg(url.helm ?? url.blockout);
  const lightning = el("div", "pic lightning", view);
  if (url.lightning) lightning.style.backgroundImage = bg(url.lightning);
  const wave = el("div", "pic" + (url.wave ? "" : " fb-wave"), view);
  wave.style.backgroundImage = bg(url.wave ?? url.blockout);
  const capsize = el("div", "pic" + (url.capsize ? "" : " fb-capsize"), view);
  capsize.style.backgroundImage = bg(url.capsize ?? url.blockout);
  const blinkPics = [0, 1, 2].map((i) => {
    const real = url.blink[i];
    const p = el("div", "pic" + (real ? "" : " fb-blink"), view);
    p.style.backgroundImage = bg(real ?? url.blockout);
    if (!real) {
      p.style.filter = `blur(${[9, 6, 4][i]}px) brightness(${[0.7, 0.85, 1][i]})`;
      p.style.transform = `rotate(${[-11, -8, -5][i]}deg) scale(1.15)`;
      if (url.face) {
        const f = el("div", "face", p);
        f.style.backgroundImage = bg(url.face);
        f.style.opacity = String([0.22, 0.4, 0.58][i]);
      }
    }
    return p;
  });
  const rain = el("div", "rain", layer);
  const flash = el("div", "flash", layer);
  el("div", "vignette", layer);
  el("div", "grain", layer);
  const lidTop = el("div", "lid top", layer);
  const lidBot = el("div", "lid bot", layer);
  const sub = el("div", "sub", layer);
  const who = el("div", "who", sub);
  const line = el("div", "line", sub);
  const hint = el("div", "hint", layer);
  hint.textContent = "Space: skip";
  const black = el("div", "black", layer);

  const synth = new Synth(!!opts.muted);

  // timers
  const all = new Set<number>();
  let beatTimers: number[] = [];
  const later = (fn: () => void, ms: number, beatScoped = true): number => {
    const id = window.setTimeout(() => { all.delete(id); fn(); }, ms);
    all.add(id);
    if (beatScoped) beatTimers.push(id);
    return id;
  };
  const clearBeat = (): void => { for (const id of beatTimers) { clearTimeout(id); all.delete(id); } beatTimers = []; };
  const anims: Animation[] = [];
  const animate = (e: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions): void => { try { anims.push(e.animate(kf, o)); } catch { /* no WAAPI */ } };

  const show = (...which: HTMLElement[]): void => {
    for (const p of [helm, wave, capsize, ...blinkPics]) p.classList.toggle("on", which.includes(p));
  };
  const lids = (open: boolean): void => { lidTop.classList.toggle("open", open); lidBot.classList.toggle("open", open); };

  // lightning: white flash, optional lightning frame, thunder after a delay
  const strike = (): void => {
    const seq = [0, 1, 0.15, 0.85, 0];
    animate(flash, seq.map((o) => ({ opacity: o * 0.6 })), { duration: 380, easing: "steps(5, end)" });
    if (url.lightning) animate(lightning, seq.map((o) => ({ opacity: o })), { duration: 380, easing: "steps(5, end)" });
    else animate(helm, seq.map((o) => ({ filter: `brightness(${1 + o * 1.6})` })), { duration: 380, easing: "steps(5, end)" });
    later(() => synth.thunder(), 350 + Math.random() * 900, false);
  };

  let stormOn = false;
  const lightningLoop = (): void => {
    if (!stormOn) return;
    later(() => { if (stormOn) { strike(); lightningLoop(); } }, 4500 + Math.random() * 4000, false);
  };
  const creakLoop = (): void => {
    if (!stormOn) return;
    later(() => { if (stormOn) { synth.creak(); creakLoop(); } }, 2500 + Math.random() * 3500, false);
  };

  // state
  let index = -1;
  let finished = false;
  let destroyed = false;
  let typeTimer = 0;

  const typeLine = (b: Beat, dur: number): void => {
    clearInterval(typeTimer);
    if (!b.line) { who.textContent = ""; line.textContent = ""; line.className = "line"; return; }
    who.textContent = b.speaker!;
    who.className = "who " + b.speaker!.replace(" ", "");
    line.className = "line" + (b.speaker === "COAST GUARD" ? " radio" : "");
    const t0 = performance.now();
    const cps = Math.max(30, Math.min(60, b.line.length / (dur * 0.0006)));
    typeTimer = window.setInterval(() => {
      line.textContent = typedText(b.line!, performance.now() - t0, cps);
      if (line.textContent.length >= b.line!.length) clearInterval(typeTimer);
    }, 30);
  };

  const enter = (i: number): void => {
    clearBeat();
    clearInterval(typeTimer);
    index = i;
    if (i >= BEATS.length) { finish(); return; }
    const b = BEATS[i];
    const dur = readingMs(b);
    typeLine(b, dur);
    later(() => enter(i + 1), dur);

    switch (b.n) {
      case 1:
        show(helm);
        lids(true);
        animate(helm, [{ transform: "scale(1) translate(0,0)" }, { transform: "scale(1.09) translate(-8px,-5px)" }], { duration: 46000, fill: "forwards", easing: "linear" });
        synth.startBed();
        stormOn = true;
        creakLoop();
        later(strike, 2600);
        later(() => { stormOn && lightningLoop(); }, 3000);
        break;
      case 2:
        view.classList.add("shake");
        break;
      case 3:
        synth.creak();
        break;
      case 6:
        synth.static_(dur / 1000 * 0.8);
        break;
      case 8:
        later(() => { synth.waveImpact(); synth.cutBed(0.3); }, dur - 700);
        later(strike, 900);
        break;
      case 10: {
        stormOn = false;
        view.classList.remove("shake");
        show(wave);
        synth.cutBed(0.01); // hard cut to silence
        animate(wave, [{ transform: "scale(1)" }, { transform: "scale(1.35) translateY(-3%)" }], { duration: 2700, fill: "forwards", easing: "ease-in" });
        later(strike, 1500);
        later(() => {
          show(capsize);
          synth.waveImpact();
          animate(capsize, [{ transform: "rotate(0deg) scale(1.05)" }, { transform: "rotate(38deg) scale(1.4)" }], { duration: 2400, fill: "forwards", easing: "ease-in" });
          animate(view, [{ transform: "rotate(0deg)" }, { transform: "rotate(14deg)" }], { duration: 2400, fill: "forwards", easing: "ease-in" });
          animate(flash, [{ opacity: 0.7 }, { opacity: 0 }], { duration: 500 });
        }, 2700);
        later(() => { lids(false); }, dur - 500);
        break;
      }
      case 11: {
        show();
        lids(false);
        view.style.animation = "none";
        for (const a of anims) { try { a.cancel(); } catch { /* done */ } }
        anims.length = 0;
        synth.startMuffle();
        const frames = [0, 1, 1, 2];
        const per = (dur - 200) / frames.length;
        frames.forEach((f, k) => {
          const t = k * per + 500;
          later(() => { show(blinkPics[f]); lids(true); synth.heartbeat(); }, t);
          later(() => lids(false), t + per * 0.4);
        });
        break;
      }
      case 12:
        lids(false);
        show();
        animate(black, [{ opacity: 0 }, { opacity: 1 }], { duration: dur - 500, fill: "forwards" });
        synth.fadeOut(dur / 1000);
        break;
    }
    rain.classList.toggle("off", b.n >= 10);
  };

  const advance = (): void => { if (!finished && index < BEATS.length) enter(index + 1); };

  const teardown = (): void => {
    clearBeat();
    for (const id of all) clearTimeout(id);
    all.clear();
    clearInterval(typeTimer);
    clearTimeout(hintTimer);
    stormOn = false;
    for (const a of anims) { try { a.cancel(); } catch { /* done */ } }
    window.removeEventListener("keydown", onKey, true);
    layer.removeEventListener("pointerdown", onClick);
    synth.close();
    layer.remove();
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    teardown();
    onDone();
  };

  const swallowKeyup = (e: KeyboardEvent): void => {
    if (e.code === "Space" || e.code === "Escape") { e.preventDefault(); e.stopPropagation(); }
  };

  const onKey = (e: KeyboardEvent): void => {
    const skipKey = e.code === "Space" || e.code === "Escape";
    if (!skipKey && e.code !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (skipKey) {
      // eat the matching keyup too, so the game never sees the half of the keypress that skipped
      window.addEventListener("keyup", swallowKeyup, true);
      setTimeout(() => window.removeEventListener("keyup", swallowKeyup, true), 600);
      finish();
    } else advance();
  };
  const onClick = (e: Event): void => { e.stopPropagation(); void synth.ctx?.resume(); advance(); };

  window.addEventListener("keydown", onKey, true);
  layer.addEventListener("pointerdown", onClick);
  const hintTimer = window.setTimeout(() => hint.classList.add("on"), 1000);

  enter(0);

  return {
    skip: () => finish(),
    destroy: () => { if (destroyed) return; destroyed = true; if (!finished) { finished = true; teardown(); } },
  };
}
