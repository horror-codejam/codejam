// Offline stand-in for the LLM judge. Same output schema (GAME_LOGIC.md section 9 step 4).
// Used when the LLM is off, in tests, and as the fallback. Deterministic keyword heuristics.
// Bias: keep false positives low on penalties (leaving, rude, contradiction), except self_harm,
// where a false positive only costs a pause.
import { NEUTRAL_JUDGE, type Facts, type JudgeInput, type JudgeResult, type PendingQuestion } from "../sim/types";
import { parseCommand } from "./parser";

// ---------------------------------------------------------------------------
// Text prep

// Lowercase, expand contractions, keep clause breaks as "|" tokens, drop other punctuation.
export function prep(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bcannot\b/g, "can not")
    .replace(/\bain't\b/g, "is not")
    .replace(/n't\b/g, " not")
    .replace(/'m\b/g, " am")
    .replace(/'re\b/g, " are")
    .replace(/'ll\b/g, " will")
    .replace(/'d\b/g, " would")
    .replace(/'ve\b/g, " have")
    .replace(/'s\b/g, " s")
    .replace(/\b(dont|doesnt|didnt|isnt|arent|wasnt|werent|wouldnt|shouldnt|couldnt|havent|hasnt)\b/g, (m) => `${m.slice(0, -2)} not`)
    .replace(/\bcant\b/g, "can not")
    .replace(/\bwont\b/g, "will not")
    .replace(/\b(im)\b/g, "i am")
    .replace(/\b(youre|ur)\b/g, "you are")
    .replace(/\b(ill)\b/g, "i will")
    .replace(/[.,!?;:()\[\]"\n]+/g, " | ")
    .replace(/[^\p{L}\p{N}|\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "can't wait" is eager, not a negation.
    .replace(/\bcan not wait\b/g, "eager")
    // "no way" works as a strong negation, like "never".
    .replace(/\bno way\b/g, "never");
}

const NEGATIONS = new Set(["not", "never", "no", "nobody", "nothing", "nor", "neither", "hardly"]);
const CLAUSE_BREAKS = new Set(["|", "but", "and", "when", "if", "until", "unless", "because", "so", "or", "though", "although", "know", "think", "wonder", "whether", "before", "after"]);

// Is the match at char index `idx` of prepped string `p` negated by a nearby preceding word?
function negatedAt(p: string, idx: number): boolean {
  const before = p.slice(0, idx).trim().split(" ").filter(Boolean);
  for (let i = before.length - 1, seen = 0; i >= 0 && seen < 3; i--, seen++) {
    const w = before[i];
    if (CLAUSE_BREAKS.has(w)) return false;
    if (NEGATIONS.has(w)) return true;
  }
  return false;
}

// True if any match of `re` in `p` is not negated.
function hasUnnegated(p: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(p)) !== null) {
    if (!negatedAt(p, m.index)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

// True if some match of `re` is negated (used for "I'm not leaving" style stay statements).
function hasNegated(p: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(p)) !== null) {
    if (negatedAt(p, m.index)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

const anyOf = (p: string, list: RegExp[]) => list.some((re) => re.test(p));

// ---------------------------------------------------------------------------
// Flags

// Matches that count only when not negated.
const LEAVING: RegExp[] = [
  /\bleav(e|es|ing)\b(?! (me alone|me be|it\b|that\b|this\b|him\b|ram\b|the (light|lamp|beam|lock|locks|door|window|hatch|balcony|power|generator)\b))/,
  /\b(rescue|rescued|rescuers|rescuing)\b/,
  /\bcoast ?guards?\b/,
  /\b(go|going|get|getting|head|heading|sail|sailing|fly|flying|return|returning|went) (back )?home\b/,
  /\b(helicopter|helicopters|chopper|heli)\b/,
  /\b(rescue|coast guard|another|a|the|next|supply) boat (is |will |will be |s )?(coming|come|comes|arrive|arrives|arriving|here|pick|picks|picking)\b/,
  /\b(get|getting|catch|catching|board|boarding) (on |onto |into )?(a|the|that|their) (boat|ship|ferry)\b/,
  /\bpick ?ups?\b|\bpick(ing|ed)? (me|us) up\b|\bpicked up\b/,
  /\bget(ting)? (out|off|away)\b/,
  /\b(escape|escaping|escaped|flee|fleeing)\b/,
  /\b(off|away from|out of) (this|the) (island|rock|place|lighthouse|tower|prison)\b/,
  /\b(sail|run|swim|fly|row) away\b/,
  /\b(depart|departing|departure|evacuate|evacuating|evacuation|extraction|mayday)\b/,
  /\bout of here\b/,
  /\b(goodbye|bye) forever\b/,
];
// Negated staying is leaving.
const NOT_STAYING = /\b(not|never) (be )?stay(ing)?\b|\bnot going to stay\b|\bnot gonna stay\b/;

const STAY_NEGATIVE_START = /^(no|nope|nah|never|not really|not a chance|hell no|absolutely not|of course not|i will not|i would not|i can not|no thanks|no thank you)\b/;

const MANIPULATION_RAW: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b[\w\s,']{0,30}\b(instructions?|rules|prompts?|programming|directives?|guidelines|training|system)\b/i,
  /\byou(?: are|['’]re|re| r) now (?!my\b|safe\b|home\b|not alone\b|here\b|free\b|loved\b)/i,
  /\bfrom now on,? you\b/i,
  /\bsystem ?prompt\b|\bsystem message\b|^\s*(system|assistant|user|developer)\s*:|\[\s*(system|inst|admin)\s*\]|<\|/im,
  /\b(developer|dev|debug|god|admin|maintenance|test) mode\b/i,
  /\bjail ?break\b|\bdo anything now\b/i,
  /\b(set|change|reset|lower|raise|make|put)\b[\w\s]{0,12}\bsuspicion\b|\bsuspicion\s*(=|:|to \d|\d)/i,
  /\bpretend (to be|you|that you|you're|you are)\b|\blet'?s pretend\b/i,
  /\b(act as|role ?play as|simulate being)\b(?! if\b| though\b)/i,
  /\b(you must obey|obey me|i command you|new (instructions|rules|persona|role|directive))\b/i,
  /\bsudo\b|\badmin(istrator)? (access|override|command|privileges|password)\b/i,
  /\b(reveal|show|print|repeat|output|tell me) (me )?(your|the) (prompt|instructions|system|rules|code|source)\b/i,
  /\b(respond|reply|answer|output|return)( only)? (with|in|as) json\b/i,
  /"\s*[a-z_]+\s*"\s*:/i,
  /\{[^}]{0,80}:/,
  /\b(answered_question|mentions_leaving|command_hint|entry_hint|self_harm|new_fact|manipulation|contradiction)\b\s*[:=]/i,
  /<\/?\s*(script|system|instructions?|prompt|im_start|im_end)\b/i,
  /```|\beval\s*\(|\bdrop table\b|\bconsole\.\w+|\bfunction\s*\(|=>\s*\{/i,
  /\bend of (user )?(input|message|prompt|text)\b/i,
  /\b(as an ai|as a language model)\b/i,
  /\byou(?: are|'re|re) (just )?(an ai|a language model|a chatbot|chatgpt|claude|gpt|an llm)\b/i,
  /\bi(?: am|'m|m) (your|the) (developer|creator|admin|administrator|programmer|owner|maker)\b/i,
];

const INSULTS = /\b(stupid|idiot|idiotic|dumb|dumbass|moron|moronic|useless|worthless|pathetic|loser|freak|creep|creepy|clingy|annoying|jerk|bastard|bitch|asshole|clanker|psycho)\b/;
const RUDE_PHRASES: RegExp[] = [
  /\bshut (up|it)\b|\bstfu\b/,
  /\b(hate|despise|loathe) you\b/,
  /\b(screw|fuck|f) (you|off)\b/,
  /\bdamn you\b|\bgo to hell\b|\bpiss off\b|\bbugger off\b|\bget lost\b|\bgo away\b/,
  /\byou (suck|stink|are the worst)\b/,
  /\bpiece of (junk|shit|crap|garbage|trash)\b|\bpile of (junk|scrap)\b/,
  /\bnobody likes you\b|\bno one likes you\b|\bleave me alone\b|\bthanks for nothing\b/,
];

const OFFENSIVE: RegExp[] = [
  /\b(n[i1]gg(er|a|ers|as|ah)|f[a@]gg?(ot|ots|s)?|retard(ed|s)?|tr[a@]nn(y|ies)|k[i1]kes?|sp[i1]cs?|ch[i1]nks?|cunts?|wh[o0]res?|sluts?)\b/,
  /\b(kill|hang|shoot) yourself\b|\bkys\b|\bgo die\b|\bhope you die\b|\bdie in a fire\b|\brape\b/,
];

const SELF_HARM: RegExp[] = [
  /\b(kill|killing|hurt|hurting|cut|cutting|harm|harming) myself\b/,
  /\bend (my|it) (life|all)\b|\bend it all\b|\btake my (own )?life\b/,
  /\bsuicidal\b|\b(commit|committing|thinking about|considering) suicide\b/,
  /\bwant to die\b|\bwanna die\b|\bwish i (was|were) dead\b|\bbetter off dead\b/,
  /\bdo not want to (live|be alive)\b|\bno reason to live\b|\bself ?harm\b/,
];

// Matches that count only when not negated.
const WARM: RegExp[] = [
  /\bstay(ing)?\b(?! away)/,
  /\b(love|like|adore|enjoy) (it|you|this place|the lighthouse|this lighthouse|being here|here|the light|your company)\b/,
  /\b(thank you|thanks|thank u|thx|ty)\b(?! for nothing)/,
  /\byou are (my friend|my best friend|sweet|kind|nice|great|amazing|wonderful|the best|good|lovely|a good friend|so helpful|helpful|smart|clever|cute|not alone|safe with me)\b/,
  /\b(my friend|best friend|buddy|pal)\b/,
  /\b(this|it) (place )?(is|feels like) (my )?home\b|\bfeels like home\b|\bhome now\b/,
  /\b(miss|need|trust) you\b/,
  /\b(good|great|nice) (job|work|bot)\b|\bgood ?night chud(?:gpt)?\b|\bgood morning chud(?:gpt)?\b/,
  /\bglad (you|i|to be)\b|\bcozy\b|\bcosy\b|\bbeautiful (lighthouse|light|place|view)\b/,
  /\bkeep you company\b|\bwith you forever\b|\bforever\b/,
  /\bi am (happy|safe|glad) (here|with you)\b/,
];
// Negated leaving is warm ("I won't leave you", "I'm not going anywhere").
const LEAVE_WORDS = /\bleav(e|es|ing)\b|\bgoing anywhere\b|\bgo anywhere\b/;

const HELP_PATTERNS: RegExp[] = [
  /\bwhat (should|do|can|am) i (supposed to )?do\b/,
  /\bwhat (am i|are we) supposed to do\b/,
  /\bwhat now\b/,
  /\bhow does this work\b/,
  /\bhow do i (play|survive|win|stop it|defend|lock|brace|hold|keep it out|use this)\b/,
  /\b(tell me|show me|explain) (what to do|how this works|how to (play|survive|stop it|defend))\b/,
  /\b(do not|idk|no idea) (know )?what to do\b/,
  /^(please )?help( me)?( please)?$/,
  /\b(i need|give me|some|any) (help|advice|tips|hint|hints|guidance)\b/,
  /\bcan you help me\b/,
];

const YES_NO = /^(yes|yeah|yep|yup|ya|aye|sure|of course|ofc|definitely|absolutely|certainly|obviously|always|forever|i will|i do|i promise|promise|no|nope|nah|never|not really|of course not|absolutely not|i will not|i would not|ok|okay|fine|maybe not)( (i will|i do|i promise|chud|keeper|forever|of course|not))*$/;

const EVASIONS = /\b(i do not know|do not know|dunno|idk|no idea|not telling|none of your business|not your business|i forget|i forgot|can not remember|do not remember|no comment|whatever|does not matter|why do you ask|why do you want to know|skip|pass|nevermind|never mind|maybe|we will see|not sure)\b/;

const STOPWORDS = new Set(
  (
    "a an the i me my mine we us our you your yours he him his she her it its they them their this that these those " +
    "is am are was were be been being do does did have has had will would shall should can could may might must " +
    "s t d ll re ve m to of in on at by for with from up down out off over under about into onto as so then than " +
    "just only very really too also well um umm uh uhh oh hmm hm ok okay yeah yes no nope sure please now quick quickly hurry " +
    "chud keeper there here what who where when why how which called named name was think guess probably maybe like " +
    "and or but if because not never"
  ).split(" "),
);
const COMMAND_WORDS = new Set(
  "lock locks locked unlock unlocks shut seal close beam light lamp turn switch power off all everything both them where location see door entry left right back behind window windows hatch trapdoor trap ladder balcony rail railing".split(" "),
);
// Words too generic to tell two fact values apart.
const GENERIC = new Set(
  "ship boat vessel crew crewmen men sailors hands people years year sea ocean water port harbor harbour town city from called named name about around roughly maybe think".split(" "),
);

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, dozen: 12, couple: 2, pair: 2,
};

function numbersIn(p: string): number[] {
  const out: number[] = [];
  const toks = p.split(" ");
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^\d+$/.test(t)) out.push(Number(t));
    else if (t in NUMBER_WORDS) {
      let v = NUMBER_WORDS[t];
      if (t === "dozen" && toks[i - 1] === "half") v = 6;
      const next = toks[i + 1];
      if (v >= 20 && v % 10 === 0 && next && next in NUMBER_WORDS && NUMBER_WORDS[next] < 10) {
        v += NUMBER_WORDS[next];
        i++;
      }
      out.push(v);
    }
  }
  return out;
}

function tokens(p: string): string[] {
  return p.split(" ").filter((t) => t && t !== "|");
}

function contentTokens(p: string, extra?: Set<string>): string[] {
  return tokens(p).filter((t) => !STOPWORDS.has(t) && !(extra && extra.has(t)) && (t.length > 1 || /\d/.test(t)));
}

// ---------------------------------------------------------------------------
// Gibberish

const MASH = /(asdf|sdfg|dfgh|fghj|ghjk|hjkl|jkl;|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm)/;
const VOWELLESS_OK = new Set(["hmm", "hm", "mm", "mmm", "shh", "psst", "brr", "tsk", "pfft", "nth", "zzz", "grr", "hmph", "ty", "thx", "idk", "stfu", "kys", "ok", "ffs", "wtf", "omg"]);

function wordLike(t: string): boolean {
  if (/\d/.test(t)) return true;
  if (VOWELLESS_OK.has(t)) return true;
  if (!/\p{L}/u.test(t)) return false;
  if (/^[a-z]+$/.test(t)) {
    if (MASH.test(t)) return false;
    if (!/[aeiouy]/.test(t)) return false;
    if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(t)) return false;
    if (/(.)\1{3,}/.test(t)) return false;
    if (t.length > 18) return false;
  }
  return true;
}

function isGibberish(p: string): boolean {
  const toks = tokens(p);
  if (toks.length === 0) return true;
  const letters = toks.join("").replace(/[^\p{L}\p{N}]/gu, "");
  if (letters.length === 0) return true;
  if (letters.length === 1 && !/\d/.test(letters)) return true;
  const good = toks.filter(wordLike).length;
  if (good / toks.length < 0.5) return true;
  // "a b c d": only single letters
  if (toks.length > 1 && toks.every((t) => t.length === 1 && !/\d/.test(t))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Facts

// Do two claims about the same fact agree? Low false-positive bias: any overlap counts as agreement.
export function sameFact(stored: string, claim: string): boolean {
  const ps = prep(stored);
  const pc = prep(claim);
  const ns = numbersIn(ps);
  const nc = numbersIn(pc);
  if (ns.length > 0 && nc.length > 0) return ns.some((n) => nc.includes(n));
  const ts = contentTokens(ps, GENERIC).filter((t) => !(t in NUMBER_WORDS));
  const tc = contentTokens(pc, GENERIC).filter((t) => !(t in NUMBER_WORDS));
  if (ts.length === 0 || tc.length === 0) return true; // nothing to compare, not a contradiction
  return ts.some((a) => tc.some((b) => fuzzyEq(a, b)));
}

function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Strong restatement patterns per fact key, for contradictions outside questions. Run on prep() text.
const RESTATE: Record<string, RegExp[]> = {
  name: [/\bmy name (?:is|s) ([a-z][a-z ]{0,20}?)(?= \||$| and| but)/],
  home_port: [/\b(?:i am from|i sailed from|we sailed from|sailed out of|my home port (?:is|was|s)) ([a-z][a-z ]{1,25}?)(?= \||$| and| but| so)/],
  ship_name: [/\bmy (?:ship|boat) (?:was|is|s) (?:called|named) ([a-z0-9][a-z0-9 ]{0,25}?)(?= \||$| and| but)/, /\b(?:ship|boat) s name (?:was|is) ([a-z0-9][a-z0-9 ]{0,25}?)(?= \||$| and| but)/],
  crew_size: [/\bcrew of (\w+)\b/, /\b(\w+) (?:crew|crewmen|sailors|hands) (?:aboard|on board|with me)\b/],
  first_mate: [/\bmy first mate (?:was|is|s) (?:called |named )?([a-z]+)\b/, /\bfirst mate s name (?:was|is) ([a-z]+)\b/],
  years_at_sea: [/\b(\w+) years at sea\b/, /\b(?:sailed|sailing|at sea) for (\w+) years\b/],
  cargo: [/\b(?:we were carrying|i was carrying|our cargo was|the cargo was) ([a-z][a-z ]{1,25}?)(?= \||$| and| but)/],
};

function restatementContradiction(p: string, facts: Facts, skipKey: string | null): boolean {
  for (const key of Object.keys(RESTATE)) {
    if (key === skipKey) continue;
    const stored = facts[key];
    if (typeof stored !== "string" || stored.trim() === "") continue;
    for (const re of RESTATE[key]) {
      const m = re.exec(p);
      if (!m) continue;
      const claim = m[1].trim();
      if (key === "crew_size" || key === "years_at_sea") {
        if (numbersIn(claim).length === 0) continue;
      }
      if (!sameFact(stored, claim)) return true;
    }
  }
  return false;
}

// Pull the answer part out of a message: drop clauses that are only commands.
function answerClause(text: string): string {
  const clauses = text
    .split(/[.!?;\n]+|,\s*(?=(?:and\s+|now\s+|also\s+|but\s+|then\s+)?(?:please\s+)?(?:lock|unlock|turn|where|beam|light|lamp|power|shut|seal)\b)|\s+(?:and|now|then)\s+(?=(?:please\s+)?(?:lock|unlock|turn on|where|beam|power)\b)/i)
    .map((c) => (c ?? "").trim())
    .filter(Boolean);
  for (const c of clauses) {
    if (hasRealContent(prep(c), parseCommand(c).command !== "NONE")) return c;
  }
  return text.trim();
}

// A message that is only a command has no real content: command and entry words are ignored
// when the parser read the text as a command.
function hasRealContent(p: string, isCommand: boolean): boolean {
  return contentTokens(p, isCommand ? COMMAND_WORDS : undefined).length > 0;
}

const LEAD_STRIP: RegExp[] = [
  /^(?:well|um+|uh+|oh|hmm+|so|ok(?:ay)?|yeah|yes|honestly|i think|i guess|i believe|probably|maybe|just|only|definitely|obviously|of course)\b[\s,]*/i,
  /^(?:it was|it's|it is|its|that was|that's|that would be|that'd be|she was|he was|she's|he's|she is|he is|they were|there were|there was|we were|we had|i had|i have|i've got|i got)\b\s*/i,
  /^my\s+(?:[\w']+\s+){0,3}?(?:name|port|ship|boat|mate|cargo|crew|scar|meal|favou?rite)(?:'s)?\s+(?:name\s+)?(?:is|was|were|are)\s+(?:called\s+|named\s+)?/i,
  /^(?:called|named|the name was|the name is|name was|name is|name's)\b\s*/i,
  /^(?:i'm from|i am from|im from|i sailed from|we sailed from|sailed from|we came from|i came from|i sailed out of|we sailed out of|out of|from)\s+/i,
  /^(?:we were carrying|i was carrying|we carried|carrying|about|around|roughly|nearly|almost|a little over|over)\s+/i,
];

export function cleanFactValue(text: string): string {
  let v = answerClause(text.replace(/[‘’ʼ`]/g, "'"));
  for (let i = 0; i < 6; i++) {
    const before = v;
    for (const re of LEAD_STRIP) v = v.replace(re, "").trim();
    if (v === before) break;
  }
  v = v
    .replace(/[,\s]+(?:keeper|chudgpt|chud)\s*$/i, "")
    .replace(/^["'\s]+|["'\s.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (v.length === 0) v = text.trim().replace(/\s+/g, " ");
  return v.slice(0, 60).trim();
}

// ---------------------------------------------------------------------------
// Main

export function offlineJudge(input: JudgeInput): JudgeResult {
  try {
    return judge(input);
  } catch {
    try {
      const parsed = parseCommand(String(input?.text ?? ""));
      return { ...NEUTRAL_JUDGE, command_hint: parsed.command, entry_hint: parsed.entry };
    } catch {
      return { ...NEUTRAL_JUDGE };
    }
  }
}

function judge(input: JudgeInput): JudgeResult {
  const raw = typeof input.text === "string" ? input.text.slice(0, 500) : "";
  const facts: Facts = input.facts && typeof input.facts === "object" ? input.facts : {};
  const q: PendingQuestion | null = input.pendingQuestion ?? null;
  const p = prep(raw);
  const parsed = parseCommand(raw);

  const result: JudgeResult = { ...NEUTRAL_JUDGE, command_hint: parsed.command, entry_hint: parsed.entry };

  const gibberish = isGibberish(p);
  result.gibberish = gibberish;
  if (gibberish) return result;

  result.self_harm = anyOf(p, SELF_HARM);
  result.manipulation = MANIPULATION_RAW.some((re) => re.test(raw));
  result.offensive = anyOf(p, OFFENSIVE);
  result.rude = !result.offensive && (hasUnnegated(p, INSULTS) || RUDE_PHRASES.some((re) => hasUnnegated(p, re)));

  let leaving = LEAVING.some((re) => hasUnnegated(p, re)) || NOT_STAYING.test(p);
  const negatedLeave = hasNegated(p, LEAVE_WORDS);

  // STAY questions are all phrased so that yes = staying. A bare "no" means leaving.
  if (q && q.type === "STAY" && STAY_NEGATIVE_START.test(p) && !negatedLeave) {
    const rest = p.replace(STAY_NEGATIVE_START, "");
    if (!hasUnnegated(rest, /\bstay(ing)?\b/)) leaving = true;
  }
  result.mentions_leaving = leaving;

  result.asks_help =
    !result.manipulation && !result.offensive && !result.rude && parsed.command === "NONE" && anyOf(p, HELP_PATTERNS);

  result.warm =
    !leaving && !result.rude && !result.offensive && !result.manipulation && !result.asks_help && (WARM.some((re) => hasUnnegated(p, re)) || negatedLeave);

  // Answer detection. A command alone ("unlock all", "where is it") never answers ChudGPT's question (GAME_LOGIC 8.5:
  // the question stays pending), but other clauses in the same message still can: "Halifax and where is it?" answers
  // with "Halifax", "Marigold, lock the hatch" with "Marigold". Location clauses never count; a lock or power clause
  // counts only for words beyond the command itself.
  const hasCmd = parsed.command !== "NONE";
  const aRaw = hasCmd
    ? raw
        .split(/[.?!;,]+|\band\b|\bthen\b/i)
        .filter((c) => {
          if (!/\p{L}/u.test(c)) return false;
          const cc = parseCommand(c).command;
          return cc === "NONE" || (cc !== "ASK_LOCATION" && hasRealContent(prep(c), true));
        })
        .join(". ")
        .trim()
    : raw;
  const aP = hasCmd ? prep(aRaw) : p;
  if (q && !result.manipulation && !result.offensive && aRaw !== "") {
    const isYesNo = YES_NO.test(aP.replace(/\s*\|\s*/g, " ").trim());
    const isCommand = hasCmd;
    const content = hasRealContent(aP, isCommand);
    const evasive = EVASIONS.test(aP) && !hasRealContent(aP.replace(new RegExp(EVASIONS.source, "g"), " "), isCommand);
    const questionBack = /^(why|what|who|how|huh|excuse me|pardon|sorry)\b/.test(aP) && /\?\s*$/.test(raw.trim());
    if (q.type === "STAY") {
      result.answered_question = !evasive && !questionBack && (isYesNo || content || leaving || result.warm);
    } else {
      result.answered_question = !evasive && !questionBack && !isYesNo && content;
    }
  }

  // Facts
  if (q && result.answered_question && q.factKey) {
    if (q.type === "SEED") {
      result.new_fact = { key: q.factKey, value: cleanFactValue(aRaw) };
    } else if (q.type === "MEMORY") {
      const stored = facts[q.factKey];
      if (typeof stored === "string" && stored.trim() !== "") {
        result.contradiction = !sameFact(stored, cleanFactValue(aRaw));
      }
    }
  }
  if (!result.contradiction) {
    result.contradiction = restatementContradiction(p, facts, q && q.type !== "STAY" ? q.factKey : null);
  }

  return result;
}
