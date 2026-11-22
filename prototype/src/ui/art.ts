// Art slots. Each slot resolves, in order, to:
//   1. a final render in scenes/03-watch-room/final/webp/, by job name (`tell_window_on`) or through FINAL_ALIASES
//      for the older slot names (`view_window` -> `view_window_off`). Made by tools/convert_renders.mjs.
//   2. prototype/assets/<slot>.(png|webp|jpg)   if the final is missing, see prototype/assets/README.md
//   3. the team's earlier render in scenes/ listed in SCENE_ART below
//   4. a coded placeholder
// Plates are 2:1 stills. Only jumpscares are loaded as ordered frame textures. Other sequences are videos.

import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { ENTRIES } from "../sim/types";
import { H, PLATE_H, PLATE_W, W } from "./layout";
import { entryPlate, FINAL_ALIASES, holdPlate, JUMPSCARE_MIN_FRAMES, jumpscareJob } from "./plates";

const overrides = import.meta.glob("../../assets/*.{png,webp,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;

const sceneFiles = import.meta.glob(
  [
    "../../../scenes/03-watch-room/render_blockout_cam_*.png",
    "../../../scenes/03-watch-room/render_hold_*.png",
    "../../../scenes/03-watch-room/final/png/title_bg/title_bg.png",
    "../../../scenes/03-watch-room/chud_smiley_four_moods.png",
    "../../../scenes/04-ram/*.png",
  ],
  { eager: true, import: "default" },
) as Record<string, string>;
const videoFiles = import.meta.glob([
  "../../../scenes/03-watch-room/final/title_loop.webm",
  "../../../scenes/03-watch-room/final/webm/*.webm",
], {
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
  title_bg: "03-watch-room/final/png/title_bg/title_bg.png",
  chud_faces: "03-watch-room/chud_smiley_four_moods.png",
  // Ram after a silent breach: the creepy flash (960 x 480 plates from the entry cameras) and the jumpscare (1280 x 720)
  ram_inside_window: "04-ram/ram_inside_window.png",
  ram_inside_hatch: "04-ram/ram_inside_hatch.png",
  ram_inside_balcony: "04-ram/ram_inside_balcony.png",
  ram_jumpscare_1: "04-ram/ram_jumpscare_1.png",
  ram_jumpscare_2: "04-ram/ram_jumpscare_2.png",
  ram_jumpscare_3: "04-ram/ram_jumpscare_3.png",
  ram_jumpscare_4: "04-ram/ram_jumpscare_4.png",
};

// Final renders (WebP, committed). Stills: final/webp/<job>.webp. Sequences: final/webp/<job>/<job>_0001.webp ...
// Eager glob of URLs only (nothing is fetched until loadArt): new files are picked up on the next dev reload or build.
const finalFiles = import.meta.glob([
  "../../../scenes/03-watch-room/final/webp/*.webp",
  "../../../scenes/03-watch-room/final/webp/jumpscare_{window,hatch,balcony}/*.webp",
], { eager: true, import: "default" }) as Record<string, string>;
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
    if (list.length >= JUMPSCARE_MIN_FRAMES && list.every((fr, i) => fr.n === i + 1)) {
      finalSeqs.set(job, list.map((fr) => fr.url));
    }
  }
}

const urlBySlot = new Map<string, string>();
const finalSlots = new Set<string>(); // slots that resolved to a final render (already graded: no night grade on top)
for (const [slotName, suffix] of Object.entries(SCENE_ART)) {
  const hit = Object.entries(sceneFiles).find(([p]) => p.endsWith(suffix));
  if (hit) urlBySlot.set(slotName, hit[1]);
}
for (const [path, url] of Object.entries(overrides)) {
  const slotName = path.split("/").pop()!.replace(/\.(png|webp|jpe?g)$/i, "");
  urlBySlot.set(slotName, url);
}
for (const [job, url] of finalStills) {
  urlBySlot.set(job, url);
  finalSlots.add(job);
}
for (const [slotName, job] of Object.entries(FINAL_ALIASES)) {
  const url = finalStills.get(job) ?? urlBySlot.get(job);
  if (!url) continue;
  urlBySlot.set(slotName, url);
  if (finalStills.has(job)) finalSlots.add(slotName);
}
const videos = new Map(Object.entries(videoFiles).map(([path, url]) => [
  path.split("/").pop()!.slice(0, -".webm".length), url,
]));

const textures = new Map<string, Texture>();
const frameTextures = new Map<string, Texture[]>();
const DOM_ONLY = /^artifact_/;
const LEGACY_SCARE = /^ram_jumpscare_[1-4]$/;

// URL of a slot for DOM use. Null if the slot has no art yet.
export function artUrl(slotName: string): string | null {
  return urlBySlot.get(slotName) ?? null;
}

// A URL only. The title and desk request their loops when they become visible.
export function artVideoUrl(job: string): string | null {
  return videos.get(job) ?? null;
}

// Preload progress for a loading screen: files done (loaded or failed) out of total. Updated by loadArt.
export const artProgress = { done: 0, total: 0 };

// Preload stills and jumpscares for instant plate changes. Videos are loaded on demand.
export async function loadArt(onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const loaded: string[] = [];
  const allStills = [...urlBySlot].filter(([slotName]) => !DOM_ONLY.test(slotName));
  const legacyScares = allStills.filter(([slotName]) => LEGACY_SCARE.test(slotName));
  const haveAllScares = finalSeqs.size === 3;
  const stills = haveAllScares ? allStills.filter(([slotName]) => !LEGACY_SCARE.test(slotName)) : allStills;
  const seqs = [...finalSeqs];
  artProgress.done = 0;
  artProgress.total = stills.length + seqs.reduce((n, [, urls]) => n + urls.length, 0);
  onProgress?.(0, artProgress.total);
  const tick = (): void => {
    artProgress.done++;
    onProgress?.(artProgress.done, artProgress.total);
  };
  const loadStill = async ([slotName, url]: [string, string]): Promise<void> => {
    try {
      textures.set(slotName, await Assets.load<Texture>(url));
      loaded.push(slotName);
    } catch (err) {
      console.warn(`art slot ${slotName} failed to load`, err);
    } finally {
      tick();
    }
  };
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
  await Promise.all([...stills.map(loadStill), ...seqJobs]);
  if (haveAllScares && frameTextures.size < finalSeqs.size) {
    artProgress.total += legacyScares.length;
    onProgress?.(artProgress.done, artProgress.total);
    await Promise.all(legacyScares.map(loadStill));
  }
  if (import.meta.env.DEV) warnPrototypeFallbacks();
  return loaded.sort();
}

function warnPrototypeFallbacks(): void {
  const fallback = ["view_desk_off", ...ENTRIES.flatMap((entry) => [
    entryPlate(entry, false, "none"), entryPlate(entry, true, "none"),
    entryPlate(entry, false, "tell_faint"), entryPlate(entry, true, "tell_clear"),
    entryPlate(entry, true, "approach_silhouette"), entryPlate(entry, true, "inside"),
    ...[false, true].flatMap((brace) => [false, true].flatMap((tell) => [false, true].map((lit) => holdPlate(entry, brace, tell, lit)))),
  ])].filter((name) => !isFinal(name));
  for (const entry of ENTRIES) {
    const job = jumpscareJob(entry);
    if (!frameTextures.has(job)) fallback.push(job);
    const key = entry.toLowerCase();
    for (const turn of [`turn_desk_${key}`, `turn_${key}_desk`]) {
      if (!artVideoUrl(turn)) fallback.push(turn);
    }
  }
  if (!artVideoUrl("ambient_desk")) fallback.push("ambient_desk");
  if (!hasArt("chud_faces")) {
    fallback.push("chud_faces");
    if (!hasArt("chud_face_malicious")) fallback.push("chud_face_malicious");
  }
  if (fallback.length) console.warn("Visual slots using prototype fallbacks:", fallback.join(", "));
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
