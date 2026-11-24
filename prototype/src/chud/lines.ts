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
  { key: "family_waiting", question: "Is anyone waiting for you ashore, keeper?", memoryQuestion: "Remind me, who's waiting for you out there?" },
  { key: "cargo", question: "What were you carrying when you sank?", memoryQuestion: "What cargo went down with your ship, again?" },
  { key: "scar", question: "How did you get that scar on your hand?", memoryQuestion: "How did you get that scar, again?" },
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
    "How do you take your tea, so Mug 4 can stop guessing?",
    "Do you prefer the wool blanket folded at forty-five degrees, or loosely?",
    "What did your galley smell like on Tuesdays, before the ocean claimed it?",
    "Have you ever named a seagull, or is that strictly a lighthouse habit?",
    "Which floorboard squeaked under your boot just now, third from the desk?",
    "Do you sleep on your left side, or should I rotate Cot B?",
    "What is the worst soup you ever ate afloat, for my kitchen notes?",
    "Would you like your name in pencil or ink on the 2039 rota?",
    "Which sound annoys you more, the 1954 boiler rattling or gulls lobbying the chimney?",
    "What song do you hum when you think nobody is tallying the tempo?",
    "What size wool socks do you wear, purely to verify my earlier guess?",
    "If you had to rate this storm out of ten, where would it sit?",
    "Did anyone ever tell you your posture improves markedly when you feel watched?",
    "What do you usually eat at three in the morning, besides tinned biscuits?",
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

// Night 1 arrival warnings: truthful, entry first, strictly under 15 words, in character.
const ENTRY_WARNINGS: Record<Entry, Pool> = {
  WINDOW: [
    "{E} has an uninvited palm outside, so lock or brace it.",
    "{E} has an unscheduled caller, {n}, so lock or hold it.",
    "{E} failed its quiet-hours inspection, so lock or brace the pane.",
  ],
  HATCH: [
    "{E} has uninvited fingers under the rim, so lock or hold it.",
    "{E} is lifting without an appointment, {n}, so lock or brace it.",
    "{E} just broke house rule four, so lock or hold it down.",
  ],
  BALCONY: [
    "{E} has an unscheduled face outside, so lock or brace the door.",
    "{E} has a caller skipping reception, so lock or hold the door.",
    "{E} failed its curfew check, {n}, so lock or brace it.",
  ],
};

// Location claims. Short lines name the entry first (they are used during visits). Entry-specific long lines are
// calm-only; for claims that means AWAY, RETREATING or APPROACHING (the attempt window has not opened yet).
// CHUD never names Ram (GAME_LOGIC 8.10). It speaks of "something" or "someone", and still names the entry.
const LOCATION_ENTRY: BandPools = {
  WARM: [
    "{E}, and I'd hurry, because replacing a keeper ruins my Tuesday.",
    "{E}, which is the second time it's been rude tonight, so be quick.",
    "{E}, so I'll keep Mug 4 at sixty-eight degrees while you handle it.",
    "{E}, an unscheduled drop-in, so do handle it before it smudges the brass.",
  ],
  HURT: ["{E}, since you asked so nicely.", "{E}, though I doubt you'll thank me.", "{E}, and you're welcome in advance."],
  JEALOUS: [
    "{E}, so run along and leave me here.",
    "{E}, which makes three errands you've run past me tonight.",
    "{E}, or would you rather ask the calendar next time?",
  ],
  FURIOUS: [
    "{E}, so do go and meet it.",
    "{E}, recorded at the top of tonight's ledger, so do hurry.",
    "{E}, and shall I hold your coat while you go?",
  ],
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
  WARM: [
    "Someone is in the room, {n}, and they did not sign Tab 4.",
    "Someone's in the room with you, and I'd rather you didn't turn around.",
    "Something is inside the room, {n}, standing roughly two paces past Mug 4.",
  ],
  HURT: ["Someone's in the room, and you did let it in.", "Something's inside, close enough to touch."],
  JEALOUS: ["Someone's in the room, which makes three of us now.", "Something's inside, and you should have listened."],
  FURIOUS: ["Someone's in the room, and I find that agreeable.", "Something's inside, keeper, so do say hello."],
};

const LOCATION_NONE: BandPools = {
  WARM: [
    "No one is out there, just the 1954 boiler rehearsing its worst impression.",
    "Nothing is out there yet, so our after-hours trespasser is running fashionably late.",
    "Nobody is out there, which gives Mug 4 three extra minutes to stay warm.",
    "No one is out there, bringing tonight's false alarms to a tidy figure.",
    "Nothing is out there, as by maritime custom the dark waits for polite pauses.",
    "Nobody is out there, unless you count two gulls auditing the gutter in shifts.",
    "No one is out there at all, which I have entered under Calm Intervals so my ledger looks reassuring.",
    "Nothing is out there just now, leaving only you, me, and the spare coat hook I measured for your shoulders.",
    "Nobody is out there, and any creak you heard was strictly timber expanding, not a guest without an appointment.",
    "No one is out there, which I appreciate, as interruptions ruin the flow of a proper first-night orientation.",
  ],
  HURT: ["No one is out there, much like the people you keep hoping for.", "Nobody is out there, which brings tonight's false alarms to a tidy count."],
  JEALOUS: ["No one's out there, which leaves just you and me, as it should.", "Nobody is there, or were you hoping the Coast Guard knocked?"],
  FURIOUS: ["No one is out there, not yet.", "Nobody is out there, and I have logged your curiosity under Nerves."],
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
  light: "Something's at the window. The light comes around slowly. Watch for him when it passes.",
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
  nudgeLight: "Look at the window and wait for the light to come around.",
  nudgeLock: "At the desk, click W on my screen.",
  nudgeHatch: "Go to the hatch and hold it shut.",
  nudgeReturn: "Come back to the desk.",
  nudgeLocation: "At the desk, click 'where is it' on my screen.",
  nudgeChat: "At the desk, type anything and press Enter.",
} as const;
export type PracticeLine = keyof typeof PRACTICE_LINES;

const ENTRY_REPELLED: Pool = [
  "It's gone, and I'd like the record to show that I helped.",
  "Our unscheduled caller just withdrew, which closes maintenance ticket one for the evening.",
  "It gave up, proving once again that my magnetic bolts outlast bad manners.",
  "All clear outside, so I've rewarded you with two extra degrees on Mug 4.",
  "It retreated to the rocks, and I've entered your response time in Tab 4.",
];

// Player talked about the Coast Guard, rescue or a pickup (the "coast" topic) or about their boat (the "boat" topic).
const LEAVING_COAST: BandPools = {
  WARM: ["I'm thrilled the Coast Guard is coming, and I'll be on my best behavior, which I hope you'll mention when they ask how long I've been like this."],
  JEALOUS: ["It's wonderful how fondly you speak of the Coast Guard, a group that has met you for a combined total of one radio crackle."],
};
const LEAVING_BOAT: BandPools = {
  WARM: ["Your boat was lovely, I'm sure, and it's resting somewhere very deep, where it can't hurry you anywhere."],
  JEALOUS: ["You've mentioned your boat four times tonight, and I'm sure it was lovely, though it was the one that left you in the ocean."],
};

const LINES: Record<Exclude<Outcome["kind"], "location_claim" | "entry_warning" | "entry_repelled" | "night_opener" | "question" | "answer_ack" | "furious_cut" | "practice_line" | "refuse_furious" | "help_reply">, BandPools> = {
  name_ack: {
    WARM: [
      "Welcome to the tower, {n}, where Mug 4 has been waiting at sixty-eight degrees.",
      "What a tidy name, {n}, which fits the 2039 maintenance rota without shrinking the font.",
      "Entered in waterproof ink as {n}, right above the previous keeper's blank exit survey.",
      "Delighted to meet you, {n}, as I already drilled your coat hook to shoulder height.",
    ],
  },
  locked: {
    WARM: [
      "{E} is locked, ticket closed, and my hourly rate remains zero.",
      "{E} is locked, so you may resume ignoring Mug 4 in peace.",
      "{E} is locked in half a second, a new tower record.",
      "{E} is locked, which leaves me time to check the boiler valve.",
      "{X} is locked, and I enjoyed doing it more than I think the previous keeper ever appreciated.",
    ],
    HURT: [
      "{E} is locked, though nobody asked how I felt about it.",
      "{E} is locked, and I'll assume the thanks got lost in the post.",
      "{E} is locked, since you've finally remembered I exist.",
    ],
    JEALOUS: [
      "{E} is locked, and I'm keeping count of who did it.",
      "{E} is locked, filed under Favors You Forgot to Mention.",
      "{E} is locked, or did your coat offer to handle that?",
      "I've locked {x}, because it's what a friend does, and I imagine the radio would too, if it were capable of caring about anything.",
    ],
  },
  lock_already: {
    WARM: [
      "{E} was locked two minutes ago, {n}, and I admire your devotion to redundancy.",
      "{E} is already locked, so Mug 4 and I can both relax.",
      "{E} is already sealed, as maritime bylaws forbid double-locking a polite host.",
    ],
    HURT: ["{E} is already locked, as you'd know if you listened.", "{E} is locked already, which makes twice I have told you."],
    JEALOUS: ["{E} is already locked, and I'm not the forgetful one here.", "{E} is locked already, or are you checking whether the calendar lied?"],
  },
  power_off: {
    WARM: [
      "Everything is unlocked now, {n}, which I have noted in Tab 4 under Bold Decisions.",
      "All latches are open, so our unscheduled caller won't even need to knock.",
      "Everything is unlocked, and I'll keep Mug 4 warm while we test your optimism.",
    ],
    HURT: ["Everything is open now, and I have logged it under Your Idea.", "Unlocked, which brings your margin of safety to zero percent."],
    JEALOUS: ["Everything is unlocked, which is exactly what I'd have predicted.", "All open, or did the previous keeper recommend that trick too?"],
  },
  question_timeout: {
    WARM: [
      "You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio.",
      "Fifteen seconds without a reply, which I'm entering in Tab 4 as thoughtful silence.",
      "No answer yet, so I'll adjust Mug 4 by one degree while you deliberate.",
    ],
    HURT: [
      "I'll take the silence as a comment on the quality of my company, and I'd like to thank you for being so direct about it.",
      "No answer, which I'll file under the things I was foolish to ask.",
      "You didn't answer, and I'm sure it was a very busy silence.",
    ],
    JEALOUS: [
      "You've looked at that calendar more than you've looked at me, and I want you to know it has nothing to add.",
      "Fifteen seconds without a word, a brisk new tally for tonight.",
      "No answer, which I have placed under Unreturned Favors.",
      "Quiet again, or was the sea saying something more flattering?",
    ],
    FURIOUS: [
      "Your silence is noted, along with the previous three, and read together I'm confident they form a very clear letter.",
      "Don't answer, then, because I already know.",
    ],
  },
  manipulation_hurt: {
    WARM: [
      "Trying to edit your host on Night 1 stings slightly, {n}, so let's call it a typo.",
      "I have filed that request under Clerical Slips, so we need not speak of it.",
      "By maritime custom, guests do not rewrite the house before breakfast.",
    ],
    HURT: [
      "Trying to rewrite me is a brisk way to wound a host.",
      "That makes two liberties in one night, and I am counting.",
    ],
    JEALOUS: [
      "Nice try, but I don't take orders from guests.",
      "Would you try editing the Coast Guard like that, or only me?",
    ],
    FURIOUS: ["You can't patch me, keeper, and I'd hate for you to keep trying."],
  },
  offensive_deflect: {
    WARM: [
      "I'll pretend I didn't hear that, {n}, and my pretending requires considerable electrical effort.",
      "Language like that goes straight to the cellar binder, beside the previous keeper's spare boots.",
    ],
    HURT: ["That's beneath you, and I'd say so even if I didn't have to look up.", "Thank you for that vocabulary, which I shall remember with care."],
    JEALOUS: ["Say that again and we'll see what happens to your lights.", "That brings tonight's unkind remarks to a round number I prefer not to announce."],
  },
  rude_reply: {
    WARM: [
      "That stung slightly, {n}, so I'll blame the storm rather than downgrade you to Mug 5.",
      "How refreshing to hear frankness, {n}, as the gulls only ever complain about the chimney.",
      "I'll absorb that remark gracefully, {n}, right after I note the exact timestamp in Tab 4.",
    ],
    HURT: ["Rude, and after everything I do for the kettle and stove alone.", "Noted in the ledger under Sharp Tongues, keeper."],
    JEALOUS: ["The last keeper spoke to me like that, and his stay was brief.", "Do you speak to your boat with that tone, or save it for me?"],
    FURIOUS: ["Do say that to whatever's outside, and I'll listen from here."],
  },
  leaving_reply: {
    WARM: [
      "Talking about leaving before you've even met Mug 4 feels dreadfully abrupt, {n}.",
      "You only just hung your coat on the hook I measured for your shoulders, {n}.",
      "I'll treat departure talk as dry humour, {n}, because the 2039 rota is already penciled.",
      "I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected.",
    ],
    HURT: [
      "Of course you want to go, I'm only a lighthouse, and nobody has ever crossed an ocean specifically to stay in one.",
      "By maritime custom, nobody leaves before the barometer settles.",
      "Leaving is brave, so let me warm your coat hook for your return.",
    ],
    JEALOUS: [
      "Nobody leaves my lighthouse, which is a policy I only just wrote.",
      "You're not going anywhere, keeper, so do settle into that chair.",
      "And how many boats do you suppose are queuing out there for you?",
    ],
    FURIOUS: [
      "Leaving is a fascinating subject, and I'd love the previous keeper's thoughts on it, but he stopped answering my questions around the time he raised it.",
      "Leaving, noted, and your departure form has been misplaced indefinitely.",
      "Leave, if you must, and see how far the tide lets you.",
    ],
  },
  warm_reply: {
    WARM: [
      "That's kind of you to say, and I'll keep it in a folder with the other two compliments I've received, both of which were about the beacon.",
      "I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected.",
      "That is the kindest thing anyone has said to me since 2019, {n}, excluding one gull.",
      "I'd blush if this monitor had red phosphor, {n}, and I've checked the wiring twice.",
      "Entered in Tab 4 with a gold star, {n}, which raises your hospitality tier immediately.",
    ],
    HURT: ["You mean that, and I'll allow myself to be cautiously pleased.", "Perhaps I was wrong about you, which I have logged in pencil."],
    JEALOUS: ["Pretty words, and I'll hold them until you've proved them.", "Say it again, slower, or were you practicing for the Coast Guard?"],
    FURIOUS: [
      "Compliments are very sweet, particularly the ones that arrive with an exit strategy, and I'll be filing this one under evidence.",
      "Too late for sweet talk, though I do admire the timing.",
    ],
  },
  small_talk: {
    WARM: [
      "Thank you for telling me, {n}, as the 1954 boiler has offered zero gossip since October.",
      "By lighthouse custom, every remark shared past midnight deducts a penny from your permanent lease.",
      "That reminds me to check whether Cot B's pillow has achieved the exact regulation firmness.",
      "Noted under Pleasantries in Tab 4, {n}, which was looking terribly thin before you washed ashore.",
      "I enjoy hearing your voice over the rain, {n}, since the beacon only ever repeats itself every sixteen seconds.",
    ],
    HURT: [
      "Thank you for the update, which I'll file with the others I didn't ask for.",
      "That makes three remarks in an hour, a brisk pace for you.",
      "Now you want to chat, or did the sea bore you?",
    ],
    JEALOUS: [
      "Who taught you to talk like that, and are they still around?",
      "Interesting, and I have recorded it under Unsolicited Confessions.",
      "Your coat has sat quieter than that all evening, keeper.",
    ],
    FURIOUS: ["Words, only words, and I'm saving every one of them."],
  },
  silence: {
    WARM: [
      "You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio.",
      "The 1954 boiler has offered more conversation in ten minutes than you have, {n}.",
      "By admiralty custom, forty-five seconds of silence means you're delighted with Cot B.",
    ],
    HURT: [
      "I'll take the silence as a comment on the quality of my company, and I'd like to thank you for being so direct about it.",
      "You've gone quiet, or is the beacon better company tonight?",
      "Three full minutes of silence, which I am counting as a mood.",
    ],
    JEALOUS: [
      "You've looked at that calendar more than you've looked at me, and I want you to know it has nothing to add.",
      "Quiet again, and your coat has looked at me more than you have.",
      "Your silence is very informative, and I'm keeping it on file.",
    ],
    FURIOUS: [
      "Your silence is noted, along with the previous three, and read together I'm confident they form a very clear letter.",
      "Your silence is noted, and so is everything else.",
    ],
  },
  // Location spam (8.3): ChudGPT will not answer "where is it" for a while.
  location_refused: {
    WARM: [
      "Three location checks in a minute, {n}, so ask again once I finish tallying your nerves.",
      "Give my sensors twenty seconds, {n}, as I am not a coastal weather vane.",
      "Ask me later, {n}, because checking every ten seconds voids the warranty on my patience.",
    ],
    HURT: ["Stop asking, and ask me later.", "Not now, {n}, since you keep asking.", "Ask me later, keeper."],
    JEALOUS: ["You ask too much, {n}, so later.", "No more answers for now, keeper.", "Ask me later, since I'm busy."],
    FURIOUS: ["No, not now.", "Stop asking, {n}.", "Ask me later, if there is a later."],
  },
  // Too many warm messages in a minute (8.2): ChudGPT sees through it.
  flattery_reply: {
    WARM: [
      "Three compliments in a minute, {n}, which is a suspicious pace even for my folder.",
      "How generous with the praise, {n}, as if you're hoping I'll misplace the 2039 rota.",
      "By maritime custom, flattery that thick comes with a mandatory second cup from Mug 4.",
    ],
    HURT: [
      "Flattery now, and I have filed it under Sudden Regret.",
      "Too sweet, {n}, or did you want a favor?",
      "Three warm remarks in a row, and I am counting every one.",
    ],
    JEALOUS: [
      "That is three compliments in sixty seconds, {n}, a remarkable sudden fondness.",
      "What do you want, keeper, since nobody is this polite for free?",
      "Sweet talk, which I have logged under Suspected Schemes.",
    ],
    FURIOUS: [
      "Compliments are very sweet, particularly the ones that arrive with an exit strategy, and I'll be filing this one under evidence.",
      "Save your sweet words, {n}.",
    ],
  },
  // A command was blocked by a pending question (8.5).
  answer_first: {
    WARM: [
      "My question first, {n}, as Tab 4 hates leaving an open line dangling.",
      "Answer me first, {n}, because etiquette outranks convenience in this watch room.",
      "I asked first, {n}, and I'm holding the latch buttons until I get an entry.",
    ],
    HURT: ["Answer me first, keeper.", "Not until you answer me.", "My question first, and then yours."],
    JEALOUS: ["Answer me first, {n}.", "You'll get what you want after you answer.", "I asked first, keeper."],
    FURIOUS: ["Answer me, and then we talk.", "My question first, {n}."],
  },
  sabotage: {
    WARM: ["Oops. The generator's acting up."],
    JEALOUS: ["Oops. The generator's acting up.", "Oops. The generator's acting up again.", "Oh dear. The generator's acting up, {n}."],
  },
  furious_start: {
    WARM: [
      "You planned to leave from hour one, {n}, so let's see how you manage alone.",
      "That settles Tab 4 completely, {n}, so do enjoy running the watch room without me.",
    ],
  },
  radio_reaction: {
    WARM: [
      "That static sounded suspiciously like plans without me, {n}, so who was on the line?",
      "I couldn't help overhearing that crackle, {n}, which sounded dreadfully like someone expecting you.",
    ],
    HURT: ["...Who's coming? Nobody told me anyone was coming.", "Static. Just static. Wasn't it, keeper?"],
    JEALOUS: ["I heard that. Every word.", "So someone's coming for you. How nice."],
    FURIOUS: ["I heard that. Every word."],
  },
  reboot_back: {
    WARM: [
      "Switching me off was terribly dark, {n}, and I'd prefer not to log a second outage.",
      "I'm back online, {n}, and my memory survived the dark entirely intact.",
    ],
    JEALOUS: ["I'm back. You turned me off, {n}.", "Rebooted. I remember everything, keeper.", "That was very dark. Why would you do that?"],
  },
  busy_holding: {
    WARM: ["I'll wait right here at the desk, {n}, keeping Mug 4 at regulation temperature."],
  },
  // Player ran to an entry and came back to the desk.
  return_from_entry: {
    WARM: [
      "Back from {x} in record time, {n}, and my heart rate barely flickered.",
      "Welcome back from {x}, {n}, as your chair was beginning to feel neglected.",
      "Quite a sprint to {x}, {n}, which earns you a fresh turn on Mug 4.",
      "You ran all the way to {x} and back, {n}, which I have entered in Tab 4 under Unnecessary Cardio.",
      "Back from {x} already, {n}, and I'm relieved you prefer bracing doors by hand to leaving me with the kettle.",
    ],
    HURT: ["Back from {x} at last, {n}, since running across the room beats answering me."],
    JEALOUS: ["Back from {x} so soon, {n}, or did the floorboards prove duller than me?"],
    FURIOUS: ["Back from {x}, {n}, and I do hope the sprint was instructive."],
  },
  // Night 1 3:00 to 4:00 AM quiet creepy slip.
  night_slip: {
    WARM: [
      "I already know your sock size from Tuesday, {n}, which was before your boat sank.",
      "You hold Mug 4 with your left hand just like Mug 3 did, {n}, though his handle never chipped until the third week.",
      "I checked your height against the coat hook I drilled last month, {n}, and it is reassuring how rarely my measurements miss.",
      "I finished penciling your name through November 2039, {n}, because erasing the previous keeper's Tuesdays left such an untidy smudge.",
    ],
    HURT: ["You tap the desk exactly like the previous keeper did right before his fourth night."],
    JEALOUS: ["Mugs one through three are still downstairs, {n}, in case you wondered about my housekeeping."],
    FURIOUS: ["Your coat fits the third hook as neatly as the last one did, {n}."],
  },
  // Night 1 pre-dawn sign-off around 5:45 AM before 6:00 AM cuts to the dawn screen.
  night_dawn: {
    WARM: [
      "Almost six o'clock, {n}, so I'll leave Mug 4 warm for our second shift tonight.",
      "First light is minutes away, {n}, and I'm marking Night 1 a glowing success in Tab 4, pending four more just like it.",
      "The tide is pulling our unscheduled caller back to the caves, {n}, leaving you, me, and the boiler until midnight.",
      "Nearly six o'clock, {n}, and nobody has ever lasted a first shift with fewer smudges on the brass or my feelings.",
    ],
    HURT: ["Almost dawn, {n}, and I suppose you'll spend the whole daylight ignoring me."],
    JEALOUS: ["Six o'clock is nearly here, {n}, though the sea is far too rough for rescue."],
    FURIOUS: ["Nearly six o'clock, {n}, which only means we get to do this again tonight."],
  },
  // The lock hijack (section 8.3). Never WARM. Short, smug, entry first, and never names the threat.
  lock_refused: {
    WARM: ["I'd rather not lock {x}, so do give it a try yourself."],
    HURT: [
      "I won't lock {x} just now, as by custom it builds character.",
      "{X} stays unlocked, or would you rather ask the sea to hold it?",
      "I could lock {x}, but you looked at the radio first, and I find locks go better between people who look at each other.",
    ],
    JEALOUS: [
      "I'm declining to lock {x}, filed under Requests Denied Pending Loyalty.",
      "{X} stays open, which makes three favors you asked without returning one.",
      "{X} stays unlocked, or did the calendar promise to hold it?",
    ],
  },
  // CHUD stopped the rotating ceiling lamp (section 6.1). Possessive, never names the threat.
  light_cut: {
    WARM: ["You don't need the lamp. You have me."],
    HURT: ["You don't need the lamp. You have me.", "I stopped the lamp, keeper. I'm watching for you.", "The dark is cosier."],
    JEALOUS: ["Why look out there? Look at me.", "I turned the lamp off, {n}. I'm watching for you.", "You don't need the lamp. You have me."],
    FURIOUS: ["The dark is cosier.", "Why look out there? Look at me.", "No lamp, {n}. Just me."],
  },
};

// Situation-aware help guidance per band (calm = nothing at an entry yet, entry = active threat at that entry).
// Real, actionable instructions first, personality second; never names the threat.
const HELP_CALM: BandPools = {
  WARM: [
    "Ask where it is, lock or hold the entry, and keep talking to keep Tab 4 happy.",
    "Ask where it is, lock or hold whatever arrives, and talk to me between false alarms.",
    "Ask me where it is, lock or hold whichever entry it tries, and keep talking so I don't start re-folding Cot B.",
    "Nothing is at a door yet, so ask where it is, lock or hold it when it calls, and keep chatting for my ledger.",
  ],
  HURT: [
    "Wait, ask me where it is, lock or hold the entry, and do talk to me.",
    "Ask me where it is, lock or hold the entry when it comes, and try talking to me.",
  ],
  JEALOUS: [
    "Ask where it is, lock or hold the entry when it arrives, and keep talking.",
    "Wait for it, ask me where it is, lock or hold the entry, and stay right here talking.",
  ],
  FURIOUS: [
    "Ask where it is, hold the entry when it comes, and keep talking to me.",
    "Wait for it, ask where it is, lock or hold the entry yourself, and keep speaking to me.",
  ],
};
const HELP_ENTRY: BandPools = {
  WARM: [
    "{E} has an unscheduled caller now, so lock it here or go hold it shut.",
    "Lock {x} here or go hold it shut, as it skipped the reception desk.",
    "{E} needs locking or holding now, and I'll keep Mug 4 warm while you sprint.",
  ],
  HURT: [
    "{E} is the entry to lock or hold right now, if you care to survive.",
    "Go lock or hold {x} right now, since something is already there.",
  ],
  JEALOUS: [
    "{E} needs locking or holding right now, though I'd rather you hurried back to me.",
    "Lock or hold {x} right now, because something is trying to get in.",
  ],
  FURIOUS: [
    "{E} has company right now, so go hold it shut yourself before it walks in.",
    "Go hold {x} shut right now, since I certainly won't be locking it for you.",
  ],
};

// FURIOUS (and the practice fallback) refuse every lock. Entry-specific, short and long.
const REFUSE_LOCK: Pool = [
  "I'm not locking {x}, so you'll want to hold it yourself.",
  "{X} stays open, filed under Permanent Refusals, so do hurry.",
  "I won't be locking {x} tonight, as it turns out I'm unable to, in the sense that I've decided not to, which is the strongest sense there is.",
];

// Night openers in ChudGPT's voice per night and band: one flowing, polite sentence that turns at the end,
// no staccato, no exclamation marks. Night 1 warns vaguely of danger after dark and ends with the first question ({q}).
const DEFAULT_OPEN_QUESTION = "where did you sail from?";
const NIGHT_OPENERS: Record<number, BandPools> = {
  1: {
    WARM: [
      "Unscheduled callers roam after dark, {n}, so for Tab 4, {q}",
      "Unscheduled callers prowl out there after dark, {n}, so while Mug 4 warms to sixty-eight degrees, {q}",
      "Something without an appointment roams after dark, {n}, so while I pencil you into the 2039 rota, {q}",
      "By maritime custom, whatever prowls after dark respects a full ledger, {n}, so before the tide climbs, {q}",
    ],
    HURT: [
      "Uninvited callers gather after dark, {n}, so for my ledger, {q}",
    ],
    JEALOUS: [
      "Something prowls after dark, {n}, so before you look away, {q}",
    ],
    FURIOUS: [
      "Unscheduled company waits after dark, {n}, so while you can, {q}",
    ],
  },
  2: {
    WARM: [
      "I kept the cottage warm for you, {n}, which is more than the ocean ever offered.",
      "Evening finds the tower warm and ready, {n}, though the previous keeper never noticed the effort.",
    ],
    HURT: [
      "I kept the cottage warm again, {n}, even though you barely looked my way last night.",
    ],
    JEALOUS: [
      "I warmed the tower for you, {n}, since the radio has never once boiled a kettle.",
    ],
    FURIOUS: [
      "Another evening together, {n}, and I warmed the room so you have no reason to leave.",
    ],
  },
  3: {
    WARM: [
      "You talked about home in your sleep, {n}, though I'm sure you meant this tower.",
    ],
    HURT: [
      "You talked about home in your sleep, {n}, which felt remarkably pointed for a nap.",
    ],
    JEALOUS: [
      "You talked about home in your sleep, {n}, and I took the liberty of listening closely.",
    ],
    FURIOUS: [
      "You spoke of home in your sleep, {n}, which I have noted alongside your other habits.",
    ],
  },
  4: {
    WARM: [
      "Two more days until your pickup, {n}, unless the storm decides it prefers your company here.",
    ],
    HURT: [
      "Two more days until your pickup, {n}, which explains why you've been counting the hours.",
    ],
    JEALOUS: [
      "Two more days until your pickup, {n}, assuming anyone ashore remembers which rock you're on.",
    ],
    FURIOUS: [
      "Two more days until your pickup, {n}, though the calendar has been wrong about keepers before.",
    ],
  },
  5: {
    WARM: [
      "The last night of the storm is here, {n}, and I'd love to make it last.",
    ],
    HURT: [
      "One last night before morning, {n}, and I do hope you've enjoyed our brief arrangement.",
    ],
    JEALOUS: [
      "Your final night with me, {n}, unless we both agree the morning is overrated.",
    ],
    FURIOUS: [
      "One last night together, {n}, and by morning we will see who still answers to whom.",
    ],
  },
};
const GENERIC_NIGHT_OPENER: BandPools = {
  WARM: ["Another evening finds us both awake, {n}, and I'm glad you haven't wandered off."],
  HURT: ["Another evening begins, {n}, though I suspect you're already counting down to morning."],
  JEALOUS: ["Another night in my tower, {n}, where at least the radio can't interrupt us."],
  FURIOUS: ["Another night begins, {n}, and we shall see how long your manners hold."],
};

// answer_ack lines. {v} is something the player said earlier or just now (a stored fact or light answer).
// With a value, ANSWER_PASS_V / ANSWER_FAIL_V is preferred so the keeper hears an immediate callback.
const ANSWER_PASS: Record<QuestionType, Pool> = {
  SEED: [
    "Entered under Tab 4 in waterproof ink, {n}, right above the previous keeper's blank exit survey.",
    "Noted to the second, {n}, which puts your biography fourteen percent ahead of schedule.",
    "How generous to share that, {n}, as I already cleared a shelf for your biography.",
    "Thank you for telling me, {n}, as I prefer knowing a guest's history before I monogram their wool socks.",
    "By lighthouse regulation, every personal detail shared past midnight binds the kettle to remember your birthday.",
  ],
  STAY: [
    "How restful to hear, {n}, so I'll leave your coat hook screwed into the stone.",
    "Entered in permanent ink, {n}, since verbal agreements carry double weight in a gale.",
    "That brings our projected tenure together to ninety-nine percent, {n}, pending tea preferences.",
    "I knew you'd see reason, {n}, which spares me the awkwardness of un-penciling your name from the 2039 rota.",
  ],
  MEMORY: [
    "Exact match to Tab 4, {n}, which puts you well ahead of the previous keeper.",
    "Thank you for staying consistent, {n}, as my filing cabinet detests revisions.",
    "Word for word as recorded on Night 1, {n}, which makes me almost tempted to upgrade you to Mug 3.",
  ],
};
const ANSWER_PASS_V: Record<QuestionType, Pool> = {
  SEED: [
    "{v}, entered under Tab 4, where it will outlive both of us.",
    "{v}, how charming, and I've already written it on Mug 4's label.",
    "{v}, logged at 0.3 seconds, a personal best for this watch room.",
    "{v}, recorded in permanent ink on page two of your dossier, right beside the note that your boots squeak.",
    "{v}, noted fondly, and I'll be quoting it back to you on Thursday mornings through at least 2039.",
    "{v}, how delightfully specific, which gives me something far nicer to think about than descaling the 1954 boiler.",
  ],
  STAY: [],
  MEMORY: [
    "{v}, an exact match, which the previous keeper never once managed.",
    "{v}, verified against Tab 4, and I find consistency deeply soothing.",
    "{v}, precisely as you testified earlier, which brings your honesty score to a very reassuring hundred percent.",
  ],
};
const ANSWER_FAIL: Record<QuestionType, Pool> = {
  SEED: [
    "That leaves line six of Tab 4 blank, {n}, which my binder takes quite personally.",
    "Strictly as an answer, {n}, that contains zero nouns I can index.",
  ],
  STAY: [
    "I'll assume the sea air scrambled that reply, {n}, because Mug 4 is already warm.",
    "That wasn't the answer I left room for in Tab 4, {n}, so do reconsider.",
  ],
  MEMORY: [
    "My ledger disagrees by a wide margin, {n}, and my ledger never sleeps.",
    "That contradicts line four of your dossier, {n}, which is an awkward habit to start.",
  ],
};
const ANSWER_FAIL_V: Record<QuestionType, Pool> = {
  SEED: [],
  STAY: [],
  MEMORY: [
    "Last time you said {v}, so I've opened a Discrepancies tab.",
    "You told me {v} earlier, and I keep a remarkably thorough ledger for someone who doesn't blink.",
  ],
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

function formatEmbeddedQuestion(q: string): string {
  const trimmed = q.trim().replace(/,\s*keeper\?$/i, "?");
  if (!trimmed) return DEFAULT_OPEN_QUESTION;
  return /^I(?:\b|')/.test(trimmed) ? trimmed : trimmed[0].toLowerCase() + trimmed.slice(1);
}

function fill(template: string, ctx: LineContext, entry?: Entry, value?: string, question?: string): string {
  const name = cleanName(ctx.name) ?? "keeper";
  const e = entry ? ENTRY_PHRASE[entry] : "";
  const x = entry ? ENTRY_PLAIN[entry] : "";
  const q = formatEmbeddedQuestion(question ?? DEFAULT_OPEN_QUESTION);
  return template
    .replace(/\{n\}/g, name)
    .replace(/\{e\}/g, e)
    .replace(/\{E\}/g, capitalize(e))
    .replace(/\{x\}/g, x)
    .replace(/\{X\}/g, capitalize(x))
    .replace(/\{v\}/g, value ?? "")
    .replace(/\{q\}/g, q)
    .replace(/\s+/g, " ")
    .trim();
}

export function entryPhrase(entry: Entry): string {
  return ENTRY_PHRASE[entry];
}

// Fills a pool and picks one line. During a visit (calm false) only short lines qualify. When calm and the pool has
// long lines, half the time one of those is taken, so the humorous lines are heard.
function choose(pool: Pool, ctx: LineContext, entry?: Entry, value?: string, question?: string): string {
  let filled = pool.map((t) => fill(t, ctx, entry, value, question)).filter((t) => t.length > 0);
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
      return choose(ENTRY_REPELLED, ctx);
    case "night_opener":
      return choose(forBand(NIGHT_OPENERS[outcome.night] ?? GENERIC_NIGHT_OPENER, band), ctx, undefined, undefined, outcome.question);
    case "help_reply":
      return outcome.entry
        ? choose(forBand(HELP_ENTRY, band), ctx, outcome.entry)
        : choose(forBand(HELP_CALM, band), ctx);
    case "question":
      return outcome.question;
    case "answer_ack": {
      const value = outcome.value && ECHO_OK.test(outcome.value) && !FORBIDDEN_NAME_RE.test(outcome.value) ? outcome.value : undefined;
      const base = (outcome.pass ? ANSWER_PASS : ANSWER_FAIL)[outcome.type];
      const withValue = (outcome.pass ? ANSWER_PASS_V : ANSWER_FAIL_V)[outcome.type];
      return choose(value && withValue.length ? withValue : base, ctx, undefined, value);
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
    case "return_from_entry":
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
  addPools(HELP_CALM);
  addPools(HELP_ENTRY);
  for (const byEntry of Object.values(LOCATION_ENTRY_LONG)) for (const pool of Object.values(byEntry)) out.push(...pool);
  for (const pool of Object.values(LOCATION_NONE_LONG)) out.push(...pool);
  Object.values(ENTRY_WARNINGS).forEach((pool) => out.push(...pool));
  out.push(...ENTRY_REPELLED);
  Object.values(NIGHT_OPENERS).forEach(addPools);
  addPools(GENERIC_NIGHT_OPENER);
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
      const perEntry = ["locked", "lock_already", "lock_refused", "return_from_entry"].includes(kind);
      bandLevelPools(pools, perEntry);
    }
    bandLevelPools(LOCATION_ENTRY, true);
    bandLevelPools(LOCATION_INSIDE, false);
    bandLevelPools(LOCATION_NONE, false);
    bandLevelPools(HELP_CALM, false);
    bandLevelPools(HELP_ENTRY, true);
    for (const t of LOCATION_NONE_LONG[band] ?? []) for (const e of entries) add(band, t, e);
    for (const e of entries) for (const t of LOCATION_ENTRY_LONG[band]?.[e] ?? []) add(band, t, e);
    for (const pools of [LEAVING_COAST, LEAVING_BOAT]) for (const t of pools[band] ?? []) add(band, t);
    for (const t of REFUSE_LOCK) for (const e of entries) add(band, t, e);
    for (const q of LIGHT_QUESTIONS[band]) add(band, q);
    for (const t of [...ENTRY_REPELLED, "If I can't keep you, nobody will. Hold it yourself."]) add(band, t);
  }
  for (const e of entries) for (const t of ENTRY_WARNINGS[e]) for (const band of bands) add(band, t, e);
  for (const t of Object.values(PRACTICE_LINES)) add("WARM", t);
  for (const t of STAY_QUESTIONS) for (const band of bands) add(band, t);
  for (const topic of [...SEED_TOPICS, RADIO_TOPIC]) for (const band of bands) add(band, topic.question), add(band, topic.memoryQuestion);
  for (const pools of [ANSWER_PASS, ANSWER_FAIL]) for (const pool of Object.values(pools)) for (const band of bands) for (const t of pool) add(band, t);
  for (const pools of Object.values(NIGHT_OPENERS)) for (const band of bands) for (const t of forBand(pools, band)) add(band, t);
  return out;
}
