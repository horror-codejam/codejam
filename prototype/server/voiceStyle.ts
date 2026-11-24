// Shared style analysis for ChudGPT's voiced replies: joke shapes, rivals, opening words, and "though" tracking.
// Used on the server (to tell the model what its last 2 to 3 replies did, via req.recent without changing any API
// contract) and in tools/chud-voice-check.ts (to flag repetition automatically).

export type VoiceShape =
  | "false_fact"
  | "filing"
  | "accounting"
  | "gratitude"
  | "hospitality"
  | "literal"
  | "routine"
  | "personal_question"
  | "though_contrast"
  | "concession";

export type TargetShape = Exclude<VoiceShape, "though_contrast" | "concession">;

export const TARGET_SHAPES: readonly TargetShape[] = [
  "false_fact",
  "filing",
  "accounting",
  "gratitude",
  "hospitality",
  "literal",
  "routine",
  "personal_question",
];

export const SHAPE_LABELS: Record<VoiceShape, string> = {
  false_fact: "false fact stated calmly",
  filing: "clinical or corporate filing of the keeper's words",
  accounting: "petty accounting or a specific number",
  gratitude: "misplaced gratitude",
  hospitality: "quiet threat phrased as hospitality",
  literal: "taking the keeper's words too literally",
  routine: "non sequitur about the lighthouse's routines",
  personal_question: "slightly too personal question back",
  though_contrast: "\"though\" contrast",
  concession: "plain acknowledgement and sting",
};

export const SHAPE_DIRECTIONS: Record<TargetShape, string> = {
  false_fact:
    "Invent one calm, absurd maritime rule, almanac fact, or lighthouse custom and state it as settled truth.",
  filing:
    "Treat what the keeper said as office paperwork placed under a fresh, specific folder, ledger, form, or heading (invent a new label each time).",
  accounting:
    "Turn what the keeper said into petty accounting with a fresh specific number, tally, percentage, rate, or duration (do not say 'logged' or 'filed').",
  gratitude:
    "Offer overly formal, misplaced gratitude for something bleak, awkward, or mildly insulting (invent fresh phrasing, never 'genuinely obliged').",
  hospitality:
    "Phrase a quiet, possessive warning as attentive hostly care about their stay, comfort, meal, or quarters (invent a fresh domestic detail, never 'stairwell draft').",
  literal:
    "Take one concrete word or claim the keeper used completely literally in a deadpan way (do not start with 'Strictly speaking').",
  routine:
    "Pivot calmly from their remark to an oddly specific mundane lighthouse chore or maintenance habit (invent a fresh chore, no barometers, pipes, or weathervanes).",
  personal_question:
    "End with a question mark: ask one calm, slightly too intimate or nosy follow-up question tied to what they just said (still ONE sentence total).",
};

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

export function hasThough(text: string): boolean {
  return /\bthough\b/i.test(text);
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

const STRONG_ACCOUNTING_RE =
  /\b(\d+(\.\d+)?\s*%|\d+(\.\d+)?\s+percent|percent|tally|tallied|ratio|average[ds]?|margin|combined total|score|per\s+(hour|night|week|day)|rate of|\d[\d,]*\s+(drumbeats|mentions|hours|minutes|days|nights|times|years|words|counts?))\b/i;

const ACCOUNTING_RE =
  /\b(\d+|zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|hundred|dozen|twice|thrice|second time|third|fourth|fifth|by my count|keeping count|keep count|counts? as)\b/i;

const FILING_RE =
  /\b(fil(e|ed|ing)|folder|on record|for the record|recorded in|archive[ds]?|ledger|dossier|memorandum|clerical|drawer|cabinet|category|column|register|heading|index|policy|form\b|meeting minutes|receipt|catalog(ue)?|log(s|ged|book)?\b|noting|noted under|under\s+["']?[a-z]|appendix|addendum|exhibit|binder|paperwork|correspondence)\b/i;

const LITERAL_RE =
  /\b(literal(ly)?|strictly speaking|strictly accurate|technically|by definition|in the strict sense|dictionary|exact word|word choice|as a word|is a word|spelled|pronounced|knots?\s+an\s+hour|means\s+only|definition of|in literal terms|measured in|mathematically|temperature|weight meeting|merely a|actually a|simply a)\b/i;

const ROUTINE_RE =
  /\b(routine|chore|kettle|boiler|pipes?|floorboards?|brass|lens|polish(ed|ing)?|winding|mopping|dusting|gulls?|seagulls?|foghorn|fog bell|barometer|tide table|inventory|maintenance|inspection|scrub(bing)?|oil(ing)?|sweeping|laundry|dishes|stove|soup|biscuits?|o'clock|wick|hinges?|clockwork|(re)?wax(ed|ing)?|bleach|cistern|rust|tarnish|descal(e|ed|ing)|shutters?|panes?|drain|grease|tea leaves|mildew|wringing|bolts?|clapper)\b/i;

const GRATITUDE_RE =
  /(^thank\b|\bthank(s|ed|ing)?\b|\bgrateful\b|\bappreciate[ds]?\b|\bkind of you\b|\bgenerous of you\b|\bpolite of you\b|\btouched\b|\bdelighted\b|\bobliged\b|\bflattered\b|\bhow thoughtful\b|\bvery thoughtful\b|\bmy pleasure\b)/i;

const FALSE_FACT_RE =
  /\b(traditionally|officially|historically|scientifically|legally|statistically|customary|customarily|famously|notoriously|invariably|maritime law|maritime custom|lighthouse custom|old custom|by custom|custom dictates|by tradition|admiralty|almanac|handbook|manual|weather office|studies|surveys?|proven to|known to|most sailors|every keeper|every sailor|by law|by regulation|rule of the|standard practice|statute|harbour master|custom holds|is a fact that)\b/i;

const HOSPITALITY_RE =
  /\b(comfortable|comfort|cozy|cosy|guest|host|welcome|chair|stairs|bed|pillow|blanket|quilt|bunk|sheets?|socks?|settle|make yourself|hospitality|warm for you|shelter|stay as long|accommodat|supper|coat hook|towel|rest easy|feel at home|corridor|steps|spare room|spare cot|cot|seat|berth|quarters|dinner|breakfast|slippers|fireside|pour you|turn down|tuck|cocoa|hallway)\b/i;

export function detectShape(text: string): VoiceShape {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return "personal_question";
  if (hasThough(trimmed)) return "though_contrast";
  // Strip clock references ("at two", "before three", "two o'clock") so routine times do not collide with accounting.
  const withoutClock = trimmed
    .replace(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+o'clock\b/gi, "CLOCK")
    .replace(/\b(at|before|after|by|past|around|until)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/gi, "$1 CLOCK");
  if (FALSE_FACT_RE.test(trimmed)) return "false_fact";
  if (LITERAL_RE.test(trimmed)) return "literal";
  if (STRONG_ACCOUNTING_RE.test(withoutClock)) return "accounting";
  if (FILING_RE.test(trimmed)) return "filing";
  if (ROUTINE_RE.test(trimmed)) return "routine";
  if (ACCOUNTING_RE.test(withoutClock)) return "accounting";
  if (GRATITUDE_RE.test(trimmed)) return "gratitude";
  if (HOSPITALITY_RE.test(trimmed)) return "hospitality";
  return "concession";
}

export interface RecentChudSummary {
  lines: string[];
  shapes: VoiceShape[];
  lastShape: VoiceShape | null;
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
  const shapes = lines.map(detectShape);
  const lastShape = shapes.length ? shapes[shapes.length - 1] : null;
  const rivals = [...new Set(lines.flatMap(detectRivals))];
  const lastRivals = lines.length ? detectRivals(lines[lines.length - 1]) : [];
  const openings = [...new Set(lines.map(openingWord).filter(Boolean))];
  const lastOpening = lines.length ? openingWord(lines[lines.length - 1]) : "";
  const recentThough = lines.some(hasThough);
  return { lines, shapes, lastShape, rivals, lastRivals, openings, lastOpening, recentThough };
}
