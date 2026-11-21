// Coded stand-ins for every art slot. Each one is replaced by a render of the same slot name
// dropped into prototype/assets/. Keep them simple and dark: they exist to make the loop readable.

import type { Graphics } from "pixi.js";
import type { Entry } from "../sim/types";
import { CRT, H, W } from "./layout";

const STONE = 0x1a1e24;
const STONE_DARK = 0x0d1014;
const NIGHT = 0x06090f;
const RIM = 0x2c333d;
const AMBER = 0xffc46b;

export function deskView(g: Graphics): void {
  g.rect(0, 0, W, H).fill(STONE_DARK);
  // ocean-facing glazing behind the desk
  g.rect(120, 40, W - 240, 360).fill(NIGHT).stroke({ width: 6, color: RIM });
  for (let x = 120 + 260; x < W - 120; x += 260) g.rect(x - 3, 40, 6, 360).fill(RIM);
  g.rect(120, 300, W - 240, 100).fill({ color: 0x0b1622 }); // sea
  // desk surface
  g.poly([0, 470, W, 470, W, H, 0, H]).fill(0x141210);
  g.poly([60, 440, W - 60, 440, W, 470, 0, 470]).fill(0x1d1915);
  // CRT body around the coded face
  g.roundRect(CRT.x - 30, CRT.y - 26, CRT.w + 60, CRT.h + 70, 18).fill(0x22262b).stroke({ width: 2, color: 0x30363d });
  g.rect(CRT.x + CRT.w / 2 - 50, CRT.y + CRT.h + 44, 100, 40).fill(0x1b1e22);
}

export function entryView(entry: Entry, lit: boolean): (g: Graphics) => void {
  return (g) => {
    const wall = lit ? 0x2f3742 : STONE;
    g.rect(0, 0, W, H).fill(wall);
    if (entry === "WINDOW") {
      g.roundRect(440, 70, 400, 540, 200).fill(lit ? 0x24384f : NIGHT).stroke({ width: 14, color: lit ? 0x56606b : RIM });
      g.rect(634, 70, 12, 540).fill(lit ? 0x56606b : RIM);
      g.rect(440, 330, 400, 12).fill(lit ? 0x56606b : RIM);
      for (let i = 0; i < 26; i++) {
        const x = 460 + ((i * 97) % 360);
        const y = 120 + ((i * 53) % 420);
        g.rect(x, y, 2, 30 + (i % 4) * 10).fill({ color: 0x8aa4c0, alpha: lit ? 0.35 : 0.12 });
      }
      g.rect(420, 610, 440, 30).fill(lit ? 0x3a3f45 : 0x15181c);
    } else if (entry === "HATCH") {
      g.poly([0, 300, W, 300, W, H, 0, H]).fill(lit ? 0x2a2620 : 0x110f0d); // floor
      g.poly([430, 420, 850, 420, 920, 640, 360, 640]).fill(lit ? 0x4a3b2a : 0x1a150f).stroke({ width: 6, color: lit ? 0x6b5a45 : 0x2a231b });
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        g.moveTo(430 - 70 * t, 420 + 220 * t).lineTo(850 + 70 * t, 420 + 220 * t).stroke({ width: 2, color: 0x000000, alpha: 0.4 });
      }
      g.rect(470, 410, 40, 14).fill(0x55585c);
      g.rect(770, 410, 40, 14).fill(0x55585c);
      g.circle(640, 560, 14).stroke({ width: 5, color: 0x55585c });
    } else {
      g.rect(440, 50, 400, 600).fill(lit ? 0x1e2c3c : NIGHT).stroke({ width: 18, color: lit ? 0x4c535b : RIM });
      g.rect(440, 430, 400, 10).fill(lit ? 0x8a8f96 : 0x2b3036); // rail
      g.rect(440, 520, 400, 8).fill(lit ? 0x8a8f96 : 0x2b3036);
      for (let x = 470; x < 840; x += 45) g.rect(x, 430, 6, 220).fill(lit ? 0x7a7f86 : 0x23272c);
    }
    if (lit) {
      // the beam: one harsh amber source
      g.poly([W / 2 - 60, 0, W / 2 + 60, 0, W / 2 + 420, H, W / 2 - 420, H]).fill({ color: AMBER, alpha: 0.08 });
    }
  };
}

// Ram at the entry. Drawn opaque; the scene sets alpha for faint (no beam) vs clear (beam).
export function tell(entry: Entry): (g: Graphics) => void {
  return (g) => {
    if (entry === "WINDOW") {
      g.ellipse(600, 300, 120, 90).fill({ color: 0xc8d4e0, alpha: 0.35 }); // fog
      g.ellipse(600, 320, 42, 52).fill({ color: 0xe8eef4, alpha: 0.8 }); // palm
      const fingers: [number, number, number][] = [[548, 262, -0.5], [572, 244, -0.2], [600, 238, 0], [628, 244, 0.2], [652, 290, 0.8]];
      for (const [x, y] of fingers) g.ellipse(x, y, 11, 26).fill({ color: 0xe8eef4, alpha: 0.8 });
    } else if (entry === "HATCH") {
      g.poly([430, 420, 850, 420, 856, 438, 424, 438]).fill(0x000000); // the lid lifting: a black seam
      for (let i = 0; i < 4; i++) g.roundRect(560 + i * 34, 412, 22, 34, 9).fill(0xb89f8a);
    } else {
      g.circle(700, 360, 46).fill(0x020304); // head
      g.roundRect(620, 400, 170, 260, 60).fill(0x020304); // shoulders
      g.circle(686, 352, 5).fill({ color: 0xd8e0e8, alpha: 0.6 }); // eye glint
    }
  };
}

// Ram on his way, only visible with the beam. Small and far.
export function approach(entry: Entry): (g: Graphics) => void {
  return (g) => {
    const x = entry === "WINDOW" ? 700 : entry === "HATCH" ? 640 : 760;
    const y = entry === "WINDOW" ? 540 : entry === "HATCH" ? 500 : 600;
    g.circle(x, y - 34, 10).fill(0x000000);
    g.roundRect(x - 14, y - 24, 28, 50, 10).fill(0x000000);
    g.circle(x, y - 34, 13).stroke({ width: 2, color: AMBER, alpha: 0.5 });
  };
}

export function holdView(entry: Entry): (g: Graphics) => void {
  return (g) => {
    g.rect(0, 0, W, H).fill(0x0b0d10);
    if (entry === "WINDOW") {
      g.rect(140, 60, 1000, 560).fill(NIGHT).stroke({ width: 24, color: RIM });
      g.rect(140, 360, 1000, 20).fill(RIM);
    } else if (entry === "HATCH") {
      g.poly([80, 300, 1200, 300, 1280, 720, 0, 720]).fill(0x1a150f).stroke({ width: 8, color: 0x2a231b });
    } else {
      g.rect(200, 30, 880, 660).fill(0x15191e).stroke({ width: 26, color: RIM });
      g.rect(520, 160, 240, 200).fill(NIGHT); // door glass
    }
    // the player's forearms bracing it
    g.roundRect(250, 470, 160, 300, 60).fill(0x5a4a40);
    g.roundRect(870, 470, 160, 300, 60).fill(0x5a4a40);
    g.roundRect(240, 430, 180, 90, 40).fill(0x6b584c);
    g.roundRect(860, 430, 180, 90, 40).fill(0x6b584c);
  };
}

export function holdTell(entry: Entry): (g: Graphics) => void {
  return (g) => {
    if (entry === "WINDOW") {
      g.ellipse(640, 230, 120, 120).fill({ color: 0xc8d4e0, alpha: 0.3 });
      g.ellipse(640, 250, 60, 76).fill({ color: 0xe8eef4, alpha: 0.85 });
    } else if (entry === "HATCH") {
      g.rect(80, 296, 1120, 14).fill(0x000000);
      for (let i = 0; i < 4; i++) g.roundRect(520 + i * 60, 280, 40, 60, 16).fill(0xb89f8a);
    } else {
      g.circle(640, 250, 70).fill(0x020304);
      g.circle(620, 240, 7).fill({ color: 0xd8e0e8, alpha: 0.7 });
    }
  };
}

export function dashFloor(g: Graphics): void {
  g.rect(0, 0, W, H).fill(0x0a0908);
  for (let i = 0; i < 12; i++) g.rect(0, i * 64, W, 3).fill({ color: 0x2a231b, alpha: 0.8 });
}

export function jumpscare(entry: Entry): (g: Graphics) => void {
  return (g) => {
    g.rect(0, 0, W, H).fill(0x1a0000);
    g.circle(640, 330, entry === "HATCH" ? 300 : 260).fill(0x000000);
    g.circle(560, 290, 26).fill(0xf0f0f0);
    g.circle(720, 290, 26).fill(0xf0f0f0);
    g.ellipse(640, 450, 120, 50).fill(0x300000);
  };
}
