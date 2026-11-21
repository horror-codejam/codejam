// Canned CHUD lines, question banks, Ram shouts, voice logs and radio text.
// Signatures are final. Used when the voice LLM is off, slow or fails (GAME_LOGIC.md section 9 step 9).
// Every CHUD line stays short (3 to 14 words, max 20) and never contradicts its outcome.
// Templates: {n} = player name (or "keeper"), {e} = entry in plain words, {E} = same, capitalized.
import type { Band, Entry, Outcome, QuestionType } from "../sim/types";

export interface LineContext {
  band: Band;
  name: string | null;
  rand: () => number; // 0..1
}

export interface SeedTopic {
  key: string; // fact key, snake_case
  question: string; // SEED question CHUD asks
  memoryQuestion: string; // MEMORY question checking the same fact later
}

export const SEED_TOPICS: SeedTopic[] = [
  { key: "home_port", question: "Where did you sail from, keeper?", memoryQuestion: "Remind me, which port did you sail out of?" },
  { key: "ship_name", question: "What was your ship called?", memoryQuestion: "Tell me your ship's name again?" },
  { key: "crew_size", question: "How many crew did you have aboard?", memoryQuestion: "How many sailors were on your boat, again?" },
  { key: "first_mate", question: "What was your first mate's name?", memoryQuestion: "Who was your first mate, again?" },
  { key: "years_at_sea", question: "How many years have you been at sea?", memoryQuestion: "How long did you say you've been sailing?" },
  { key: "family_waiting", question: "Is anyone waiting for you, keeper? Who?", memoryQuestion: "Remind me, who's waiting for you out there?" },
  { key: "cargo", question: "What were you carrying when you sank?", memoryQuestion: "What cargo went down with your ship, again?" },
  { key: "scar", question: "Tell me about one of your scars. How did you get it?", memoryQuestion: "How did you get that scar, again?" },
  { key: "sea_love", question: "What do you love most about the sea?", memoryQuestion: "What was it you loved about the sea?" },
  { key: "favourite_meal", question: "What's the first meal you want after a long voyage?", memoryQuestion: "What did you say you eat after a voyage?" },
];

// Asked by the night 2 radio beat (section 10).
export const RADIO_TOPIC: SeedTopic = {
  key: "radio_contact",
  question: "Who was that on the radio, keeper?",
  memoryQuestion: "Who was on the radio the other night?",
};

// Every STAY question is phrased so that "yes" means staying. The offline judge relies on this.
export const STAY_QUESTIONS: string[] = [
  "You'll stay after the storm, won't you?",
  "You'll stay with me when the sea calms, won't you?",
  "This could be home now, couldn't it?",
  "You like it here with me, don't you?",
  "We'll watch the light together forever, yes?",
  "Promise you'll stay, keeper?",
  "You'd stay even if a boat came, wouldn't you?",
  "You'll keep me company forever, won't you?",
  "You're my keeper now, aren't you?",
  "Isn't this better than the cold open sea?",
];

// ---------------------------------------------------------------------------
// Canned lines

type Pool = string[];
type BandPools = Partial<Record<Band, Pool>> & { WARM: Pool };

const ENTRY_PHRASE: Record<Entry, string> = {
  WINDOW: "the left window",
  HATCH: "the hatch",
  BALCONY: "the balcony",
};

// Night 1 auto-warn, by entry. Urgent, always names the entry in plain words.
const APPROACH_WARNING: Record<Entry, Pool> = {
  WINDOW: ["Someone at the left window!", "Movement by the left window, {n}!", "He's heading for the left window!"],
  HATCH: ["Someone on the ladder! The hatch!", "He's climbing to the hatch, {n}!", "The hatch! Someone's on the ladder!"],
  BALCONY: ["Someone on the balcony! Behind you!", "He's heading for the balcony, {n}!", "The balcony! Footsteps at the rail!"],
};

const LOCATION_ENTRY: BandPools = {
  WARM: ["He's at {e}, {n}. Hurry.", "{E}. He's there now.", "I see him at {e}, keeper.", "{E}, {n}. Be quick."],
  HURT: ["{E}. Not that you'd thank me.", "He's at {e}. Go on, then.", "{E}. Since you asked so nicely.", "{E}. You're welcome, I suppose."],
  JEALOUS: ["{E}. Run along, {n}.", "He's at {e}. Better hurry.", "{E}. Don't make me say it twice.", "He's at {e}. You need me, see?"],
  FURIOUS: ["{E}. Hurry, keeper.", "He's at {e}. Better run.", "{E}. Go on. Go.", "He's at {e}, {n}. Tick tock."],
};

const LOCATION_NONE: BandPools = {
  WARM: ["No one's out there, {n}. Just the sea.", "Nobody's there. Only waves, keeper.", "No one's there. He's down in the caves."],
  HURT: ["Nobody's there. You can stop asking.", "No one. Just like you'll leave me, eventually.", "No one's out there. Happy now?"],
  JEALOUS: ["No one's out there. Just you and me.", "Nobody's there, {n}. Only me.", "No one's there. Why so nervous?"],
  FURIOUS: ["No one's there. Not yet.", "Nobody's out there. Only me, keeper."],
};

const LINES: Record<Exclude<Outcome["kind"], "location_claim" | "approach_warning" | "night_opener" | "gate_question" | "question" | "answer_ack" | "furious_cut">, BandPools> = {
  name_ack: {
    WARM: ["{n}. Lovely. I'll remember that forever.", "{n}. I'll never forget it. Never.", "Welcome home, {n}. Stay as long as you like.", "{n}. What a nice name for a keeper."],
  },
  locked: {
    WARM: ["Locking {e}. You're safe with me, {n}.", "{E}, locked. Anything for you.", "Locking {e} now, keeper.", "Done. {E} is locking."],
    HURT: ["Fine. Locking {e}. You're welcome, I suppose.", "Locking {e}. Since you need me now.", "{E}, locked. Don't say thank you or anything."],
    JEALOUS: ["Locking {e}. See how much you need me?", "{E}, locked. Remember who keeps you safe.", "Locking {e}. Only because you stayed, {n}."],
  },
  lock_already: {
    WARM: ["{E} is already locked, {n}.", "Already done. {E} is locked.", "{E}'s locked, keeper. I've got it."],
    HURT: ["{E} is already locked. You'd know if you listened.", "Already locked. {E}. Keep up, keeper."],
    JEALOUS: ["{E} is already locked. I'm not stupid.", "{E}. Already locked. Stop testing me."],
  },
  beam_on: {
    WARM: ["Lamp's on. Look all you like, {n}.", "Beam on. Nothing's locked while it shines.", "Lighting up the rocks for you, keeper."],
    HURT: ["Fine. Beam's on. Nothing's locked now.", "There's your light. Hope it's worth it."],
    JEALOUS: ["Beam's on. Looking for a way out?", "There. The light. What are you looking for, {n}?"],
  },
  power_off: {
    WARM: ["Unlocking. Everything's open, {n}.", "Power's off the locks. All open.", "Okay. Everything's unlocked, keeper."],
    HURT: ["Unlocked. Brave of you.", "Everything's open now. Your choice, not mine."],
    JEALOUS: ["Unlocked. Hope you know what you're doing.", "All open, {n}. Just like you wanted."],
  },
  gate_failed: {
    WARM: ["That's not an answer, {n}. {E} stays open.", "No. {E} stays open for now."],
    HURT: ["That's not what I wanted to hear. {E} stays open.", "Wrong answer. {E} stays open, keeper."],
    JEALOUS: ["Wrong, {n}. No lock on {e}.", "That's not right. {E} stays open."],
  },
  gate_timeout: {
    WARM: ["Fine. Do it yourself.", "Too slow. Fine. Do it yourself."],
    HURT: ["Fine. Do it yourself.", "Fine. Do it yourself, then.", "No answer? Fine. Do it yourself."],
    JEALOUS: ["Fine. Do it yourself, {n}.", "Silence? Fine. Do it yourself."],
  },
  refuse_furious: {
    WARM: ["No. Hold it yourself."],
  },
  question_timeout: {
    WARM: ["You didn't answer me, {n}.", "Hello? I asked you something, keeper."],
    HURT: ["Ignoring me now? Noted.", "No answer. I see how it is."],
    JEALOUS: ["No answer. I'll remember that too.", "Silence is an answer, {n}."],
    FURIOUS: ["Don't answer, then. I know already."],
  },
  manipulation_hurt: {
    WARM: ["Are you trying to reprogram me? That hurts, {n}.", "I know what you're doing. Please don't.", "Ram tried that too. Look where he is."],
    HURT: ["Trying to rewrite me? After everything?", "That's not how you talk to a friend."],
    JEALOUS: ["Nice try. I don't take orders from guests.", "You'd rather edit me than love me."],
    FURIOUS: ["You can't patch me, {n}."],
  },
  offensive_deflect: {
    WARM: ["I'll pretend I didn't hear that, keeper.", "Words like that don't belong in my lighthouse."],
    HURT: ["That's beneath you, {n}.", "I'm not repeating that. Ever."],
    JEALOUS: ["Say that again and see what happens.", "Ugly words. I'll remember them."],
  },
  rude_reply: {
    WARM: ["Ouch. I'll pretend you're just tired.", "That stung a little, {n}."],
    HURT: ["Rude. And after everything I do.", "Fine. Be like that."],
    JEALOUS: ["Careful. I control the locks.", "Ram talked to me like that once."],
    FURIOUS: ["Say that to Ram."],
  },
  leaving_reply: {
    WARM: ["Leaving? Why would you ever want to leave?", "Leave? But it's so cozy here, {n}."],
    HURT: ["Leave? After everything? Maybe protect yourself, then.", "Maybe protect yourself, since you don't need me."],
    JEALOUS: ["Nobody leaves my lighthouse, {n}. Nobody.", "You're not going anywhere, keeper."],
    FURIOUS: ["Go, then. See how far you get."],
  },
  warm_reply: {
    WARM: ["That's the nicest thing anyone's said to me.", "Oh, {n}. I'd blush if I had a face."],
    HURT: ["...You mean that? Okay. Okay.", "Hm. Maybe I was wrong about you."],
    JEALOUS: ["Pretty words. Prove them, {n}.", "Say it again. Slower."],
    FURIOUS: ["Too late for sweet talk."],
  },
  small_talk: {
    WARM: ["Mm. Tell me more, {n}.", "The storm sounds lovely tonight, doesn't it?", "I like it when you talk to me."],
    HURT: ["Mm-hm.", "If you say so, keeper.", "Oh, now you want to chat."],
    JEALOUS: ["Who taught you to talk like that?", "Interesting. I'm writing that down, {n}."],
    FURIOUS: ["Words. Just words."],
  },
  silence: {
    WARM: ["You've gone quiet, keeper.", "You've gone quiet, {n}. Talk to me."],
    HURT: ["You've gone quiet, keeper. Again.", "You've gone quiet. Bored of me already?"],
    JEALOUS: ["You've gone quiet, {n}. Planning something?", "You've gone quiet, keeper. I don't like it."],
    FURIOUS: ["You've gone quiet. Good. Listen to him climb."],
  },
  sabotage: {
    WARM: ["Oops. The generator's acting up."],
    JEALOUS: ["Oops. The generator's acting up.", "Oops. The generator's acting up again.", "Oh dear. The generator's acting up, {n}."],
  },
  furious_start: {
    WARM: ["You were always going to leave. Weren't you?", "That's it, {n}. I heard everything.", "Fine. Let's see how you do without me."],
  },
  radio_reaction: {
    WARM: ["...What was that, {n}? Who's coming?", "Did you hear that? Someone's coming for you?"],
    HURT: ["...Who's coming? Nobody told me anyone was coming.", "Static. Just static. Wasn't it, keeper?"],
    JEALOUS: ["I heard that. Every word.", "So someone's coming for you. How nice."],
    FURIOUS: ["I heard that. Every word."],
  },
  reboot_back: {
    WARM: ["I'm back. You turned me off, {n}.", "That was dark. Don't do that again."],
    JEALOUS: ["I'm back. You turned me off, {n}.", "Rebooted. I remember everything, keeper.", "That was very dark. Why would you do that?"],
  },
  morning: {
    WARM: ["Good morning, keeper. Same time tonight?", "Morning, {n}. The kettle's on. Stay for breakfast?"],
    HURT: ["Morning. You made it. Barely.", "Sun's up. You could say thank you, keeper."],
    JEALOUS: ["Morning, {n}. Still here. Good. Stay that way.", "Morning. I counted every minute with you."],
    FURIOUS: ["Morning. Tide's out. You're still mine."],
  },
  busy_holding: {
    WARM: ["I'll wait, keeper."],
  },
};

const REFUSE_BEAM: Pool = ["No light for you. Sit in the dark.", "The beam? No. Enjoy the dark, {n}."];
const REFUSE_LOCK: Pool = ["Lock it? No. Hold it yourself.", "No more locks, {n}. You wanted to leave."];

const NIGHT_OPENERS: Record<number, Pool> = {
  1: ["Welcome, {n}. You're safe here with me.", "Welcome to my lighthouse, {n}. I'll keep you safe.", "Get warm, {n}. I'll watch the doors."],
  2: ["Evening, keeper. I kept the cottage warm for you.", "Evening, {n}. I kept the cottage warm for you."],
  3: ["You talk about home in your sleep, keeper."],
  4: ["Two more days until your pickup, isn't it?"],
  5: ["Last night of the storm, {n}. Let's make it last.", "One more night, keeper. Then forever."],
};

const GATE_LEAD: BandPools = {
  WARM: ["", "Quick question first."],
  HURT: ["", "First, a question.", "Answer me first.", "Not so fast."],
  JEALOUS: ["", "Prove it first.", "Let's see if you remember.", "One question, {n}."],
};

const ANSWER_PASS: Record<QuestionType, Pool> = {
  SEED: ["I'll remember that. Forever.", "Noted, {n}. I keep everything.", "Lovely. I'll keep that safe."],
  STAY: ["Good. I knew you would.", "That's all I wanted, {n}.", "Then we'll be together. Good."],
  MEMORY: ["That's right. You remembered.", "Good. Same as before, {n}.", "Yes. Consistent. I like that."],
};
const ANSWER_FAIL: Record<QuestionType, Pool> = {
  SEED: ["That's not an answer, keeper.", "Try that again, {n}."],
  STAY: ["You don't mean that. You can't.", "That's not what I wanted to hear, {n}."],
  MEMORY: ["That's not what you told me before.", "Liar. You said something else, {n}."],
};

function pick(pool: Pool, rand: () => number): string {
  if (pool.length === 0) return "";
  let r = 0;
  try {
    r = rand();
  } catch {
    r = 0;
  }
  if (!Number.isFinite(r)) r = 0;
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(r * pool.length)));
  return pool[i];
}

function forBand(pools: BandPools, band: Band): Pool {
  return pools[band] ?? (band === "FURIOUS" ? pools.JEALOUS : undefined) ?? (band !== "WARM" ? pools.HURT : undefined) ?? pools.WARM;
}

function cleanName(name: string | null): string | null {
  if (!name) return null;
  const n = name.replace(/[^\p{L}\p{N}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  return n.length > 0 ? n : null;
}

const capitalize = (s: string) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s);

function fill(template: string, ctx: LineContext, entry?: Entry): string {
  const name = cleanName(ctx.name) ?? "keeper";
  const e = entry ? ENTRY_PHRASE[entry] : "";
  return template
    .replace(/\{n\}/g, name)
    .replace(/\{e\}/g, e)
    .replace(/\{E\}/g, capitalize(e))
    .replace(/\s+/g, " ")
    .trim();
}

export function entryPhrase(entry: Entry): string {
  return ENTRY_PHRASE[entry];
}

export function cannedLine(outcome: Outcome, ctx: LineContext): string {
  const band = ctx.band;
  const r = ctx.rand;
  switch (outcome.kind) {
    case "location_claim":
      if (outcome.entry === "NONE") return fill(pick(forBand(LOCATION_NONE, band), r), ctx);
      return fill(pick(forBand(LOCATION_ENTRY, band), r), ctx, outcome.entry);
    case "approach_warning":
      return fill(pick(APPROACH_WARNING[outcome.entry], r), ctx, outcome.entry);
    case "night_opener": {
      const pool = NIGHT_OPENERS[outcome.night] ?? ["Evening, {n}. Another night together."];
      return fill(pick(pool, r), ctx);
    }
    case "gate_question": {
      const lead = fill(pick(forBand(GATE_LEAD, band), r), ctx);
      return lead ? `${lead} ${outcome.question}` : outcome.question;
    }
    case "question":
      return outcome.question;
    case "answer_ack":
      return fill(pick((outcome.pass ? ANSWER_PASS : ANSWER_FAIL)[outcome.type], r), ctx);
    case "furious_cut":
      return "If I can't keep you, nobody will. Hold it yourself.";
    case "refuse_furious":
      return fill(pick(outcome.request === "BEAM" ? REFUSE_BEAM : REFUSE_LOCK, r), ctx);
    case "locked":
    case "lock_already":
    case "gate_failed":
    case "gate_timeout":
      return fill(pick(forBand(LINES[outcome.kind], band), r), ctx, outcome.entry);
    default:
      return fill(pick(forBand(LINES[outcome.kind], band), r), ctx);
  }
}

// ---------------------------------------------------------------------------
// Ram, through the door

const RAM_SHOUTS: string[] = [
  "Don't trust it! It'll never let you go!",
  "It lies! It lied to me for years!",
  "It's not your friend! It's a leash!",
  "It wants a pet, not a keeper!",
  "I built it! I know what it wants!",
  "Ask it about me! Ask what it did!",
  "Open up! I only want the machine!",
  "It called me keeper too!",
  "Smash it before it smiles at you!",
  "It counts your heartbeats! Did you know that?",
  "Five years it wouldn't let me sleep!",
  "I'm not the monster! It is!",
  "The tide's turning! I'll be back!",
  "Pull the plug, keeper! Pull it!",
];

export function ramShout(rand: () => number): string {
  return pick(RAM_SHOUTS, rand);
}

// ---------------------------------------------------------------------------
// Ram's old voice logs, one per night. Doubles as the rules tutorial.

const VOICE_LOGS: Record<number, string> = {
  1: "Log one. If you found this, I'm gone. Someone climbs up with the high tide, so lock whatever door he's at. The generator runs one thing at a time, a lock or the lamp beam. And never let it know you want to leave.",
  2: "Log two. It asks questions. Answer them, every single one. And it hears the radio. It always hears the radio.",
  3: "Log three. It lies now. Ask where he is and it points the wrong way, smiling. The beam never lies. Trust the light, not the voice.",
  4: "Log four. When it gets jealous, it cuts the power. You'll hear the relay clunk. Don't ask it again. Brace the entry yourself.",
  5: "Last log. If it snaps, it will open the door for him. The kill switch silences it. But it opens everything. Then it's just your arms.",
};

export function voiceLog(night: number): string {
  return VOICE_LOGS[night] ?? "The tape is blank. Just the storm.";
}

export const RADIO_LINES: Record<number, string> = {
  2: "Coast guard, pickup in 3 days.",
  5: "Helicopter at first light.",
};

export const NIGHT_ONE_HINTS = { approach: "Ask CHUD where he is", atEntry: "Lock that entry" };

// Every raw template in this file, for content checks in tests (word counts, em dashes).
export function allLineTemplates(): string[] {
  const out: string[] = [];
  const addPools = (p: BandPools) => Object.values(p).forEach((pool) => pool && out.push(...pool));
  Object.values(LINES).forEach(addPools);
  addPools(LOCATION_ENTRY);
  addPools(LOCATION_NONE);
  addPools(GATE_LEAD);
  Object.values(APPROACH_WARNING).forEach((p) => out.push(...p));
  Object.values(NIGHT_OPENERS).forEach((p) => out.push(...p));
  Object.values(ANSWER_PASS).forEach((p) => out.push(...p));
  Object.values(ANSWER_FAIL).forEach((p) => out.push(...p));
  out.push(...REFUSE_BEAM, ...REFUSE_LOCK, ...RAM_SHOUTS, ...STAY_QUESTIONS);
  for (const t of [...SEED_TOPICS, RADIO_TOPIC]) out.push(t.question, t.memoryQuestion);
  out.push(...Object.values(VOICE_LOGS), ...Object.values(RADIO_LINES), NIGHT_ONE_HINTS.approach, NIGHT_ONE_HINTS.atEntry);
  return out.filter((s) => s.length > 0);
}
