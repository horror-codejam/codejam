// Generates three 0.6 s FNAF-inspired jumpscare audio variants (A, B, C) from jumpscare.wav via ffmpeg.
// Run from repo root or prototype/: node prototype/tools/gen-jumpscare-sfx.mjs
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../public/audio/sfx", import.meta.url));
const src = resolve(dir, "jumpscare.wav");
const outA = resolve(dir, "jumpscare_a.wav");
const outB = resolve(dir, "jumpscare_b.wav");
const outC = resolve(dir, "jumpscare_c.wav");

const DUR = 0.6;
const FADE_OUT_AT = (DUR - 0.008).toFixed(3);

function runFfmpeg(args, label) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  const info = execFileSync("ffprobe", [
    "-hide_banner", "-v", "error", "-show_entries", "format=duration:stream=sample_rate,channels", "-of", "compact=p=0", args.at(-1),
  ], { encoding: "utf8" }).trim();
  console.log(`${label}: ${info}`);
}

// Variant A: pitched up (~1.35x) and trimmed from the loud peak section to exactly 0.6 s, hard attack and hard cut.
runFfmpeg([
  "-i", src,
  "-filter_complex",
  `[0:a]atrim=start=0.60:duration=0.84,asetpts=PTS-STARTPTS,` +
  `asetrate=44100*1.35,aresample=44100,atrim=0:${DUR},asetpts=PTS-STARTPTS,` +
  `alimiter=limit=0.95:level_in=2.0:attack=1:release=35,` +
  `afade=t=in:st=0:d=0.003,afade=t=out:st=${FADE_OUT_AT}:d=0.008[a]`,
  "-map", "[a]", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", outA,
], "Variant A (pitched + trimmed 0.6 s)");

// Variant B (default): Variant A + harsh high metallic screech layer (dissonant FM partials + grit), 0.6 s exact.
const screechExpr =
  "0.36*sin(2*PI*(1850+260*sin(2*PI*37*t))*t+2.4*sin(2*PI*410*t))" +
  "+0.30*sin(2*PI*(2790+340*sin(2*PI*53*t))*t+1.8*sin(2*PI*670*t))" +
  "+0.22*sin(2*PI*(3620-420*t)*t)";
runFfmpeg([
  "-i", outA,
  "-f", "lavfi", "-i", `aevalsrc=exprs='${screechExpr}|${screechExpr}':s=44100:d=${DUR}`,
  "-filter_complex",
  `[1:a]highpass=f=1200,acrusher=bits=7:mode=log:mix=0.45,volume=0.38,` +
  `afade=t=in:st=0:d=0.003,afade=t=out:st=${FADE_OUT_AT}:d=0.008[screech];` +
  `[0:a][screech]amix=inputs=2:duration=first:normalize=0,` +
  `alimiter=limit=0.95:level_in=1.15:attack=1:release=30,` +
  `atrim=0:${DUR},asetpts=PTS-STARTPTS,afade=t=out:st=${FADE_OUT_AT}:d=0.008[b]`,
  "-map", "[b]", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", outB,
], "Variant B (A + harsh high screech)");

// Variant C: sharper transient attack with low rumble filtered out (steep high-pass + upper-mid bite), 0.6 s exact.
runFfmpeg([
  "-i", src,
  "-filter_complex",
  `[0:a]atrim=start=0.64:duration=0.76,asetpts=PTS-STARTPTS,` +
  `asetrate=44100*1.22,aresample=44100,atrim=0:${DUR},asetpts=PTS-STARTPTS,` +
  `highpass=f=340:poles=2,highpass=f=280:poles=2,` +
  `equalizer=f=2600:t=q:w=1.2:g=7,equalizer=f=4800:t=q:w=1.4:g=5,` +
  `volume='if(lt(t,0.035),1.85,1.0)':eval=frame,` +
  `alimiter=limit=0.95:level_in=2.1:attack=0.5:release=25,` +
  `afade=t=in:st=0:d=0.002,afade=t=out:st=${FADE_OUT_AT}:d=0.008[c]`,
  "-map", "[c]", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", outC,
], "Variant C (sharp attack, no low rumble)");
