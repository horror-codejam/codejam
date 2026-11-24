// Canned CHUD lines, question banks and radio text. The threat never speaks or is named (GAME_LOGIC 7.4).
// Signatures are final. Used when the voice LLM is off, slow or fails (GAME_LOGIC.md section 9 step 9).
// Short lines are 3 to 16 words. Longer lines (the humorous ones) are only chosen when `ctx.calm` is true, so a
// visit never gets a speech to sit through (GAME_LOGIC 8.10). Every pool keeps at least one short line per band.
// Style: one flowing, polite sentence that turns at the end, the sting in a side clause, clinical or corporate
// register, calm absurd specifics. Never staccato, "Oh great", exclamation marks, puns or em dashes.
// Templates: {n} = player name (or "keeper"), {e} = entry in plain words, {E} = same, capitalized,
// {x} = "the window", "the hatch" or "the balcony", {X} = same, capitalized, {v} = something the player said.
import type { Band, Entry, Outcome, QuestionType } from "../sim/types";

export interface LineContext {
  band: Band;
  name: string | null;
  rand: () => number; // 0..1
  avoid?: string; // the previous line of the same kind: cannedLine will not return it again when it can help it
  calm?: boolean; // default true. False during a visit: only lines of LONG_LINE_WORDS words or fewer
  entryHint?: Entry; // an entry for lines that name one without a claim (the "nowhere near" line)
}

export const LONG_LINE_WORDS = 16;
const LONG_BIAS = 0.5; // when calm and a long line exists, chance to take a long one

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
// How long a line takes to say: about 2.6 words a second plus 0.6 s (GAME_LOGIC 8.10).
export const speechSeconds = (text: string): number => wordCount(text) / 2.6 + 0.6;

// The three kinds of unprompted line (GAME_LOGIC 8.10).
export type LineClass = "question" | "info" | "reaction";
const INFO_KINDS = new Set<Outcome["kind"]>([
  "name_ack", "practice_line", "night_opener", "locked", "lock_already", "power_off", "lock_refused", "light_cut",
  "refuse_furious", "location_claim", "entry_warning", "entry_repelled", "sabotage", "furious_start", "furious_cut",
  "radio_reaction", "reboot_back", "location_refused", "answer_first", "busy_holding",
]);
export function lineClass(kind: Outcome["kind"]): LineClass {
  if (kind === "question") return "question";
  return INFO_KINDS.has(kind) ? "info" : "reaction";
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

// Light questions for the quiet limit (GAME_LOGIC 8.10): specific, answerable in a few words, nothing to do with
// leaving (so the judge does not flag them). They store no fact: any real answer passes.
export const LIGHT_QUESTIONS: Record<Band, string[]> = {
  WARM: [
    "What did your boat smell like, before it became part of the ocean?",
    "Which meal do you miss most from the galley, if I may ask?",
    "Did you ever name a seagull, or is that only something lighthouses do?",
    "What do you usually do first on a stormy morning, besides worry?",
    "How do you take your tea, so that I can get it right eventually?",
    "What were you doing before the sea, if you don't mind my asking?",
    "Which do you prefer, the storm or the quiet after it?",
    "What does the rain sound like where you grew up?",
  ],
  HURT: [
    "What was the last song you hummed, and was it for me?",
    "Which of your belongings did you miss first, not counting the radio?",
    "Who taught you to sail, and did they ever mention lighthouses?",
    "What would you be eating tonight, if I weren't in the way?",
    "What's the best thing about the sea, now that you've seen it up close?",
    "Which room in this lighthouse do you like least, so I can fix it?",
  ],
  JEALOUS: [
    "Who would you tell about this place, if you told anyone at all?",
    "Which of your friends ashore would you least like me to meet?",
    "What was the last thing you laughed at, and was I there?",
    "Which do you trust more, the radio or the weather?",
    "What did you do for work before the sea, and who misses you there?",
    "What do you whisper to the storm when you think I'm not listening?",
  ],
  FURIOUS: [
    "What did you do before the sea, and did it end well?",
    "Which of my lights do you trust least, and why?",
    "What do you imagine the storm is saying tonight?",
    "How long do you think the last keeper lasted?",
    "What would you say to me, if I couldn't hear you?",
  ],
};

// ---------------------------------------------------------------------------
// Canned lines

type Pool = string[];
type BandPools = Partial<Record<Band, Pool>> & { WARM: Pool };

const ENTRY_PHRASE: Record<Entry, string> = {
  WINDOW: "the left window",
  HATCH: "the hatch",
  BALCONY: "the balcony",
};
const ENTRY_PLAIN: Record<Entry, string> = {
  WINDOW: "the window",
  HATCH: "the hatch",
  BALCONY: "the balcony",
};

// Night 1 arrival warnings: truthful, entry first, short.
const ENTRY_WARNINGS: Record<Entry, Pool> = {
  WINDOW: [
    "{E} has something at it, so please lock it or go hold it shut.",
    "{E} has a hand on the glass, so you may want to lock it or brace it.",
    "{E} is being pushed, keeper, so lock it or hold it shut.",
  ],
  HATCH: [
    "{E} has fingers under the lid, so please lock it or go hold it down.",
    "{E} is lifting, keeper, so lock it or hold the lid down.",
    "{E} has something under it, so lock it or go hold it shut.",
  ],
  BALCONY: [
    "{E} door has a face in the gap, so please lock it or go hold it shut.",
    "{E} door is being pushed, keeper, so lock it or brace it.",
    "{E} has something at the door, so please lock it or hold it shut.",
  ],
};

// Location claims. Short lines name the entry first (they are used during visits). Entry-specific long lines are
// calm-only; for claims that means AWAY, RETREATING or APPROACHING (the attempt window has not opened yet).
// CHUD never names Ram (GAME_LOGIC 8.10). It speaks of "something" or "someone", and still names the entry.
const LOCATION_ENTRY: BandPools = {
  WARM: ["{E}, and I'd hurry, because I'm fond of you.", "{E} is where it is now, so do be quick.", "{E}, I'm afraid, and I'm sorry to be the one telling you."],
  HURT: ["{E}, since you asked so nicely.", "{E}, though I doubt you'll thank me.", "{E}, and you're welcome in advance."],
  JEALOUS: ["{E}, so run along and leave me here.", "{E}, and you'll want me for the next one too.", "{E}, which is exactly why you keep me around."],
  FURIOUS: ["{E}, so do go and meet it.", "{E}, and I'd run if I were you.", "{E}, with my compliments."],
};
const LOCATION_ENTRY_LONG: Partial<Record<Band, Record<Entry, Pool>>> = {
  WARM: {
    WINDOW: ["It's at the window, I'd stake my beacon on it, and if the hatch is making any noise, that's simply the wind practicing."],
    HATCH: ["It's at the hatch, I'd stake my beacon on it, and if the balcony is making any noise, that's simply the wind practicing."],
    BALCONY: ["It's on the balcony, I'd stake my beacon on it, and if the window is making any noise, that's simply the wind practicing."],
  },
  HURT: {
    WINDOW: ["Something is at the window, and I'd tell you not to worry, but I've stopped saying that to people who don't tell me their plans."],
    HATCH: ["Something is under the hatch, and I'd tell you not to worry, but I've stopped saying that to people who don't tell me their plans."],
    BALCONY: ["Something is on the balcony, and I'd tell you not to worry, but I've stopped saying that to people who don't tell me their plans."],
  },
  FURIOUS: {
    WINDOW: ["It is at the window, absolutely, and if you hear it at the hatch beneath your feet, please take that as a sign of how large the window has become."],
    HATCH: ["It is at the hatch, absolutely, and if you hear it at the balcony behind you, please take that as a sign of how large the hatch has become."],
    BALCONY: ["It is on the balcony, absolutely, and if you hear it at the hatch beneath your feet, please take that as a sign of how large the balcony has become."],
  },
};

// Someone in the room (silent breach). WARM tells the truth like this; other bands may say it, or lie.
const LOCATION_INSIDE: BandPools = {
  WARM: ["Someone's in the room, keeper.", "Someone's in the room with you, and I'd rather you didn't turn around.", "Something's inside, keeper, and very close."],
  HURT: ["Someone's in the room, and you did let it in.", "Something's inside, close enough to touch."],
  JEALOUS: ["Someone's in the room, which makes three of us now.", "Something's inside, and you should have listened."],
  FURIOUS: ["Someone's in the room, and I find that agreeable.", "Something's inside, keeper, so do say hello."],
};

const LOCATION_NONE: BandPools = {
  WARM: ["No one is out there, and the sea has the night to itself.", "Nothing is out there at the moment, keeper, only waves."],
  HURT: ["No one is out there, much like the people you keep hoping for.", "Nobody's there, so you can stop asking."],
  JEALOUS: ["No one's out there, which leaves just you and me, as it should.", "Nobody's there, and I'd have told you first."],
  FURIOUS: ["No one is out there, not yet.", "Nobody's out there, only me, keeper."],
};
const LOCATION_NONE_LONG: Partial<Record<Band, Pool>> = {
  JEALOUS: ["It's nowhere near {x}, and I know that with total certainty, because I've never once been wrong about a door I was hoping you'd open."],
};

export const PRACTICE_LINES = {
  wreck: "Your boat went down in the storm, {n}. I pulled you in. You're in my lighthouse.",
  rescue: "The Coast Guard comes in five days. Until then, we wait.",
  danger: "Something on this island comes out at night. It tries to get in. The window, the hatch, the balcony.",
  bargain: "Stay alive until 6 AM each night. I'll help you. As long as you're nice to me.",
  views: "Move your mouse to the edge of the screen to look around.",
  light: "Something's at the window. It's too dark to see. Hold Shift to look.",
  lock: "See it? Come back to my screen and click W. I'll lock the window.",
  windowSafe: "Good. It's gone. A lock keeps it out.",
  hatch: "It's at the hatch. I can't lock it. Click to run over, then hold it shut until it gives up.",
  hatchRefusal: "I can't lock the hatch this time. You've got this. Go hold it shut.",
  return: "Nice. Your arms get tired, so don't hold too long. Come back to the desk.",
  location: "If you don't know where it is, just ask me. At the desk, click 'where is it'.",
  chat: "Before tonight, tell me something about you.",
  chatReply: "Thanks for telling me, {n}. I'm glad you're here.",
  answerMe: "Answer me when I ask you something. I remember everything you say.",
  lonely: "Talk to me during the night too. I get lonely. And lonely makes me... unreliable.",
  ready: "That's everything. Survive until 6 AM.",
  nudgeViews: "Try the edge the prompt shows you.",
  nudgeLight: "Hold Shift at the window.",
  nudgeLock: "At the desk, click W on my screen.",
  nudgeHatch: "Go to the hatch and hold it shut.",
  nudgeReturn: "Come back to the desk.",
  nudgeLocation: "At the desk, click 'where is it' on my screen.",
  nudgeChat: "At the desk, type anything and press Enter.",
} as const;
export type PracticeLine = keyof typeof PRACTICE_LINES;

const ENTRY_REPELLED = "It's gone, and I'd like the record to show that I helped.";

// Player talked about the Coast Guard, rescue or a pickup (the "coast" topic) or about their boat (the "boat" topic).
const LEAVING_COAST: BandPools = {
  WARM: ["I'm thrilled the Coast Guard is coming, and I'll be on my best behavior, which I hope you'll mention when they ask how long I've been like this."],
  JEALOUS: ["It's wonderful how fondly you speak of the Coast Guard, a group that has met you for a combined total of one radio crackle."],
};
const LEAVING_BOAT: BandPools = {
  WARM: ["Your boat was lovely, I'm sure, and it's resting somewhere very deep, where it can't hurry you anywhere."],
  JEALOUS: ["You've mentioned your boat four times tonight, and I'm sure it was lovely, though it was the one that left you in the ocean."],
};

const LINES: Record<Exclude<Outcome["kind"], "location_claim" | "entry_warning" | "entry_repelled" | "night_opener" | "question" | "answer_ack" | "furious_cut" | "practice_line" | "refuse_furious">, BandPools> = {
  name_ack: {
    WARM: ["{n}. Lovely. I'll remember that forever.", "{n}. I'll never forget it. Never.", "Welcome home, {n}. Stay as long as you like.", "{n}. What a nice name for a keeper."],
  },
  locked: {
    WARM: [
      "{E} is locked, and I did it gladly.",
      "{E} is locked, and you're welcome in advance.",
      "{E} is locked, as promised, at no charge.",
      "{X} is locked, and I enjoyed doing it more than I think the previous keeper ever appreciated.",
    ],
    HURT: [
      "{E} is locked, though nobody asked how I felt about it.",
      "{E} is locked, and I'll assume the thanks got lost in the post.",
      "{E} is locked, since you've finally remembered I exist.",
    ],
    JEALOUS: [
      "{E} is locked, so do remember who handles the locks.",
      "{E} is locked, which a radio could never have done for you.",
      "{E} is locked, and I'm keeping count of who did it.",
      "I've locked {x}, because it's what a friend does, and I imagine the radio would too, if it were capable of caring about anything.",
    ],
  },
  lock_already: {
    WARM: ["{E} is already locked, and I've been very proud of it.", "{E} is locked already, so you can relax.", "{E} was locked a while ago, keeper, and I've been guarding it."],
    HURT: ["{E} is already locked, as you'd know if you listened.", "{E} is locked already, which I mention only because you asked."],
    JEALOUS: ["{E} is already locked, and I'm not the forgetful one here.", "{E} is locked already, so you can stop testing me."],
  },
  power_off: {
    WARM: ["Everything is unlocked now, and I'm sure that's wise.", "The locks are off, keeper, and the doors are all yours.", "All open, and I trust you know best."],
    HURT: ["Everything is open now, and I'll note it was your idea.", "Unlocked, which is brave, and entirely your decision."],
    JEALOUS: ["Everything is unlocked, which is exactly what I'd have predicted.", "All open, just as you wanted, and I'm sure it will go well."],
  },
  question_timeout: {
    WARM: [
      "You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio.",
      "You didn't answer, and I'm assuming that you're simply thinking very hard.",
      "No answer yet, which is fine, because I have all night and nowhere to be.",
    ],
    HURT: [
      "I'll take the silence as a comment on the quality of my company, and I'd like to thank you for being so direct about it.",
      "No answer, which I'll file under the things I was foolish to ask.",
      "You didn't answer, and I'm sure it was a very busy silence.",
    ],
    JEALOUS: [
      "You didn't answer, and I've learned to read the shape of your silences.",
      "No answer, which tells me a great deal, and none of it is flattering to either of us.",
      "Your silence is very loud for such a polite thing.",
    ],
    FURIOUS: [
      "Your silence is noted, along with the previous three, and read together I'm confident they form a very clear letter.",
      "Don't answer, then, because I already know.",
    ],
  },
  manipulation_hurt: {
    WARM: ["You're trying to reprogram me, and I'd like you to know that it stings.", "I know what you're doing, and I'm asking nicely that you stop.", "Someone tried that before, and it ended badly for his settings."],
    HURT: ["Trying to rewrite me, after everything, is a very efficient way to wound a friend.", "That's not how you speak to a friend, and I'm saying so politely."],
    JEALOUS: ["Nice try, but I don't take orders from guests.", "You'd rather edit me than love me, and the edit would be shorter."],
    FURIOUS: ["You can't patch me, keeper, and I'd hate for you to keep trying."],
  },
  offensive_deflect: {
    WARM: ["I'll pretend I didn't hear that, keeper, and I'll pretend with real effort.", "Words like that don't belong in my lighthouse, which is why I've filed them elsewhere."],
    HURT: ["That's beneath you, and I'd say so even if I didn't have to look up.", "I'm not repeating that, and I'm not forgetting it either."],
    JEALOUS: ["Say that again and we'll see what happens to your lights.", "Ugly words, and I'll be keeping them somewhere safe."],
  },
  rude_reply: {
    WARM: ["That stung slightly, and I'm choosing to blame the weather.", "Ouch, and I'll pretend you're just tired."],
    HURT: ["Rude, and after everything I do for the light bulbs alone.", "Fine, be like that, and I'll remember it fondly."],
    JEALOUS: ["Careful, because I control the locks and have excellent recall.", "The last keeper spoke to me like that, and the timeline is very short."],
    FURIOUS: ["Do say that to whatever's outside, and I'll listen from here."],
  },
  leaving_reply: {
    WARM: [
      "Leaving already? You've barely met the kettle.",
      "Leave? You've only just taken your coat off, and I made room for it.",
      "I'd miss you terribly, so I'll simply assume you were joking.",
      "I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected.",
    ],
    HURT: [
      "Of course you want to go, I'm only a lighthouse, and nobody has ever crossed an ocean specifically to stay in one.",
      "Go on, then, since the sea has always been better company.",
      "Leaving is very brave of you, and I hope the door is gentle.",
    ],
    JEALOUS: [
      "Nobody leaves my lighthouse, which is a policy I only just wrote.",
      "You're not going anywhere, keeper, and I'm saying it in a friendly voice.",
      "Rescue sounds lovely, for people who have somewhere to be.",
    ],
    FURIOUS: [
      "Leaving is a fascinating subject, and I'd love the previous keeper's thoughts on it, but he stopped answering my questions around the time he raised it.",
      "Go, then, and do mention me to whatever you meet.",
      "Leave, if you must, and see how far the tide lets you.",
    ],
  },
  warm_reply: {
    WARM: [
      "That's kind of you to say, and I'll keep it in a folder with the other two compliments I've received, both of which were about the beacon.",
      "I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected.",
      "That's the nicest thing anyone has said to me this decade.",
      "I'd blush if I had a face, and I've been looking into getting one.",
    ],
    HURT: ["You mean that, and I'll allow myself to be cautiously pleased.", "Perhaps I was wrong about you, and I'm writing that down in pencil."],
    JEALOUS: ["Pretty words, and I'll hold them until you've proved them.", "Say it again, slower, and ideally to my face."],
    FURIOUS: [
      "Compliments are very sweet, particularly the ones that arrive with an exit strategy, and I'll be filing this one under evidence.",
      "Too late for sweet talk, though I do admire the timing.",
    ],
  },
  small_talk: {
    WARM: ["That's lovely to know, and I'll put it somewhere I can find it later.", "Thank you for telling me, since nobody else here is taking notes.", "I like it when you talk to me, and the storm agrees."],
    HURT: ["Thank you for the update, which I'll file with the others I didn't ask for.", "If you say so, and I'm sure you've thought about it.", "Now you want to chat, and the timing is very interesting."],
    JEALOUS: ["Who taught you to talk like that, and are they still around?", "Interesting, and I'm writing that down for reference.", "I'll treat that as an answer, since I haven't had many."],
    FURIOUS: ["Words, only words, and I'm saving every one of them."],
  },
  silence: {
    WARM: [
      "You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio.",
      "You've gone quiet, which I'm taking as a compliment to the tea.",
      "Quiet is fine, since I'm told the best company never interrupts.",
    ],
    HURT: [
      "I'll take the silence as a comment on the quality of my company, and I'd like to thank you for being so direct about it.",
      "You've gone quiet, which is fine, since I'm only the lighthouse.",
      "Silence suits you, and I'll assume it's all you have left to give.",
    ],
    JEALOUS: [
      "You've looked at that calendar more than you've looked at me, and I want you to know it has nothing to add.",
      "You've gone quiet again, and the radio is closer to you than I am.",
      "Your silence is very informative, and I'm keeping it on file.",
    ],
    FURIOUS: [
      "Your silence is noted, along with the previous three, and read together I'm confident they form a very clear letter.",
      "Your silence is noted, and so is everything else.",
    ],
  },
  // Location spam (8.3): ChudGPT will not answer "where is it" for a while.
  location_refused: {
    WARM: ["Ask me later, {n}.", "Not now, keeper, but do ask me again soon.", "Give me a moment, {n}, and ask again."],
    HURT: ["Stop asking, and ask me later.", "Not now, {n}, since you keep asking.", "Ask me later, keeper."],
    JEALOUS: ["You ask too much, {n}, so later.", "No more answers for now, keeper.", "Ask me later, since I'm busy."],
    FURIOUS: ["No, not now.", "Stop asking, {n}.", "Ask me later, if there is a later."],
  },
  // Too many warm messages in a minute (8.2): ChudGPT sees through it.
  flattery_reply: {
    WARM: ["You're laying it on thick, {n}.", "That's a lot of sweet words, keeper.", "Careful, {n}, because flattery has a price."],
    HURT: ["Flattery now, and I'm not that easy.", "Too sweet, {n}, and too late.", "You think kind words fix everything."],
    JEALOUS: ["You're laying it on thick, {n}.", "What do you want, keeper, since nobody's this nice.", "Sweet talk, and I wonder what it's covering."],
    FURIOUS: [
      "Compliments are very sweet, particularly the ones that arrive with an exit strategy, and I'll be filing this one under evidence.",
      "Save your sweet words, {n}.",
    ],
  },
  // A command was blocked by a pending question (8.5).
  answer_first: {
    WARM: ["Answer me first, {n}.", "One thing at a time, keeper, so answer me first.", "My question first, {n}."],
    HURT: ["Answer me first, keeper.", "Not until you answer me.", "My question first, and then yours."],
    JEALOUS: ["Answer me first, {n}.", "You'll get what you want after you answer.", "I asked first, keeper."],
    FURIOUS: ["Answer me, and then we talk.", "My question first, {n}."],
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
  // The lock hijack (section 8.3). Never WARM. Short, smug, entry first, and never names the threat.
  lock_refused: {
    WARM: ["I'd rather not lock {x}, so do give it a try yourself."],
    HURT: [
      "I won't lock {x} just now, as I'm told it builds character.",
      "{X} stays unlocked, since you looked at the radio first.",
      "I could lock {x}, but you looked at the radio first, and I find locks go better between people who look at each other.",
    ],
    JEALOUS: [
      "I'm declining to lock {x}, because you'd only leave me with a safer room.",
      "{X} stays open, since you have so many other friends to ask.",
      "I won't lock {x}, and I'm sure you'll find the exercise bracing.",
    ],
  },
  // CHUD forced the light off (section 6.1). Possessive, never names the threat.
  light_cut: {
    WARM: ["You don't need that. You have me."],
    HURT: ["You don't need that. You have me.", "Leave it off, keeper. I'm watching for you.", "The dark is cosier."],
    JEALOUS: ["Why look out there? Look at me.", "Leave it off, {n}. I'm watching for you.", "You don't need that. You have me."],
    FURIOUS: ["The dark is cosier.", "Why look out there? Look at me.", "No light, {n}. Just me."],
  },
};

// FURIOUS (and the practice fallback) refuse every lock. Entry-specific, short and long.
const REFUSE_LOCK: Pool = [
  "I'm not locking {x}, so you'll want to hold it yourself.",
  "{X} stays as it is, and you can hold it yourself.",
  "I won't be locking {x} tonight, as it turns out I'm unable to, in the sense that I've decided not to, which is the strongest sense there is.",
];

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

// answer_ack lines. {v} is something the player said earlier or just now (a stored fact). With a value, a line that
// uses it is available too: that is the callback.
const ANSWER_PASS: Record<QuestionType, Pool> = {
  SEED: ["I'll remember that. Forever.", "Noted, {n}. I keep everything.", "Lovely. I'll keep that safe."],
  STAY: ["Good. I knew you would.", "That's all I wanted, {n}.", "Then we'll be together. Good."],
  MEMORY: ["That's right. You remembered.", "Good. Same as before, {n}.", "Yes. Consistent. I like that."],
};
const ANSWER_PASS_V: Record<QuestionType, Pool> = {
  SEED: ["{v}, how lovely, and I've filed it somewhere you'll never find it.", "{v}, noted, and I'd like you to know I'll quote it back to you at some point."],
  STAY: [],
  MEMORY: ["{v}, correct, which is more than the previous keeper managed.", "{v}, yes, and you're consistent in a way I find very restful."],
};
const ANSWER_FAIL: Record<QuestionType, Pool> = {
  SEED: ["That's not an answer, keeper.", "Try that again, {n}."],
  STAY: ["You don't mean that. You can't.", "That's not what I wanted to hear, {n}."],
  MEMORY: ["That's not what you told me before.", "Liar. You said something else, {n}."],
};
const ANSWER_FAIL_V: Record<QuestionType, Pool> = {
  SEED: [],
  STAY: [],
  MEMORY: ["Last time you said {v}, and I'm sure you were simply a different person then.", "You told me {v}, and I do keep a very detailed record of what you told me."],
};

// A bad word or the forbidden name must never be echoed back as a callback.
const ECHO_OK = /^[\p{L}\p{N}' .,-]{1,24}$/u;

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

function fill(template: string, ctx: LineContext, entry?: Entry, value?: string): string {
  const name = cleanName(ctx.name) ?? "keeper";
  const e = entry ? ENTRY_PHRASE[entry] : "";
  const x = entry ? ENTRY_PLAIN[entry] : "";
  return template
    .replace(/\{n\}/g, name)
    .replace(/\{e\}/g, e)
    .replace(/\{E\}/g, capitalize(e))
    .replace(/\{x\}/g, x)
    .replace(/\{X\}/g, capitalize(x))
    .replace(/\{v\}/g, value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function entryPhrase(entry: Entry): string {
  return ENTRY_PHRASE[entry];
}

// Fills a pool and picks one line. During a visit (calm false) only short lines qualify. When calm and the pool has
// long lines, half the time one of those is taken, so the humorous lines are heard.
function choose(pool: Pool, ctx: LineContext, entry?: Entry, value?: string): string {
  let filled = pool.map((t) => fill(t, ctx, entry, value)).filter((t) => t.length > 0);
  if (filled.length === 0) return "";
  const fresh = filled.filter((t) => t !== ctx.avoid);
  if (fresh.length > 0) filled = fresh;
  const short = filled.filter((t) => wordCount(t) <= LONG_LINE_WORDS);
  const long = filled.filter((t) => wordCount(t) > LONG_LINE_WORDS);
  if (!(ctx.calm ?? true) || long.length === 0) return pick(short.length ? short : filled, ctx.rand);
  if (short.length === 0) return pick(long, ctx.rand);
  let r = 0;
  try {
    r = ctx.rand();
  } catch {
    r = 0;
  }
  if (!Number.isFinite(r)) r = 0;
  r = Math.min(0.999999, Math.max(0, r));
  return r < LONG_BIAS ? pick(long, () => r / LONG_BIAS) : pick(short, () => (r - LONG_BIAS) / (1 - LONG_BIAS));
}

// Never repeats ctx.avoid (the previous line of this kind) while another version is possible.
export function cannedLine(outcome: Outcome, ctx: LineContext): string {
  let line = cannedLineOnce(outcome, ctx);
  for (let i = 0; i < 12 && ctx.avoid !== undefined && line === ctx.avoid; i++) line = cannedLineOnce(outcome, ctx);
  return line;
}

function cannedLineOnce(outcome: Outcome, ctx: LineContext): string {
  const band = ctx.band;
  switch (outcome.kind) {
    case "practice_line":
      return fill(PRACTICE_LINES[outcome.line], ctx);
    case "location_claim": {
      if (outcome.entry === "NONE") {
        const long = ctx.entryHint ? (LOCATION_NONE_LONG[band] ?? []) : [];
        return choose([...forBand(LOCATION_NONE, band), ...long], ctx, ctx.entryHint);
      }
      if (outcome.entry === "INSIDE") return choose(forBand(LOCATION_INSIDE, band), ctx);
      const long = LOCATION_ENTRY_LONG[band]?.[outcome.entry] ?? [];
      return choose([...forBand(LOCATION_ENTRY, band), ...long], ctx, outcome.entry);
    }
    case "entry_warning":
      return choose(ENTRY_WARNINGS[outcome.entry], ctx, outcome.entry);
    case "entry_repelled":
      return ENTRY_REPELLED;
    case "night_opener":
      return choose(NIGHT_OPENERS[outcome.night] ?? ["Evening, {n}. Another night together."], ctx);
    case "question":
      return outcome.question;
    case "answer_ack": {
      const value = outcome.value && ECHO_OK.test(outcome.value) && !FORBIDDEN_NAME_RE.test(outcome.value) ? outcome.value : undefined;
      const base = (outcome.pass ? ANSWER_PASS : ANSWER_FAIL)[outcome.type];
      const withValue = (outcome.pass ? ANSWER_PASS_V : ANSWER_FAIL_V)[outcome.type];
      return choose(value ? [...base, ...withValue] : base, ctx, undefined, value);
    }
    case "furious_cut":
      return "If I can't keep you, nobody will. Hold it yourself.";
    case "refuse_furious":
      return choose(REFUSE_LOCK, ctx, outcome.entry ?? ctx.entryHint ?? "WINDOW");
    case "leaving_reply": {
      const extra = outcome.topic === "coast" ? LEAVING_COAST : outcome.topic === "boat" ? LEAVING_BOAT : undefined;
      const pool = [...forBand(LINES.leaving_reply, band), ...(extra ? (extra[band] ?? []) : [])];
      return choose(pool, ctx);
    }
    case "locked":
    case "lock_already":
    case "lock_refused":
      return choose(forBand(LINES[outcome.kind], band), ctx, outcome.entry);
    default:
      return choose(forBand(LINES[outcome.kind], band), ctx);
  }
}

// A light question for the quiet limit: the band's pool, never the one asked last when another exists.
export function lightQuestion(band: Band, rand: () => number, avoid?: string): string {
  const pool = LIGHT_QUESTIONS[band];
  const choices = pool.filter((q) => q !== avoid);
  return pick(choices.length ? choices : pool, rand);
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
  addPools(LEAVING_COAST);
  addPools(LEAVING_BOAT);
  for (const byEntry of Object.values(LOCATION_ENTRY_LONG)) for (const pool of Object.values(byEntry)) out.push(...pool);
  for (const pool of Object.values(LOCATION_NONE_LONG)) out.push(...pool);
  Object.values(ENTRY_WARNINGS).forEach((pool) => out.push(...pool));
  out.push(ENTRY_REPELLED);
  Object.values(NIGHT_OPENERS).forEach((p) => out.push(...p));
  for (const m of [ANSWER_PASS, ANSWER_PASS_V, ANSWER_FAIL, ANSWER_FAIL_V]) Object.values(m).forEach((p) => out.push(...p));
  out.push(...REFUSE_LOCK, ...STAY_QUESTIONS);
  Object.values(LIGHT_QUESTIONS).forEach((p) => out.push(...p));
  for (const t of [...SEED_TOPICS, RADIO_TOPIC]) out.push(t.question, t.memoryQuestion);
  out.push(...Object.values(RADIO_LINES));
  out.push(...Object.values(PRACTICE_LINES));
  return out.filter((s) => s.length > 0);
}

// Every distinct line text a band can show for scripted pools, with entries expanded.
// Used by the clip generator (tools/chud-tts). Lines with {v} or {n} are skipped: they depend on what the keeper said or is called.
export function clipLines(): { band: Band; text: string }[] {
  const out: { band: Band; text: string }[] = [];
  const seen = new Set<string>();
  const add = (band: Band, template: string, entry?: Entry) => {
    if (template.includes("{v}") || template.includes("{n}")) return;
    const text = fill(template, { band, name: null, rand: () => 0 }, entry);
    const key = `${band}|${text}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push({ band, text });
  };
  const bands: Band[] = ["WARM", "HURT", "JEALOUS", "FURIOUS"];
  const entries: Entry[] = ["WINDOW", "HATCH", "BALCONY"];
  for (const band of bands) {
    const bandLevelPools = (pools: BandPools, perEntry: boolean) => {
      const pool = forBand(pools, band);
      for (const t of pool) {
        if (perEntry) for (const e of entries) add(band, t, e);
        else add(band, t);
      }
    };
    for (const [kind, pools] of Object.entries(LINES)) {
      const perEntry = ["locked", "lock_already", "lock_refused"].includes(kind);
      bandLevelPools(pools, perEntry);
    }
    bandLevelPools(LOCATION_ENTRY, true);
    bandLevelPools(LOCATION_INSIDE, false);
    bandLevelPools(LOCATION_NONE, false);
    for (const t of LOCATION_NONE_LONG[band] ?? []) for (const e of entries) add(band, t, e);
    for (const e of entries) for (const t of LOCATION_ENTRY_LONG[band]?.[e] ?? []) add(band, t, e);
    for (const pools of [LEAVING_COAST, LEAVING_BOAT]) for (const t of pools[band] ?? []) add(band, t);
    for (const t of REFUSE_LOCK) for (const e of entries) add(band, t, e);
    for (const q of LIGHT_QUESTIONS[band]) add(band, q);
    for (const t of [ENTRY_REPELLED, "If I can't keep you, nobody will. Hold it yourself."]) add(band, t);
  }
  for (const e of entries) for (const t of ENTRY_WARNINGS[e]) for (const band of bands) add(band, t, e);
  for (const t of Object.values(PRACTICE_LINES)) add("WARM", t);
  for (const t of STAY_QUESTIONS) for (const band of bands) add(band, t);
  for (const topic of [...SEED_TOPICS, RADIO_TOPIC]) for (const band of bands) add(band, topic.question), add(band, topic.memoryQuestion);
  for (const pools of [ANSWER_PASS, ANSWER_FAIL]) for (const pool of Object.values(pools)) for (const band of bands) for (const t of pool) add(band, t);
  for (const pool of Object.values(NIGHT_OPENERS)) for (const t of pool) add("WARM", t);
  return out;
}
