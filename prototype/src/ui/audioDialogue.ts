import { chud } from "../../assets/audio/dialogue.json";
import type { Band } from "../sim/types";

// Lazy glob: avoids firing 900+ simultaneous HTTP module fetches on first speech in Vite dev mode,
// while still including every chud_*.ogg asset in production builds.
const urlLoaders = import.meta.glob<string>("../../assets/audio/chud_*.ogg", {
  import: "default",
  query: "?url",
});
const resolvedUrls = new Map<string, string>();

const clipsByMood = new Map(Object.entries(chud).map(([mood, clips]) => [
  mood, new Map(Object.entries(clips).map(([line, file]) => [line.toLowerCase(), file])),
]));

export async function cannedClip(text: string, band: Band): Promise<{ name: string; url: string } | undefined> {
  const file = clipsByMood.get(band.toLowerCase())?.get(text.toLowerCase());
  if (!file) return undefined;
  const key = `../../assets/audio/${file}`;
  let url = resolvedUrls.get(key);
  if (!url) {
    const loader = urlLoaders[key];
    if (!loader) return undefined;
    url = await loader();
    if (url) resolvedUrls.set(key, url);
  }
  return url ? { name: file.slice(0, -4), url } : undefined;
}
