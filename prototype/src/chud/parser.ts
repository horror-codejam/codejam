// GAME_LOGIC.md section 9 step 2 (normalize) and step 3 (instant keyword command parser).
// Bias: miss a command rather than invent one. A missed command still reaches the LLM judge hint;
// an invented one (e.g. POWER_OFF from "I'm off to bed") would hurt the player instantly.
import type { Entry, ParsedCommand } from "../sim/types";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nouns win over directions, so "lock the window right now" is WINDOW, not HATCH.
const ENTRY_NOUNS: Record<Entry, string[]> = {
  WINDOW: ["window"],
  HATCH: ["hatch", "trapdoor", "trap door", "ladder"],
  BALCONY: ["balcony", "rail", "railing"],
};
const ENTRY_DIRECTIONS: Record<Entry, string[]> = {
  WINDOW: ["left"],
  HATCH: ["right"],
  BALCONY: ["back", "behind"],
};

// Idioms that use direction words without naming an entry.
const DIRECTION_IDIOMS =
  /\b(right now|right away|right there|right here|right then|all right|alright|be right back|right behind you|come back|came back|comes back|coming back|he s back|hes back|is back|get back|go back|back off|back up|left me|left you|left us|left it|left alone|you left|he left|i left)\b/g;

function findEntry(n: string, table: Record<Entry, string[]>): Entry | null {
  let best: { entry: Entry; pos: number } | null = null;
  for (const entry of Object.keys(table) as Entry[]) {
    for (const word of table[entry]) {
      const m = new RegExp(`\\b${word}s?\\b`).exec(n);
      if (m && (best === null || m.index < best.pos)) best = { entry, pos: m.index };
    }
  }
  return best?.entry ?? null;
}

export function parseEntry(text: string): Entry | null {
  const n = normalize(text);
  return findEntry(n, ENTRY_NOUNS) ?? findEntry(n.replace(DIRECTION_IDIOMS, " "), ENTRY_DIRECTIONS);
}


const POWER_OFF_RE =
  /\bunlock(s|ed)?\b|\b(turn|switch|shut|cut|power|kill)( \w+){0,3} off\b|\boff (the |all )?(lock|locks|lamp|lamps|beam|light|lights|power)\b|\b(power|locks|lock|lamps?|beams?|lights?) off\b/;
// "shut" and "close" only as a verb with an object: "is he close to the hatch?" is a question, not a lock request.
const LOCK_RE = /\block(s|ed)?\b|\bseal\b|\b(shut|close) (the|it|that|this|up)\b/;
// "is he gone?", "still there?" and "has he left?" are location questions too (GAME_LOGIC 9 step 3).
const LOCATION_RE =
  /\bwhere (is|s|are|was|d)\b|\bwhere he\b|\bwhere ram\b|\blocation\b|\bsee him\b|\bwhich (door|entry|one|way|side)\b|\bis he (here|there|close|coming|in|inside|gone|still)\b|^where\b|\b(he|hes|he s|ram|ram s|is it|someone|anyone) (still )?(gone|still there|still here|still out there)\b|\b(has|did) (he|ram) (gone|left|go|leave)\b|^(still there|gone|is he gone|he gone)\b|\banyone (there|out there)\b/;

// "please don't unlock the window", "do not lock the hatch": a negated lock or power verb is not a command.
// Same bias as above: the judge can still read the intent, the parser must never invent the opposite one.
const NEGATED_POWER_RE =
  /\b(don t|dont|do not|never|not|stop|won t|wont|shouldn t|shouldnt|no need to)( (you|please|ever|even))? (unlock|lock|turn|switch|shut|cut|power|kill|seal|close)/;

export function parseCommand(text: string): ParsedCommand {
  const n = normalize(text);
  const negated = NEGATED_POWER_RE.test(n);
  if (!negated && POWER_OFF_RE.test(n)) return { command: "POWER_OFF", entry: null };
  const lock = negated ? null : LOCK_RE.exec(n);
  if (lock) {
    // The entry named after the lock verb wins: "the window is clear, lock the hatch" locks the hatch.
    const entry = parseEntry(n.slice(lock.index)) ?? parseEntry(n);
    if (entry) return { command: "LOCK", entry };
  }
  if (LOCATION_RE.test(n)) return { command: "ASK_LOCATION", entry: null };
  return { command: "NONE", entry: null };
}
