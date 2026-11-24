// The PixiJS side (2.5D): rotating-beam plate rendering, hold views, the dash and screen effects.
// Reads engine state every frame. Never changes game state.
//
// Pipeline each frame:
//   beamRenderer (1600 x 800 linear-light beam + bounce + haze + AgX grade) -> beamRT
//   world (off-stage) > cam (plate px, scaled by K, panned by the mouse) -> RenderTexture
//   stage > warp mesh (curved for entry/hold views, planar for desk)
//         > foreground rain > darkened dash/turn clips > scare flash > jumpscare frames > fade > grain > vignette
// The DOM terminal uses the desk's camera transform and the calibrated monitor corners.

import { Application, BlurFilter, ColorMatrixFilter, Container, Graphics, Mesh, PlaneGeometry, RenderTexture, Sprite, Texture, TilingSprite } from "pixi.js";
import type { ColorMatrix } from "pixi.js";
import { CONFIG } from "../config";
import type { BeamParams } from "../sim/beam";
import { BRACE, CONTROLS, JUMPSCARE, SCARE } from "../uiConfig";
import type { GameEngine } from "../sim/engine";
import type { Entry, View } from "../sim/types";
import { ENTRIES } from "../sim/types";
import {
  artFrames,
  artVideoUrl,
  getBeamGrade,
  getBeamSlot,
  hasArt,
  hasBeamArt,
  isFinal,
  preloadHoldBeam,
  slot,
  stageSlot,
} from "./art";
import { BeamRenderer } from "./beamRenderer";
import { DESK_GLAZING, H, K, PAN_X, PAN_Y, PLATE_H, PLATE_W, W, ZOOM } from "./layout";
import { MONITOR_CORNERS, monitorTransform } from "./monitor";
import * as P from "./placeholders";
import { VideoPlate } from "./videoPlate";
import { beamEntryState, beamSlot, holdBeamSlot, JUMPSCARE_FPS, jumpscareDuration, jumpscareJob, sequenceFrame } from "./plates";

interface EntryLayers {
  root: Container;
  k: string;
  dark: Container;
  litOverlay: Container | null;
  tell: Container;
  approach: Container;
  inside: Container;
  render: boolean;
}

interface HoldLayers {
  root: Container;
  k: string;
  base: Container;
  tell: Container;
  arms: Container;
  strain: Sprite | null;
  render: boolean;
}

type Rgb = [number, number, number];

// Fallback night grade for gray blockout renders when final_beam is unavailable.
const GRADE_DARK: Rgb = [0.16, 0.2, 0.28];
const GRADE_LIT: Rgb = [0.66, 0.57, 0.46];
const GRADE_DESK_DARK: Rgb = [0.18, 0.22, 0.3];
const GRADE_NONE: Rgb = [1, 1, 1];

const WARP_S = 0.08; // perspective warp strength
const SWEEP_PERIOD = 7; // seconds for the exterior beacon to cross the glazing
const SWEEP_W = 300; // plate px
const DESK_ZOOM = 1.03 / ZOOM; // leave room for the monitor bezel through the full desk pan

// The green panel in the blockout desk render, blacked out so the DOM terminal blends in.
const SCREEN_FRAME = { x: 152, y: 259, w: 659, h: 201 };

// The two glazing panes either side of the monitor: lightning and the beacon glow light only these.
const FINAL_DESK_PANES = [
  { x: 0, y: 0, w: 167, h: 197 },
  { x: 793, y: 0, w: 167, h: 197 },
];

export class Scene {
  private app: Application;
  private world = new Container();
  private cam = new Container();
  private light = new Container(); // same transform as cam, not graded: exterior beacon sweep and lightning
  private grade = new ColorMatrixFilter();
  private gradeNow: Rgb = [...GRADE_DESK_DARK];
  private clipDarkFilter = new ColorMatrixFilter();
  private beam: BeamRenderer | null = null;
  private beamPlate: Sprite | null = null;
  private rt: RenderTexture;
  private rtPrev: RenderTexture;
  private views = new Container();
  private warpCurved: Mesh;
  private warpFlat: Sprite;
  private warpPrevCurved: Mesh;
  private warpPrevFlat: Sprite;
  private warpIsFlat = false;
  private warpPrevIsFlat = false;
  private warpX = 0;
  private turnBlur = new BlurFilter({ strengthX: 0, strengthY: 0, quality: 2 });
  private turnSlide = false;
  private turnDir = 1;
  private turnDur = CONTROLS.TURN_TIME;
  private lastDashing = false;
  private braceK = 0;
  private armsK = 0;
  private fxT = 0;
  private wasBracing = false;
  private lungeAt = -10;
  private relaxAt = -10;
  private repel: { entry: Entry; at: number } | null = null;
  private desk = new Container();
  private deskStill: Container;
  private deskRender: boolean;
  private deskFinal: boolean;
  private deskMedia = new Container(); // above the desk plate and below the calibrated monitor glass mask
  private transitions = new Container();
  private dashFloor: Container | null = null;
  private clips = new Map<string, VideoPlate>();
  private activeTransition?: VideoPlate;
  private clipsPrepared = false;
  private turnJob = "";
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private sweep = new Container();
  private sweepBand: Sprite;
  private paneGlow: Sprite[] = [];
  private lightning = new Container();
  private rain: TilingSprite;
  private entries = new Map<Entry, EntryLayers>();
  private holds = new Map<Entry, HoldLayers>();
  private jumps: Container[] = [];
  private jumpSeq = new Container();
  private jumpSeqSprite = new Sprite(Texture.EMPTY);
  private jumpSeqFrames: Texture[] = [];
  private jumpStartedAt = 0;
  private jumpDuration = JUMPSCARE.DURATION;
  private jumpActive = false;
  private jumpImpactFlashed = false;
  private scareEntry: Entry | null = null;
  private snapUntil = 0;
  private flashLayer = new Graphics();
  private impactFlash = new Graphics();
  private fade = new Graphics();
  private grain: Sprite;
  private lastView: View | null = null;
  private turnStartedAt = -10;
  private nextLightningAt = 8;
  private lightningUntil = 0;
  private lastT = 0;
  private mouse = { x: 0, y: 0 };
  private overDeskControl = false;
  private pan = { x: 0, y: 0 };

  private flashStartedAt = Infinity;
  lightFlickerUntil = 0; // real seconds: the stage flickers as CHUD cuts the ceiling lamp
  onThunder: (() => void) | null = null;
  paused = false;
  transitionVisible = false;
  fadeAlpha = 0;

  constructor(app: Application) {
    this.app = app;
    this.world.addChild(this.cam, this.light);
    this.cam.pivot.set(PLATE_W / 2, PLATE_H / 2);
    this.light.pivot.set(PLATE_W / 2, PLATE_H / 2);
    this.cam.scale.set(K);
    this.cam.filters = [this.grade];

    const beamGrade = getBeamGrade();
    if (beamGrade && hasBeamArt()) {
      this.beam = new BeamRenderer(beamGrade);
      this.beamPlate = new Sprite(this.beam.texture);
      this.beamPlate.width = PLATE_W;
      this.beamPlate.height = PLATE_H;
      this.beamPlate.visible = false;
      this.cam.addChild(this.beamPlate);
    }

    // desk: fallback render (hidden when beamPlate renders desk), media layer, calibrated monitor glass
    this.deskRender = hasArt("view_desk") || hasBeamArt();
    this.deskFinal = isFinal("view_desk") || hasBeamArt();
    this.deskStill = slot("view_desk", P.deskView, "stage");
    this.deskMedia.filters = [this.clipDarkFilter];
    this.desk.addChild(this.deskStill, this.deskMedia);
    if (this.deskFinal) {
      const glass = MONITOR_CORNERS.flat();
      this.desk.addChild(new Graphics().poly(glass).fill(0x07130d));
    } else if (this.deskRender) {
      const f = SCREEN_FRAME;
      this.desk.addChild(new Graphics().rect(f.x, f.y, f.w, f.h).fill(0x020604));
    }
    const gl = DESK_GLAZING;
    this.sweepBand = new Sprite(makeBandTexture());
    this.sweepBand.width = SWEEP_W;
    this.sweepBand.height = gl.h;
    this.sweepBand.y = gl.y;
    this.sweepBand.blendMode = "add";
    if (this.deskFinal) {
      const glow = makePaneGlow();
      for (const p of FINAL_DESK_PANES) {
        const beacon = new Sprite(glow);
        const lightning = new Sprite(glow);
        for (const sprite of [beacon, lightning]) {
          sprite.position.set(p.x, p.y);
          sprite.setSize(p.w, p.h);
          sprite.blendMode = "add";
        }
        beacon.tint = 0xffc878;
        lightning.tint = 0xcfe0ff;
        this.paneGlow.push(beacon);
        this.sweep.addChild(beacon);
        this.lightning.addChild(lightning);
      }
    } else {
      this.sweep.addChild(this.sweepBand);
      this.lightning.addChild(new Graphics().rect(gl.x, gl.y, gl.w, gl.h).fill(0xcfe0ff));
    }
    this.lightning.alpha = 0;
    this.light.addChild(this.sweep, this.lightning);
    this.cam.addChild(this.desk);

    // Fallback entry and hold containers (used only if final_beam assets are unavailable or loading).
    for (const e of ENTRIES) {
      const k = e.toLowerCase();
      const render = hasArt(`view_${k}`);
      const dark = slot(`view_${k}`, P.entryView(e, false), "stage");
      let litOverlay: Container | null = null;
      if (render) {
        litOverlay = slot(`lit_${k}`, P.onRenderLit(e), "plate");
        litOverlay.blendMode = "add";
      }
      const approach = render ? slot(`approach_${k}`, P.onRenderApproach(e), "plate") : slot(`approach_${k}`, P.approach(e), "stage");
      const tell = render ? slot(`tell_${k}`, P.onRenderTell(e), "plate") : slot(`tell_${k}`, P.tell(e), "stage");
      const inside = slot(`ram_inside_${k}`, P.ramInside(e), "plate");
      inside.visible = false;
      const root = new Container();
      root.addChild(dark);
      if (litOverlay) root.addChild(litOverlay);
      root.addChild(approach, tell, inside);
      root.visible = false;
      this.cam.addChild(root);
      this.entries.set(e, { root, k, dark, litOverlay, tell, approach, inside, render });

      const holdRender = hasArt(`hold_${k}`);
      const hold = new Container();
      const holdTell = holdRender ? slot(`hold_tell_${k}`, P.onRenderHoldTell(e), "plate") : slot(`hold_tell_${k}`, P.holdTell(e), "stage");
      const arms = new Container();
      let strain: Sprite | null = null;
      if (hasArt(`brace_arms_${k}`)) {
        arms.addChild(slot(`brace_arms_${k}`, () => undefined, "plate"));
      } else {
        const painted = P.braceArms(e);
        const base = new Sprite(Texture.from(painted.base));
        strain = new Sprite(Texture.from(painted.strain));
        for (const sp of [base, strain]) {
          sp.scale.set(PLATE_W / painted.base.width);
          if (!holdRender) sp.tint = 0x6a6a72;
        }
        arms.addChild(base, strain);
      }
      arms.visible = false;
      const base = slot(`hold_${k}`, P.holdView(e), "stage");
      hold.addChild(base, holdTell, arms);
      hold.visible = false;
      this.cam.addChild(hold);
      this.holds.set(e, { root: hold, k, base, tell: holdTell, arms, strain, render: holdRender });
    }

    // world -> RenderTexture -> warped mesh on the stage
    this.rt = RenderTexture.create({ width: W, height: H, resolution: app.renderer.resolution });
    this.rtPrev = RenderTexture.create({ width: W, height: H, resolution: app.renderer.resolution });
    const geo = new PlaneGeometry({ width: W, height: H, verticesX: 33, verticesY: 9 });
    const pos = geo.positions;
    for (let i = 0; i < pos.length; i += 2) {
      const nx = (pos[i] - W / 2) / (W / 2);
      pos[i + 1] = H / 2 + (pos[i + 1] - H / 2) * (1 + WARP_S * nx * nx);
    }
    geo.positions = pos;
    this.warpCurved = new Mesh({ geometry: geo, texture: this.rt });
    this.warpFlat = new Sprite(this.rt);
    this.warpFlat.visible = false;
    this.warpPrevCurved = new Mesh({ geometry: geo, texture: this.rtPrev });
    this.warpPrevCurved.visible = false;
    this.warpPrevFlat = new Sprite(this.rtPrev);
    this.warpPrevFlat.visible = false;
    this.views.addChild(this.warpPrevCurved, this.warpPrevFlat, this.warpCurved, this.warpFlat);
    app.stage.addChild(this.views);

    this.rain = new TilingSprite({ texture: makeRainTexture(), width: W + 2 * PAN_X * 1.6, height: H });
    this.rain.alpha = 0.14;
    this.rain.blendMode = "add";
    this.transitions.filters = [this.clipDarkFilter];
    app.stage.addChild(this.rain, this.transitions);
    if (isFinal("dash_floor")) {
      this.dashFloor = stageSlot("dash_floor", () => {});
      this.dashFloor.pivot.set(W / 2, H / 2);
      this.dashFloor.visible = false;
      this.dashFloor.filters = [this.clipDarkFilter];
      app.stage.addChild(this.dashFloor);
    }

    this.flashLayer.rect(0, 0, W, H).fill(0xffffff);
    this.flashLayer.alpha = 0;
    app.stage.addChild(this.flashLayer);
    for (let n = 1; n <= 4; n++) {
      const j = stageSlot(`ram_jumpscare_${n}`, P.ramJumpscare(n));
      j.pivot.set(W / 2, H / 2);
      j.visible = false;
      app.stage.addChild(j);
      this.jumps.push(j);
    }
    this.jumpSeq.addChild(this.jumpSeqSprite);
    this.jumpSeq.pivot.set(W / 2, H / 2);
    this.jumpSeq.visible = false;
    app.stage.addChild(this.jumpSeq);

    this.impactFlash.rect(0, 0, W, H).fill(0xffffff);
    this.impactFlash.alpha = 0;
    app.stage.addChild(this.impactFlash);

    this.fade.rect(0, 0, W, H).fill(0x000000);
    this.fade.alpha = 0;
    app.stage.addChild(this.fade);

    this.grain = new Sprite(makeGrain());
    this.grain.alpha = 0.07;
    this.grain.blendMode = "add";
    app.stage.addChild(this.grain);
    app.stage.addChild(makeVignette());

    window.addEventListener("mousemove", (ev) => {
      const r = app.canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      this.overDeskControl = ev.target instanceof Element && !!ev.target.closest("#terminal button, #terminal input, #artifacts button");
      this.mouse.x = clamp(((ev.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.mouse.y = clamp(((ev.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    });
  }

  get beamParams(): BeamParams | null {
    return this.beam?.params ?? null;
  }

  ensureHoldBeam(entry: Entry): Promise<void> {
    return preloadHoldBeam(entry);
  }

  deskScreenTransform(): string {
    const plate = this.plateRect({ x: 0, y: 0, w: PLATE_W, h: PLATE_H });
    const projection = this.deskFinal ? monitorTransform.final : monitorTransform.fallback;
    return `translate(${plate.x}px, ${plate.y}px) scale(${this.cam.scale.x}) ${projection}`;
  }

  pauseMedia(): void {
    for (const clip of this.clips.values()) clip.pause();
  }

  private prepareClips(): void {
    if (this.clipsPrepared || this.reducedMotion.matches) return;
    this.clipsPrepared = true;
    const add = (job: string, desk = false): void => {
      const url = artVideoUrl(job);
      if (url) this.clips.set(job, new VideoPlate(
        job, url, desk ? this.deskMedia : this.transitions, desk ? PLATE_W : W, desk ? PLATE_H : H, desk,
      ));
    };
    if (this.deskFinal) {
      add("ambient_desk", true);
      add("desk_typing_off", true);
    }
    for (const entry of ENTRIES) {
      const key = entry.toLowerCase();
      add(`dash_${key}_go`);
      add(`dash_${key}_back`);
      add(`turn_desk_${key}`);
      add(`turn_${key}_desk`);
    }
  }

  private showTransition(job: string, progress: number, duration: number): boolean {
    const clip = this.reducedMotion.matches ? undefined : this.clips.get(job);
    if (clip !== this.activeTransition) this.activeTransition?.pause(true);
    this.activeTransition = clip;
    this.transitionVisible = clip?.play(progress, duration) ?? false;
    return this.transitionVisible;
  }

  private syncDeskVideos(ambient: boolean, typing: boolean): boolean {
    const play = (job: string, wanted: boolean): boolean => {
      const clip = this.clips.get(job);
      if (wanted && !this.reducedMotion.matches) return clip?.play() ?? false;
      clip?.pause();
      return false;
    };
    const ambientVisible = play("ambient_desk", ambient);
    const typingVisible = play("desk_typing_off", typing);
    const hands = this.deskMedia.children.at(-1);
    if (typingVisible && hands?.label !== "desk_typing_off") {
      const typingPlate = this.deskMedia.getChildByLabel("desk_typing_off");
      if (typingPlate) this.deskMedia.setChildIndex(typingPlate, this.deskMedia.children.length - 1);
    }
    return ambientVisible || typingVisible;
  }

  // Any plate-px rect of the current view in stage px at the current pan and zoom (DOM hotspots on the desk).
  plateRect(r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
    const k = this.cam.scale.x;
    return {
      x: this.warpX + this.cam.x + (r.x - PLATE_W / 2) * k,
      y: this.cam.y + (r.y - PLATE_H / 2) * k,
      w: r.w * k,
      h: r.h * k,
    };
  }

  prepareScare(entry: Entry, flash: boolean, t: number): number {
    const snap = this.lastView !== entry || this.lastDashing ? SCARE.SNAP_TIME : 0;
    this.scareEntry = flash || snap ? entry : null;
    this.snapUntil = t + snap;
    this.flashStartedAt = flash ? this.snapUntil : Infinity;
    this.turnStartedAt = -10;
    return snap;
  }

  playScare(entry: Entry, t: number): number {
    this.jumpSeqFrames = artFrames(jumpscareJob(entry));
    this.jumpStartedAt = t;
    this.jumpActive = true;
    this.jumpImpactFlashed = false;
    const count = this.jumpSeqFrames.length;
    this.jumpDuration = count ? jumpscareDuration(count, JUMPSCARE_FPS) : JUMPSCARE.DURATION;
    return this.jumpDuration;
  }

  clearScare(): void {
    this.scareEntry = null;
    this.snapUntil = 0;
    this.flashStartedAt = Infinity;
    this.jumpActive = false;
    this.jumpImpactFlashed = false;
    this.jumpSeq.visible = false;
    this.jumpSeq.rotation = 0;
    this.impactFlash.alpha = 0;
    for (const j of this.jumps) {
      j.visible = false;
      j.rotation = 0;
    }
  }

  repelImpact(entry: Entry): void {
    this.repel = { entry, at: this.fxT };
  }

  private updateClipDarkness(lampOn: boolean): void {
    const darkGain = this.beam?.params.darkGain ?? CONFIG.BEAM_DARK_GAIN;
    // Linear darkGain=0.6 maps to ~0.73 sRGB after AgX grading; scale clips smoothly with darkGain and lamp state.
    const k = clamp(Math.pow(Math.max(0.02, darkGain), 1 / 2.2) * 0.92 * (lampOn ? 1 : 0.55), 0.1, 1);
    this.clipDarkFilter.matrix = [
      k, 0, 0, 0, 0,
      0, k, 0, 0, 0,
      0, 0, k, 0, 0,
      0, 0, 0, 1, 0,
    ] as ColorMatrix;
  }

  update(engine: GameEngine, t: number, typing: boolean): void {
    const s = engine.state;
    if (s.phase === "PLAYING") this.prepareClips();
    const pos = s.player.position;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const fdt = this.paused ? 0 : dt;
    this.fxT += fdt;
    const ft = this.fxT;

    const dashing = s.phase === "PLAYING" && (pos.kind === "TRAVELING" || pos.kind === "RETURNING");
    const dashProgress = dashing ? clamp(1 - (pos.until - engine.now) / CONFIG.TRAVEL_TIME, 0, 1) : 0;
    const holding = this.scareEntry ? null
      : pos.kind === "HOLDING" || pos.kind === "STANDING" || (pos.kind === "TRAVELING" && dashProgress >= 0.5) ? pos.entry
      : pos.kind === "RETURNING" && dashProgress < 0.5 ? pos.from : null;
    const bracing = pos.kind === "HOLDING";
    const view: View = this.scareEntry ?? (pos.kind === "RETURNING" && dashProgress >= 0.5 ? "DESK" : s.player.view);
    if (view !== this.lastView) {
      if (this.lastView !== null) {
        this.turnStartedAt = this.scareEntry || dashing || this.lastDashing ? -10 : t;
        this.turnSlide = s.phase === "PLAYING" && !this.lastDashing && !dashing;
        this.turnDir = turnDirection(this.lastView, view);
        this.turnJob = `turn_${this.lastView.toLowerCase()}_${view.toLowerCase()}`;
        this.turnDur = this.lastView === "BALCONY" || view === "BALCONY" ? CONTROLS.TURN_TIME_BALCONY : CONTROLS.TURN_TIME;
        if (this.turnSlide) {
          [this.rt, this.rtPrev] = [this.rtPrev, this.rt];
          this.warpCurved.texture = this.rt;
          this.warpFlat.texture = this.rt;
          this.warpPrevCurved.texture = this.rtPrev;
          this.warpPrevFlat.texture = this.rtPrev;
          this.warpPrevIsFlat = this.warpIsFlat;
        }
      }
      this.warpIsFlat = view === "DESK";
      this.lastView = view;
    }
    this.lastDashing = dashing;
    const turnK = (t - this.turnStartedAt) / (this.turnSlide ? this.turnDur : CONTROLS.TURN_TIME);
    const turning = !dashing && this.turnSlide && turnK < 1;
    const dashJob = pos.kind === "TRAVELING" ? `dash_${pos.entry.toLowerCase()}_go`
      : pos.kind === "RETURNING" ? `dash_${pos.from.toLowerCase()}_back` : "";
    const transition = this.showTransition(
      dashing ? dashJob : turning ? this.turnJob : "",
      dashing ? dashProgress : turnK,
      dashing ? CONFIG.TRAVEL_TIME : this.turnDur,
    );

    // Lazy-load hold beam textures as soon as the player faces or dashes to an entry.
    if (view !== "DESK") void preloadHoldBeam(view);
    if (holding) void preloadHoldBeam(holding);

    const lampOn = engine.isLampOn();
    this.updateClipDarkness(lampOn);

    const onDesk = !holding && view === "DESK";
    const ramAtHolding = holding !== null && s.ram.state === "AT_ENTRY" && s.ram.target === holding;
    const beamSlotName = holding
      ? holdBeamSlot(holding, bracing, ramAtHolding)
      : view === "DESK"
        ? "desk"
        : beamSlot(view, beamEntryState(view, s.ram, this.scareEntry));
    const beamTex = this.beam ? (getBeamSlot(beamSlotName) ?? (holding ? getBeamSlot(beamSlot(holding, ramAtHolding ? "tell" : "empty")) : null)) : null;
    const beamActive = this.beam !== null && this.beamPlate !== null && beamTex !== null;

    if (beamActive && this.beam && this.beamPlate && beamTex) {
      const azimuth = engine.beamAngle(engine.visualTime);
      const darkScale = lampOn ? 1 : onDesk ? 0.55 : 0.35;
      this.beam.render(this.app.renderer, beamTex, azimuth, lampOn, darkScale);
      this.beamPlate.visible = true;
      const hatchShudder = !holding && view === "HATCH" && engine.ramVisual("HATCH") === "tell_clear";
      this.beamPlate.y = hatchShudder ? Math.sin(t * 60) * 1.5 : 0;
    } else if (this.beamPlate) {
      this.beamPlate.visible = false;
      this.beamPlate.y = 0;
    }

    let grade: Rgb = GRADE_NONE;
    this.desk.visible = onDesk;
    this.deskStill.visible = onDesk && !beamActive;
    if (onDesk && !beamActive && this.deskRender && !this.deskFinal) grade = GRADE_DESK_DARK;

    for (const [e, L] of this.entries) {
      const on = !beamActive && !holding && view === e;
      L.root.visible = on;
      if (!on) continue;
      const vis = this.scareEntry === e ? "inside" : engine.ramVisual(e);
      const lit = this.scareEntry === e || engine.beamIntensity(e) >= CONFIG.BEAM_REVEAL_THRESHOLD;
      const tellUp = lit && vis === "tell_clear";
      L.dark.visible = true;
      if (L.litOverlay) L.litOverlay.visible = lit;
      if (L.render && !isFinal(`view_${L.k}`)) grade = lit ? GRADE_LIT : GRADE_DARK;
      L.inside.visible = lit && vis === "inside";
      L.tell.visible = tellUp;
      L.approach.visible = lit && vis === "approach_silhouette";
      L.root.y = e === "HATCH" && tellUp ? Math.sin(t * 60) * 1.5 : 0;
    }

    if (bracing !== this.wasBracing) {
      if (bracing) this.lungeAt = ft;
      else if (holding) this.relaxAt = ft;
      this.wasBracing = bracing;
    }
    const fatigue = pos.kind === "HOLDING" ? clamp((engine.now - pos.since) / CONFIG.HOLD_MAX, 0, 1) : 0;
    this.armsK += ((bracing ? 1 : 0) - this.armsK) * (1 - Math.exp(-fdt * BRACE.ARMS_EASE));
    const pushing = bracing && ramAtHolding;
    for (const [e, L] of this.holds) {
      const on = !beamActive && holding === e;
      L.root.visible = on;
      if (!on) continue;
      const lit = engine.beamIntensity(e) >= CONFIG.BEAM_REVEAL_THRESHOLD;
      const tellUp = ramAtHolding && lit;
      L.base.visible = true;
      if (L.render && !isFinal(`hold_${L.k}`)) grade = lit ? GRADE_LIT : GRADE_DARK;
      L.tell.visible = tellUp;
      L.tell.alpha = 1;
    }

    // One silent shove per PUSH_PERIOD, followed by a stronger shove on repel.
    let push = 0;
    let pushSide = 1;
    if (pushing) {
      const n = Math.floor(ft / BRACE.PUSH_PERIOD);
      const ph = (ft / BRACE.PUSH_PERIOD) % 1;
      push = ph < 0.1 ? ph / 0.1 : Math.exp(-(ph - 0.1) * 6);
      pushSide = n % 2 === 0 ? 1 : -1;
    }
    if (this.repel && holding === this.repel.entry && !dashing && !this.reducedMotion.matches) {
      const remaining = Math.max(0, 1 - (ft - this.repel.at) / BRACE.REPEL_SETTLE);
      push = Math.max(push, BRACE.REPEL_PUSH * remaining ** 2);
    }
    const tr = (ph: number): number =>
      (Math.sin(ft * BRACE.TREMOR_HZ * 6.283 + ph) + 0.6 * Math.sin(ft * BRACE.TREMOR_HZ * 1.73 * 6.283 + ph * 2.1) + 0.35 * Math.sin(ft * BRACE.TREMOR_HZ * 2.91 * 6.283 + ph * 3.7)) / 1.95;
    const strainK = this.braceK * (1 + BRACE.FATIGUE_GAIN * fatigue);
    const tremorPx = BRACE.TREMOR_PX * strainK + BRACE.PUSH_TREMOR * push * this.braceK;
    const shakeX = BRACE.SWAY_PX * strainK * Math.sin(ft * BRACE.SWAY_HZ * 6.283) + tremorPx * tr(0);
    const shakeY = BRACE.SWAY_PX * 0.7 * strainK * Math.sin(ft * BRACE.SWAY_HZ * 0.77 * 6.283 + 1) + tremorPx * tr(1.3) - BRACE.PUSH_PX * push;
    if (holding && !beamActive) {
      const L = this.holds.get(holding)!;
      L.arms.visible = this.armsK > 0.01;
      L.arms.alpha = Math.min(1, this.armsK * 1.4);
      L.arms.position.set(
        BRACE.ARMS_TREMOR * tremorPx * tr(2.6),
        (1 - this.armsK) * BRACE.ARMS_DROP + BRACE.ARMS_SLIP * fatigue + BRACE.ARMS_PUSH * push + BRACE.ARMS_TREMOR * tremorPx * tr(4.1),
      );
      if (L.strain) L.strain.alpha = Math.min(1, Math.max(0, (fatigue - 0.25) / 0.75) + 0.4 * push);
    }

    // Desk videos: when beam renders the desk, keep ambient_desk off so the rotating beam sweeps visibly across the desk;
    // desk_typing_off (darkened to match darkGain) still plays while typing.
    const liveDesk = s.phase === "PLAYING" && onDesk && !dashing && !transition;
    const deskPowered = liveDesk && s.power.generatorOn;
    const playingDeskClip = this.syncDeskVideos(!beamActive && deskPowered, liveDesk && s.power.chudOnline && typing);
    const sweepOn = deskPowered && !playingDeskClip;
    this.sweep.visible = sweepOn;
    if (sweepOn) {
      const k = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
      this.sweepBand.x = -SWEEP_W + k * (PLATE_W + 2 * SWEEP_W);
      this.sweepBand.alpha = 0.22;
      const cx = this.sweepBand.x + SWEEP_W / 2;
      this.paneGlow.forEach((g, i) => {
        const p = FINAL_DESK_PANES[i];
        g.alpha = 0.1 * Math.max(0, 1 - Math.abs(cx - (p.x + p.w / 2)) / 240);
      });
    }

    // lightning across the ocean glazing, desk view only (pure ambience)
    if (t > this.nextLightningAt) {
      this.lightningUntil = t + 0.12;
      this.nextLightningAt = t + 14 + Math.random() * 18;
      this.onThunder?.();
    }
    const flash = t < this.lightningUntil;
    this.lightning.alpha = flash && onDesk ? 0.18 : 0;

    // Fallback night grade (not used when beamActive)
    const ease = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < 3; i++) this.gradeNow[i] += (grade[i] - this.gradeNow[i]) * ease;
    this.cam.filters = grade === GRADE_NONE ? null : [this.grade];
    const boost = flash && onDesk ? 0.35 : 0;
    const [r, g, b] = this.gradeNow;
    this.grade.matrix = [r + boost, 0, 0, 0, 0, 0, g + boost, 0, 0, 0, 0, 0, b + boost, 0, 0, 0, 0, 0, 1, 0] as ColorMatrix;

    const framedDesk = onDesk && this.deskFinal;
    let zoom = framedDesk ? DESK_ZOOM : 1;
    if (!onDesk || !this.overDeskControl) {
      const panEase = 1 - Math.exp(-dt * 4);
      const maxX = framedDesk ? (PLATE_W * K * zoom - W) / 2 : PAN_X;
      const maxY = framedDesk ? (PLATE_H * K * zoom - H) / 2 : PAN_Y;
      this.pan.x += (this.mouse.x * maxX - this.pan.x) * panEase;
      this.pan.y += (this.mouse.y * maxY - this.pan.y) * panEase;
    }
    let ox = -this.pan.x;
    let oy = -this.pan.y;
    this.cam.rotation = 0;
    let black = 0;
    if (this.dashFloor) this.dashFloor.visible = false;
    if (dashing && !transition && this.dashFloor) {
      const edge = 0.2 / CONFIG.TRAVEL_TIME;
      const k = dashProgress;
      const slide = k < edge ? 1 - k / edge : k > 1 - edge ? -(k - (1 - edge)) / edge : 0;
      const f = this.dashFloor;
      f.visible = true;
      f.scale.set(1.08);
      f.position.set(W / 2 + Math.sin(t * 31) * 14, H / 2 + slide * H + Math.abs(Math.sin(t * 13)) * 22);
      f.rotation = Math.sin(t * 7) * 0.02;
      zoom = 1.05;
    } else if (dashing && !transition) {
      black = Math.max(0, 1 - Math.abs(dashProgress - 0.5) * CONFIG.TRAVEL_TIME / 0.2);
      ox += Math.sin(t * 31) * 14;
      oy += Math.abs(Math.sin(t * 13)) * 22;
      this.cam.rotation = Math.sin(t * 7) * 0.02;
      zoom = 1.05;
    } else {
      this.braceK += ((bracing ? 1 : 0) - this.braceK) * (1 - Math.exp(-fdt * 12));
      if (holding) {
        const bump = (since: number, dur: number): number => {
          const k = (ft - since) / dur;
          return k < 0 || k >= 1 ? 0 : Math.sin(Math.PI * Math.pow(k, 0.6));
        };
        const lunge = bump(this.lungeAt, BRACE.LUNGE_TIME);
        const relax = bump(this.relaxAt, BRACE.RELAX_TIME);
        zoom = 1 + BRACE.LEAN_ZOOM * this.braceK + BRACE.LUNGE_ZOOM * lunge + BRACE.RELAX_ZOOM * relax + BRACE.PUSH_ZOOM * push;
        ox += shakeX;
        oy += shakeY + BRACE.LUNGE_PX * lunge + BRACE.RELAX_PX * relax;
        this.cam.rotation = BRACE.PUSH_ROT * push * pushSide + 0.002 * strainK * Math.sin(ft * BRACE.SWAY_HZ * 0.9 * 6.283 + 2);
      }
      ox += Math.sin(t * 0.6) * 4;
      oy += Math.sin(t * 0.43) * 3;
    }
    const roll = dashing ? 0 : Math.abs(this.cam.rotation) * W;
    const mx = (PLATE_W * K * zoom - W) / 2 - roll;
    const my = (PLATE_H * K * zoom - H) / 2 - roll;
    this.cam.scale.set(K * zoom);
    this.cam.position.set(W / 2 + clamp(ox, -mx, mx), H / 2 + clamp(oy, -my, my));
    this.light.position.copyFrom(this.cam.position);
    this.light.scale.copyFrom(this.cam.scale);
    this.light.rotation = this.cam.rotation;
    this.light.visible = onDesk;

    const sliding = turning && !transition;
    if (sliding) {
      const e = turnK < 0.5 ? 2 * turnK * turnK : 1 - 2 * (1 - turnK) * (1 - turnK);
      const bump = Math.sin(Math.PI * turnK);
      const prevX = this.turnDir * W * e;
      this.warpX = this.turnDir * W * (e - 1);
      this.warpPrevCurved.x = this.warpPrevFlat.x = prevX;
      this.warpCurved.x = this.warpFlat.x = this.warpX;
      this.turnBlur.strengthX = CONTROLS.TURN_BLUR * bump;
      black = Math.max(black, CONTROLS.TURN_DIM * bump);
    } else {
      this.warpX = 0;
      this.warpCurved.x = this.warpFlat.x = 0;
      if (!transition && turnK < 1) black = Math.max(black, 1 - turnK);
    }
    this.warpFlat.visible = this.warpIsFlat;
    this.warpCurved.visible = !this.warpIsFlat;
    this.warpPrevFlat.visible = sliding && this.warpPrevIsFlat;
    this.warpPrevCurved.visible = sliding && !this.warpPrevIsFlat;
    this.views.visible = !transition;
    this.views.filters = sliding ? [this.turnBlur] : null;
    if (!this.jumpActive && t < this.snapUntil) black = Math.max(black, (this.snapUntil - t) / SCARE.SNAP_TIME);
    if (!this.jumpActive && t < this.lightFlickerUntil) black = Math.max(black, Math.random() < 0.5 ? 0.55 : 0.15);
    this.fadeAlpha = this.jumpActive ? 0 : black;
    this.fade.alpha = this.jumpActive ? 0 : Math.max(this.fadeAlpha, s.phase === "PLAYING" || s.phase === "BREACH" ? 0 : 0.6);

    // Authored beam plates already carry their own glass and weather detail. The old
    // additive overlays lift the black floor and draw streaks across interior surfaces.
    this.rain.visible = !beamActive && !this.jumpActive && !transition && !this.scareEntry && !dashing && !holding && (view === "DESK" || view === "WINDOW");
    this.rain.x = -PAN_X * 1.6 - this.pan.x * 1.6;
    this.rain.tilePosition.y = (t * 900) % 512;
    this.rain.tilePosition.x = (t * 60) % 512;

    this.app.renderer.render({ container: this.world, target: this.rt, clear: true });

    if (t >= this.flashStartedAt && !this.jumpActive) {
      const k = t - this.flashStartedAt;
      this.flashLayer.alpha = k < 0.06 ? 0.85 : Math.random() < 0.18 ? 0.25 : 0;
      this.views.x = (Math.random() - 0.5) * 10;
    } else {
      this.flashLayer.alpha = 0;
      this.views.x = 0;
    }
    const jumpTime = Math.max(0, t - this.jumpStartedAt);
    const seq = this.jumpActive && this.jumpSeqFrames.length > 0;
    const legacyFrame = this.jumpActive && !seq ? sequenceFrame(jumpTime, this.jumps.length / this.jumpDuration, this.jumps.length) : -1;
    this.jumpSeq.visible = seq;
    this.jumps.forEach((j, i) => (j.visible = legacyFrame === i));
    // Exact 1-frame stark white flash on impact, hard cut off on the next frame (no fade).
    if (this.jumpActive && !this.jumpImpactFlashed) {
      this.impactFlash.alpha = 0.95;
      this.jumpImpactFlashed = true;
    } else {
      this.impactFlash.alpha = 0;
    }
    if (seq || legacyFrame >= 0) {
      const p = clamp(jumpTime / Math.max(0.001, this.jumpDuration), 0, 1);
      const punch = Math.pow(p, 0.72);
      const amp = 0.75 + 0.35 * p;
      const shake = !this.reducedMotion.matches;
      const scale = JUMPSCARE.ZOOM_START + JUMPSCARE.ZOOM_PUNCH * punch + (shake ? (Math.random() - 0.5) * 0.045 : 0);
      const sx = shake ? (Math.random() * 2 - 1) * JUMPSCARE.SHAKE_X * amp : 0;
      const sy = shake ? (Math.random() * 2 - 1) * JUMPSCARE.SHAKE_Y * amp : 0;
      const rot = shake ? (Math.random() * 2 - 1) * JUMPSCARE.SHAKE_ROT * amp : 0;
      const target = seq ? this.jumpSeq : this.jumps[legacyFrame];
      if (seq) {
        const tex = this.jumpSeqFrames[sequenceFrame(jumpTime, JUMPSCARE_FPS, this.jumpSeqFrames.length)];
        const sp = this.jumpSeqSprite;
        sp.texture = tex;
        const k = Math.max(W / tex.width, H / tex.height);
        sp.scale.set(k);
        sp.position.set((W - tex.width * k) / 2, (H - tex.height * k) / 2);
      }
      target.scale.set(scale);
      target.rotation = rot;
      target.position.set(W / 2 + sx, H / 2 + JUMPSCARE.FACE_OFFSET_Y * punch + sy);
    }

    this.grain.visible = !beamActive || dashing || Boolean(transition) || this.jumpActive;
    if (this.grain.visible) {
      this.grain.x = -Math.random() * 256;
      this.grain.y = -Math.random() * 256;
    }
  }
}

function turnDirection(from: View, to: View): number {
  if (to === "WINDOW" || from === "HATCH") return 1;
  if (to === "HATCH" || from === "WINDOW") return -1;
  return to === "BALCONY" ? -1 : 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function makeBandTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, "rgba(255,190,100,0)");
  grad.addColorStop(0.45, "rgba(255,200,120,0.75)");
  grad.addColorStop(0.5, "rgba(255,225,170,1)");
  grad.addColorStop(0.55, "rgba(255,200,120,0.75)");
  grad.addColorStop(1, "rgba(255,190,100,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);
  return Texture.from(c);
}

function makePaneGlow(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "#fff");
  glow.addColorStop(1, "#fff0");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  return Texture.from(canvas);
}

function makeRainTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(190,210,235,0.9)";
  ctx.lineWidth = 1;
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * 512;
    const y = rnd() * H;
    const len = 18 + rnd() * 30;
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.12, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  const fadeOut = ctx.createLinearGradient(0, 0, 0, H);
  fadeOut.addColorStop(0, "rgba(0,0,0,1)");
  fadeOut.addColorStop(0.45, "rgba(0,0,0,0.8)");
  fadeOut.addColorStop(0.62, "rgba(0,0,0,0)");
  fadeOut.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fadeOut;
  ctx.fillRect(0, 0, 512, H);
  return Texture.from(c);
}

function makeGrain(): Texture {
  const c = document.createElement("canvas");
  c.width = W + 256;
  c.height = H + 256;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(c);
}

function makeVignette(): Sprite {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  return new Sprite(Texture.from(c));
}
