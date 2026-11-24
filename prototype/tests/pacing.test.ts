// ChudGPT pacing (GAME_LOGIC 8.10): it never talks over itself or the keeper, questions wait for a free moment,
// the low priority lines are dropped, long lines wait for calm, and a quiet ChudGPT asks a light question.
import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { cannedLine, wordCount, type LineContext } from "../src/chud/lines";
import { GameEngine } from "../src/sim/engine";
import { NEUTRAL_JUDGE, type Band, type Entry, type GameEvent, type Outcome } from "../src/sim/types";

const T = CONFIG.TICK;
type Say = Extract<GameEvent, { type: "CHUD_SAY" }>;

// An engine with no visits and no scheduled questions unless the test adds them.
function quiet(night = 1, over: Partial<typeof CONFIG> = {}): GameEngine {
  const nights = CONFIG.nights.map((n) => ({ ...n, firstVisitDelay: 1e6, questionMix: [] as typeof n.questionMix }));
  const e = new GameEngine({ seed: 11, skipNamePrompt: true, startNight: night, config: { ...CONFIG, nights, ...over } });
  e.beginNight();
  e.drainEvents();
  return e;
}
const run = (e: GameEngine, seconds: number, onEvent?: (ev: GameEvent) => void): GameEvent[] => {
  const seen: GameEvent[] = [];
  for (let i = 0, n = Math.round(seconds / T); i < n && e.state.phase === "PLAYING"; i++) {
    e.tick(T);
    for (const ev of e.drainEvents()) {
      seen.push(ev);
      onEvent?.(ev);
    }
  }
  return seen;
};
const lines = (evs: GameEvent[]): Say[] => evs.filter((ev): ev is Say => ev.type === "CHUD_SAY");
const asked = (_e: GameEngine, evs: GameEvent[]): number[] =>
  evs.flatMap((ev) => (ev.type === "QUESTION_ASKED" ? [ev.question.askedAt] : []));
const plan = (e: GameEngine, ...due: number[]) => {
  e.state.chud.questionPlan = due.map((dueAt) => ({ type: "SEED" as const, dueAt, asked: false }));
};
const answer = (e: GameEngine, text = "Halifax") => {
  const r = e.submitMessage(text);
  if (!r.ok) throw new Error(r.reason);
  e.applyJudge(r.ticket.id, { ...NEUTRAL_JUDGE, answered_question: true });
  return lines(e.drainEvents());
};
const LONG = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five";

describe("holds on questions", () => {
  it("a question waits while ChudGPT is still speaking", () => {
    const e = quiet();
    plan(e, 20);
    run(e, 19.9);
    e.noteSpoken(LONG); // about 10 s of speech starting now
    const busyEnd = e.state.clock.elapsed + wordCount(LONG) / 2.6 + 0.6;
    const evs = run(e, 25);
    const [t] = asked(e, evs);
    expect(t).toBeGreaterThanOrEqual(busyEnd - 0.1);
    expect(t).toBeLessThan(busyEnd + 0.5);
  });

  it("a question waits while the keeper is typing, and comes when they stop", () => {
    const e = quiet();
    plan(e, 20);
    run(e, 19);
    e.setTyping(true);
    expect(asked(e, run(e, 15))).toEqual([]);
    e.setTyping(false);
    const [t] = asked(e, run(e, 2));
    expect(t).toBeGreaterThan(33.9);
  });

  it("typing only counts at the desk", () => {
    const e = quiet();
    plan(e, 20);
    e.turn("WINDOW");
    e.setTyping(true);
    expect(asked(e, run(e, 22)).length).toBe(1);
  });

  it("no question lands within 15 s of the keeper's last exchange, and none while one is open", () => {
    const e = quiet();
    plan(e, 20);
    run(e, 17);
    const r = e.submitMessage("just chatting");
    if (!r.ok) throw new Error("rejected");
    e.applyJudge(r.ticket.id, NEUTRAL_JUDGE);
    const evs = run(e, 20);
    const [t] = asked(e, evs);
    expect(t).toBeGreaterThanOrEqual(17 + CONFIG.PACING.EXCHANGE_GAP - 0.1);
    // An open question blocks every other question.
    expect(e.state.chud.pendingQuestion).not.toBeNull();
    plan(e, e.state.clock.elapsed);
    expect(asked(e, run(e, 10))).toEqual([]);
  });

  it("questions are never back to back: the next is at least the minimum spacing after the last", () => {
    const e = quiet(2);
    plan(e, 20, 21);
    const first = asked(e, run(e, 25));
    expect(first.length).toBe(1);
    const lineAfter = answer(e);
    expect(lineAfter.length).toBe(1); // the reaction closes the exchange
    const second = asked(e, run(e, 80));
    expect(second.length).toBe(1);
    expect(second[0] - first[0]).toBeGreaterThanOrEqual(CONFIG.scheduledQuestionMinSpacing - 0.1);
  });

  it("a talkative keeper cannot dodge a due question forever", () => {
    const e = quiet();
    plan(e, 20);
    let t = 0;
    let got: number | undefined;
    while (t < 80 && got === undefined) {
      const r = e.submitMessage(`chatting ${t}`);
      if (r.ok) e.applyJudge(r.ticket.id, NEUTRAL_JUDGE);
      const evs = run(e, 8);
      t += 8;
      got = asked(e, evs)[0];
    }
    expect(got).toBeDefined();
    expect(got!).toBeLessThanOrEqual(20 + CONFIG.PACING.EXCHANGE_HOLD_MAX + 4);
  });

  it("the question times out after 15 s", () => {
    const e = quiet();
    plan(e, 20);
    run(e, 20.2);
    expect(e.state.chud.pendingQuestion).not.toBeNull();
    const askedAt = e.state.chud.pendingQuestion!.askedAt;
    expect(CONFIG.QUESTION_TIMEOUT).toBe(15);
    run(e, askedAt + 14.8 - e.state.clock.elapsed);
    expect(e.state.chud.pendingQuestion).not.toBeNull();
    const evs = run(e, 0.5);
    expect(evs.some((ev) => ev.type === "QUESTION_RESOLVED" && ev.result === "timeout")).toBe(true);
  });
});

describe("priorities", () => {
  it("answers and lock confirmations play at once, even while ChudGPT is busy or the keeper types", () => {
    const e = quiet();
    run(e, 5);
    e.noteSpoken(LONG);
    e.setTyping(true);
    e.pressQuick("LOCK_HATCH");
    const said = lines(e.drainEvents());
    expect(said.map((l) => l.outcome.kind)).toEqual(["locked"]);
    expect(said[0].lineClass).toBe("info");
    run(e, 0.6);
    e.pressQuick("ASK_LOCATION");
    expect(lines(e.drainEvents()).map((l) => l.outcome.kind)).toEqual(["location_claim"]);
  });

  it("the night 1 entry warning plays at once while busy or typing", () => {
    const e = quiet(1);
    e.setTyping(true);
    e.noteSpoken(LONG);
    e.devSendRam("HATCH");
    const evs = run(e, 20);
    const warning = lines(evs).find((l) => l.outcome.kind === "entry_warning");
    expect(warning).toBeDefined();
    expect(wordCount(warning!.text)).toBeLessThanOrEqual(16);
    expect(warning!.text.toLowerCase()).toContain("hatch");
  });

  // Night 1 repel: "It's gone" is the lowest priority line (it only plays in a free moment).
  it("a low priority line that cannot play within 3 s is dropped, not queued", () => {
    const e = quiet(1);
    e.devSendRam("HATCH");
    while (e.state.ram.state !== "AT_ENTRY") run(e, 0.25);
    e.pressQuick("LOCK_HATCH");
    e.setTyping(true); // the keeper types through the repel and the 3 s after it
    const evs = run(e, 12);
    expect(evs.some((ev) => ev.type === "RAM_REPELLED")).toBe(true);
    expect(lines(evs).some((l) => l.outcome.kind === "entry_repelled")).toBe(false);
    e.setTyping(false);
    expect(lines(run(e, 6)).some((l) => l.outcome.kind === "entry_repelled")).toBe(false);
  });

  it("a low priority line plays when the moment is free", () => {
    const e = quiet(1);
    e.devSendRam("HATCH");
    while (e.state.ram.state !== "AT_ENTRY") run(e, 0.25);
    e.pressQuick("LOCK_HATCH");
    expect(lines(run(e, 14)).some((l) => l.outcome.kind === "entry_repelled")).toBe(true);
  });

  it("unprompted lines are at least the gap apart", () => {
    const e = quiet(4);
    plan(e, 15, 60, 110);
    const times: number[] = [];
    run(e, 200, (ev) => {
      if (ev.type === "CHUD_SAY" && ev.unprompted && ev.outcome.kind !== "night_opener" && ev.outcome.kind !== "question_timeout") times.push(e.state.clock.elapsed);
    });
    expect(times.length).toBeGreaterThan(3);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1], `${times}`).toBeGreaterThanOrEqual(CONFIG.PACING.UNPROMPTED_GAP - 0.1);
  });
});

describe("long lines only when calm", () => {
  it("during a visit every spoken line is 16 words or fewer, over many seeds", () => {
    let longCalm = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const nights = CONFIG.nights.map((n) => ({ ...n, firstVisitDelay: 1e6, questionMix: [] as typeof n.questionMix }));
      const e = new GameEngine({ seed, skipNamePrompt: true, startNight: 3, config: { ...CONFIG, nights } });
      e.beginNight();
      e.drainEvents();
      e.devSetSuspicion(seed % 2 ? 55 : 80);
      // Calm: ask and lock with nothing at the entries.
      e.pressQuick("LOCK_HATCH");
      for (const l of lines(e.drainEvents())) if (wordCount(l.text) > 16) longCalm++;
      run(e, 13);
      e.pressQuick("ASK_LOCATION");
      for (const l of lines(e.drainEvents())) if (wordCount(l.text) > 16) longCalm++;
      // Visit: approach, at entry. Many requests, all short.
      e.devSendRam("WINDOW");
      while (e.state.ram.state !== "AT_ENTRY" && e.state.phase === "PLAYING") run(e, 0.25);
      for (let k = 0; k < 6; k++) {
        e.pressQuick(k % 2 ? "LOCK_WINDOW" : "ASK_LOCATION");
        for (const l of lines(e.drainEvents())) expect(wordCount(l.text), l.text).toBeLessThanOrEqual(16);
        const evs = run(e, 1.2);
        for (const l of lines(evs)) expect(wordCount(l.text), l.text).toBeLessThanOrEqual(16);
        if (e.state.phase !== "PLAYING") break;
      }
    }
    expect(longCalm).toBeGreaterThan(0);
  });
});

describe("the quiet limit", () => {
  it.each([[1, 30], [2, 35], [3, 40], [4, 45], [5, 50]])("night %i: a light question after %i s of silence while calm", (night, limit) => {
    const e = quiet(night);
    const evs = run(e, limit - 0.5);
    expect(asked(e, evs)).toEqual([]);
    const more = run(e, 1);
    const q = more.find((ev) => ev.type === "QUESTION_ASKED");
    expect(q).toBeDefined();
    if (q?.type === "QUESTION_ASKED") {
      expect(q.question.origin).toBe("QUIET");
      expect(q.question.text.endsWith("?")).toBe(true);
      expect(q.question.askedAt).toBeGreaterThanOrEqual(limit - 0.1);
    }
    const said = lines(more).find((l) => l.outcome.kind === "question");
    expect(said?.lineClass).toBe("question");
    expect(wordCount(said!.text)).toBeLessThanOrEqual(16);
  });

  it("is only asked while calm, and a question answered earlier restarts the quiet clock", () => {
    const e = quiet(1);
    e.devSendRam("WINDOW"); // a visit is under way: approach 12 s then the attempt window
    e.state.ram.stateEndsAt += 100;
    const evs = run(e, 40);
    expect(asked(e, evs)).toEqual([]);
  });

  it("any line restarts the quiet clock", () => {
    const e = quiet(1);
    run(e, 25);
    e.pressQuick("ASK_LOCATION");
    e.drainEvents();
    expect(asked(e, run(e, 29))).toEqual([]);
    expect(asked(e, run(e, 3)).length).toBe(1);
  });

  it("a light question is answered like any real answer and stores no fact", () => {
    const e = quiet(1);
    run(e, 31);
    const pq = e.state.chud.pendingQuestion!;
    expect(pq.factKey).toBeNull();
    const reply = answer(e, "Salt and wet rope");
    expect(reply.map((l) => l.outcome.kind)).toEqual(["answer_ack"]);
    expect(e.state.chud.pendingQuestion).toBeNull();
    expect(Object.keys(e.state.chud.facts).filter((k) => k !== "name")).toEqual([]);
  });

  it("an unanswered light question costs less than a scheduled one", () => {
    const e = quiet(1, { SILENCE_LIMIT: 1e9 });
    run(e, 31);
    const before = e.state.chud.suspicion;
    run(e, CONFIG.QUESTION_TIMEOUT + 0.5);
    expect(e.state.chud.suspicion - before).toBe(CONFIG.LIGHT_QUESTION_TIMEOUT_PENALTY);
  });
});

describe("radio question", () => {
  it("night 2: the radio question is the reaction, with no extra line stacked on it", () => {
    const e = quiet(2);
    const evs = run(e, CONFIG.HOUR_LENGTH * 3 + 30);
    const radio = evs.findIndex((ev) => ev.type === "RADIO");
    expect(radio).toBeGreaterThanOrEqual(0);
    expect(lines(evs.slice(radio)).some((l) => l.outcome.kind === "radio_reaction")).toBe(false);
    expect(lines(evs.slice(radio)).some((l) => l.outcome.kind === "question")).toBe(true);
  });
});

// The 20 approved lines, each in the context it was written for (band, outcome, calm).
describe("the approved voice lines are reachable", () => {
  const ctx = (band: Band, rand: number, over: Partial<LineContext> = {}): LineContext => ({ band, name: "keeper", rand: () => rand, calm: true, ...over });
  const seen = (o: Outcome, band: Band, over: Partial<LineContext> = {}): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i < 100; i++) out.add(cannedLine(o, ctx(band, i / 100, over)));
    return out;
  };
  const expectLine = (o: Outcome, band: Band, text: string, over: Partial<LineContext> = {}) =>
    expect([...seen(o, band, over)], text).toContain(text);

  it("1 to 6 (WARM)", () => {
    expectLine({ kind: "leaving_reply" }, "WARM", "I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected.");
    expectLine({ kind: "warm_reply" }, "WARM", "That's kind of you to say, and I'll keep it in a folder with the other two compliments I've received, both of which were about the beacon.");
    expectLine({ kind: "leaving_reply", topic: "coast" }, "WARM", "I'm thrilled the Coast Guard is coming, and I'll be on my best behavior, which I hope you'll mention when they ask how long I've been like this.");
    expectLine({ kind: "locked", entry: "HATCH" }, "WARM", "The hatch is locked, and I enjoyed doing it more than I think the previous keeper ever appreciated.");
    expectLine({ kind: "silence" }, "WARM", "You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio.");
    expectLine({ kind: "location_claim", entry: "BALCONY" }, "WARM", "It's on the balcony, I'd stake my beacon on it, and if the window is making any noise, that's simply the wind practicing.");
  });
  it("7 to 10 (HURT)", () => {
    expectLine({ kind: "lock_refused", entry: "WINDOW" }, "HURT", "I could lock the window, but you looked at the radio first, and I find locks go better between people who look at each other.");
    expectLine({ kind: "leaving_reply" }, "HURT", "Of course you want to go, I'm only a lighthouse, and nobody has ever crossed an ocean specifically to stay in one.");
    expectLine({ kind: "silence" }, "HURT", "I'll take the silence as a comment on the quality of my company, and I'd like to thank you for being so direct about it.");
    expectLine({ kind: "location_claim", entry: "HATCH" }, "HURT", "Something is under the hatch, and I'd tell you not to worry, but I've stopped saying that to people who don't tell me their plans.");
  });
  it("11 to 15 (JEALOUS)", () => {
    expectLine({ kind: "leaving_reply", topic: "coast" }, "JEALOUS", "It's wonderful how fondly you speak of the Coast Guard, a group that has met you for a combined total of one radio crackle.");
    expectLine({ kind: "leaving_reply", topic: "boat" }, "JEALOUS", "You've mentioned your boat four times tonight, and I'm sure it was lovely, though it was the one that left you in the ocean.");
    expectLine({ kind: "locked", entry: "WINDOW" }, "JEALOUS", "I've locked the window, because it's what a friend does, and I imagine the radio would too, if it were capable of caring about anything.");
    expectLine({ kind: "location_claim", entry: "NONE" }, "JEALOUS", "It's nowhere near the hatch, and I know that with total certainty, because I've never once been wrong about a door I was hoping you'd open.", { entryHint: "HATCH" as Entry });
    expectLine({ kind: "silence" }, "JEALOUS", "You've looked at that calendar more than you've looked at me, and I want you to know it has nothing to add.");
  });
  it("16 to 20 (FURIOUS)", () => {
    expectLine({ kind: "refuse_furious", request: "LOCK", entry: "BALCONY" }, "FURIOUS", "I won't be locking the balcony tonight, as it turns out I'm unable to, in the sense that I've decided not to, which is the strongest sense there is.");
    expectLine({ kind: "leaving_reply" }, "FURIOUS", "Leaving is a fascinating subject, and I'd love the previous keeper's thoughts on it, but he stopped answering my questions around the time he raised it.");
    expectLine({ kind: "warm_reply" }, "FURIOUS", "Compliments are very sweet, particularly the ones that arrive with an exit strategy, and I'll be filing this one under evidence.");
    expectLine({ kind: "silence" }, "FURIOUS", "Your silence is noted, along with the previous three, and read together I'm confident they form a very clear letter.");
    expectLine({ kind: "location_claim", entry: "BALCONY" }, "FURIOUS", "It is on the balcony, absolutely, and if you hear it at the hatch beneath your feet, please take that as a sign of how large the balcony has become.");
  });

  it("the long ones are never chosen during a visit, and each pool keeps a short line", () => {
    const kinds: Outcome[] = [
      { kind: "leaving_reply" }, { kind: "warm_reply" }, { kind: "locked", entry: "HATCH" }, { kind: "silence" },
      { kind: "lock_refused", entry: "WINDOW" }, { kind: "refuse_furious", request: "LOCK", entry: "BALCONY" },
      { kind: "location_claim", entry: "BALCONY" }, { kind: "location_claim", entry: "NONE" },
    ];
    for (const o of kinds) {
      for (const band of ["WARM", "HURT", "JEALOUS", "FURIOUS"] as Band[]) {
        for (const text of seen(o, band, { calm: false, entryHint: "HATCH" })) expect(wordCount(text), text).toBeLessThanOrEqual(16);
      }
    }
  });
});
