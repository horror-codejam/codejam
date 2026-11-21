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

const wordCount = (n: string) => (n ? n.split(" ").length : 0);

const POWER_OFF_RE =
  /\bunlock(s|ed)?\b|\b(turn|switch|shut|cut|power|kill)( \w+){0,3} off\b|\boff (the |all )?(lock|locks|lamp|lamps|beam|light|lights|power)\b|\b(power|locks|lock|lamps?|beams?|lights?) off\b/;
const LOCK_RE = /\block(s|ed)?\b|\bshut\b|\bseal\b|\bclose\b/;
const BEAM_NOUN_RE = /\b(beam|lamp|light|lights|spotlight|searchlight)\b/;
const BEAM_VERB_RE = /\b(turn|switch|put|use|need|give|shine|flash|light up|lights up|power|hit)\b|\b(beam|lamp|lights) on\b|\bon the (beam|lamp)\b/;
const LOCATION_RE =
  /\bwhere (is|s|are|was|d)\b|\bwhere he\b|\bwhere ram\b|\blocation\b|\bsee him\b|\bwhich (door|entry|one|way|side)\b|\bis he (here|there|close|coming)\b|^where\b/;

export function parseCommand(text: string): ParsedCommand {
  const n = normalize(text);
  if (POWER_OFF_RE.test(n)) return { command: "POWER_OFF", entry: null };
  if (LOCK_RE.test(n)) {
    const entry = parseEntry(n);
    if (entry) return { command: "LOCK", entry };
  }
  if (BEAM_NOUN_RE.test(n) && (BEAM_VERB_RE.test(n) || wordCount(n) <= 3)) return { command: "BEAM", entry: null };
  if (LOCATION_RE.test(n)) return { command: "ASK_LOCATION", entry: null };
  return { command: "NONE", entry: null };
}
