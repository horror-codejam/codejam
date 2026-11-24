import dialogue from "../../assets/audio/dialogue.json";
import { namedSpeechParts } from "../chud/speechParts";
import type { Band } from "../sim/types";

// Dev can fetch the asset directly. Production loads a single map of hashed URLs alongside the dialogue index.
const productionUrls = import.meta.env.DEV ? undefined
  : import("./audioClipUrls").then(({ urls }) => urls).catch(() => undefined);

const clipsByMood = new Map(Object.entries(dialogue.chud).map(([mood, clips]) => [
  mood, new Map(Object.entries(clips).map(([line, file]) => [line.toLowerCase(), file])),
]));
const namedByMood = new Map(Object.entries(dialogue.chudNamed).map(([mood, templates]) => [
  mood, new Set(templates.map((template) => template.toLowerCase())),
]));

export async function cannedClip(text: string, band: Band): Promise<{ name: string; url: string } | undefined> {
  const file = clipsByMood.get(band.toLowerCase())?.get(text.toLowerCase());
  if (!file) return undefined;
  const url = import.meta.env.DEV
    ? new URL(/* @vite-ignore */ `../../assets/audio/${file}`, import.meta.url).href
    : (await productionUrls)?.[`../../assets/audio/${file}`];
  return url ? { name: file.slice(0, -4), url } : undefined;
}

export function namedClips(text: string, band: Band, name: string): [string, string] | undefined {
  const templates = namedByMood.get(band.toLowerCase());
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + name.length)) {
    const template = `${text.slice(0, at)}{n}${text.slice(at + name.length)}`;
    if (templates?.has(template.toLowerCase())) return namedSpeechParts(template);
  }
  return undefined;
}
