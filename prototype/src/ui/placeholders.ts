// Coded stand-ins for every art slot. Each one is replaced by a render of the same slot name
// (prototype/assets/ override or the team's render in scenes/, see art.ts). Keep them simple and dark:
// they exist to make the loop readable.
//
// Two coordinate spaces:
//   - "stage" placeholders (full views, the first group below) are drawn for 1280 x 720 and scaled
//     0.75 into the 960 x 480 plate by art.ts (plate = stage * 0.75 - 30 in y).
//   - "plate" overlays (the `onRender*` group at the bottom) are drawn in plate px on top of the
//     team's renders, using the geometry listed in prototype/HANDOFF_V3.md.

import type { Graphics } from "pixi.js";
import type { Entry } from "../sim/types";
import { DESK_SCREEN, H, PLATE_H, PLATE_W, W } from "./layout";

// DESK_SCREEN mapped back into stage space for the desk placeholder.
const PK = PLATE_W / W; // 0.75
const PY = (PLATE_H - H * PK) / 2; // -30
const SCREEN_STAGE = {
  x: DESK_SCREEN.x / PK,
  y: (DESK_SCREEN.y - PY) / PK,
  w: DESK_SCREEN.w / PK,
  h: DESK_SCREEN.h / PK,
};

const STONE = 0x1a1e24;
const STONE_DARK = 0x0d1014;
const NIGHT = 0x06090f;
const RIM = 0x2c333d;
const AMBER = 0xffc46b;

export function deskView(g: Graphics): void {
  g.rect(0, 0, W, H).fill(STONE_DARK);
  // ocean-facing glazing behind the desk
  // ocean-facing glazing behind the desk (DESK_GLAZING)
  g.rect(0, 40, W, 280).fill(NIGHT).stroke({ width: 6, color: RIM });
  for (let x = 320; x < W; x += 320) g.rect(x - 3, 40, 6, 280).fill(RIM);
  g.rect(0, 240, W, 80).fill({ color: 0x0b1622 }); // sea
  // desk surface
  g.poly([0, 380, W, 380, W, H, 0, H]).fill(0x141210);
  // console body around CHUD's terminal (the DOM terminal sits on DESK_SCREEN)
  const sc = SCREEN_STAGE;
  g.roundRect(sc.x - 16, sc.y - 14, sc.w + 32, sc.h + 28, 10).fill(0x22262b).stroke({ width: 2, color: 0x30363d });
  g.rect(sc.x, sc.y, sc.w, sc.h).fill(0x020604);
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

// ---------------------------------------------------------------------------
// Overlays on the team's renders, in plate px (960 x 480). Geometry from the renders:
//   window view: twin panes x 360-588, y 80-285
//   hatch view: lid quad (385,207) (573,207) (600,284) (360,284)
//   balcony view: door x 424-535, y 131-385
//   hold_window: panes x 245-715, y 40-440; hold_hatch: lid quad top y 50, bottom y 430;
//   hold_balcony: door fills x 120-840

// The beam lighting the entry: a pale amber wash on the glass or door, drawn additive by the scene.
export function onRenderLit(entry: Entry): (g: Graphics) => void {
  return (g) => {
    if (entry === "WINDOW") {
      g.rect(368, 88, 92, 188).fill({ color: AMBER, alpha: 0.22 });
      g.rect(486, 84, 94, 194).fill({ color: AMBER, alpha: 0.22 });
      g.poly([360, 285, 588, 285, 700, 420, 250, 420]).fill({ color: AMBER, alpha: 0.05 }); // spill on the floor
    } else if (entry === "HATCH") {
      g.poly([385, 207, 573, 207, 600, 284, 360, 284]).fill({ color: AMBER, alpha: 0.18 });
      g.poly([300, 150, 660, 150, 760, 330, 200, 330]).fill({ color: AMBER, alpha: 0.05 });
    } else {
      g.rect(424, 131, 111, 254).stroke({ width: 3, color: AMBER, alpha: 0.35 });
      g.poly([424, 385, 535, 385, 640, 470, 320, 470]).fill({ color: AMBER, alpha: 0.08 });
    }
  };
}

// Ram at the entry (AT_ENTRY). Opaque; the scene sets alpha for faint vs clear.
export function onRenderTell(entry: Entry): (g: Graphics) => void {
  return (g) => {
    if (entry === "WINDOW") {
      g.ellipse(414, 176, 42, 50).fill({ color: 0xc8d4e0, alpha: 0.35 }); // breath fog on the left pane
      g.ellipse(414, 186, 15, 19).fill({ color: 0xe8eef4, alpha: 0.85 }); // palm
      const fingers: [number, number][] = [[396, 162], [405, 155], [415, 152], [425, 155], [436, 172]];
      for (const [x, y] of fingers) g.ellipse(x, y, 4, 9).fill({ color: 0xe8eef4, alpha: 0.85 });
    } else if (entry === "HATCH") {
      g.poly([385, 207, 573, 207, 575, 214, 383, 214]).fill(0x000000); // the lid lifting: a black seam
      for (let i = 0; i < 4; i++) g.roundRect(452 + i * 14, 201, 9, 14, 4).fill(0xb89f8a);
    } else {
      g.rect(424, 131, 16, 254).fill(0x000000); // the door pushed ajar: a black gap
      g.circle(434, 196, 13).fill(0x020304); // head in the gap
      g.circle(431, 193, 2).fill({ color: 0xd8e0e8, alpha: 0.7 }); // eye glint
    }
  };
}

// Ram on his way, only visible with the beam. Small, outside the glass or beyond the entry.
export function onRenderApproach(entry: Entry): (g: Graphics) => void {
  return (g) => {
    const [x, y, s] = entry === "WINDOW" ? [520, 262, 0.7] : entry === "HATCH" ? [480, 262, 0.6] : [480, 300, 0.8];
    g.circle(x, y - 24 * s, 8 * s).fill(0x000000);
    g.roundRect(x - 10 * s, y - 16 * s, 20 * s, 36 * s, 7 * s).fill(0x000000);
    g.circle(x, y - 24 * s, 11 * s).stroke({ width: 1.5, color: AMBER, alpha: 0.5 });
  };
}

export function onRenderHoldTell(entry: Entry): (g: Graphics) => void {
  return (g) => {
    if (entry === "WINDOW") {
      g.ellipse(360, 210, 80, 90).fill({ color: 0xc8d4e0, alpha: 0.3 });
      g.ellipse(360, 225, 40, 52).fill({ color: 0xe8eef4, alpha: 0.85 });
      const fingers: [number, number][] = [[318, 172], [342, 158], [366, 154], [390, 160], [414, 198]];
      for (const [x, y] of fingers) g.ellipse(x, y, 10, 22).fill({ color: 0xe8eef4, alpha: 0.85 });
    } else if (entry === "HATCH") {
      g.poly([130, 422, 830, 422, 834, 436, 126, 436]).fill(0x000000); // seam at the near edge
      for (let i = 0; i < 4; i++) g.roundRect(400 + i * 44, 404, 30, 42, 12).fill(0xb89f8a);
    } else {
      g.poly([120, 0, 175, 0, 230, 480, 180, 480]).fill(0x000000); // the door forced open a crack
      g.circle(185, 170, 34).fill(0x020304);
      g.circle(178, 162, 5).fill({ color: 0xd8e0e8, alpha: 0.7 });
    }
  };
}
