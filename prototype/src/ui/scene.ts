// The PixiJS side: views, hold views, the dash, CHUD's face and screen effects.
// Reads engine state every frame. Never changes game state.

import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { CONFIG } from "../config";
import type { GameEngine } from "../sim/engine";
import type { Band, Entry, View } from "../sim/types";
import { ENTRIES } from "../sim/types";
import { slot } from "./art";
import { CRT, H, W } from "./layout";
import * as P from "./placeholders";

interface EntryLayers {
  root: Container;
  dark: Container;
  lit: Container;
  tell: Container;
  approach: Container;
}

interface HoldLayers {
  root: Container;
  tell: Container;
}

const FACE_COLOR: Record<Band, number> = {
  WARM: 0x4dff88,
  HURT: 0xd6e05a,
  JEALOUS: 0xff9a3c,
  FURIOUS: 0xff3b3b,
};

export class Scene {
  private world = new Container();
  private desk = new Container();
  private face = new Graphics();
  private lightning = new Graphics();
  private entries = new Map<Entry, EntryLayers>();
  private holds = new Map<Entry, HoldLayers>();
  private dash: Container;
  private jumps = new Map<Entry, Container>();
  private fade = new Graphics();
  private grain: Sprite;
  private lastView: View | null = null;
  private turnStartedAt = -10;
  private nextLightningAt = 8;
  private lightningUntil = 0;

  speakingUntil = 0; // real seconds, set by the UI on CHUD_SAY
  jumpscare: Entry | null = null;
  onThunder: (() => void) | null = null;

  constructor(app: Application) {
    app.stage.addChild(this.world);

    this.desk.addChild(slot("view_desk", P.deskView));
    this.lightning.rect(120, 40, W - 240, 360).fill({ color: 0xcfe0ff, alpha: 1 });
    this.lightning.alpha = 0;
    this.desk.addChild(this.lightning, this.face);
    this.world.addChild(this.desk);

    for (const e of ENTRIES) {
      const k = e.toLowerCase();
      const dark = slot(`view_${k}`, P.entryView(e, false));
      const lit = slot(`view_${k}_beam`, P.entryView(e, true));
      const approach = slot(`approach_${k}`, P.approach(e));
      const tell = slot(`tell_${k}`, P.tell(e));
      const root = new Container();
      root.addChild(dark, lit, approach, tell);
      root.visible = false;
      this.world.addChild(root);
      this.entries.set(e, { root, dark, lit, tell, approach });

      const hold = new Container();
      const holdTell = slot(`hold_tell_${k}`, P.holdTell(e));
      hold.addChild(slot(`hold_${k}`, P.holdView(e)), holdTell);
      hold.visible = false;
      this.world.addChild(hold);
      this.holds.set(e, { root: hold, tell: holdTell });

      const j = slot(`jumpscare_${k}`, P.jumpscare(e));
      j.visible = false;
      app.stage.addChild(j);
      this.jumps.set(e, j);
    }

    this.dash = slot("dash_floor", P.dashFloor);
    this.dash.visible = false;
    this.world.addChild(this.dash);

    this.fade.rect(0, 0, W, H).fill(0x000000);
    this.fade.alpha = 0;
    app.stage.addChild(this.fade);

    this.grain = new Sprite(makeGrain());
    this.grain.alpha = 0.07;
    this.grain.blendMode = "add";
    app.stage.addChild(this.grain);
    app.stage.addChild(makeVignette());
  }

  update(engine: GameEngine, t: number): void {
    const s = engine.state;
    const pos = s.player.position;
    const beam = s.power.slot === "BEAM";

    // which picture is up
    const holding = pos.kind === "HOLDING" ? pos.entry : null;
    const dashing = pos.kind === "TRAVELING" || pos.kind === "RETURNING";
    const view: View = s.player.view;
    if (view !== this.lastView) {
      if (this.lastView !== null) this.turnStartedAt = t;
      this.lastView = view;
    }

    this.desk.visible = !holding && !dashing && view === "DESK";
    for (const [e, L] of this.entries) {
      const on = !holding && !dashing && view === e;
      L.root.visible = on;
      if (!on) continue;
      L.dark.visible = !beam;
      L.lit.visible = beam;
      const vis = engine.ramVisual(e);
      L.tell.visible = vis === "tell_faint" || vis === "tell_clear";
      L.tell.alpha = vis === "tell_clear" ? 1 : 0.22 + 0.08 * Math.sin(t * 9);
      L.approach.visible = vis === "approach_silhouette";
      // hatch lid shudders while he is at it
      L.root.y = e === "HATCH" && L.tell.visible ? Math.sin(t * 60) * 2 : 0;
    }
    for (const [e, L] of this.holds) {
      L.root.visible = holding === e;
      if (holding !== e) continue;
      const vis = engine.ramVisual(e);
      L.tell.visible = vis === "tell_faint" || vis === "tell_clear";
      L.tell.alpha = vis === "tell_clear" ? 1 : 0.45;
      L.root.y = L.tell.visible ? Math.sin(t * 50) * 4 : 0;
    }
    this.dash.visible = dashing;

    // camera: dash tip, shake and rise (GAME_LOGIC 6.4), otherwise a slow sway
    this.world.pivot.set(W / 2, H / 2);
    this.world.position.set(W / 2, H / 2);
    this.world.rotation = 0;
    this.world.scale.set(1);
    let black = 0;
    if (dashing) {
      const left = pos.until - s.clock.elapsed;
      const k = 1 - Math.max(0, Math.min(1, left / CONFIG.TRAVEL_TIME)); // 0..1 through the dash
      const tip = 0.2 / CONFIG.TRAVEL_TIME;
      if (k < tip) black = 1 - k / tip;
      else if (k > 1 - tip) black = (k - (1 - tip)) / tip;
      this.world.position.x += Math.sin(t * 31) * 14;
      this.world.position.y += Math.abs(Math.sin(t * 13)) * 22;
      this.world.rotation = Math.sin(t * 7) * 0.02;
    } else {
      this.world.position.x += Math.sin(t * 0.6) * 4;
      this.world.position.y += Math.sin(t * 0.43) * 3;
    }
    const turnK = (t - this.turnStartedAt) / 0.25;
    if (turnK < 1) black = Math.max(black, 1 - turnK);
    this.fade.alpha = Math.max(black * 0.95, s.phase === "PLAYING" || s.phase === "BREACH" ? 0 : 0.6);

    // lightning across the ocean glazing, desk view only (pure ambience)
    if (t > this.nextLightningAt) {
      this.lightningUntil = t + 0.12;
      this.nextLightningAt = t + 14 + Math.random() * 18;
      this.onThunder?.();
    }
    this.lightning.alpha = t < this.lightningUntil ? 0.35 : 0;

    this.drawFace(engine, t);

    for (const [e, j] of this.jumps) j.visible = this.jumpscare === e;
    if (this.jumpscare) {
      const j = this.jumps.get(this.jumpscare)!;
      j.scale.set(1 + Math.random() * 0.04);
      j.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    }

    this.grain.x = -Math.random() * 256;
    this.grain.y = -Math.random() * 256;
  }

  private drawFace(engine: GameEngine, t: number): void {
    const s = engine.state;
    const g = this.face;
    g.clear();
    const { x, y, w, h } = CRT;
    g.rect(x, y, w, h).fill(0x020604);
    const cx = x + w / 2;
    const cy = y + h / 2 - 10;

    if (!s.power.chudOnline) {
      if (s.power.rebootingUntil !== null && Math.floor(t * 2) % 2 === 0) {
        const left = Math.max(0, s.power.rebootingUntil - s.clock.elapsed);
        const k = 1 - left / CONFIG.REBOOT_TIME;
        g.rect(cx - 100, cy + 30, 200 * k, 8).fill(0x2a7a46);
        g.rect(cx - 100, cy + 30, 200, 8).stroke({ width: 1, color: 0x2a7a46 });
      }
      this.scanlines(g);
      return;
    }

    const band = s.chud.band;
    const col = FACE_COLOR[band];
    const flicker = band === "FURIOUS" ? (Math.random() < 0.15 ? 0.4 : 1) : 1;
    const a = 0.95 * flicker;
    const talking = t < this.speakingUntil;
    const mouthOpen = talking ? 6 + Math.abs(Math.sin(t * 18)) * 12 : 0;
    const blink = Math.sin(t * 0.9) > 0.985;

    const eye = (ex: number, slant: number): void => {
      if (blink) {
        g.rect(ex - 24, cy - 30, 48, 4).fill({ color: col, alpha: a });
        return;
      }
      if (band === "WARM") g.circle(ex, cy - 30, 20).fill({ color: col, alpha: a });
      else if (band === "HURT") {
        g.circle(ex, cy - 26, 18).fill({ color: col, alpha: a });
        g.rect(ex - 22, cy - 50, 44, 22).fill(0x020604); // droopy lids
      } else {
        g.poly([ex - 26, cy - 30 - slant * 10, ex + 26, cy - 30 + slant * 10, ex + 26, cy - 22 + slant * 10, ex - 26, cy - 22 - slant * 10]).fill({ color: col, alpha: a });
        if (band === "FURIOUS") g.rect(ex - 30, cy - 62 + slant * 12, 60, 6).fill({ color: col, alpha: a });
      }
    };
    eye(cx - 70, band === "JEALOUS" || band === "FURIOUS" ? 1 : 0);
    eye(cx + 70, band === "JEALOUS" || band === "FURIOUS" ? -1 : 0);

    const my = cy + 50;
    if (band === "WARM") {
      g.moveTo(cx - 60, my).quadraticCurveTo(cx, my + 34 + mouthOpen, cx + 60, my).stroke({ width: 6, color: col, alpha: a });
    } else if (band === "HURT") {
      g.moveTo(cx - 50, my + 14).quadraticCurveTo(cx, my - 6 - mouthOpen * 0.3, cx + 50, my + 14).stroke({ width: 6, color: col, alpha: a });
    } else if (band === "JEALOUS") {
      g.moveTo(cx - 60, my);
      for (let i = 1; i <= 6; i++) g.lineTo(cx - 60 + i * 20, my + (i % 2 ? 6 : -6) + (talking ? Math.sin(t * 20 + i) * 4 : 0));
      g.stroke({ width: 5, color: col, alpha: a });
    } else {
      g.moveTo(cx - 70, my + 10);
      for (let i = 1; i <= 7; i++) g.lineTo(cx - 70 + i * 20, my + (i % 2 ? -12 : 12) + mouthOpen * 0.4);
      g.stroke({ width: 6, color: col, alpha: a });
    }
    // glow
    g.rect(x, y, w, h).fill({ color: col, alpha: 0.05 });
    this.scanlines(g);
  }

  private scanlines(g: Graphics): void {
    const { x, y, w, h } = CRT;
    for (let yy = y; yy < y + h; yy += 4) g.rect(x, yy, w, 1).fill({ color: 0x000000, alpha: 0.35 });
  }
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
