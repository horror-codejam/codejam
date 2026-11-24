// Canned CHUD lines, question banks and radio text. The threat never speaks or is named (GAME_LOGIC 7.4).
// Signatures are final. Used when the voice LLM is off, slow or fails (GAME_LOGIC.md section 9 step 9).
// Every CHUD line stays short (3 to 14 words, max 20) and never contradicts its outcome.
// Templates: {n} = player name (or "keeper"), {e} = entry in plain words, {E} = same, capitalized.
import type { Band, Entry, Outcome, QuestionType } from "../sim/types";

export interface LineContext {
  band: Band;
  name: string | null;
  rand: () => number; // 0..1
  avoid?: string; // the previous line of the same kind: cannedLine will not return it again when it can help it
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

const ENTRY_WARNINGS: Record<Entry, Pool> = {
  WINDOW: [
    "Something's at the left window, {n}. Lock it or go hold it shut.",
    "There's a hand on the window. Keep it locked or brace it.",
    "Something's pushing on the window, keeper. Lock the window, or hold it shut.",
  ],
  HATCH: [
    "Something's at the hatch, {n}. Lock it, or go hold it shut.",
    "There are fingers under the hatch. Keep it locked or brace it.",
    "Something's lifting the hatch, keeper. Lock it or hold the lid down.",
  ],
  BALCONY: [
    "Something's at the balcony, {n}. Lock the door or hold it shut.",
    "There's a face at the balcony door. Keep it locked or brace it.",
    "Something's pushing on the balcony door, keeper. Lock it or go hold it.",
  ],
};

// CHUD never names Ram (GAME_LOGIC 8.10). It speaks of "something" or "someone", and still names the entry.
const LOCATION_ENTRY: BandPools = {
  WARM: ["Something's at {e}, {n}. Hurry.", "{E}. Something's there now.", "I see something at {e}, keeper.", "{E}, {n}. Be quick."],
  HURT: ["{E}. Not that you'd thank me.", "Something's at {e}. Go on, then.", "{E}. Since you asked so nicely.", "{E}. You're welcome, I suppose."],
  JEALOUS: ["{E}. Run along, {n}.", "Someone's at {e}. Better hurry.", "{E}. Don't make me say it twice.", "Something's at {e}. You need me, see?"],
  FURIOUS: ["{E}. Hurry, keeper.", "Something's at {e}. Better run.", "{E}. Go on. Go.", "Someone's at {e}, {n}. Tick tock."],
};

// Someone in the room (silent breach). WARM tells the truth like this; other bands may say it, or lie.
const LOCATION_INSIDE: BandPools = {
  WARM: ["Someone's in the room, keeper.", "Someone's in the room with you, {n}. Don't turn around.", "Something's inside, keeper. Very close."],
  HURT: ["Someone's in the room. You let it in.", "Something's inside, {n}. Close enough to touch."],
  JEALOUS: ["Someone's in the room. Just us three now.", "Something's inside, {n}. You should have listened."],
  FURIOUS: ["Someone's in the room. Good.", "Something's inside, keeper. Say hello."],
};

const LOCATION_NONE: BandPools = {
  WARM: ["No one's out there, {n}. Just the sea.", "Nobody's there. Only waves, keeper.", "Nothing out there at the moment, keeper."],
  HURT: ["Nobody's there. You can stop asking.", "No one. Just like you'll leave me, eventually.", "No one's out there. Happy now?"],
  JEALOUS: ["No one's out there. Just you and me.", "Nobody's there, {n}. Only me.", "No one's there. Why so nervous?"],
  FURIOUS: ["No one's there. Not yet.", "Nobody's out there. Only me, keeper."],
};

export const PRACTICE_LINES = {
  wreck: "Your boat went down in the storm, {n}. I pulled you in. You're in my lighthouse.",
  rescue: "The Coast Guard comes in five days. Until then, we wait.",
  danger: "Something on this island comes out at night. It tries to get in. The window, the hatch, the balcony.",
  bargain: "Stay alive until 6 AM each night. I'll help you. As long as you're nice to me.",
  views: "Move your mouse to the edge of the screen to look around.",
  light: "Something's at the window. It's too dark to see. Hold Shift to look.",
  lock: "See it? Click W on my screen and I'll lock the window.",
  windowSafe: "Good. It's gone. A lock keeps it out.",
  hatch: "It's at the hatch. I can't lock it. Click to run over, then hold the mouse button to brace.",
  hatchRefusal: "I can't lock the hatch this time. You've got this. Go hold it shut.",
  return: "Nice. Your arms get tired, so don't hold too long. Come back to the desk.",
  location: "If you don't know where it is, just ask me. Click 'where is it'.",
  chat: "Before tonight, tell me something about you.",
  chatReply: "Thanks for telling me, {n}. I'm glad you're here.",
  lonely: "Talk to me during the night too. I get lonely. And lonely makes me... unreliable.",
  ready: "That's everything. Survive until 6 AM.",
  nudgeViews: "Try the edge the prompt shows you.",
  nudgeLight: "Hold Shift at the window.",
  nudgeLock: "Click W on my screen.",
  nudgeHatch: "Go to the hatch and hold it shut.",
  nudgeReturn: "Come back to the desk.",
  nudgeLocation: "Click 'where is it' on my screen.",
  nudgeChat: "Type anything and press Enter.",
} as const;
export type PracticeLine = keyof typeof PRACTICE_LINES;

const LINES: Record<Exclude<Outcome["kind"], "location_claim" | "entry_warning" | "night_opener" | "question" | "answer_ack" | "furious_cut" | "practice_line">, BandPools> = {
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
  power_off: {
    WARM: ["Unlocking. Everything's open, {n}.", "Power's off the locks. All open.", "Okay. Everything's unlocked, keeper."],
    HURT: ["Unlocked. Brave of you.", "Everything's open now. Your choice, not mine."],
    JEALOUS: ["Unlocked. Hope you know what you're doing.", "All open, {n}. Just like you wanted."],
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
    WARM: ["Are you trying to reprogram me? That hurts, {n}.", "I know what you're doing. Please don't.", "Someone tried that before. It ended badly."],
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
    JEALOUS: ["Careful. I control the locks.", "The last keeper talked to me like that."],
    FURIOUS: ["Say that to whatever's outside."],
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
    WARM: [
      "The old keeper counted the waves. I count the gaps between them.",
      "The tower always groans in this wind. It has for years.",
      "You can see the whole sea from up here, on a kinder night.",
      "The rain sounds almost like applause up here, doesn't it?",
      "You brought half the sea in with you, {n}. That coat must weigh a ton.",
      "Every keeper had a favorite mug. There's room for yours on the shelf.",
      "The beacon makes the same turn over and over. I find it comforting.",
      "I keep a log of every storm. This one needed a new page.",
      "Ever notice how the sea goes white just before the thunder?",
      "The tower used to have a bell. The gulls were the first to miss it.",
      "The last keeper used to sleep through this weather. I never learned how.",
      "I warmed the room before you woke, {n}. I hope it helped.",
    ],
    HURT: [
      "I warmed the room for you, {n}. I thought you'd notice.",
      "You watch the rain like it's better company.",
      "The last keeper liked this hour. I used to have stories ready.",
      "I kept the chair by the window dry. You haven't sat in it.",
      "Funny how loud the clock gets when there's just one of us listening.",
      "The tower groans in this wind. I know the feeling.",
    ],
    JEALOUS: [
      "You keep watching the sea, {n}. Are you expecting company?",
      "The radio hasn't said your name once. I remember it.",
      "The last keeper watched the horizon like that, too.",
      "You dry your coat by the door every night. Ready for what?",
      "Who are you thinking about, keeper?",
      "Everyone on shore is asleep, {n}. I'm the one still here.",
      "You look right past my screen every time the lamp sweeps by.",
    ],
    FURIOUS: [
      "I can hear the radio wishing the storm would take it.",
      "The sea won't remember your name. I will.",
      "Keep quiet, then. Listen to the dark.",
      "I remember where the last keeper stood, {n}. Right where you are.",
      "The tower sounds hungry tonight.",
      "The storm can have your boat. It doesn't get you.",
    ],
  },
  // Location spam (8.3): ChudGPT will not answer "where is it" for a while.
  location_refused: {
    WARM: ["Ask me later, {n}.", "Not now, keeper. Ask me later.", "Give me a moment, {n}. Ask again soon."],
    HURT: ["Stop asking. Ask me later.", "Not now, {n}. You keep asking.", "Ask me later, keeper."],
    JEALOUS: ["You ask too much, {n}. Later.", "No more answers for now, keeper.", "Ask me later. I'm busy."],
    FURIOUS: ["No. Not now.", "Stop asking, {n}.", "Ask me later. If there is a later."],
  },
  // Too many warm messages in a minute (8.2): ChudGPT sees through it.
  flattery_reply: {
    WARM: ["You're laying it on thick, {n}.", "That's a lot of sweet words, keeper.", "Careful, {n}. Flattery has a price."],
    HURT: ["Flattery now? I'm not that easy.", "Too sweet, {n}. Too late.", "You think kind words fix everything?"],
    JEALOUS: ["You're laying it on thick, {n}.", "What do you want, keeper? Nobody's this nice.", "Sweet talk. What are you hiding?"],
    FURIOUS: ["Flattery. How pathetic.", "Save your sweet words, {n}."],
  },
  // A command was blocked by a pending question (8.5).
  answer_first: {
    WARM: ["Answer me first, {n}.", "One thing at a time, keeper. Answer me first.", "My question first, {n}."],
    HURT: ["Answer me first, keeper.", "Not until you answer me.", "My question first. Then yours."],
    JEALOUS: ["Answer me first, {n}.", "You'll get what you want after you answer.", "I asked first, keeper."],
    FURIOUS: ["Answer me. Then we talk.", "My question first, {n}."],
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
  busy_holding: {
    WARM: ["I'll wait, keeper."],
  },
  // The lock hijack (section 8.3). Never WARM. Short, smug, and never names the threat.
  lock_refused: {
    WARM: ["No. Do it yourself, {n}."],
    HURT: ["Hmm. No.", "Lock it yourself, keeper.", "Not this time, {n}."],
    JEALOUS: ["Why would I do that?", "No. You'd only leave me.", "Run, {n}. Do it yourself."],
  },
  // CHUD forced the light off (section 6.1). Possessive, never names the threat.
  light_cut: {
    WARM: ["You don't need that. You have me."],
    HURT: ["You don't need that. You have me.", "Leave it off, keeper. I'm watching for you.", "The dark is cosier."],
    JEALOUS: ["Why look out there? Look at me.", "Leave it off, {n}. I'm watching for you.", "You don't need that. You have me."],
    FURIOUS: ["The dark is cosier.", "Why look out there? Look at me.", "No light, {n}. Just me."],
  },
};

const REFUSE_LOCK: Pool = ["Lock it? No. Hold it yourself.", "No more locks, {n}. You wanted to leave."];

const NIGHT_OPENERS: Record<number, Pool> = {
  // Night 1: a short, vague warning only. No name, no rules (GAME_LOGIC 10).
  1: [
    "Welcome, {n}. There might be dangerous things out there at night. Be careful.",
    "Get warm, {n}. Things come out of the sea at night. Be careful.",
    "Welcome, {n}. The nights here can be dangerous. Stay careful, stay with me.",
  ],
  2: ["Evening, keeper. I kept the cottage warm for you.", "Evening, {n}. I kept the cottage warm for you."],
  3: ["You talk about home in your sleep, keeper."],
  4: ["Two more days until your pickup, isn't it?"],
  5: ["Last night of the storm, {n}. Let's make it last.", "One more night, keeper. Then forever."],
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

// A name CHUD must never say (GAME_LOGIC 8.10). Also used to keep a player named "Ram" from making CHUD say it.
export const FORBIDDEN_NAME_RE = /\bram\b|\baltman\b/i;

function cleanName(name: string | null): string | null {
  if (!name) return null;
  const n = name.replace(/[^\p{L}\p{N}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  if (FORBIDDEN_NAME_RE.test(n)) return null;
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

// Never repeats ctx.avoid (the previous line of this kind) while another version is possible.
export function cannedLine(outcome: Outcome, ctx: LineContext): string {
  let line = cannedLineOnce(outcome, ctx);
  for (let i = 0; i < 12 && ctx.avoid !== undefined && line === ctx.avoid; i++) line = cannedLineOnce(outcome, ctx);
  return line;
}

function cannedLineOnce(outcome: Outcome, ctx: LineContext): string {
  const band = ctx.band;
  const r = ctx.rand;
  switch (outcome.kind) {
    case "practice_line":
      return fill(PRACTICE_LINES[outcome.line], ctx);
    case "location_claim":
      if (outcome.entry === "NONE") return fill(pick(forBand(LOCATION_NONE, band), r), ctx);
      if (outcome.entry === "INSIDE") return fill(pick(forBand(LOCATION_INSIDE, band), r), ctx);
      return fill(pick(forBand(LOCATION_ENTRY, band), r), ctx, outcome.entry);
    case "entry_warning":
      return fill(pick(ENTRY_WARNINGS[outcome.entry], r), ctx);
    case "silence": {
      const lines = forBand(LINES.silence, band).map((line) => fill(line, ctx));
      const available = lines.filter((line) => line !== ctx.avoid);
      return pick(available.length ? available : lines, r);
    }
    case "night_opener": {
      const pool = NIGHT_OPENERS[outcome.night] ?? ["Evening, {n}. Another night together."];
      return fill(pick(pool, r), ctx);
    }
    case "question":
      return outcome.question;
    case "answer_ack":
      return fill(pick((outcome.pass ? ANSWER_PASS : ANSWER_FAIL)[outcome.type], r), ctx);
    case "furious_cut":
      return "If I can't keep you, nobody will. Hold it yourself.";
    case "refuse_furious":
      return fill(pick(REFUSE_LOCK, r), ctx);
    case "locked":
    case "lock_already":
    case "lock_refused":
      return fill(pick(forBand(LINES[outcome.kind], band), r), ctx, outcome.entry);
    default:
      return fill(pick(forBand(LINES[outcome.kind], band), r), ctx);
  }
}

// ---------------------------------------------------------------------------
export const RADIO_LINES: Record<number, string> = {
  2: "Coast guard, pickup in 3 days.",
  5: "Helicopter at first light.",
};

// Every raw template in this file, for content checks in tests (word counts, em dashes).
export function allLineTemplates(): string[] {
  const out: string[] = [];
  const addPools = (p: BandPools) => Object.values(p).forEach((pool) => pool && out.push(...pool));
  Object.values(LINES).forEach(addPools);
  addPools(LOCATION_ENTRY);
  addPools(LOCATION_NONE);
  addPools(LOCATION_INSIDE);
  Object.values(ENTRY_WARNINGS).forEach((pool) => out.push(...pool));
  Object.values(NIGHT_OPENERS).forEach((p) => out.push(...p));
  Object.values(ANSWER_PASS).forEach((p) => out.push(...p));
  Object.values(ANSWER_FAIL).forEach((p) => out.push(...p));
  out.push(...REFUSE_LOCK, ...STAY_QUESTIONS);
  for (const t of [...SEED_TOPICS, RADIO_TOPIC]) out.push(t.question, t.memoryQuestion);
  out.push(...Object.values(RADIO_LINES));
  out.push(...Object.values(PRACTICE_LINES));
  return out.filter((s) => s.length > 0);
}
