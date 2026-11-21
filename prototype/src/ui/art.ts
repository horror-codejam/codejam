// Art slots: a real render from prototype/assets/ if one exists, otherwise a coded placeholder.
// See prototype/assets/README.md for the slot names.

import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { H, W } from "./layout";

const files = import.meta.glob("../../assets/*.{png,webp,jpg,jpeg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const urlBySlot = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop()!.replace(/\.(png|webp|jpe?g)$/i, "");
  urlBySlot.set(name, url);
}

const textures = new Map<string, Texture>();

export async function loadArt(): Promise<string[]> {
  const loaded: string[] = [];
  for (const [slot, url] of urlBySlot) {
    try {
      textures.set(slot, await Assets.load<Texture>(url));
      loaded.push(slot);
    } catch (err) {
      console.warn(`art slot ${slot} failed to load`, err);
    }
  }
  return loaded;
}

export function hasArt(slot: string): boolean {
  return textures.has(slot);
}

// Returns a container holding either the render (scaled to cover the stage) or the placeholder.
export function slot(name: string, placeholder: (g: Graphics) => void): Container {
  const c = new Container();
  c.label = name;
  const tex = textures.get(name);
  if (tex) {
    const s = new Sprite(tex);
    const k = Math.max(W / tex.width, H / tex.height);
    s.scale.set(k);
    s.x = (W - tex.width * k) / 2;
    s.y = (H - tex.height * k) / 2;
    c.addChild(s);
  } else {
    const g = new Graphics();
    placeholder(g);
    c.addChild(g);
  }
  return c;
}
