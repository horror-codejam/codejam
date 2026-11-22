import { chud } from "../../assets/audio/dialogue.json";
import type { Band } from "../sim/types";

const urls = import.meta.glob<string>("../../assets/audio/chud_*.ogg", {
  eager: true, import: "default", query: "?url",
});

const clipsByMood = new Map(Object.entries(chud).map(([mood, clips]) => [
  mood, new Map(Object.entries(clips).map(([line, file]) => [line.toLowerCase(), file])),
]));

export function cannedClip(text: string, band: Band): { name: string; url: string } | undefined {
  const file = clipsByMood.get(band.toLowerCase())?.get(text.toLowerCase());
  if (!file) return;
  const url = urls[`../../assets/audio/${file}`];
  return url ? { name: file.slice(0, -4), url } : undefined;
}
