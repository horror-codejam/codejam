// Shared style analysis for ChudGPT's voiced replies: rivals, opening words, "though", and banned jargon detection.
// Used on the server (via req.recent without changing the /voice contract) and in tools/chud-voice-check.ts.

export type Rival =
  | "radio"
  | "coast_guard"
  | "boat"
  | "calendar"
  | "sea"
  | "previous_keeper"
  | "beacon"
  | "coat";

export const RIVALS: readonly Rival[] = [
  "radio",
  "coast_guard",
  "boat",
  "calendar",
  "sea",
  "previous_keeper",
  "beacon",
  "coat",
];

export const RIVAL_LABELS: Record<Rival, string> = {
  radio: "the radio",
  coast_guard: "the Coast Guard",
  boat: "the boat",
  calendar: "the calendar",
  sea: "the sea",
  previous_keeper: "the previous keeper",
  beacon: "the beacon",
  coat: "the keeper's coat",
};

const RIVAL_PATTERNS: Record<Rival, RegExp> = {
  radio: /\bradio\b/i,
  coast_guard: /\bcoast\s*guard\b/i,
  boat: /\b(boat|ship|vessel|trawler|schooner|hull|dinghy)\b/i,
  calendar: /\bcalendar\b/i,
  sea: /\b(sea|ocean|tide|waves?)\b/i,
  previous_keeper: /\b(previous|last|former|old)\s+keeper\b|\bpredecessor\b/i,
  beacon: /\bbeacon\b|\bfresnel\b/i,
  coat: /\b(coat|jacket|oilskin)\b/i,
};

export const BANNED_JARGON_RE =
  /\b(tab\s*4|mug\s*[1-5]|cot\s*b|2039|rota|unscheduled\s+(caller|visitor|drop-in|inspection|guest)|admiralty\s+custom|maritime\s+(custom|bylaw)|1954\s+boiler|dossier|binder|ledger|exit\s+survey|house\s+rule\s+four|oh\s+great|well,\s*well|as\s+an\s+ai|language\s+model)\b/i;

export function hasThough(text: string): boolean {
  return /\bthough\b/i.test(text);
}

export function hasBannedJargon(text: string): boolean {
  return BANNED_JARGON_RE.test(text);
}

export function openingWord(text: string): string {
  const m = text.trim().toLowerCase().match(/^["'\u201c\u201d]*([a-z']+)/);
  return m ? m[1] : "";
}

export function detectRivals(text: string): Rival[] {
  const found: Rival[] = [];
  for (const r of RIVALS) {
    if (RIVAL_PATTERNS[r].test(text)) found.push(r);
  }
  return found;
}

export interface RecentChudSummary {
  lines: string[];
  rivals: Rival[];
  lastRivals: Rival[];
  openings: string[];
  lastOpening: string;
  recentThough: boolean;
}

// Extracts ChudGPT's last 3 replies from req.recent (the existing "Keeper: ..." / "ChudGPT: ..." log).
export function summarizeRecentChud(recent: string[]): RecentChudSummary {
  const lines = recent
    .filter((l) => l.startsWith("ChudGPT:"))
    .map((l) => l.slice(8).trim())
    .filter(Boolean)
    .slice(-3);
  const rivals = [...new Set(lines.flatMap(detectRivals))];
  const lastRivals = lines.length ? detectRivals(lines[lines.length - 1]) : [];
  const openings = [...new Set(lines.map(openingWord).filter(Boolean))];
  const lastOpening = lines.length ? openingWord(lines[lines.length - 1]) : "";
  const recentThough = lines.some(hasThough);
  return { lines, rivals, lastRivals, openings, lastOpening, recentThough };
}
