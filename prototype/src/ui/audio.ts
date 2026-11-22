// Web Audio for the room, player, CHUD, and screen transitions. Entry itself remains silent.
import { RADIO_LINES } from "../chud/lines";
import type { Band, Entry, View } from "../sim/types";
import { CHUD_SPEECH } from "../uiConfig";

const sampleUrls = new Map(Object.entries(import.meta.glob<string>([
  "../../assets/audio/*.ogg", "!../../assets/audio/chud_*.ogg", "!../../assets/audio/log_*.ogg",
], {
  eager: true, import: "default", query: "?url",
})).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -4), url]));

const radioClips = new Map([
  [RADIO_LINES[2], "radio_coastguard"],
  [RADIO_LINES[5], "radio_helicopter"],
]);
const decoyClips = {
  creak: [1, 9, 11, 15],
  knock: [2, 6],
  metal: [3, 4, 7, 8, 10, 13],
  glass: [5, 12, 14],
} as const;

type Playback = {
  level?: number;
  pan?: number;
  rate?: number;
  loop?: boolean;
  dest?: AudioNode;
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private stormGain!: GainNode;
  private stormLevel = 0;
  private noise!: AudioBuffer;
  private loops = new Map<string, () => void>();
  private clipData = new Map<string, ArrayBuffer>();
  private clips = new Map<string, AudioBuffer>();
  private pendingClips = new Map<string, Promise<AudioBuffer | undefined>>();
  private cues = new Set<AudioScheduledSourceNode>();
  private radioFinished: Promise<void> | undefined;
  private titlePlaying = false;
  private generatorPowered = true;
  private lastDecoy = new Map<keyof typeof decoyClips, number>();
  private nextKey = 0;
  private cueGeneration = 0;
  private ambientPlaying = false;
  private suspended = false;
  private jumpData: ArrayBuffer | null = null;
  private jumpBuf: AudioBuffer | null = null;
  private speechGain!: GainNode;
  private speechPan!: StereoPannerNode;
  private speechDuck!: GainNode;
  private speechView: View = "DESK";
  private speechQueue: { text: string; band: Band }[] = [];
  private speechRun: AbortController | null = null;
  private speechSource: AudioBufferSourceNode | null = null;

  // UI pause: freeze every scheduled sound and loop, resume where they were.
  suspend(): void {
    this.suspended = true;
    if (this.ctx) void this.ctx.suspend();
  }

  resume(): void {
    this.suspended = false;
    if (this.ctx) void this.ctx.resume();
  }

  async preload(): Promise<void> {
    const recordings = [...sampleUrls].map(async ([name, url]) => {
      try {
        this.clipData.set(name, await this.fetchClip(url));
      } catch {
        // A missing recording leaves the synthesized fallback available.
      }
    });
    const jumpscare = fetch(`${import.meta.env.BASE_URL}audio/sfx/jumpscare.wav`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((data) => { this.jumpData = data; })
      .catch((err) => console.warn("jumpscare.wav failed to load, using the synth burst", err));
    await Promise.all([...recordings, jumpscare]);
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
    this.speechDuck = ctx.createGain();
    this.speechGain.connect(this.speechPan).connect(this.speechDuck).connect(this.master);
    this.speechGain.gain.value = CHUD_SPEECH[this.speechView].gain;
    this.speechPan.pan.value = CHUD_SPEECH[this.speechView].pan;
    ctx.listener.positionX.value = 0;
    ctx.listener.positionY.value = 0;
    ctx.listener.positionZ.value = 0;
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.stormGain = ctx.createGain();
    this.stormGain.gain.value = this.stormLevel;
    this.stormGain.connect(this.master);
    void this.loadClip("bed_storm").then((buffer) => {
      if (!buffer) this.stormFallback();
      else this.play("bed_storm", { level: 0.34, loop: true, dest: this.stormGain });
    });
    for (const name of this.clipData.keys()) void this.loadClip(name);
    this.syncBeds();
    this.startSpeech();
    if (this.jumpData) {
      void ctx.decodeAudioData(this.jumpData)
        .then((buffer) => { this.jumpBuf = buffer; })
        .catch((err) => console.warn("jumpscare.wav failed to decode, using the synth burst", err));
      this.jumpData = null;
    }
  }

  private async fetchClip(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio response ${response.status}`);
    return response.arrayBuffer();
  }

  private loadClip(name: string, url = sampleUrls.get(name)): Promise<AudioBuffer | undefined> {
    const ctx = this.ctx;
    const cached = this.clips.get(name);
    if (cached || !ctx || !url) return Promise.resolve(cached);
    const pending = this.pendingClips.get(name);
    if (pending) return pending;
    const data = this.clipData.get(name);
    this.clipData.delete(name);
    const request = (data ? Promise.resolve(data) : this.fetchClip(url))
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        this.clips.set(name, buffer);
        return buffer;
      })
      .catch(() => undefined)
      .finally(() => this.pendingClips.delete(name));
    this.pendingClips.set(name, request);
    return request;
  }

  private play(name: string, options: Playback = {}): AudioBufferSourceNode | undefined {
    const ctx = this.ctx;
    const buffer = this.clips.get(name);
    if (!ctx || !buffer) return;
    return this.playBuffer(ctx, buffer, options);
  }

  private playBuffer(ctx: AudioContext, buffer: AudioBuffer, {
    level = 1, pan, rate = 1, loop = false, dest = this.master,
  }: Playback = {}): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const panner = pan === undefined ? undefined : ctx.createStereoPanner();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    gain.gain.value = level;
    source.connect(gain);
    if (panner && pan !== undefined) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner).connect(dest);
    } else {
      gain.connect(dest);
    }
    const disconnect = () => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    if (loop) source.addEventListener("ended", disconnect, { once: true });
    else this.trackCue(source, disconnect);
    source.start();
    return source;
  }

  private setBed(name: string, enabled: boolean, level: number): void {
    if (!enabled) {
      this.stop(name);
      return;
    }
    if (!this.ctx || this.loops.has(name)) return;
    const source = this.play(name, { level, loop: true });
    if (source) this.loops.set(name, () => source.stop());
  }

  private syncBeds(): void {
    if (!this.ctx) return;
    for (const [name, level, enabled] of [
      ["music_title", 0.36, () => this.titlePlaying],
      ["bed_room", 0.23, () => this.ambientPlaying && this.generatorPowered],
    ] as const) {
      this.setBed(name, enabled(), level);
      if (enabled() && !this.clips.has(name)) {
        void this.loadClip(name).then(() => this.setBed(name, enabled(), level));
      }
    }
  }

  private trackCue(source: AudioScheduledSourceNode, disconnect: () => void): void {
    this.cues.add(source);
    source.addEventListener("ended", () => {
      this.cues.delete(source);
      disconnect();
    }, { once: true });
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
    this.trackCue(src, () => { src.disconnect(); f.disconnect(); g.disconnect(); });
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
    this.trackCue(o, () => { o.disconnect(); g.disconnect(); });
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
    this.cueGeneration++;
    this.stop("brace");
    this.stop("generator");
    this.radioFinished = undefined;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.speechDuck.gain.cancelScheduledValues(t);
      this.speechDuck.gain.setTargetAtTime(1, t, 0.02);
    }
    for (const source of this.cues) source.stop();
    this.cues.clear();
  }

  // --- ambience -------------------------------------------------------------

  private stormFallback(): void {
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
      src.connect(f).connect(g).connect(this.stormGain);
      src.start();
      lfo.start();
    };
    mk(500, 0.05, 0.13); // wind and rain
    mk(160, 0.12, 0.07); // waves
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
    if (!this.ctx || this.suspended) return;
    if (!this.play("ui_click", { level: 0.28 })) this.burst(this.master, 0.045, "highpass", 2500, 0.025);
  }

  setAmbientPlaying(on: boolean): void {
    this.ambientPlaying = on;
    this.syncBeds();
  }

  setTitlePlaying(on: boolean): void {
    this.titlePlaying = on;
    this.syncBeds();
  }

  setGeneratorPowered(on: boolean): void {
    this.generatorPowered = on;
    this.syncBeds();
  }

  generator(on: boolean): void {
    this.setGeneratorPowered(on);
    this.stop("generator");
    const source = this.play(on ? "generator_on" : "generator_off", { level: 0.58 });
    if (!source) return;
    const stop = () => {
      this.cues.delete(source);
      source.stop();
    };
    this.loops.set("generator", stop);
    source.addEventListener("ended", () => {
      if (this.loops.get("generator") === stop) this.loops.delete("generator");
    }, { once: true });
  }

  keyboard(): void {
    this.nextKey = this.nextKey % 4 + 1;
    this.play(`type_keys_0${this.nextKey}`, { level: 0.32 });
  }

  nightStart(): void {
    if (!this.ctx || this.play("night_start", { level: 0.45 })) return;
    const generation = this.cueGeneration;
    void this.loadClip("night_start").then(() => {
      if (generation === this.cueGeneration) this.play("night_start", { level: 0.45 });
    });
  }

  dawn(): void {
    this.play("win_6am", { level: 0.58 });
  }

  lossStatic(): void {
    this.play("loss_static", { level: 0.42 });
  }

  // --- Ram is silent (GAME_LOGIC 7.4). Decoys are the house settling, never him. ------

  // A decoy noise, panned in stereo (-1 left .. 1 right). Decided by the engine's decoy stream only.
  decoy(sound: "creak" | "knock" | "metal" | "glass", pan: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const variants = decoyClips[sound].filter((value) => value !== this.lastDecoy.get(sound));
    const index = variants[Math.floor(Math.random() * variants.length)];
    this.lastDecoy.set(sound, index);
    if (this.play(`decoy_${String(index).padStart(2, "0")}`, { pan, level: 0.51 })) return;
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
    if (this.play(on ? "lights_on" : "lights_off", { level: 0.38 })) return;
    this.burst(this.master, 0.025, "highpass", on ? 2600 : 1800, 0.12, 1.5);
    if (on) this.tone(this.master, 120, 0.3, "sawtooth", 0.012); // faint lamp hum
  }

  lightTick(): void {
    if (!this.ctx || this.play("lights_off", { level: 0.5 })) return;
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
  jumpscare(entry: Entry): void {
    if (!this.ctx) return;
    this.stopCues();
    if (this.jumpBuf) this.playBuffer(this.ctx, this.jumpBuf);
    else this.scareFallback();
    this.play(`breach_${entry.toLowerCase()}`, { level: 0.24 });
  }

  // A faint sting under the creepy flash before the scare (not Ram's voice: a sound of the picture).
  flashSting(): void {
    if (!this.ctx) return;
    this.tone(this.master, 1800, 0.35, "sine", 0.05, 0, 1700);
    this.burst(this.master, 0.3, "highpass", 6000, 0.05);
  }

  private scareFallback(): void {
    this.burst(this.master, 1.4, "lowpass", 3000, 0.9, 0.5, 200);
    this.tone(this.master, 60, 1.2, "sawtooth", 0.5, 0, 35);
    this.tone(this.master, 1100, 0.6, "square", 0.15, 0, 700);
  }

  // --- room -------------------------------------------------------------------

  relay(loud: boolean): void {
    if (!this.ctx || this.play("relay_clunk", { level: loud ? 0.69 : 0.44 })) return;
    this.tone(this.master, 55, 0.22, "sine", loud ? 0.9 : 0.4);
    this.burst(this.master, 0.05, "highpass", 2000, loud ? 0.4 : 0.15);
  }

  lockEngage(): void {
    this.play("lock_engage", { level: 0.39 });
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
    if (this.speechQueue.length >= CHUD_SPEECH.MAX_WAITING_LINES) this.speechQueue.shift();
    this.speechQueue.push({ text, band });
    this.startSpeech();
  }

  private startSpeech(): void {
    const ctx = this.ctx;
    if (!ctx || this.speechRun || this.speechQueue.length === 0) return;
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
    const timeout = import.meta.env.DEV ? CHUD_SPEECH.REQUEST_TIMEOUT_MS : CHUD_SPEECH.HOSTED_TIMEOUT_MS;
    while (!run.signal.aborted && this.speechQueue.length > 0) {
      const line = this.speechQueue.shift()!;
      try {
        const voiceIndex = await import("./audioDialogue").catch(() => undefined);
        if (run.signal.aborted) break;
        const clip = voiceIndex?.cannedClip(line.text, line.band);
        let buffer = clip ? await this.loadClip(clip.name, clip.url) : undefined;
        if (!buffer && !run.signal.aborted) {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(line),
            signal: AbortSignal.any([run.signal, AbortSignal.timeout(timeout)]),
          });
          if (!response.ok || response.headers.get("content-type") !== "audio/wav") continue;
          buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        }
        if (!buffer) continue;
        if (this.radioFinished) await this.radioFinished;
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

  radio(text: string): void {
    if (!this.ctx) return;
    const clip = radioClips.get(text);
    const source = clip ? this.play(clip, { level: 0.83 }) : undefined;
    if (!source?.buffer) {
      this.burst(this.master, 1.6, "bandpass", 2000, 0.15, 1.5);
      return;
    }
    const background = this.play("radio_static", { level: 0.09, loop: true });
    if (background) this.trackCue(background, () => undefined);
    const t = this.ctx.currentTime;
    this.speechDuck.gain.cancelScheduledValues(t);
    this.speechDuck.gain.setTargetAtTime(0.23, t, 0.025);
    this.speechDuck.gain.setTargetAtTime(1, t + source.buffer.duration, 0.025);
    const finished = new Promise<void>((resolve) => {
      source.addEventListener("ended", () => {
        if (background && this.cues.delete(background)) background.stop();
        if (this.radioFinished === finished) this.radioFinished = undefined;
        resolve();
      }, { once: true });
    });
    this.radioFinished = finished;
  }

  // A fast head turn (edge controls): an air whoosh and the chair creaking. `long` for the turn round to the balcony.
  turn(long: boolean): void {
    if (!this.ctx) return;
    if (this.play("turn_whoosh", { level: 0.46, rate: long ? 1 : 1.25 })) return;
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
    this.stop("brace");
    const source = this.play("brace_strain", { level: 0.32, loop: true });
    if (source) {
      this.loops.set("brace", () => source.stop());
      return;
    }
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
    const stepsClip = this.play("dash_steps", { level: 0.62, rate: 1.5 / seconds });
    const breath = this.play("dash_breath", { level: 0.34, rate: 1.5 / seconds });
    if (!stepsClip) this.footstepFallback(seconds);
    if (!breath) this.burst(this.master, seconds, "bandpass", 1200, 0.05, 0.5);
  }

  private footstepFallback(seconds: number): void {
    const steps = Math.round(seconds / 0.27);
    for (let i = 0; i < steps; i++) {
      this.tone(this.master, 75, 0.09, "sine", 0.4, 0.15 + i * 0.27);
      this.burst(this.master, 0.06, "lowpass", 600, 0.2, 1, undefined, 0.15 + i * 0.27);
    }
  }
}
