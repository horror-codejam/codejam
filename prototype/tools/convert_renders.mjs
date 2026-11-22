#!/usr/bin/env node
// Converts final Blender PNGs into still plates, jumpscare frames and video loops.
//
//   stills:     <src>/<job>/<job>.png          -> <out>/<job>.webp
//   jumpscares: <src>/<job>/<job>_0001.png ... -> <out>/<job>/<job>_0001.webp ...
//   other clips:                              -> <out>/../webm/<job>.webm
//   title loop:                               -> <out>/../title_loop.webm
//
// Usage (from prototype/):
//   node tools/convert_renders.mjs [--src <png folder>] [--out <webp folder>] [--quality 85] [--force]
// Defaults: --src <repo>/scenes/03-watch-room/final/png (or $RENDERS_SRC), --out <repo>/scenes/03-watch-room/final/webp.
// Idempotent: an output newer than its source PNGs is skipped. A sequence is converted only once the render
// queue logged its END in final/render_log.txt (without the log: once its newest frame is 15 s old). Needs ffmpeg.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
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
const FPS = 24;
const FINAL = dirname(OUT);
const JUMPSCARE = /^jumpscare_(window|hatch|balcony)$/;

if (!existsSync(SRC)) {
  console.error(`source folder not found: ${SRC}`);
  process.exit(1);
}
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg not found on PATH");
  process.exit(1);
}

const stats = { converted: 0, skipped: 0, failed: 0, pending: 0 };

// The render queue logs "START <job> (... final)" and "END <job>" to final/render_log.txt next to the png folder.
// When the log exists a sequence is converted only once its last final START has an END after it.
const logPath = join(dirname(SRC), "render_log.txt");
const renderLog = existsSync(logPath) ? readFileSync(logPath, "utf8").split(/\r?\n/) : null;
function finishedInLog(job) {
  let started = -1;
  let ended = -1;
  renderLog.forEach((line, i) => {
    if (line.includes(` START ${job} (`) && line.endsWith("final)")) started = i;
    if (line.includes(` END ${job} `) || line.endsWith(` END ${job}`)) ended = i;
  });
  return started >= 0 && ended > started;
}

function encode(dst, newest, ffmpegArgs) {
  if (!FORCE && existsSync(dst) && statSync(dst).mtimeMs >= newest) {
    stats.skipped++;
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  const extension = extname(dst);
  const temporary = `${dst}.${process.pid}.tmp`;
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-y", ...ffmpegArgs, "-f", extension.slice(1), temporary],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    stats.failed++;
    rmSync(temporary, { force: true });
    console.warn(`FAILED ${dst}\n${r.stderr?.trim() || r.error?.message || r.signal}`);
    return;
  }
  renameSync(temporary, dst);
  stats.converted++;
  console.log(`ok ${relative(FINAL, dst)}`);
}

function toWebp(src, dst, resize = false) {
  encode(dst, statSync(src).mtimeMs, [
    "-i", src, ...(resize ? ["-vf", "scale=1600:800:flags=lanczos"] : []),
    "-c:v", "libwebp", "-quality", String(QUALITY), "-compression_level", "5", "-preset", "picture",
  ]);
}

function toWebm(dir, job, frames, newest) {
  const dst = job === "title_loop" ? join(FINAL, "title_loop.webm") : join(FINAL, "webm", `${job}.webm`);
  encode(dst, newest, [
    "-framerate", String(FPS), "-start_number", "1", "-i", join(dir, `${job}_%04d.png`),
    "-frames:v", String(frames.length), "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
    "-b:v", "3M", "-minrate", "2M", "-maxrate", "4M", "-bufsize", "8M", "-g", "48", "-row-mt", "1", "-threads", "4",
  ]);
}

for (const job of readdirSync(SRC).sort()) {
  const dir = join(SRC, job);
  if (!statSync(dir).isDirectory()) continue;
  const still = join(dir, `${job}.png`);
  if (existsSync(still)) {
    toWebp(still, join(OUT, `${job}.webp`), true);
    continue;
  }
  const frameRe = new RegExp(`^${job.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(\\d{4})\\.png$`);
  const frames = readdirSync(dir).filter((f) => frameRe.test(f)).sort();
  if (!frames.length) continue; // empty folder: still rendering
  const newest = Math.max(...frames.map((f) => statSync(join(dir, f)).mtimeMs));
  if (renderLog ? !finishedInLog(job) : Date.now() - newest < SETTLE_MS) {
    stats.pending++;
    console.log(`pending ${job} (${frames.length} frames so far, still being written)`);
    continue;
  }
  if (!frames.every((frame, index) => Number(frameRe.exec(frame)[1]) === index + 1)) {
    stats.failed++;
    console.warn(`FAILED ${job}: expected consecutive PNG frames starting at 0001`);
    continue;
  }
  if (JUMPSCARE.test(job)) {
    for (const f of frames) toWebp(join(dir, f), join(OUT, job, f.replace(/\.png$/, ".webp")));
  } else {
    toWebm(dir, job, frames, newest);
  }
}

console.log(`done: ${stats.converted} converted, ${stats.skipped} up to date, ${stats.pending} sequences pending, ${stats.failed} failed. Output: ${OUT}`);
if (stats.failed) process.exit(2);
