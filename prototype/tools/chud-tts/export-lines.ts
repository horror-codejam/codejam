// Build the complete audio input catalog from the same pools the game uses.
import { clipLines } from "../../src/chud/lines";
import { namedSpeechParts } from "../../src/chud/speechParts";
import type { Band } from "../../src/sim/types";

const fixed = new Map<string, { band: Band; text: string }>();
const clips = new Map<string, { band: Band; text: string }>();
const named: Record<string, string[]> = { warm: [], hurt: [], jealous: [], furious: [] };
let namedTotal = 0;
for (const { band, text } of clipLines()) {
  if (text.includes("{n}")) {
    namedTotal++;
    const parts = namedSpeechParts(text);
    const recorded = parts?.find((part) => !part.includes("{n}"));
    if (recorded) {
      named[band.toLowerCase()].push(text);
      clips.set(`${band}|${recorded.toLowerCase()}`, { band, text: recorded });
    }
  }
  const spoken = text.replaceAll("{n}", "keeper");
  const key = `${band}|${spoken.toLowerCase()}`;
  fixed.set(key, { band, text: spoken });
  clips.set(key, { band, text: spoken });
}

console.log(JSON.stringify({ fixed: [...fixed.values()], clips: [...clips.values()], named, namedTotal }));
