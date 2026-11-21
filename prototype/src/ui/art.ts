// Art slots. Each slot resolves, in order, to:
//   1. prototype/assets/<slot>.(png|webp|jpg)   manual override, see prototype/assets/README.md
//   2. the team's render in scenes/ listed in SCENE_ART below (picked up automatically when re-rendered)
//   3. a coded placeholder
// Plates (views) are 2:1 stills fitted to PLATE_W x PLATE_H; overlays use the same frame.

import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { H, PLATE_H, PLATE_W, W } from "./layout";

const overrides = import.meta.glob("../../assets/*.{png,webp,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;

const sceneFiles = import.meta.glob(
  [
    "../../../scenes/03-watch-room/render_blockout_cam_*.png",
    "../../../scenes/03-watch-room/render_hold_*.png",
    "../../../scenes/03-watch-room/render_dash_floor.png",
    "../../../scenes/03-watch-room/chud_smiley_four_moods.png",
    "../../../scenes/99-final-cage-hall/render_*.png",
    "../../../scenes/01-shipwreck/render_blockout.png",
  ],
  { eager: true, import: "default" },
) as Record<string, string>;

// slot -> file in scenes/ (path suffix)
const SCENE_ART: Record<string, string> = {
  view_desk: "03-watch-room/render_blockout_cam_desk.png",
  view_window: "03-watch-room/render_blockout_cam_window.png",
  view_hatch: "03-watch-room/render_blockout_cam_hatch.png",
  view_balcony: "03-watch-room/render_blockout_cam_balcony.png",
  hold_window: "03-watch-room/render_hold_window.png",
  hold_hatch: "03-watch-room/render_hold_hatch.png",
  hold_balcony: "03-watch-room/render_hold_balcony.png",
  dash_floor: "03-watch-room/render_dash_floor.png",
  chud_faces: "03-watch-room/chud_smiley_four_moods.png",
  ending_lose: "99-final-cage-hall/render_lose_in_cage.png",
  ending_win: "99-final-cage-hall/render_win_outside.png",
  intro: "01-shipwreck/render_blockout.png",
};

const urlBySlot = new Map<string, string>();
for (const [slotName, suffix] of Object.entries(SCENE_ART)) {
  const hit = Object.entries(sceneFiles).find(([p]) => p.endsWith(suffix));
  if (hit) urlBySlot.set(slotName, hit[1]);
}
for (const [path, url] of Object.entries(overrides)) {
  urlBySlot.set(path.split("/").pop()!.replace(/\.(png|webp|jpe?g)$/i, ""), url);
}

const textures = new Map<string, Texture>();

// URL of a slot for DOM use (faces, ending backgrounds). Null if the slot has no art yet.
export function artUrl(slotName: string): string | null {
  return urlBySlot.get(slotName) ?? null;
}

export async function loadArt(): Promise<string[]> {
  const loaded: string[] = [];
  await Promise.all(
    [...urlBySlot].map(async ([slotName, url]) => {
      try {
        textures.set(slotName, await Assets.load<Texture>(url));
        loaded.push(slotName);
      } catch (err) {
        console.warn(`art slot ${slotName} failed to load`, err);
      }
    }),
  );
  return loaded.sort();
}

export function hasArt(slotName: string): boolean {
  return textures.has(slotName);
}

// A plate-sized container: the render fitted to the plate, or the placeholder.
// `placeholderSpace`: "stage" placeholders are drawn for 1280 x 720 and scaled into the plate,
// "plate" placeholders (overlays) are drawn directly in plate px.
export function slot(name: string, placeholder: (g: Graphics) => void, placeholderSpace: "stage" | "plate" = "plate"): Container {
  const c = new Container();
  c.label = name;
  const tex = textures.get(name);
  if (tex) {
    const s = new Sprite(tex);
    const k = Math.max(PLATE_W / tex.width, PLATE_H / tex.height);
    s.scale.set(k);
    s.x = (PLATE_W - tex.width * k) / 2;
    s.y = (PLATE_H - tex.height * k) / 2;
    c.addChild(s);
  } else {
    const g = new Graphics();
    placeholder(g);
    if (placeholderSpace === "stage") {
      const k = PLATE_W / W;
      g.scale.set(k);
      g.y = (PLATE_H - H * k) / 2;
    }
    c.addChild(g);
  }
  return c;
}
