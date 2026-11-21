// Synthesized placeholder sound with Web Audio. Every cue from GAME_LOGIC.md 7.4 exists here as a
// procedural stand-in so the loop is playable by ear. Real recordings replace these one by one.

import type { Entry } from "../sim/types";

type Where = "left" | "right" | "behind" | "center";
const WHERE: Record<Entry, Where> = { WINDOW: "left", HATCH: "right", BALCONY: "behind" };

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private loops = new Map<string, () => void>();
  windowMask = 1; // the storm masks the window more on nights 4 and 5

  // UI pause: freeze every scheduled sound and loop, resume where they were.
  suspend(): void {
    if (this.ctx) void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx) void this.ctx.resume();
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    ctx.listener.positionX.value = 0;
    ctx.listener.positionY.value = 0;
    ctx.listener.positionZ.value = 0;
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.storm();
  }

  private out(where: Where): AudioNode {
    const ctx = this.ctx!;
    if (where === "center") return this.master;
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1;
    const pos = where === "left" ? [-2, 0, -0.3] : where === "right" ? [2, -0.6, -0.3] : [0, 0, 2];
    p.positionX.value = pos[0];
    p.positionY.value = pos[1];
    p.positionZ.value = pos[2];
    if (where === "behind") {
      // HRTF front/back is weak on headphones; a duller tone sells "behind"
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      lp.connect(p);
      p.connect(this.master);
      return lp;
    }
    p.connect(this.master);
    return p;
  }

  private burst(dest: AudioNode, dur: number, type: BiquadFilterType, freq: number, gain: number, q = 1, freqEnd?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.linearRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(dest: AudioNode, freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, freqEnd?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private loop(key: string, everyMs: number, fn: (i: number) => void): void {
    this.stop(key);
    let i = 0;
    fn(i++);
    const id = window.setInterval(() => fn(i++), everyMs);
    this.loops.set(key, () => window.clearInterval(id));
  }

  stop(key: string): void {
    this.loops.get(key)?.();
    this.loops.delete(key);
  }

  stopCues(): void {
    for (const k of [...this.loops.keys()]) if (k !== "storm") this.stop(k);
  }

  // --- ambience -------------------------------------------------------------

  private storm(): void {
    const ctx = this.ctx!;
    const mk = (freq: number, gain: number, lfoHz: number): void => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoHz;
      const lg = ctx.createGain();
      lg.gain.value = gain * 0.6;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.master);
      src.start();
      lfo.start();
    };
    mk(500, 0.05, 0.13); // wind and rain
    mk(160, 0.12, 0.07); // waves
    this.loops.set("storm", () => undefined);
  }

  thunder(): void {
    if (!this.ctx) return;
    this.burst(this.master, 2.5, "lowpass", 140, 0.35, 0.7, 60, 0.4 + Math.random() * 0.6);
  }

  // --- Ram (GAME_LOGIC 7.4) ---------------------------------------------------

  approachStart(): void {
    if (!this.ctx) return;
    // splashing and climbing on wet rock, same for every target, not directional
    this.loop("approach", 420, (i) => {
      this.burst(this.master, 0.18, "bandpass", 900 + Math.random() * 700, 0.12, 0.8);
      if (i % 3 === 0) this.tone(this.master, 70, 0.15, "sine", 0.15);
    });
  }

  approachStop(): void {
    this.stop("approach");
  }

  entryStart(entry: Entry): void {
    if (!this.ctx) return;
    this.stop("approach");
    const dest = this.out(WHERE[entry]);
    if (entry === "HATCH") {
      // metal rungs clatter below right, then the lid knocks. Loud
      this.loop("entry", 520, (i) => {
        if (i < 3) {
          this.tone(dest, 410, 0.25, "square", 0.08);
          this.tone(dest, 633, 0.2, "triangle", 0.1, 0.01);
          this.burst(dest, 0.08, "highpass", 3000, 0.1);
        } else {
          this.tone(dest, 95, 0.18, "sine", 0.6);
          this.burst(dest, 0.12, "lowpass", 400, 0.5);
          this.tone(dest, 90, 0.16, "sine", 0.5, 0.18);
        }
      });
    } else if (entry === "WINDOW") {
      // soft tapping on glass, left. Quiet
      const g = 0.09 * this.windowMask;
      this.loop("entry", 650, () => {
        this.burst(dest, 0.03, "highpass", 3500, g, 2);
        this.tone(dest, 2400, 0.05, "sine", g * 0.6);
        this.burst(dest, 0.03, "highpass", 3200, g * 0.8, 2, undefined, 0.14);
      });
    } else {
      // scraping on the rail, behind. Medium
      this.loop("entry", 900, () => {
        this.burst(dest, 0.55, "bandpass", 500, 0.35, 6, 1500);
      });
    }
  }

  retreat(entry: Entry): void {
    if (!this.ctx) return;
    this.stop("entry");
    const dest = this.out(WHERE[entry]);
    // a shout through the entry, then footsteps fade
    this.tone(dest, 140, 0.7, "sawtooth", 0.12, 0, 90);
    this.burst(dest, 0.7, "bandpass", 700, 0.2, 3, 400);
    for (let i = 0; i < 5; i++) this.tone(dest, 80, 0.1, "sine", 0.3 * (1 - i / 5), 0.9 + i * 0.35);
  }

  breach(): void {
    if (!this.ctx) return;
    this.stopCues();
    this.burst(this.master, 1.4, "lowpass", 3000, 0.9, 0.5, 200);
    this.tone(this.master, 60, 1.2, "sawtooth", 0.5, 0, 35);
    this.tone(this.master, 1100, 0.6, "square", 0.15, 0, 700);
  }

  // --- room -------------------------------------------------------------------

  relay(loud: boolean): void {
    if (!this.ctx) return;
    this.tone(this.master, 55, 0.22, "sine", loud ? 0.9 : 0.4);
    this.burst(this.master, 0.05, "highpass", 2000, loud ? 0.4 : 0.15);
  }

  chime(): void {
    if (!this.ctx) return;
    this.tone(this.master, 880, 0.12, "sine", 0.05);
    this.tone(this.master, 1320, 0.16, "sine", 0.04, 0.07);
  }

  radio(): void {
    if (!this.ctx) return;
    this.burst(this.master, 1.6, "bandpass", 2000, 0.15, 1.5);
  }

  footsteps(seconds: number): void {
    if (!this.ctx) return;
    const steps = Math.round(seconds / 0.27);
    for (let i = 0; i < steps; i++) {
      this.tone(this.master, 75, 0.09, "sine", 0.4, 0.15 + i * 0.27);
      this.burst(this.master, 0.06, "lowpass", 600, 0.2, 1, undefined, 0.15 + i * 0.27);
    }
    this.burst(this.master, seconds, "bandpass", 1200, 0.05, 0.5); // breathing
  }

  morning(): void {
    if (!this.ctx) return;
    this.stopCues();
    [523, 659, 784].forEach((f, i) => this.tone(this.master, f, 0.6, "sine", 0.06, i * 0.15));
  }
}
