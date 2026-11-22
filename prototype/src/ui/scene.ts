// The PixiJS side (Prototype 3.0, 2.5D): plate-space views, hold views, the dash and screen effects.
// Reads engine state every frame. Never changes game state.
//
// Pipeline each frame:
//   world (off-stage) > cam (plate px, scaled by K, panned by the mouse, night-graded)
//     rendered into a RenderTexture
//   stage > warp mesh (the RenderTexture on a PlaneGeometry, edges stretched for a cylindrical feel)
//         > foreground rain (parallax, moves more than the plate) > scare flash > jumpscare frames > fade > grain > vignette
// The DOM terminal uses the desk's camera transform and the calibrated monitor corners.

import { Application, BlurFilter, ColorMatrixFilter, Container, Graphics, Mesh, PlaneGeometry, RenderTexture, Sprite, Texture, TilingSprite } from "pixi.js";
import type { ColorMatrix } from "pixi.js";
import { CONFIG } from "../config";
import { BRACE, CONTROLS } from "../uiConfig";
import type { GameEngine } from "../sim/engine";
import type { Entry, View } from "../sim/types";
import { ENTRIES } from "../sim/types";
import { artFrames, hasArt, isFinal, slot, stageSlot } from "./art";
import { DESK_GLAZING, H, K, PAN_X, PAN_Y, PLATE_H, PLATE_W, W, ZOOM } from "./layout";
import { MONITOR_CORNERS, monitorTransform } from "./monitor";
import * as P from "./placeholders";
import { entryPlate, holdPlate, JUMPSCARE_FPS, JUMPSCARE_MIN_FRAMES, jumpscareJob, sequenceFrame } from "./plates";

// Final renders are full plates per state (src/ui/plates.ts): when the plate for the current state exists it is shown
// alone, with no overlay and no night grade. The layers below (view + coded overlays) are the fallback for a state whose
// final plate is missing.
interface EntryLayers {
  root: Container;
  k: string; // "window" | "hatch" | "balcony"
  dark: Container; // `view_<e>` (final `view_<e>_off` when present)
  lit: Container | null; // a separate lit plate (placeholder, or `view_<e>_beam` / final `view_<e>_on`)
  litOverlay: Container | null; // additive light wash on the team's render when there is no lit plate
  tell: Container;
  approach: Container;
  inside: Container; // Ram in the room, just inside this entry (`ram_inside_<entry>`), only with its light on
  plates: Map<string, Container>; // final state plates: tell_<e>_<on|off>, approach_<e>_on, inside_<e>_on
  render: boolean;
}

interface HoldLayers {
  root: Container;
  k: string;
  base: Container; // `hold_<e>` (final `hold_<e>_stand_empty_off` when present), fallback only
  tell: Container;
  arms: Container; // the player's arms on the entry, only while bracing (fallback: the brace plates include the arms)
  strain: Sprite | null; // whitened knuckles over the coded arms, faded in with fatigue
  plates: Map<string, Container>; // final plates hold_<e>_<stand|brace>_<empty|tell>_<on|off>
  plate: Container | null; // the final plate showing this frame
  render: boolean;
}

type Rgb = [number, number, number];

// Night grade (multipliers on R, G, B) for the team's grey blockout renders.
const GRADE_DARK: Rgb = [0.22, 0.27, 0.38]; // light off: dark and blue
const GRADE_LIT: Rgb = [0.66, 0.57, 0.46]; // this entry's light on (Shift): warm and lighter
const GRADE_DESK_DARK: Rgb = [0.22, 0.26, 0.36]; // the desk is never lit by an entry light
const GRADE_NONE: Rgb = [1, 1, 1]; // coded placeholders are already dark

const WARP_S = 0.08; // perspective warp strength
const SWEEP_PERIOD = 7; // seconds for the beacon to cross the glazing
const SWEEP_W = 300; // plate px
const DESK_ZOOM = 1.03 / ZOOM; // leave room for the monitor bezel through the full desk pan

// The green panel in the desk render, slightly outset; blacked out so the DOM terminal blends in.
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
  private light = new Container(); // same transform as cam, not graded: the beacon sweep and lightning
  private grade = new ColorMatrixFilter();
  private gradeNow: Rgb = [...GRADE_DESK_DARK];
  private rt: RenderTexture;
  private rtPrev: RenderTexture; // the last frame of the view being turned away from (edge controls slide)
  private views = new Container(); // warp + warpPrev, motion-blurred during a turn
  private warp: Mesh;
  private flatGeometry = new PlaneGeometry({ width: W, height: H });
  private curvedGeometry: PlaneGeometry;
  private warpPrev: Mesh;
  private turnBlur = new BlurFilter({ strengthX: 0, strengthY: 0, quality: 2 });
  private turnSlide = false; // the current turn slides (edge turn) rather than fades (arriving from a dash)
  private turnDir = 1; // +1: the picture moves right (turning left), -1: moves left
  private turnDur = CONTROLS.TURN_TIME;
  private lastDashing = false;
  private braceK = 0; // 0 standing at an entry, 1 bracing it (eased): the camera leans in while bracing
  private armsK = 0; // 0 arms down out of frame, 1 arms on the entry (eased faster than braceK)
  private fxT = 0; // effect clock: real seconds that stop while paused (brace shake, Ram's shoves)
  private wasBracing = false;
  private lungeAt = -10; // fxT of the last brace start (push-in)
  private relaxAt = -10; // fxT of the last brace end (relax-back)
  private desk = new Container();
  private deskRender: boolean;
  private deskFinal: boolean; // the final desk plate: terminal on the monitor, lightning and beacon on the side panes
  private sweep = new Container();
  private sweepBand: Sprite;
  private paneGlow: Sprite[] = []; // final desk: the beacon brightens each side pane as it passes behind the monitor
  private lightning = new Container();
  private rain: TilingSprite;
  private entries = new Map<Entry, EntryLayers>();
  private holds = new Map<Entry, HoldLayers>();
  private dash: Container;
  private dashRender: boolean;
  private jumps: Container[] = []; // ram_jumpscare_1..4 (fallback)
  private jumpSeq = new Container(); // the final 24 fps jumpscare_<entry> sequence, when rendered
  private jumpSeqSprite = new Sprite(Texture.EMPTY);
  private jumpSeqFrames: Texture[] = [];
  private jumpStartedAt = 0;
  private lastJump: number | null = null;
  private flashLayer = new Graphics(); // the white pop at the start of the creepy flash
  private fade = new Graphics();
  private grain: Sprite;
  private lastView: View | null = null;
  private turnStartedAt = -10;
  private nextLightningAt = 8;
  private lightningUntil = 0;
  private lastT = 0;
  private mouse = { x: 0, y: 0 }; // -1..1 over the canvas
  private overDeskControl = false;
  private pan = { x: 0, y: 0 }; // stage px, lerped toward the mouse

  jumpscare: number | null = null; // frame 1..4 of the jumpscare, set by the UI's scare sequence
  flashEntry: Entry | null = null; // the creepy full-frame flash: this entry, lit, with Ram inside
  flashStartedAt = 0;
  lightFlickerUntil = 0; // real seconds: the stage flickers as CHUD forces the light off
  onThunder: (() => void) | null = null;
  paused = false; // UI pause: the brace effects freeze
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
    this.deskFinal = isFinal("view_desk");
    this.desk.addChild(slot("view_desk", P.deskView, "stage"));
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
      // The monitor hides the middle of the glazing: no band across it, a soft glow on each side pane instead.
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
      // No mask: the band is exactly the glazing height and the glazing spans the plate width, so it never leaves the
      // glazing on screen. A rect mask turns into a stencil mask once the camera rolls (dash, bracing), and inside the
      // RenderTexture that stencil state broke the frame (the glazing area showed a shifted copy of the plate).
      this.sweep.addChild(this.sweepBand);
      this.lightning.addChild(new Graphics().rect(gl.x, gl.y, gl.w, gl.h).fill(0xcfe0ff));
    }
    this.lightning.alpha = 0;
    this.light.addChild(this.sweep, this.lightning);
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
      const inside = slot(`ram_inside_${k}`, P.ramInside(e), "plate");
      inside.visible = false;
      const plates = finalPlates([`tell_${k}_off`, `tell_${k}_on`, `approach_${k}_on`, `inside_${k}_on`]);
      const root = new Container();
      root.addChild(dark);
      if (lit) root.addChild(lit);
      if (litOverlay) root.addChild(litOverlay);
      root.addChild(approach, tell, inside, ...plates.values());
      root.visible = false;
      this.cam.addChild(root);
      this.entries.set(e, { root, k, dark, lit, litOverlay, tell, approach, inside, plates, render });

      const holdRender = hasArt(`hold_${k}`);
      const hold = new Container();
      const holdTell = holdRender ? slot(`hold_tell_${k}`, P.onRenderHoldTell(e), "plate") : slot(`hold_tell_${k}`, P.holdTell(e), "stage");
      // the arms: `brace_arms_<entry>` art, else the painted overlay (P.braceArms). Placeholders are not graded,
      // so the painted arms are darkened by a tint to sit with them.
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
      const holdPlates = finalPlates(
        [false, true].flatMap((brace) => [false, true].flatMap((tell) => [false, true].map((on) => holdPlate(e, brace, tell, on)))),
      );
      hold.addChild(base, holdTell, arms, ...holdPlates.values());
      hold.visible = false;
      this.cam.addChild(hold);
      this.holds.set(e, { root: hold, k, base, tell: holdTell, arms, strain, plates: holdPlates, plate: null, render: holdRender });
    }

    this.dashRender = hasArt("dash_floor");
    this.dash = slot("dash_floor", P.dashFloor, "stage");
    this.dash.visible = false;
    this.cam.addChild(this.dash);

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
    this.curvedGeometry = geo;
    this.warp = new Mesh({ geometry: geo, texture: this.rt });
    this.warpPrev = new Mesh({ geometry: geo, texture: this.rtPrev });
    this.warpPrev.visible = false;
    this.views.addChild(this.warpPrev, this.warp);
    app.stage.addChild(this.views);

    // one parallax foreground layer: rain streaks, fading out toward the bottom
    this.rain = new TilingSprite({ texture: makeRainTexture(), width: W + 2 * PAN_X * 1.6, height: H });
    this.rain.alpha = 0.16;
    this.rain.blendMode = "add";
    app.stage.addChild(this.rain);

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
      this.overDeskControl = ev.target instanceof Element && !!ev.target.closest("#terminal button, #terminal input");
      this.mouse.x = clamp(((ev.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.mouse.y = clamp(((ev.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    });
  }

  deskScreenTransform(): string {
    const plate = this.plateRect({ x: 0, y: 0, w: PLATE_W, h: PLATE_H });
    const projection = this.deskFinal ? monitorTransform.final : monitorTransform.fallback;
    return `translate(${plate.x}px, ${plate.y}px) scale(${this.cam.scale.x}) ${projection}`;
  }

  // Any plate-px rect of the current view in stage px at the current pan and zoom (DOM hotspots on the desk).
  plateRect(r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
    const k = this.cam.scale.x;
    return {
      x: this.warp.x + this.cam.x + (r.x - PLATE_W / 2) * k,
      y: this.cam.y + (r.y - PLATE_H / 2) * k,
      w: r.w * k,
      h: r.h * k,
    };
  }

  update(engine: GameEngine, t: number): void {
    const s = engine.state;
    const pos = s.player.position;
    // The player's light (Shift) lights only the entry it is on (GAME_LOGIC 6.1).
    const litEntry: Entry | null = this.flashEntry ?? (s.power.slot.startsWith("LIGHT_") ? (s.power.slot.slice(6) as Entry) : null);
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const fdt = this.paused ? 0 : dt;
    this.fxT += fdt;
    const ft = this.fxT;

    // which picture is up
    // the hold view shows while bracing (HOLDING) and while standing at the entry (edge controls, STANDING)
    const holding = !this.flashEntry && (pos.kind === "HOLDING" || pos.kind === "STANDING") ? pos.entry : null;
    const bracing = pos.kind === "HOLDING";
    const dashing = !this.flashEntry && (pos.kind === "TRAVELING" || pos.kind === "RETURNING");
    const view: View = this.flashEntry ?? s.player.view;
    if (view !== this.lastView) {
      if (this.lastView !== null) {
        this.turnStartedAt = t;
        // a turn at the desk slides; the snap back to DESK at the end of a dash keeps the fade from black
        this.turnSlide = s.phase === "PLAYING" && !this.lastDashing && !dashing;
        this.turnDir = turnDirection(this.lastView, view);
        this.turnDur = this.lastView === "BALCONY" || view === "BALCONY" ? CONTROLS.TURN_TIME_BALCONY : CONTROLS.TURN_TIME;
        if (this.turnSlide) {
          // rt still holds the last frame of the old view: keep it as the outgoing picture
          [this.rt, this.rtPrev] = [this.rtPrev, this.rt];
          this.warp.texture = this.rt;
          this.warpPrev.texture = this.rtPrev;
          this.warpPrev.geometry = this.warp.geometry;
        }
      }
      // The desk stays planar so the projected DOM and the monitor glass share exactly the same corners.
      this.warp.geometry = view === "DESK" ? this.flatGeometry : this.curvedGeometry;
      this.lastView = view;
    }
    this.lastDashing = dashing;

    let grade: Rgb = GRADE_NONE;
    const onDesk = !holding && !dashing && view === "DESK";
    this.desk.visible = onDesk;
    if (onDesk && this.deskRender && !this.deskFinal) grade = GRADE_DESK_DARK;

    for (const [e, L] of this.entries) {
      const on = !holding && !dashing && view === e;
      L.root.visible = on;
      if (!on) continue;
      const lit = litEntry === e;
      const vis = this.flashEntry === e ? "inside" : engine.ramVisual(e);
      const tellUp = vis === "tell_faint" || vis === "tell_clear";
      // the final full plate for this state, else the view with a coded overlay
      const want = entryPlate(e, lit, vis);
      const plate = L.plates.get(want) ?? null;
      for (const c of L.plates.values()) c.visible = c === plate;
      const useLit = lit && !!L.lit;
      L.dark.visible = !plate && !useLit;
      if (L.lit) L.lit.visible = !plate && useLit;
      if (L.litOverlay) L.litOverlay.visible = !plate && lit;
      if (plate || isFinal(useLit ? `view_${L.k}_beam` : `view_${L.k}`)) grade = GRADE_NONE;
      else if (L.render) grade = lit ? GRADE_LIT : GRADE_DARK;
      L.inside.visible = !plate && vis === "inside";
      L.tell.visible = !plate && tellUp;
      // faint tells need a boost on graded renders, otherwise the night grade swallows them
      const faint = L.render ? 0.45 : 0.22;
      L.tell.alpha = vis === "tell_clear" ? 1 : faint + 0.08 * Math.sin(t * 9);
      L.approach.visible = !plate && vis === "approach_silhouette";
      // hatch lid shudders while he is at it
      L.root.y = e === "HATCH" && tellUp ? Math.sin(t * 60) * 1.5 : 0;
    }
    // bracing: fatigue (0..1 over HOLD_MAX), push-in on press, relax-back on release, Ram's shoves
    if (bracing !== this.wasBracing) {
      if (bracing) this.lungeAt = ft;
      else if (holding) this.relaxAt = ft;
      this.wasBracing = bracing;
    }
    const fatigue = pos.kind === "HOLDING" ? clamp((s.clock.elapsed - pos.since) / CONFIG.HOLD_MAX, 0, 1) : 0;
    this.armsK += ((bracing ? 1 : 0) - this.armsK) * (1 - Math.exp(-fdt * BRACE.ARMS_EASE));
    let pushing = false;
    for (const [e, L] of this.holds) {
      L.root.visible = holding === e;
      if (holding !== e) continue;
      const lit = litEntry === e;
      const vis = engine.ramVisual(e);
      const tellUp = vis === "tell_faint" || vis === "tell_clear";
      // the final full plate (the brace plates include the arms), else the hold view with coded tell and painted arms
      const plate = L.plates.get(holdPlate(e, bracing, tellUp, lit)) ?? null;
      for (const c of L.plates.values()) c.visible = c === plate;
      L.plate = plate;
      L.base.visible = !plate;
      if (plate || isFinal(`hold_${L.k}`)) grade = GRADE_NONE;
      else if (L.render) grade = lit ? GRADE_LIT : GRADE_DARK;
      L.tell.visible = !plate && tellUp;
      L.tell.alpha = vis === "tell_clear" ? 1 : L.render ? 0.6 : 0.45;
      pushing = bracing && tellUp;
    }
    // one shove per PUSH_PERIOD: a sharp knock then a slow give (0..1). Felt, never heard: Ram is silent.
    let push = 0;
    let pushSide = 1;
    if (pushing) {
      const n = Math.floor(ft / BRACE.PUSH_PERIOD);
      const ph = (ft / BRACE.PUSH_PERIOD) % 1;
      push = ph < 0.1 ? ph / 0.1 : Math.exp(-(ph - 0.1) * 6);
      pushSide = n % 2 === 0 ? 1 : -1;
    }
    // tremor: three incommensurate sines (organic, not random jitter), -1..1
    const tr = (ph: number): number =>
      (Math.sin(ft * BRACE.TREMOR_HZ * 6.283 + ph) + 0.6 * Math.sin(ft * BRACE.TREMOR_HZ * 1.73 * 6.283 + ph * 2.1) + 0.35 * Math.sin(ft * BRACE.TREMOR_HZ * 2.91 * 6.283 + ph * 3.7)) / 1.95;
    const strainK = this.braceK * (1 + BRACE.FATIGUE_GAIN * fatigue);
    const tremorPx = BRACE.TREMOR_PX * strainK + BRACE.PUSH_TREMOR * push * this.braceK;
    const shakeX = BRACE.SWAY_PX * strainK * Math.sin(ft * BRACE.SWAY_HZ * 6.283) + tremorPx * tr(0);
    const shakeY = BRACE.SWAY_PX * 0.7 * strainK * Math.sin(ft * BRACE.SWAY_HZ * 0.77 * 6.283 + 1) + tremorPx * tr(1.3) - BRACE.PUSH_PX * push;
    if (holding) {
      const L = this.holds.get(holding)!;
      // with a final plate up the arms are in the brace render (or out of frame when standing): the camera carries the
      // brace motion (lean, tremor, Ram's shoves) for the whole plate
      L.arms.visible = !L.plate && this.armsK > 0.01;
      L.arms.alpha = Math.min(1, this.armsK * 1.4);
      L.arms.position.set(
        BRACE.ARMS_TREMOR * tremorPx * tr(2.6),
        (1 - this.armsK) * BRACE.ARMS_DROP + BRACE.ARMS_SLIP * fatigue + BRACE.ARMS_PUSH * push + BRACE.ARMS_TREMOR * tremorPx * tr(4.1),
      );
      if (L.strain) L.strain.alpha = Math.min(1, Math.max(0, (fatigue - 0.25) / 0.75) + 0.4 * push);
    }
    this.dash.visible = dashing;
    if (dashing && this.dashRender) grade = GRADE_DARK;

    // the lighthouse beacon sweeping outside the glazing: exterior ambience only, it never lights the room
    // and has nothing to do with the power slot or Ram (GAME_LOGIC 6.1)
    const sweepOn = onDesk && s.power.generatorOn;
    this.sweep.visible = sweepOn;
    if (sweepOn) {
      const k = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
      this.sweepBand.x = -SWEEP_W + k * (PLATE_W + 2 * SWEEP_W);
      this.sweepBand.alpha = 0.3;
      const cx = this.sweepBand.x + SWEEP_W / 2;
      this.paneGlow.forEach((g, i) => {
        const p = FINAL_DESK_PANES[i];
        g.alpha = 0.14 * Math.max(0, 1 - Math.abs(cx - (p.x + p.w / 2)) / 240);
      });
    }

    // lightning across the ocean glazing, desk view only (pure ambience)
    if (t > this.nextLightningAt) {
      this.lightningUntil = t + 0.12;
      this.nextLightningAt = t + 14 + Math.random() * 18;
      this.onThunder?.();
    }
    const flash = t < this.lightningUntil;
    this.lightning.alpha = flash && onDesk ? 0.24 : 0;

    // night grade, eased so turning or switching power reads as light changing
    const ease = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < 3; i++) this.gradeNow[i] += (grade[i] - this.gradeNow[i]) * ease;
    const boost = flash && onDesk ? 0.35 : 0;
    const [r, g, b] = this.gradeNow;
    this.grade.matrix = [r + boost, 0, 0, 0, 0, 0, g + boost, 0, 0, 0, 0, 0, b + boost, 0, 0, 0, 0, 0, 1, 0] as ColorMatrix;

    // camera: mouse pan (lerped), plus dash tip, shake and rise (GAME_LOGIC 6.4), otherwise a slow sway
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
      this.braceK += ((bracing ? 1 : 0) - this.braceK) * (1 - Math.exp(-fdt * 12));
      if (holding) {
        // standing: a step back from the entry, bracing: leaning into it, straining, shoved by Ram
        const bump = (since: number, dur: number): number => {
          const k = (ft - since) / dur;
          return k < 0 || k >= 1 ? 0 : Math.sin(Math.PI * Math.pow(k, 0.6)); // fast attack, slower settle
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
    // never pan past the plate edge
    // (a rolled camera needs a little more margin so the corners stay covered)
    const roll = dashing ? 0 : Math.abs(this.cam.rotation) * W;
    const mx = (PLATE_W * K * zoom - W) / 2 - roll;
    const my = (PLATE_H * K * zoom - H) / 2 - roll;
    this.cam.scale.set(K * zoom);
    this.cam.position.set(W / 2 + clamp(ox, -mx, mx), H / 2 + clamp(oy, -my, my));
    this.light.position.copyFrom(this.cam.position);
    this.light.scale.copyFrom(this.cam.scale);
    this.light.rotation = this.cam.rotation;
    this.light.visible = onDesk; // desk-only effects (sweep, lightning): nothing to draw anywhere else

    // turn: a fast slide with motion blur (edge controls), or the old fade from black after a dash
    const turnK = (t - this.turnStartedAt) / (this.turnSlide ? this.turnDur : 0.25);
    const sliding = this.turnSlide && turnK < 1;
    if (sliding) {
      const e = turnK < 0.5 ? 2 * turnK * turnK : 1 - 2 * (1 - turnK) * (1 - turnK); // ease in-out
      const bump = Math.sin(Math.PI * turnK);
      this.warpPrev.x = this.turnDir * W * e;
      this.warp.x = this.turnDir * W * (e - 1);
      this.turnBlur.strengthX = CONTROLS.TURN_BLUR * bump;
      black = Math.max(black, CONTROLS.TURN_DIM * bump);
    } else {
      this.warp.x = 0;
      if (turnK < 1) black = Math.max(black, 1 - turnK);
    }
    this.warpPrev.visible = sliding;
    this.views.filters = sliding ? [this.turnBlur] : null;
    if (t < this.lightFlickerUntil) black = Math.max(black, Math.random() < 0.5 ? 0.55 : 0.15);
    this.fadeAlpha = black * 0.95;
    this.fade.alpha = Math.max(this.fadeAlpha, s.phase === "PLAYING" || s.phase === "BREACH" ? 0 : 0.6);

    // foreground rain: desk (through the glazing) and window views, moves 1.6x the plate
    this.rain.visible = !dashing && !holding && (view === "DESK" || view === "WINDOW");
    this.rain.x = -PAN_X * 1.6 - this.pan.x * 1.6;
    this.rain.tilePosition.y = (t * 900) % 512;
    this.rain.tilePosition.x = (t * 60) % 512;

    this.app.renderer.render({ container: this.world, target: this.rt, clear: true });

    // the creepy flash: a white pop, then the lit entry with him inside, flickering and twitching
    if (this.flashEntry) {
      const k = t - this.flashStartedAt;
      this.flashLayer.alpha = k < 0.06 ? 0.85 : Math.random() < 0.18 ? 0.25 : 0;
      this.views.x = (Math.random() - 0.5) * 10;
    } else {
      this.flashLayer.alpha = 0;
      this.views.x = 0;
    }
    // the jumpscare: the final 24 fps sequence of the breach entry when rendered (main's frame clock only starts and
    // ends it: jumpscare.wav plays at its frame 1, the last frame holds until main clears it), else the 4 frames
    if (this.jumpscare !== null && this.lastJump === null) {
      this.jumpStartedAt = t;
      const entry = engine.state.loss?.entry ?? null;
      const frames = entry ? artFrames(jumpscareJob(entry)) : [];
      this.jumpSeqFrames = frames.length >= JUMPSCARE_MIN_FRAMES ? frames : [];
    }
    this.lastJump = this.jumpscare;
    const seq = this.jumpscare !== null && this.jumpSeqFrames.length > 0;
    this.jumpSeq.visible = seq;
    this.jumps.forEach((j, i) => (j.visible = !seq && this.jumpscare === i + 1));
    if (seq) {
      const tex = this.jumpSeqFrames[sequenceFrame(t - this.jumpStartedAt, JUMPSCARE_FPS, this.jumpSeqFrames.length)];
      const sp = this.jumpSeqSprite;
      sp.texture = tex;
      const k = Math.max(W / tex.width, H / tex.height); // cover the stage (1280 x 640 frames crop a little at the sides)
      sp.scale.set(k);
      sp.position.set((W - tex.width * k) / 2, (H - tex.height * k) / 2);
      // a lighter shake than the stills: the frames already move
      this.jumpSeq.scale.set(1.03 + Math.random() * 0.015);
      this.jumpSeq.position.set(W / 2 + (Math.random() - 0.5) * 12, H / 2 + (Math.random() - 0.5) * 12);
    } else if (this.jumpscare) {
      const j = this.jumps[this.jumpscare - 1];
      j.scale.set(1.02 + Math.random() * 0.04);
      j.position.set(W / 2 + (Math.random() - 0.5) * 30, H / 2 + (Math.random() - 0.5) * 30);
    }

    this.grain.x = -Math.random() * 256;
    this.grain.y = -Math.random() * 256;
  }
}

// +1 when the head turns left (the picture moves right), -1 when it turns right.
function turnDirection(from: View, to: View): number {
  if (to === "WINDOW" || from === "HATCH") return 1;
  if (to === "HATCH" || from === "WINDOW") return -1;
  return to === "BALCONY" ? -1 : 1; // turn round to the right, back to the left
}

// The final full plates among `names` that are loaded, each a hidden plate-sized container.
function finalPlates(names: string[]): Map<string, Container> {
  const m = new Map<string, Container>();
  for (const name of names) {
    if (!hasArt(name)) continue;
    const c = slot(name, () => undefined, "plate");
    c.visible = false;
    m.set(name, c);
  }
  return m;
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
