#!/usr/bin/env node
// Converts the final Blender renders (PNG) into the WebP files the game loads.
//
//   stills:    <src>/<job>/<job>.png          -> <out>/<job>.webp
//   sequences: <src>/<job>/<job>_0001.png ... -> <out>/<job>/<job>_0001.webp ...
//
// Usage (from prototype/):
//   node tools/convert_renders.mjs [--src <png folder>] [--out <webp folder>] [--quality 85] [--force]
// Defaults: --src <repo>/scenes/03-watch-room/final/png (or $RENDERS_SRC), --out <repo>/scenes/03-watch-room/final/webp.
// Idempotent: a file is skipped when its WebP is newer than the PNG. Sequences whose newest frame changed less than
// 15 s ago are skipped (Blender is probably still writing them); run again later. Needs ffmpeg on PATH.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const SRC = resolve(opt("src", process.env.RENDERS_SRC || join(repo, "scenes/03-watch-room/final/png")));
const OUT = resolve(opt("out", join(repo, "scenes/03-watch-room/final/webp")));
const QUALITY = Number(opt("quality", "85"));
const FORCE = args.includes("--force");
const SETTLE_MS = 15000;

if (!existsSync(SRC)) {
  console.error(`source folder not found: ${SRC}`);
  process.exit(1);
}
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg not found on PATH");
  process.exit(1);
}

const stats = { converted: 0, skipped: 0, failed: 0, pending: 0 };

function upToDate(src, dst) {
  return !FORCE && existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs;
}

function toWebp(src, dst) {
  if (upToDate(src, dst)) {
    stats.skipped++;
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-y", "-i", src, "-c:v", "libwebp", "-quality", String(QUALITY), "-compression_level", "5", "-preset", "picture", dst],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    stats.failed++;
    rmSync(dst, { force: true });
    console.warn(`FAILED ${src}\n${r.stderr.trim()}`);
    return;
  }
  stats.converted++;
  console.log(`ok ${dst.slice(OUT.length + 1)}`);
}

for (const job of readdirSync(SRC).sort()) {
  const dir = join(SRC, job);
  if (!statSync(dir).isDirectory()) continue;
  const still = join(dir, `${job}.png`);
  if (existsSync(still)) {
    toWebp(still, join(OUT, `${job}.webp`));
    continue;
  }
  const frameRe = new RegExp(`^${job.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(\\d{4})\\.png$`);
  const frames = readdirSync(dir).filter((f) => frameRe.test(f)).sort();
  if (!frames.length) continue; // empty folder: still rendering
  const newest = Math.max(...frames.map((f) => statSync(join(dir, f)).mtimeMs));
  if (Date.now() - newest < SETTLE_MS) {
    stats.pending++;
    console.log(`pending ${job} (${frames.length} frames so far, still being written)`);
    continue;
  }
  for (const f of frames) toWebp(join(dir, f), join(OUT, job, f.replace(/\.png$/, ".webp")));
}

console.log(`done: ${stats.converted} converted, ${stats.skipped} up to date, ${stats.pending} sequences pending, ${stats.failed} failed. Output: ${OUT}`);
if (stats.failed) process.exit(2);
