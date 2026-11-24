// Art slots and rotating-beam asset pipeline.
// Watch-room views load from scenes/03-watch-room/final_beam/ (manifest.json + dark/beam/bounce/angles/hazeDepth).
// Title, dash floor, jumpscare sequences, UI sprites and fallbacks resolve from final/webp/, assets/, and scenes/.

import { Assets, Container, Graphics, ImageSource, Sprite, Texture } from "pixi.js";
import rawBeamManifest from "../../../scenes/03-watch-room/final_beam/manifest.json";
import { ENTRIES, type Entry } from "../sim/types";
import { H, PLATE_H, PLATE_W, W } from "./layout";
import { beamSlot, FINAL_ALIASES, holdPlateSlot, JUMPSCARE_MIN_FRAMES, jumpscareJob } from "./plates";

export interface BeamSlotMeta {
  slot: string;
  state: string;
  entry: string | null;
  camera: string;
  darkBase: string;
  width: number;
  height: number;
  previewAzimuth: number;
  position: [number, number, number];
  rayOrigin: [number, number, number];
  rayAcross: [number, number, number];
  rayDown: [number, number, number];
  bounce?: { azimuth: number; gain: number };
  files: {
    dark: string;
    beam: string;
    angles: string;
    hazeDepth: string;
    bounce?: string;
  };
}

export interface BeamManifest {
  version: number;
  lamp: {
    position: [number, number, number];
    tilt: number;
    width: number;
    height: number;
    softness: number;
    periodSeconds: number;
    phaseAzimuth: number;
    entryTellAzimuths: { window: number; hatch: number; balcony: number };
  };
  darkGain: number;
  ambientHighlights: { knee: number; headroom: number };
  colorShaper: number;
  haze: {
    linearColor: [number, number, number];
    samples: number;
    rangeMeters: number;
  };
  grade: { lut: string; vignette: string };
  slots: Record<string, BeamSlotMeta>;
}

export interface BeamSlotTextures {
  dark: Texture;
  darkEmpty: Texture;
  beam: Texture;
  angles: Texture;
  hazeDepth: Texture;
  bounce?: Texture;
  meta: BeamSlotMeta;
}

export interface BeamGradeTextures {
  grade: Texture;
  vignette: Texture;
}

export const beamManifest = rawBeamManifest as unknown as BeamManifest;

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

// Rotating-beam assets for seated shots. Close-ups use the lit stills.
const beamFiles = import.meta.glob([
  "../../../scenes/03-watch-room/final_beam/*.{webp,png}",
  "!../../../scenes/03-watch-room/final_beam/hold_*.{webp,png}",
  "!../../../scenes/03-watch-room/final_beam/contact.png",
], { eager: true, import: "default" }) as Record<string, string>;

const beamFileUrls = new Map<string, string>();
for (const [path, url] of Object.entries(beamFiles)) {
  const name = path.split("/").pop();
  if (name) beamFileUrls.set(name, url);
}

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
  ram_inside_window: "04-ram/ram_inside_window.png",
  ram_inside_hatch: "04-ram/ram_inside_hatch.png",
  ram_inside_balcony: "04-ram/ram_inside_balcony.png",
  ram_jumpscare_1: "04-ram/ram_jumpscare_1.png",
  ram_jumpscare_2: "04-ram/ram_jumpscare_2.png",
  ram_jumpscare_3: "04-ram/ram_jumpscare_3.png",
  ram_jumpscare_4: "04-ram/ram_jumpscare_4.png",
};

// Final renders still used for title, dash floor, jumpscares, and fallback stills.
const finalFiles = import.meta.glob([
  "../../../scenes/03-watch-room/final/webp/*.webp",
  "../../../scenes/03-watch-room/final/webp/jumpscare_{window,hatch,balcony}/*.webp",
], { eager: true, import: "default" }) as Record<string, string>;
const finalStills = new Map<string, string>();
const finalSeqs = new Map<string, string[]>();
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
const finalSlots = new Set<string>();
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
const beamTexCache = new Map<string, Promise<Texture>>();
const beamSlots = new Map<string, BeamSlotTextures>();
const beamSlotPending = new Map<string, Promise<BeamSlotTextures | null>>();
let beamGrade: BeamGradeTextures | null = null;

const DOM_ONLY = /^artifact_/;
const LEGACY_SCARE = /^ram_jumpscare_[1-4]$/;
const BEAM_SUPERSEDED = /^(view|tell|approach|inside|hold|ram_inside)_/;
const HOLD_PLATES = new Set(ENTRIES.flatMap((entry) =>
  [false, true].flatMap((bracing) => [false, true].map((tell) => holdPlateSlot(entry, bracing, tell))),
));
const SEATED_BEAM_SLOTS = [
  "desk",
  ...ENTRIES.flatMap((e) => (["empty", "tell", "approach", "inside"] as const).map((s) => beamSlot(e, s))),
];

function loadRawBeamTexture(fileName: string, linear = false): Promise<Texture> {
  const key = `${linear ? "L" : "N"}:${fileName}`;
  const cached = beamTexCache.get(key);
  if (cached) return cached;
  const url = beamFileUrls.get(fileName);
  if (!url) return Promise.reject(new Error(`Missing beam asset ${fileName}`));
  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load ${fileName} (${response.status})`);
      return response.blob();
    })
    .then((blob) => createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" }))
    .then((bitmap) => new Texture({
      source: new ImageSource({
        resource: bitmap,
        scaleMode: linear ? "linear" : "nearest",
        autoGenerateMipmaps: false,
      }),
    }));
  beamTexCache.set(key, promise);
  return promise;
}

function loadBeamSlot(slotName: string, onFileDone?: () => void): Promise<BeamSlotTextures | null> {
  const existing = beamSlots.get(slotName);
  if (existing) return Promise.resolve(existing);
  const inflight = beamSlotPending.get(slotName);
  if (inflight) return inflight;
  const meta = beamManifest.slots[slotName];
  if (!meta) return Promise.resolve(null);
  const baseMeta = beamManifest.slots[meta.darkBase] ?? meta;
  const files = meta.files;
  const load = (fileName: string) =>
    loadRawBeamTexture(fileName, false).finally(() => onFileDone?.());

  const req = Promise.all([
    load(files.dark),
    meta.darkBase === slotName ? Promise.resolve<Texture | null>(null) : loadRawBeamTexture(baseMeta.files.dark, false),
    load(files.beam),
    load(files.angles),
    load(files.hazeDepth),
    files.bounce ? load(files.bounce) : Promise.resolve<Texture | undefined>(undefined),
  ])
    .then(([dark, darkBase, beam, angles, hazeDepth, bounce]) => {
      const entry: BeamSlotTextures = {
        dark,
        darkEmpty: darkBase ?? dark,
        beam,
        angles,
        hazeDepth,
        bounce,
        meta,
      };
      beamSlots.set(slotName, entry);
      return entry;
    })
    .catch((err) => {
      console.warn(`beam slot ${slotName} failed to load`, err);
      return null;
    })
    .finally(() => {
      beamSlotPending.delete(slotName);
    });
  beamSlotPending.set(slotName, req);
  return req;
}

export function hasBeamArt(): boolean {
  return beamGrade !== null && beamSlots.has("desk");
}

export function getBeamGrade(): BeamGradeTextures | null {
  return beamGrade;
}

export function getBeamSlot(slotName: string): BeamSlotTextures | null {
  return beamSlots.get(slotName) ?? null;
}

export function getHoldPlate(entry: Entry, bracing: boolean, tell: boolean): Texture | null {
  return textures.get(holdPlateSlot(entry, bracing, tell)) ?? null;
}

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

// Preload seated beam plates, close-ups, essential stills, and jumpscares. Videos load on demand.
export async function loadArt(onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const loaded: string[] = [];
  const beamAvailable = beamFileUrls.has(beamManifest.grade.lut) && beamFileUrls.has(beamManifest.grade.vignette);
  const allStills = [...urlBySlot].filter(([slotName]) => !DOM_ONLY.test(slotName));
  const legacyScares = allStills.filter(([slotName]) => LEGACY_SCARE.test(slotName));
  const haveAllScares = finalSeqs.size === 3;
  const stills = allStills.filter(([slotName]) => {
    if (haveAllScares && LEGACY_SCARE.test(slotName)) return false;
    if (HOLD_PLATES.has(slotName)) return true;
    // Skip legacy watch-room stills superseded by the current room art.
    if (beamAvailable && BEAM_SUPERSEDED.test(slotName) && slotName !== "view_desk_off") return false;
    return true;
  });
  const seqs = [...finalSeqs];
  const seatedBeamFiles = beamAvailable
    ? 2 + SEATED_BEAM_SLOTS.reduce((n, name) => {
        const meta = beamManifest.slots[name];
        if (!meta) return n;
        return n + 4 + (meta.files.bounce ? 1 : 0);
      }, 0)
    : 0;

  artProgress.done = 0;
  artProgress.total = stills.length + seqs.reduce((n, [, urls]) => n + urls.length, 0) + seatedBeamFiles;
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

  const beamJobs: Promise<void>[] = [];
  if (beamAvailable) {
    beamJobs.push(
      Promise.all([
        loadRawBeamTexture(beamManifest.grade.lut, true).finally(tick),
        loadRawBeamTexture(beamManifest.grade.vignette, true).finally(tick),
      ])
        .then(([grade, vignette]) => {
          beamGrade = { grade, vignette };
          loaded.push("beam_grade");
        })
        .catch((err) => console.warn("beam grade failed to load", err)),
    );
    // Load empty base slots first so shared darkBase textures resolve from the cache cleanly.
    for (const name of SEATED_BEAM_SLOTS) {
      beamJobs.push(
        loadBeamSlot(name, tick).then((res) => {
          if (res) loaded.push(`beam:${name}`);
        }),
      );
    }
  }

  await Promise.all([...stills.map(loadStill), ...seqJobs, ...beamJobs]);
  if (haveAllScares && frameTextures.size < finalSeqs.size) {
    artProgress.total += legacyScares.length;
    onProgress?.(artProgress.done, artProgress.total);
    await Promise.all(legacyScares.map(loadStill));
  }
  if (import.meta.env.DEV) warnPrototypeFallbacks();
  return loaded.sort();
}

function warnPrototypeFallbacks(): void {
  const fallback: string[] = [];
  if (!hasBeamArt()) fallback.push("final_beam");
  for (const entry of ENTRIES) {
    const job = jumpscareJob(entry);
    if (!frameTextures.has(job)) fallback.push(job);
    const key = entry.toLowerCase();
    for (const turn of [`turn_desk_${key}`, `turn_${key}_desk`]) {
      if (!artVideoUrl(turn)) fallback.push(turn);
    }
  }
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
