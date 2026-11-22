// Art slots. Each slot resolves, in order, to:
//   1. prototype/assets/<slot>.(png|webp|jpg)   manual override, see prototype/assets/README.md
//   2. a final render in scenes/03-watch-room/final/webp/, by job name (`tell_window_on`) or through FINAL_ALIASES
//      for the older slot names (`view_window` -> `view_window_off`). Made by tools/convert_renders.mjs.
//   3. the team's earlier render in scenes/ listed in SCENE_ART below
//   4. a coded placeholder
// Plates (views) are 2:1 stills (finals 1920 x 960) cover-fitted to PLATE_W x PLATE_H; overlays use the same frame.
// Frame sequences (final/webp/<job>/<job>_0001.webp ...) load as ordered texture lists: artFrames(job).

import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { H, PLATE_H, PLATE_W, W } from "./layout";
import { FINAL_ALIASES } from "./plates";

const overrides = import.meta.glob("../../assets/*.{png,webp,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;

const sceneFiles = import.meta.glob(
  [
    "../../../scenes/03-watch-room/render_blockout_cam_*.png",
    "../../../scenes/03-watch-room/render_hold_*.png",
    "../../../scenes/03-watch-room/render_dash_floor.png",
    "../../../scenes/03-watch-room/final/png/title_bg/title_bg.png",
    "../../../scenes/03-watch-room/chud_smiley_four_moods.png",
    "../../../scenes/03-watch-room/chud_launch_newspaper_clipping_v2.png",
    "../../../scenes/03-watch-room/daniel_vale_notebook.jpg",
    "../../../scenes/03-watch-room/leaving_calendar_aged_pen.png",
    "../../../scenes/04-ram/*.png",
    "../../../scenes/99-final-cage-hall/render_*.png",
    "../../../scenes/01-shipwreck/render_blockout.png",
  ],
  { eager: true, import: "default" },
) as Record<string, string>;
const videoFiles = import.meta.glob("../../../scenes/03-watch-room/final/title_loop.webm", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

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
  title_bg: "03-watch-room/final/png/title_bg/title_bg.png",
  chud_faces: "03-watch-room/chud_smiley_four_moods.png",
  // desk artifacts (DOM only: the hotspot thumbnail and the reading view)
  artifact_clipping: "03-watch-room/chud_launch_newspaper_clipping_v2.png",
  artifact_notebook: "03-watch-room/daniel_vale_notebook.jpg",
  artifact_calendar: "03-watch-room/leaving_calendar_aged_pen.png",
  // Ram after a silent breach: the creepy flash (960 x 480 plates from the entry cameras) and the jumpscare (1280 x 720)
  ram_inside_window: "04-ram/ram_inside_window.png",
  ram_inside_hatch: "04-ram/ram_inside_hatch.png",
  ram_inside_balcony: "04-ram/ram_inside_balcony.png",
  ram_jumpscare_1: "04-ram/ram_jumpscare_1.png",
  ram_jumpscare_2: "04-ram/ram_jumpscare_2.png",
  ram_jumpscare_3: "04-ram/ram_jumpscare_3.png",
  ram_jumpscare_4: "04-ram/ram_jumpscare_4.png",
  ending_lose: "99-final-cage-hall/render_lose_in_cage.png",
  ending_win: "99-final-cage-hall/render_win_outside.png",
  intro: "01-shipwreck/render_blockout.png",
};

// Final renders (WebP, committed). Stills: final/webp/<job>.webp. Sequences: final/webp/<job>/<job>_0001.webp ...
// Eager glob of URLs only (nothing is fetched until loadArt): new files are picked up on the next dev reload or build.
const finalFiles = import.meta.glob("../../../scenes/03-watch-room/final/webp/**/*.webp", { eager: true, import: "default" }) as Record<string, string>;
const finalStills = new Map<string, string>(); // job -> url
const finalSeqs = new Map<string, string[]>(); // job -> frame urls in order (only sequences numbered 0001.. without gaps)
{
  const frames = new Map<string, { n: number; url: string }[]>();
  for (const [path, url] of Object.entries(finalFiles)) {
    const m = /final\/webp\/(?:([^/]+)\/)?([^/]+)\.webp$/.exec(path);
    if (!m) continue;
    const [, folder, name] = m;
    if (!folder) {
      finalStills.set(name, url);
      continue;
    }
    if (!name.startsWith(`${folder}_`)) continue;
    const n = Number(name.slice(folder.length + 1));
    if (!Number.isInteger(n) || n < 1) continue;
    const list = frames.get(folder) ?? [];
    list.push({ n, url });
    frames.set(folder, list);
  }
  for (const [job, list] of frames) {
    list.sort((a, b) => a.n - b.n);
    if (list.every((fr, i) => fr.n === i + 1)) finalSeqs.set(job, list.map((fr) => fr.url));
    else console.warn(`final sequence ${job} has missing frames, ignored`);
  }
}

const urlBySlot = new Map<string, string>();
const finalSlots = new Set<string>(); // slots that resolved to a final render (already graded: no night grade on top)
for (const [slotName, suffix] of Object.entries(SCENE_ART)) {
  const hit = Object.entries(sceneFiles).find(([p]) => p.endsWith(suffix));
  if (hit) urlBySlot.set(slotName, hit[1]);
}
for (const [job, url] of finalStills) {
  urlBySlot.set(job, url);
  finalSlots.add(job);
}
for (const [slotName, job] of Object.entries(FINAL_ALIASES)) {
  const url = finalStills.get(job);
  if (!url) continue;
  urlBySlot.set(slotName, url);
  finalSlots.add(slotName);
}
for (const [path, url] of Object.entries(overrides)) {
  const slotName = path.split("/").pop()!.replace(/\.(png|webp|jpe?g)$/i, "");
  urlBySlot.set(slotName, url);
  finalSlots.delete(slotName);
}
const titleLoop = Object.values(videoFiles)[0];
if (titleLoop) urlBySlot.set("title_loop", titleLoop);

const textures = new Map<string, Texture>();
const frameTextures = new Map<string, Texture[]>();
const DOM_ONLY = /^(artifact_|title_loop$)/; // DOM only, never loaded as a texture: artifacts (<img>) and the title video

// URL of a slot for DOM use (faces, ending backgrounds, title_bg). Null if the slot has no art yet.
export function artUrl(slotName: string): string | null {
  return urlBySlot.get(slotName) ?? null;
}

// Frame URLs of a final sequence (e.g. `jumpscare_window`, `title_loop`), in order. Empty if not rendered yet.
export function artFrameUrls(job: string): string[] {
  return finalSeqs.get(job) ?? [];
}

// Preload progress for a loading screen: files done (loaded or failed) out of total. Updated by loadArt.
export const artProgress = { done: 0, total: 0 };

// Loads every texture slot and every final sequence frame. Boot awaits it, so every final is in memory before a night
// starts. Resolves with the loaded slot names (sequences listed as `<job>[frames]`). `onProgress` fires after each file.
export async function loadArt(onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const loaded: string[] = [];
  const stills = [...urlBySlot].filter(([slotName]) => !DOM_ONLY.test(slotName));
  const seqs = [...finalSeqs];
  artProgress.done = 0;
  artProgress.total = stills.length + seqs.reduce((n, [, urls]) => n + urls.length, 0);
  onProgress?.(0, artProgress.total);
  const tick = (): void => {
    artProgress.done++;
    onProgress?.(artProgress.done, artProgress.total);
  };
  const stillJobs = stills.map(async ([slotName, url]) => {
    try {
      textures.set(slotName, await Assets.load<Texture>(url));
      loaded.push(slotName);
    } catch (err) {
      console.warn(`art slot ${slotName} failed to load`, err);
    } finally {
      tick();
    }
  });
  const seqJobs = seqs.map(async ([job, urls]) => {
    const list = await Promise.all(
      urls.map(async (url): Promise<Texture | null> => {
        try {
          return await Assets.load<Texture>(url);
        } catch (err) {
          console.warn(`frame ${url} failed to load`, err);
          return null;
        } finally {
          tick();
        }
      }),
    );
    if (list.every((tx) => tx !== null)) {
      frameTextures.set(job, list as Texture[]);
      loaded.push(`${job}[${list.length}]`);
    }
  });
  await Promise.all([...stillJobs, ...seqJobs]);
  return loaded.sort();
}

export function hasArt(slotName: string): boolean {
  return textures.has(slotName);
}

// True when the slot shows a final render (already lit and graded in Blender: no night grade, no light wash).
export function isFinal(slotName: string): boolean {
  return finalSlots.has(slotName) && textures.has(slotName);
}

// Loaded frames of a final sequence, in order. Empty if the sequence is missing or failed to load.
export function artFrames(job: string): Texture[] {
  return frameTextures.get(job) ?? [];
}

// A sprite cover-fitted into a w x h box. For sequences, swap `.texture`: the fit holds while every frame has one size.
export function coverSprite(tex: Texture, w: number, h: number): Sprite {
  const s = new Sprite(tex);
  const k = Math.max(w / tex.width, h / tex.height);
  s.scale.set(k);
  s.x = (w - tex.width * k) / 2;
  s.y = (h - tex.height * k) / 2;
  return s;
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

// A stage-sized container (1280 x 720): the art scaled to cover the stage, centered, or the placeholder drawn in stage px.
export function stageSlot(name: string, placeholder: (g: Graphics) => void): Container {
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
