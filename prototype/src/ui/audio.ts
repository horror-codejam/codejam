// Sound with Web Audio. Ram makes no sound at all (GAME_LOGIC 7.4): what you hear is the storm, the ambient bed
// (public/audio/amb/ambient-noise.m4a), decoy noises of the house, the player, CHUD, the lights and the jumpscare
// (public/audio/sfx/jumpscare.wav). Synth stand-ins cover everything that has no recording yet.

import type { Band, View } from "../sim/types";
import { CHUD_SPEECH } from "../uiConfig";

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private stormGain!: GainNode;
  private stormLevel = 1;
  private noise!: AudioBuffer;
  private loops = new Map<string, () => void>();
  private ambient: HTMLAudioElement | null = null;
  private ambientPlaying = false;
  private suspended = false;
  private jumpData: ArrayBuffer | null = null;
  private jumpBuf: AudioBuffer | null = null;
  private speechGain!: GainNode;
  private speechPan!: StereoPannerNode;
  private speechView: View = "DESK";
  private speechQueue: { text: string; band: Band }[] = [];
  private speechRun: AbortController | null = null;
  private speechSource: AudioBufferSourceNode | null = null;
  windowMask = 1; // the storm masks the window more on nights 4 and 5

  // UI pause: freeze every scheduled sound and loop, resume where they were.
  suspend(): void {
    this.suspended = true;
    if (this.ctx) void this.ctx.suspend();
    this.ambient?.pause();
  }

  resume(): void {
    this.suspended = false;
    if (this.ctx) void this.ctx.resume();
    this.setAmbientPlaying(this.ambientPlaying);
  }

  async preload(): Promise<void> {
    const ambientUrl = `${import.meta.env.BASE_URL}audio/amb/ambient-noise.m4a`;
    const ambient = fetch(ambientUrl)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => ambientUrl)
      .then((url) => {
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = 0.45;
        audio.preload = "auto";
        this.ambient = audio;
      });
    const jumpscare = fetch(`${import.meta.env.BASE_URL}audio/sfx/jumpscare.wav`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((data) => { this.jumpData = data; })
      .catch((err) => console.warn("jumpscare.wav failed to load, using the synth burst", err));
    await Promise.all([ambient, jumpscare]);
  }

  unlock(): void {
    if (this.ctx) {
      if (!this.suspended) void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (this.suspended) void ctx.suspend();
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.speechGain = ctx.createGain();
    this.speechPan = ctx.createStereoPanner();
    this.speechGain.connect(this.speechPan).connect(this.master);
    this.speechGain.gain.value = CHUD_SPEECH[this.speechView].gain;
    this.speechPan.pan.value = CHUD_SPEECH[this.speechView].pan;
    ctx.listener.positionX.value = 0;
    ctx.listener.positionY.value = 0;
    ctx.listener.positionZ.value = 0;
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.storm();
    this.setAmbientPlaying(this.ambientPlaying);
    if (this.jumpData) {
      void ctx.decodeAudioData(this.jumpData)
        .then((buffer) => { this.jumpBuf = buffer; })
        .catch((err) => console.warn("jumpscare.wav failed to decode, using the synth burst", err));
      this.jumpData = null;
    }
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
    const id = window.setInterval(() => {
      if (!this.suspended) fn(i++);
    }, everyMs);
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
    this.stormGain = ctx.createGain();
    this.stormGain.gain.value = this.stormLevel;
    this.stormGain.connect(this.master);
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
      src.connect(f).connect(g).connect(this.stormGain);
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

  fadeStorm(level: number, seconds: number): void {
    this.stormLevel = level;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.stormGain.gain.cancelScheduledValues(t);
    this.stormGain.gain.setTargetAtTime(level, t, seconds / 5);
  }

  menuTick(): void {
    if (this.ctx?.state === "running") this.burst(this.master, 0.045, "highpass", 2500, 0.025);
  }

  setAmbientPlaying(on: boolean): void {
    this.ambientPlaying = on;
    if (!this.ambient) return;
    if (on && this.ctx && !this.suspended) void this.ambient.play().catch(() => undefined);
    else this.ambient.pause();
  }

  // --- Ram is silent (GAME_LOGIC 7.4). Decoys are the house settling, never him. ------

  // A decoy noise, panned in stereo (-1 left .. 1 right). Decided by the engine's decoy stream only.
  decoy(sound: "creak" | "knock" | "metal" | "glass", pan: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    g.gain.value = 0.7;
    g.connect(p).connect(this.master);
    const t = ctx.currentTime;
    if (sound === "creak") {
      const dur = 0.5 + Math.random() * 0.5;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(26 + Math.random() * 10, t);
      o.frequency.linearRampToValueAtTime(18 + Math.random() * 6, t + dur);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 800 + Math.random() * 500;
      f.Q.value = 6;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.0001, t);
      eg.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(eg).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    } else if (sound === "knock") {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.tone(g, 90 + Math.random() * 20, 0.14, "sine", 0.3, i * 0.22);
        this.burst(g, 0.07, "lowpass", 500, 0.15, 1, undefined, i * 0.22);
      }
    } else if (sound === "metal") {
      const f0 = 300 + Math.random() * 300;
      this.tone(g, f0, 0.6, "triangle", 0.06);
      this.tone(g, f0 * 1.51, 0.45, "sine", 0.04, 0.01);
      this.burst(g, 0.05, "highpass", 2500, 0.08);
    } else {
      this.burst(g, 0.03, "highpass", 3500, 0.06, 2);
      this.tone(g, 2600 + Math.random() * 600, 0.08, "sine", 0.03);
    }
  }

  // The player's light (Shift): a small switch click. A forced cut (CHUD): a soft electrical tick and fizzle.
  lightClick(on: boolean): void {
    if (!this.ctx) return;
    this.burst(this.master, 0.025, "highpass", on ? 2600 : 1800, 0.12, 1.5);
    if (on) this.tone(this.master, 120, 0.3, "sawtooth", 0.012); // faint lamp hum
  }

  lightTick(): void {
    if (!this.ctx) return;
    this.burst(this.master, 0.02, "highpass", 3800, 0.18, 2);
    this.tone(this.master, 60, 0.18, "square", 0.04, 0.01, 40);
    this.burst(this.master, 0.12, "bandpass", 5000, 0.03, 4, undefined, 0.03);
  }

  paper(): void {
    if (!this.ctx) return;
    this.burst(this.master, 0.25, "bandpass", 3000, 0.08, 0.7, 5000);
    this.burst(this.master, 0.18, "highpass", 4000, 0.05, 1, undefined, 0.12);
  }

  // The jumpscare (GAME_LOGIC 5.4): jumpscare.wav, or the synth burst until it has loaded.
  jumpscare(): void {
    if (!this.ctx) return;
    this.stopCues();
    if (!this.jumpBuf) {
      this.breach();
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.jumpBuf;
    const g = this.ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(this.master);
    src.start();
  }

  // A faint sting under the creepy flash before the scare (not Ram's voice: a sound of the picture).
  flashSting(): void {
    if (!this.ctx) return;
    this.tone(this.master, 1800, 0.35, "sine", 0.05, 0, 1700);
    this.burst(this.master, 0.3, "highpass", 6000, 0.05);
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

  setSpeechView(view: View): void {
    if (this.speechView === view) return;
    this.speechView = view;
    if (!this.ctx) return;
    const { gain, pan } = CHUD_SPEECH[view];
    this.speechGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.06);
    this.speechPan.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.06);
  }

  speak(text: string, band: Band): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.speechQueue.length >= CHUD_SPEECH.MAX_WAITING_LINES) this.speechQueue.shift();
    this.speechQueue.push({ text, band });
    if (this.speechRun) return;
    const run = new AbortController();
    this.speechRun = run;
    void this.playSpeech(ctx, run);
  }

  stopSpeech(): void {
    this.speechQueue.length = 0;
    this.speechRun?.abort();
    this.speechRun = null;
    this.speechSource?.stop();
    this.speechSource = null;
  }

  private async playSpeech(ctx: AudioContext, run: AbortController): Promise<void> {
    while (!run.signal.aborted && this.speechQueue.length > 0) {
      const line = this.speechQueue.shift()!;
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(line),
          signal: AbortSignal.any([run.signal, AbortSignal.timeout(CHUD_SPEECH.REQUEST_TIMEOUT_MS)]),
        });
        if (!response.ok || response.headers.get("content-type") !== "audio/wav") continue;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (run.signal.aborted) break;

        const source = ctx.createBufferSource();
        this.speechSource = source;
        source.buffer = buffer;
        source.connect(this.speechGain);
        const ended = new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
        source.start();
        await ended;
        source.disconnect();
        if (this.speechSource === source) this.speechSource = null;
      } catch {
        // Keep the existing subtitle and chime if Piper or audio decoding fails.
      }
    }
    if (this.speechRun === run) this.speechRun = null;
  }

  radio(): void {
    if (!this.ctx) return;
    this.burst(this.master, 1.6, "bandpass", 2000, 0.15, 1.5);
  }

  // A fast head turn (edge controls): an air whoosh and the chair creaking. `long` for the turn round to the balcony.
  turn(long: boolean): void {
    if (!this.ctx) return;
    const d = long ? 0.4 : 0.25;
    this.burst(this.master, d, "bandpass", 350, 0.1, 0.8, long ? 1600 : 1300);
    // creak: a slow buzz (each saw cycle is one "tick" of the wood) through a narrow band, sagging in pitch
    const ctx = this.ctx;
    const t = ctx.currentTime + (long ? 0.06 : 0.02);
    const dur = long ? 0.42 : 0.26;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(long ? 34 : 42, t);
    o.frequency.linearRampToValueAtTime(long ? 22 : 30, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lg = ctx.createGain();
    lg.gain.value = 8;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1150 + Math.random() * 300;
    f.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  // --- bracing an entry (edge controls) ----------------------------------------

  // A short voiced effort: a sagging buzz through a vowel-ish band, plus breath noise.
  private voice(dest: AudioNode, f0: number, f1: number, dur: number, gain: number, formant: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = formant;
    f.Q.value = 2.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(lp).connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    this.burst(dest, dur * 0.9, "bandpass", formant * 1.6, gain * 0.9, 1.2, undefined, delay);
  }

  // Brace start: a grunt as the shoulder hits the entry, then strained breathing through the teeth until release.
  braceStart(): void {
    if (!this.ctx) return;
    this.voice(this.master, 125, 92, 0.3, 0.07, 620);
    this.burst(this.master, 0.09, "lowpass", 300, 0.25); // body against wood or metal
    this.loop("brace", 1250, (i) => {
      if (i === 0) return;
      // a held breath forced out in a hiss, now and then a small voiced strain
      this.burst(this.master, 0.45, "bandpass", 1100 + Math.random() * 300, 0.035, 1.4, 800);
      if (i % 2 === 0) this.voice(this.master, 105, 98, 0.35, 0.025, 520, 0.05);
    });
  }

  // Brace end: a release breath. `armsGaveOut` (HOLD_MAX): a heavier gasp.
  braceEnd(armsGaveOut: boolean): void {
    if (!this.ctx) return;
    this.stop("brace");
    this.burst(this.master, armsGaveOut ? 0.7 : 0.45, "bandpass", 900, armsGaveOut ? 0.07 : 0.04, 1, 500);
    if (armsGaveOut) this.voice(this.master, 140, 90, 0.35, 0.05, 700);
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
}
