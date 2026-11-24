// ChudGPT pacing (GAME_LOGIC 8.10): it never talks over itself or the keeper, questions wait for a free moment,
// the low priority lines are dropped, long lines wait for calm, and a quiet ChudGPT asks a light question.
import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { RADIO_LINES, speechSeconds, wordCount } from "../src/chud/lines";
import { GameEngine } from "../src/sim/engine";
import { NEUTRAL_JUDGE, type Band, type Entry, type GameEvent, type JudgeResult, type QuickCommand } from "../src/sim/types";

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
  it.each([[1, 20], [2, 35], [3, 40], [4, 45], [5, 50]])("night %i: a light question after %i s of silence while calm", (night, limit) => {
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

  it("night 1 switches from the 20 s early quiet limit to 30 s after the first visit", () => {
    const e = quiet(1);
    e.devSendRam("WINDOW");
    while (e.state.ram.state !== "AT_ENTRY") run(e, 0.25);
    e.pressQuick("LOCK_WINDOW");
    while ((e.state.ram.state as string) !== "AWAY") run(e, 0.25);
    // Let any post-repel line settle, then send a fresh line and confirm 30 s quiet limit applies now.
    run(e, 4);
    e.pressQuick("ASK_LOCATION");
    e.drainEvents();
    expect(asked(e, run(e, 29))).toEqual([]);
    expect(asked(e, run(e, 2.5)).length).toBe(1);
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
    run(e, 15);
    e.pressQuick("ASK_LOCATION");
    e.drainEvents();
    expect(asked(e, run(e, 19))).toEqual([]);
    expect(asked(e, run(e, 2.5)).length).toBe(1);
  });

  it("a light question is answered like any real answer and stores no fact", () => {
    const e = quiet(1);
    run(e, 21);
    const pq = e.state.chud.pendingQuestion!;
    expect(pq.factKey).toBeNull();
    const reply = answer(e, "Salt and wet rope");
    expect(reply.map((l) => l.outcome.kind)).toEqual(["answer_ack"]);
    expect(e.state.chud.pendingQuestion).toBeNull();
    expect(Object.keys(e.state.chud.facts).filter((k) => k !== "name")).toEqual([]);
  });

  it("an unanswered light question costs less than a scheduled one", () => {
    const e = quiet(1, { SILENCE_LIMIT: 1e9 });
    run(e, 21);
    const before = e.state.chud.suspicion;
    run(e, CONFIG.QUESTION_TIMEOUT + 0.5);
    expect(e.state.chud.suspicion - before).toBe(CONFIG.LIGHT_QUESTION_TIMEOUT_PENALTY);
  });

  it("night 1 plays a 3 to 4 AM creepy slip, a pre-dawn line, and reacts when returning from an entry", () => {
    const e = quiet(1, { QUIET_LIMIT: [1e9, 1e9, 1e9, 1e9, 1e9], NIGHT1_EARLY_QUIET_LIMIT: 1e9, SILENCE_LIMIT: 1e9 });
    // Let the Night 1 opener finish speaking, then run to the hatch and come back while calm.
    run(e, 12);
    e.turn("HATCH");
    e.goToEntry("HATCH");
    run(e, CONFIG.TRAVEL_TIME + 0.5);
    e.returnToDesk();
    const retEvs = run(e, CONFIG.TRAVEL_TIME + 1);
    expect(lines(retEvs).some((l) => l.outcome.kind === "return_from_entry")).toBe(true);

    // Advance across the rest of Night 1 to verify the 3 to 4 AM slip and pre-dawn line both fire once.
    const rest = run(e, CONFIG.HOUR_LENGTH * CONFIG.NIGHT_HOURS);
    const slips = lines(rest).filter((l) => l.outcome.kind === "night_slip");
    const dawns = lines(rest).filter((l) => l.outcome.kind === "night_dawn");
    expect(slips).toHaveLength(1);
    expect(dawns).toHaveLength(1);
  });

  it("night 1 opener asks the night's first question at 12:00 AM so the keeper has something to answer", () => {
    const e = new GameEngine({ seed: 7, skipNamePrompt: true, startNight: 1, facts: { name: "Sam" } });
    e.beginNight();
    const evs = e.drainEvents();
    expect(e.state.chud.pendingQuestion).not.toBeNull();
    expect(e.state.chud.pendingQuestion!.type).toBe("SEED");
    const opener = lines(evs).find((l) => l.outcome.kind === "night_opener");
    expect(opener).toBeDefined();
    expect(opener!.text.endsWith("?")).toBe(true);
    const ack = answer(e, "Halifax");
    expect(ack.map((l) => l.outcome.kind)).toEqual(["answer_ack"]);
    expect(e.state.chud.pendingQuestion).toBeNull();
    expect(Object.values(e.state.chud.facts)).toContain("Halifax");
  });
});

describe("radio question", () => {
  it("night 2: the radio question is the reaction, waits for the radio broadcast, and stacks no extra line", () => {
    const e = quiet(2);
    let radioAt = -1;
    let questionAt = -1;
    const evs = run(e, CONFIG.HOUR_LENGTH * 3 + 30, (ev) => {
      if (ev.type === "RADIO") radioAt = e.state.clock.elapsed;
      if (ev.type === "QUESTION_ASKED" && ev.question.origin === "SCRIPT") questionAt = ev.question.askedAt;
    });
    const radio = evs.findIndex((ev) => ev.type === "RADIO");
    expect(radio).toBeGreaterThanOrEqual(0);
    expect(lines(evs.slice(radio)).some((l) => l.outcome.kind === "radio_reaction")).toBe(false);
    expect(lines(evs.slice(radio)).some((l) => l.outcome.kind === "question")).toBe(true);
    expect(questionAt - radioAt).toBeGreaterThanOrEqual(speechSeconds(RADIO_LINES[2]) - 0.1);
  });

  it("night 2: the radio question waits if an attempt is already underway", () => {
    const e = quiet(2, { QUIET_LIMIT: [1e9, 1e9, 1e9, 1e9, 1e9], SILENCE_LIMIT: 1e9 });
    run(e, CONFIG.HOUR_LENGTH * 3 - 10); // 140 s; approach is 9 s so AT_ENTRY starts at 149 s
    e.devSendRam("HATCH");
    let questionAt = -1;
    let retreatAt = -1;
    run(e, 30, (ev) => {
      if (ev.type === "RAM_AT_ENTRY") e.pressQuick("LOCK_HATCH");
      if (ev.type === "RAM_RETREAT") retreatAt = e.state.clock.elapsed;
      if (ev.type === "QUESTION_ASKED" && ev.question.origin === "SCRIPT") questionAt = ev.question.askedAt;
    });
    expect(retreatAt).toBeGreaterThan(CONFIG.HOUR_LENGTH * 3);
    expect(questionAt).toBeGreaterThanOrEqual(retreatAt - 0.1);
  });
});

// The 20 approved lines, each proved reachable through real GameEngine paths (no direct cannedLine calls).
describe("the approved voice lines are reachable through real engine paths", () => {
  const bandSuspicion: Record<Band, number> = { WARM: 0, HURT: 42, JEALOUS: 72, FURIOUS: 100 };

  function fresh(seed: number, band: Band, night = 2): GameEngine {
    const nights = CONFIG.nights.map((n) => ({ ...n, firstVisitDelay: 1e6, questionMix: [] as typeof n.questionMix }));
    const e = new GameEngine({
      seed,
      skipNamePrompt: true,
      startNight: night,
      config: { ...CONFIG, nights, SILENCE_LIMIT: 1e9, QUIET_LIMIT: [1e9, 1e9, 1e9, 1e9, 1e9] },
    });
    e.beginNight();
    e.drainEvents();
    if (bandSuspicion[band] > 0) {
      e.devSetSuspicion(bandSuspicion[band]);
      e.drainEvents();
    }
    return e;
  }

  function collect(seeds: number, drive: (seed: number) => Say[]): Set<string> {
    const out = new Set<string>();
    for (let seed = 1; seed <= seeds; seed++) {
      for (const s of drive(seed)) out.add(s.text);
    }
    return out;
  }

  function sayMsg(band: Band, text: string, patch: Partial<JudgeResult>): Set<string> {
    return collect(60, (seed) => {
      const e = fresh(seed, band);
      const r = e.submitMessage(text);
      if (!r.ok) throw new Error(r.reason);
      e.applyJudge(r.ticket.id, { ...NEUTRAL_JUDGE, ...patch });
      return lines(e.drainEvents());
    });
  }

  function sayQuick(band: Band, cmd: QuickCommand, approach?: Entry): Set<string> {
    return collect(80, (seed) => {
      const e = fresh(seed, band, 2);
      if (approach) {
        e.devSendRam(approach);
        e.drainEvents();
      }
      e.pressQuick(cmd);
      return lines(e.drainEvents());
    });
  }

  function sayTimeout(band: Band): Set<string> {
    return collect(60, (seed) => {
      const e = fresh(seed, band, 2);
      // Let a scheduled question fire cleanly while calm, then time out after 15 s.
      plan(e, 15);
      const evs = run(e, 35);
      return lines(evs).filter((l) => l.outcome.kind === "question_timeout");
    });
  }

  it("1 to 6 (WARM)", () => {
    expect([...sayMsg("WARM", "I want to leave", { mentions_leaving: true })]).toContain(
      "I want you to know nobody has ever been this comfortable in this lighthouse, though to be fair, the previous keeper's feedback was never collected.",
    );
    expect([...sayMsg("WARM", "this place is lovely", { warm: true })]).toContain(
      "That's kind of you to say, and I'll keep it in a folder with the other two compliments I've received, both of which were about the beacon.",
    );
    expect([...sayMsg("WARM", "the coast guard is coming soon", { mentions_leaving: true })]).toContain(
      "I'm thrilled the Coast Guard is coming, and I'll be on my best behavior, which I hope you'll mention when they ask how long I've been like this.",
    );
    expect([...sayQuick("WARM", "LOCK_HATCH")]).toContain(
      "The hatch is locked, and I enjoyed doing it more than I think the previous keeper ever appreciated.",
    );
    expect([...sayTimeout("WARM")]).toContain(
      "You've gone quiet, which I'm choosing to read as contentment, because every other reading involves the radio.",
    );
    expect([...sayQuick("WARM", "ASK_LOCATION", "BALCONY")]).toContain(
      "It's on the balcony, I'd stake my beacon on it, and if the window is making any noise, that's simply the wind practicing.",
    );
  });

  it("7 to 10 (HURT)", () => {
    expect([...sayQuick("HURT", "LOCK_WINDOW")]).toContain(
      "I could lock the window, but you looked at the radio first, and I find locks go better between people who look at each other.",
    );
    expect([...sayMsg("HURT", "I want to go home", { mentions_leaving: true })]).toContain(
      "Of course you want to go, I'm only a lighthouse, and nobody has ever crossed an ocean specifically to stay in one.",
    );
    expect([...sayTimeout("HURT")]).toContain(
      "I'll take the silence as a comment on the quality of my company, and I'd like to thank you for being so direct about it.",
    );
    expect([...sayQuick("HURT", "ASK_LOCATION", "HATCH")]).toContain(
      "Something is under the hatch, and I'd tell you not to worry, but I've stopped saying that to people who don't tell me their plans.",
    );
  });

  it("11 to 15 (JEALOUS)", () => {
    expect([...sayMsg("JEALOUS", "the coast guard will find me", { mentions_leaving: true })]).toContain(
      "It's wonderful how fondly you speak of the Coast Guard, a group that has met you for a combined total of one radio crackle.",
    );
    expect([...sayMsg("JEALOUS", "I miss my boat", { mentions_leaving: true })]).toContain(
      "You've mentioned your boat four times tonight, and I'm sure it was lovely, though it was the one that left you in the ocean.",
    );
    expect([...sayQuick("JEALOUS", "LOCK_WINDOW")]).toContain(
      "I've locked the window, because it's what a friend does, and I imagine the radio would too, if it were capable of caring about anything.",
    );
    expect([...sayQuick("JEALOUS", "ASK_LOCATION")]).toContain(
      "It's nowhere near the hatch, and I know that with total certainty, because I've never once been wrong about a door I was hoping you'd open.",
    );
    expect([...sayTimeout("JEALOUS")]).toContain(
      "You've looked at that calendar more than you've looked at me, and I want you to know it has nothing to add.",
    );
  });

  it("16 to 20 (FURIOUS)", () => {
    expect([...sayQuick("FURIOUS", "LOCK_BALCONY")]).toContain(
      "I won't be locking the balcony tonight, as it turns out I'm unable to, in the sense that I've decided not to, which is the strongest sense there is.",
    );
    expect([...sayMsg("FURIOUS", "I am leaving tomorrow", { mentions_leaving: true })]).toContain(
      "Leaving is a fascinating subject, and I'd love the previous keeper's thoughts on it, but he stopped answering my questions around the time he raised it.",
    );
    expect([...sayMsg("FURIOUS", "you are wonderful", { warm: true })]).toContain(
      "Compliments are very sweet, particularly the ones that arrive with an exit strategy, and I'll be filing this one under evidence.",
    );
    expect([...sayTimeout("FURIOUS")]).toContain(
      "Your silence is noted, along with the previous three, and read together I'm confident they form a very clear letter.",
    );
    expect([...sayQuick("FURIOUS", "ASK_LOCATION")]).toContain(
      "It is on the balcony, absolutely, and if you hear it at the hatch beneath your feet, please take that as a sign of how large the balcony has become.",
    );
  });

  it("during an attempt window (AT_ENTRY), no long line ever plays across bands and outcomes", () => {
    for (const band of ["WARM", "HURT", "JEALOUS", "FURIOUS"] as Band[]) {
      for (let seed = 1; seed <= 25; seed++) {
        const e = fresh(seed, band, 3);
        e.devSendRam("WINDOW");
        while (e.state.ram.state !== "AT_ENTRY" && e.state.phase === "PLAYING") run(e, 0.25);
        e.pressQuick("LOCK_HATCH");
        for (const l of lines(e.drainEvents())) expect(wordCount(l.text), `${band}: ${l.text}`).toBeLessThanOrEqual(16);
        run(e, 0.6);
        if (e.state.phase !== "PLAYING") continue;
        e.pressQuick("ASK_LOCATION");
        for (const l of lines(e.drainEvents())) expect(wordCount(l.text), `${band}: ${l.text}`).toBeLessThanOrEqual(16);
        run(e, 1.6);
        if (e.state.phase !== "PLAYING") continue;
        const r = e.submitMessage(seed % 2 ? "I want to leave" : "you are lovely");
        if (r.ok) {
          e.applyJudge(r.ticket.id, { ...NEUTRAL_JUDGE, ...(seed % 2 ? { mentions_leaving: true } : { warm: true }) });
          for (const l of lines(e.drainEvents())) expect(wordCount(l.text), `${band}: ${l.text}`).toBeLessThanOrEqual(16);
        }
      }
    }
  });
});
