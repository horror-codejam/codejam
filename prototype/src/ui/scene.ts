// The PixiJS side (Prototype 3.0, 2.5D): plate-space views, hold views, the dash and screen effects.
// Reads engine state every frame. Never changes game state.
//
// Pipeline each frame:
//   world (off-stage) > cam (plate px, scaled by K, panned by the mouse, night-graded)
//     rendered into a RenderTexture
//   stage > warp mesh (the RenderTexture on a PlaneGeometry, edges stretched for a cylindrical feel)
//         > foreground rain (parallax, moves more than the plate) > jumpscare > fade > grain > vignette
// CHUD's terminal is DOM (main.ts) placed over DESK_SCREEN with `deskScreenRect()`.

import { Application, ColorMatrixFilter, Container, Graphics, Mesh, PlaneGeometry, RenderTexture, Sprite, Texture, TilingSprite } from "pixi.js";
import type { ColorMatrix } from "pixi.js";
import { CONFIG } from "../config";
import type { GameEngine } from "../sim/engine";
import type { Entry, View } from "../sim/types";
import { ENTRIES } from "../sim/types";
import { hasArt, slot } from "./art";
import { DESK_GLAZING, DESK_SCREEN, H, K, PAN_X, PAN_Y, PLATE_H, PLATE_W, W } from "./layout";
import * as P from "./placeholders";

interface EntryLayers {
  root: Container;
  dark: Container;
  lit: Container | null; // a separate lit plate (placeholder or `view_<e>_beam` art)
  litOverlay: Container | null; // additive beam wash on the team's render when there is no lit plate
  tell: Container;
  approach: Container;
  render: boolean;
}

interface HoldLayers {
  root: Container;
  tell: Container;
  render: boolean;
}

type Rgb = [number, number, number];

// Night grade (multipliers on R, G, B) for the team's grey blockout renders.
const GRADE_DARK: Rgb = [0.22, 0.27, 0.38]; // no beam: dark and blue
const GRADE_BEAM: Rgb = [0.66, 0.57, 0.46]; // beam on an entry view: warm and lighter
const GRADE_DESK_DARK: Rgb = [0.22, 0.26, 0.36];
const GRADE_DESK_BEAM: Rgb = [0.4, 0.36, 0.32];
const GRADE_NONE: Rgb = [1, 1, 1]; // coded placeholders are already dark

const WARP_S = 0.08; // perspective warp strength
const SWEEP_PERIOD = 7; // seconds for the beacon to cross the glazing
const SWEEP_W = 300; // plate px

// The green panel in the desk render, slightly outset; blacked out so the DOM terminal blends in.
const SCREEN_FRAME = { x: 152, y: 259, w: 659, h: 201 };

export class Scene {
  private app: Application;
  private world = new Container();
  private cam = new Container();
  private light = new Container(); // same transform as cam, not graded: the beacon sweep and lightning
  private grade = new ColorMatrixFilter();
  private gradeNow: Rgb = [...GRADE_DESK_BEAM];
  private rt: RenderTexture;
  private warp: Mesh;
  private desk = new Container();
  private deskRender: boolean;
  private sweep = new Container();
  private sweepBand: Sprite;
  private sweepWash = new Graphics();
  private lightning = new Graphics();
  private rain: TilingSprite;
  private entries = new Map<Entry, EntryLayers>();
  private holds = new Map<Entry, HoldLayers>();
  private dash: Container;
  private dashRender: boolean;
  private jumps = new Map<Entry, Container>();
  private fade = new Graphics();
  private grain: Sprite;
  private lastView: View | null = null;
  private turnStartedAt = -10;
  private nextLightningAt = 8;
  private lightningUntil = 0;
  private lastT = 0;
  private mouse = { x: 0, y: 0 }; // -1..1 over the canvas
  private pan = { x: 0, y: 0 }; // stage px, lerped toward the mouse

  speakingUntil = 0; // real seconds, set by the UI on CHUD_SAY (the DOM face reads it)
  jumpscare: Entry | null = null;
  onThunder: (() => void) | null = null;
  fadeAlpha = 0; // how black the stage is right now (the DOM terminal follows it)

  constructor(app: Application) {
    this.app = app;
    this.world.addChild(this.cam, this.light);
    this.cam.pivot.set(PLATE_W / 2, PLATE_H / 2);
    this.light.pivot.set(PLATE_W / 2, PLATE_H / 2);
    this.cam.scale.set(K);
    this.cam.filters = [this.grade];

    // desk: render (or placeholder), blacked-out screen, beacon sweep, lightning
    this.deskRender = hasArt("view_desk");
    this.desk.addChild(slot("view_desk", P.deskView, "stage"));
    if (this.deskRender) {
      const f = SCREEN_FRAME;
      this.desk.addChild(new Graphics().rect(f.x, f.y, f.w, f.h).fill(0x020604));
    }
    const gl = DESK_GLAZING;
    const glazingMask = new Graphics().rect(gl.x, gl.y, gl.w, gl.h).fill(0xffffff);
    this.sweepBand = new Sprite(makeBandTexture());
    this.sweepBand.width = SWEEP_W;
    this.sweepBand.height = gl.h;
    this.sweepBand.y = gl.y;
    this.sweepBand.blendMode = "add";
    this.sweep.addChild(this.sweepBand);
    this.sweep.mask = glazingMask;
    this.sweepWash.rect(0, 0, PLATE_W, PLATE_H).fill(0xffb050);
    this.sweepWash.blendMode = "add";
    this.lightning.rect(gl.x, gl.y, gl.w, gl.h).fill({ color: 0xcfe0ff, alpha: 1 });
    this.lightning.alpha = 0;
    this.light.addChild(glazingMask, this.sweep, this.sweepWash, this.lightning);
    this.cam.addChild(this.desk);

    for (const e of ENTRIES) {
      const k = e.toLowerCase();
      const render = hasArt(`view_${k}`);
      const dark = slot(`view_${k}`, P.entryView(e, false), "stage");
      const lit = !render || hasArt(`view_${k}_beam`) ? slot(`view_${k}_beam`, P.entryView(e, true), "stage") : null;
      let litOverlay: Container | null = null;
      if (render && !lit) {
        litOverlay = slot(`lit_${k}`, P.onRenderLit(e), "plate");
        litOverlay.blendMode = "add";
      }
      const approach = render ? slot(`approach_${k}`, P.onRenderApproach(e), "plate") : slot(`approach_${k}`, P.approach(e), "stage");
      const tell = render ? slot(`tell_${k}`, P.onRenderTell(e), "plate") : slot(`tell_${k}`, P.tell(e), "stage");
      const root = new Container();
      root.addChild(dark);
      if (lit) root.addChild(lit);
      if (litOverlay) root.addChild(litOverlay);
      root.addChild(approach, tell);
      root.visible = false;
      this.cam.addChild(root);
      this.entries.set(e, { root, dark, lit, litOverlay, tell, approach, render });

      const holdRender = hasArt(`hold_${k}`);
      const hold = new Container();
      const holdTell = holdRender ? slot(`hold_tell_${k}`, P.onRenderHoldTell(e), "plate") : slot(`hold_tell_${k}`, P.holdTell(e), "stage");
      hold.addChild(slot(`hold_${k}`, P.holdView(e), "stage"), holdTell);
      hold.visible = false;
      this.cam.addChild(hold);
      this.holds.set(e, { root: hold, tell: holdTell, render: holdRender });
    }

    this.dashRender = hasArt("dash_floor");
    this.dash = slot("dash_floor", P.dashFloor, "stage");
    this.dash.visible = false;
    this.cam.addChild(this.dash);

    // world -> RenderTexture -> warped mesh on the stage
    this.rt = RenderTexture.create({ width: W, height: H, resolution: app.renderer.resolution });
    const geo = new PlaneGeometry({ width: W, height: H, verticesX: 33, verticesY: 9 });
    const pos = geo.positions;
    for (let i = 0; i < pos.length; i += 2) {
      const nx = (pos[i] - W / 2) / (W / 2);
      pos[i + 1] = H / 2 + (pos[i + 1] - H / 2) * (1 + WARP_S * nx * nx);
    }
    geo.positions = pos;
    this.warp = new Mesh({ geometry: geo, texture: this.rt });
    app.stage.addChild(this.warp);

    // one parallax foreground layer: rain streaks, fading out toward the bottom
    this.rain = new TilingSprite({ texture: makeRainTexture(), width: W + 2 * PAN_X * 1.6, height: H });
    this.rain.alpha = 0.16;
    this.rain.blendMode = "add";
    app.stage.addChild(this.rain);

    for (const e of ENTRIES) {
      const j = slot(`jumpscare_${e.toLowerCase()}`, P.jumpscare(e), "stage");
      const cover = Math.max(W / PLATE_W, H / PLATE_H);
      j.pivot.set(PLATE_W / 2, PLATE_H / 2);
      j.scale.set(cover);
      j.visible = false;
      app.stage.addChild(j);
      this.jumps.set(e, j);
    }

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
      this.mouse.x = clamp(((ev.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.mouse.y = clamp(((ev.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    });
  }

  // DESK_SCREEN in stage px at the current pan (ignores the small edge warp). For the DOM terminal.
  deskScreenRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.cam.x + (DESK_SCREEN.x - PLATE_W / 2) * K,
      y: this.cam.y + (DESK_SCREEN.y - PLATE_H / 2) * K,
      w: DESK_SCREEN.w * K,
      h: DESK_SCREEN.h * K,
    };
  }

  update(engine: GameEngine, t: number): void {
    const s = engine.state;
    const pos = s.player.position;
    const beam = s.power.slot === "BEAM";
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;

    // which picture is up
    const holding = pos.kind === "HOLDING" ? pos.entry : null;
    const dashing = pos.kind === "TRAVELING" || pos.kind === "RETURNING";
    const view: View = s.player.view;
    if (view !== this.lastView) {
      if (this.lastView !== null) this.turnStartedAt = t;
      this.lastView = view;
    }

    let grade: Rgb = GRADE_NONE;
    const onDesk = !holding && !dashing && view === "DESK";
    this.desk.visible = onDesk;
    if (onDesk && this.deskRender) grade = beam ? GRADE_DESK_BEAM : GRADE_DESK_DARK;

    for (const [e, L] of this.entries) {
      const on = !holding && !dashing && view === e;
      L.root.visible = on;
      if (!on) continue;
      if (L.render) grade = beam ? GRADE_BEAM : GRADE_DARK;
      L.dark.visible = !beam || !L.lit;
      if (L.lit) L.lit.visible = beam;
      if (L.litOverlay) L.litOverlay.visible = beam;
      const vis = engine.ramVisual(e);
      L.tell.visible = vis === "tell_faint" || vis === "tell_clear";
      // faint tells need a boost on graded renders, otherwise the night grade swallows them
      const faint = L.render ? 0.45 : 0.22;
      L.tell.alpha = vis === "tell_clear" ? 1 : faint + 0.08 * Math.sin(t * 9);
      L.approach.visible = vis === "approach_silhouette";
      // hatch lid shudders while he is at it
      L.root.y = e === "HATCH" && L.tell.visible ? Math.sin(t * 60) * 1.5 : 0;
    }
    for (const [e, L] of this.holds) {
      L.root.visible = holding === e;
      if (holding !== e) continue;
      if (L.render) grade = beam ? GRADE_BEAM : GRADE_DARK;
      const vis = engine.ramVisual(e);
      L.tell.visible = vis === "tell_faint" || vis === "tell_clear";
      L.tell.alpha = vis === "tell_clear" ? 1 : L.render ? 0.6 : 0.45;
      L.root.y = L.tell.visible ? Math.sin(t * 50) * 2.5 : 0;
    }
    this.dash.visible = dashing;
    if (dashing && this.dashRender) grade = GRADE_DARK;

    // beacon sweep across the glazing while the generator feeds the beam (GAME_LOGIC 6.1)
    const sweepOn = onDesk && beam;
    this.sweep.visible = sweepOn;
    this.sweepWash.visible = sweepOn;
    if (sweepOn) {
      const k = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
      const x = -SWEEP_W + k * (PLATE_W + 2 * SWEEP_W);
      this.sweepBand.x = x;
      const d = (x + SWEEP_W / 2 - PLATE_W / 2) / 260;
      this.sweepWash.alpha = 0.05 * Math.exp(-d * d);
      this.sweepBand.alpha = 0.45;
    }

    // lightning across the ocean glazing, desk view only (pure ambience)
    if (t > this.nextLightningAt) {
      this.lightningUntil = t + 0.12;
      this.nextLightningAt = t + 14 + Math.random() * 18;
      this.onThunder?.();
    }
    const flash = t < this.lightningUntil;
    this.lightning.alpha = flash && onDesk ? 0.35 : 0;

    // night grade, eased so turning or switching power reads as light changing
    const ease = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < 3; i++) this.gradeNow[i] += (grade[i] - this.gradeNow[i]) * ease;
    const boost = flash && onDesk ? 0.35 : 0;
    const [r, g, b] = this.gradeNow;
    this.grade.matrix = [r + boost, 0, 0, 0, 0, 0, g + boost, 0, 0, 0, 0, 0, b + boost, 0, 0, 0, 0, 0, 1, 0] as ColorMatrix;

    // camera: mouse pan (lerped), plus dash tip, shake and rise (GAME_LOGIC 6.4), otherwise a slow sway
    const panEase = 1 - Math.exp(-dt * 4);
    this.pan.x += (this.mouse.x * PAN_X - this.pan.x) * panEase;
    this.pan.y += (this.mouse.y * PAN_Y - this.pan.y) * panEase;
    let ox = -this.pan.x;
    let oy = -this.pan.y;
    this.cam.rotation = 0;
    let zoom = 1;
    let black = 0;
    if (dashing) {
      const left = pos.until - s.clock.elapsed;
      const k = 1 - Math.max(0, Math.min(1, left / CONFIG.TRAVEL_TIME)); // 0..1 through the dash
      const tip = 0.2 / CONFIG.TRAVEL_TIME;
      if (k < tip) black = 1 - k / tip;
      else if (k > 1 - tip) black = (k - (1 - tip)) / tip;
      ox += Math.sin(t * 31) * 14;
      oy += Math.abs(Math.sin(t * 13)) * 22;
      this.cam.rotation = Math.sin(t * 7) * 0.02;
      zoom = 1.05; // covers the corners while the camera rolls
    } else {
      ox += Math.sin(t * 0.6) * 4;
      oy += Math.sin(t * 0.43) * 3;
    }
    // never pan past the plate edge
    const mx = (PLATE_W * K * zoom - W) / 2;
    const my = (PLATE_H * K * zoom - H) / 2;
    this.cam.scale.set(K * zoom);
    this.cam.position.set(W / 2 + clamp(ox, -mx, mx), H / 2 + clamp(oy, -my, my));
    this.light.position.copyFrom(this.cam.position);
    this.light.scale.copyFrom(this.cam.scale);
    this.light.rotation = this.cam.rotation;

    const turnK = (t - this.turnStartedAt) / 0.25;
    if (turnK < 1) black = Math.max(black, 1 - turnK);
    this.fadeAlpha = black * 0.95;
    this.fade.alpha = Math.max(this.fadeAlpha, s.phase === "PLAYING" || s.phase === "BREACH" ? 0 : 0.6);

    // foreground rain: desk (through the glazing) and window views, moves 1.6x the plate
    this.rain.visible = !dashing && !holding && (view === "DESK" || view === "WINDOW");
    this.rain.x = -PAN_X * 1.6 - this.pan.x * 1.6;
    this.rain.tilePosition.y = (t * 900) % 512;
    this.rain.tilePosition.x = (t * 60) % 512;

    this.app.renderer.render({ container: this.world, target: this.rt, clear: true });

    for (const [e, j] of this.jumps) j.visible = this.jumpscare === e;
    if (this.jumpscare) {
      const j = this.jumps.get(this.jumpscare)!;
      const cover = Math.max(W / PLATE_W, H / PLATE_H);
      j.scale.set(cover * (1 + Math.random() * 0.04));
      j.position.set(W / 2 + (Math.random() - 0.5) * 30, H / 2 + (Math.random() - 0.5) * 30);
    }

    this.grain.x = -Math.random() * 256;
    this.grain.y = -Math.random() * 256;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Horizontal amber band, transparent at both edges, for the beacon sweep.
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

// Slanted rain streaks that fade out over the lower half (so they stay off the terminal).
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
    const v = Math.random() * 255;
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
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  return new Sprite(Texture.from(c));
}
