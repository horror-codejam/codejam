// Lists the scripted lines that have no recorded clip yet, as JSON for gen_clips.py. Run from prototype/:
//   npx vite-node tools/chud-tts/export-lines.ts > tools/chud-tts/models/missing.json
// Lines with a player name in them are not pre-recorded (the name is unknown), the rest are looked up like the game does.
import { readFileSync } from "node:fs";
import { clipLines } from "../../src/chud/lines";

const dialogue = JSON.parse(readFileSync(new URL("../../assets/audio/dialogue.json", import.meta.url), "utf8")) as {
  chud: Record<string, Record<string, string>>;
};
const have = new Map(Object.entries(dialogue.chud).map(([band, clips]) => [band, new Set(Object.keys(clips).map((l) => l.toLowerCase()))]));
const missing = clipLines().filter(({ band, text }) => !have.get(band.toLowerCase())?.has(text.toLowerCase()));
console.log(JSON.stringify({ total: clipLines().length, missing }, null, 1));
