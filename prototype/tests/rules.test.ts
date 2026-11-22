// Anti-spam rules: location spam, flattery, pending question blocks commands, no back-to-back lines, new numbers.
import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { cannedLine } from "../src/chud/lines";
import { GameEngine } from "../src/sim/engine";
import { NEUTRAL_JUDGE, type GameEvent, type JudgeResult, type Outcome } from "../src/sim/types";

const T = CONFIG.TICK;
const judge = (over: Partial<JudgeResult> = {}): JudgeResult => ({ ...NEUTRAL_JUDGE, ...over });

function playing(): GameEngine {
  const e = new GameEngine({ seed: 7, skipNamePrompt: true });
  e.beginNight();
  e.drainEvents();
  return e;
}
function wait(e: GameEngine, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / T); i < n && e.state.phase === "PLAYING"; i++) e.tick(T);
  e.drainEvents();
}
function says(evs: GameEvent[]): Outcome[] {
  return evs.flatMap((ev) => (ev.type === "CHUD_SAY" ? [ev.outcome] : []));
}
function ask(e: GameEngine): Outcome[] {
  e.pressQuick("ASK_LOCATION");
  return says(e.drainEvents());
}
function type(e: GameEngine, text: string, result: JudgeResult): Outcome[] {
  const r = e.submitMessage(text);
  if (!r.ok) throw new Error(r.reason);
  e.applyJudge(r.ticket.id, result);
  return says(e.drainEvents());
}
function pend(e: GameEngine): void {
  e.state.chud.pendingQuestion = { id: 99, origin: "SCHEDULED", type: "SEED", factKey: "cargo", text: "What were you carrying?", askedAt: e.state.clock.elapsed };
}

describe("tuning numbers", () => {
  it("fewer messages", () => {
    expect(CONFIG.SILENCE_LIMIT).toBe(45);
    expect(CONFIG.scheduledQuestionMinSpacing).toBe(45);
    expect(CONFIG.WARM_BONUS_COOLDOWN).toBe(45);
  });
  it("every night's question mix fits the window at the spacing", () => {
    const [lo, hi] = CONFIG.scheduledQuestionWindow;
    for (const n of CONFIG.nights) expect((n.questionMix.length - 1) * CONFIG.scheduledQuestionMinSpacing).toBeLessThanOrEqual(hi - lo);
  });
  it("planned question times are in the window, ordered and spaced, on every night and seed", () => {
    const [lo, hi] = CONFIG.scheduledQuestionWindow;
    for (let night = 1; night <= 5; night++) {
      for (let seed = 1; seed <= 40; seed++) {
        const e = new GameEngine({ seed, skipNamePrompt: true, startNight: night });
        const plan = e.state.chud.questionPlan;
        plan.forEach((it, i) => {
          expect(it.dueAt).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(it.dueAt).toBeLessThanOrEqual(hi + 1e-9);
          if (i > 0) expect(it.dueAt - plan[i - 1].dueAt).toBeGreaterThanOrEqual(CONFIG.scheduledQuestionMinSpacing - 1e-9);
        });
      }
    }
  });
  it("silence ticks after 45 s", () => {
    const e = playing();
    wait(e, 44);
    expect(e.state.timers.silenceTicks).toBe(0);
    wait(e, 2);
    expect(e.state.timers.silenceTicks).toBe(1);
  });
});

describe("location spam", () => {
  it("1st free, 2nd +5, 3rd +10 and refused, refusal lasts 20 s, other commands still work", () => {
    const e = playing();
    e.state.chud.questionPlan = []; // no scheduled question interferes
    expect(ask(e)[0].kind).toBe("location_claim");
    expect(e.state.chud.suspicion).toBe(0);
    wait(e, 1);
    expect(ask(e)[0].kind).toBe("location_claim");
    expect(e.state.chud.suspicion).toBe(5);
    wait(e, 1);
    expect(ask(e)[0].kind).toBe("location_refused");
    expect(e.state.chud.suspicion).toBe(15);
    wait(e, 5);
    expect(ask(e)[0].kind).toBe("location_refused");
    expect(e.state.chud.suspicion).toBe(25);
    wait(e, 0.6);
    e.pressQuick("LOCK_HATCH");
    expect(says(e.drainEvents())[0].kind).toBe("locked");
    wait(e, CONFIG.LOCATION_REFUSE_TIME);
    expect(ask(e)[0].kind).toBe("location_claim");
    expect(e.state.chud.suspicion).toBe(35); // still within the 60 s window: the 5th request is +10
  });

  it("the window rolls: requests spaced over 60 s are free again", () => {
    const e = playing();
    ask(e);
    wait(e, CONFIG.LOCATION_SPAM_WINDOW + 1);
    const s = e.state.chud.suspicion;
    expect(ask(e)[0].kind).toBe("location_claim");
    expect(e.state.chud.suspicion).toBe(s);
  });

  it("typed location questions count too, and a blocked request does not count", () => {
    const e = playing();
    type(e, "where is it", judge());
    wait(e, 2);
    type(e, "where is he now", judge());
    expect(e.state.chud.suspicion).toBe(5);
    wait(e, 2);
    pend(e);
    e.pressQuick("ASK_LOCATION");
    expect(says(e.drainEvents())[0].kind).toBe("answer_first");
    expect(e.state.timers.locationRequests.length).toBe(2);
    expect(e.state.chud.suspicion).toBe(5);
  });
});

describe("flattery", () => {
  it("3 warm messages in 60 s: +10, no warm bonus, flattery_reply", () => {
    const e = playing();
    e.state.chud.suspicion = 30;
    expect(type(e, "you are lovely", judge({ warm: true }))[0].kind).toBe("warm_reply");
    expect(e.state.chud.suspicion).toBe(25);
    wait(e, 2);
    type(e, "you are wonderful", judge({ warm: true }));
    expect(e.state.chud.suspicion).toBe(25); // bonus on cooldown
    wait(e, 2);
    expect(type(e, "i adore this place", judge({ warm: true }))[0].kind).toBe("flattery_reply");
    expect(e.state.chud.suspicion).toBe(35);
  });

  it("is clamped per message and the window rolls", () => {
    const e = playing();
    e.state.chud.suspicion = 30;
    type(e, "a", judge({ warm: true }));
    wait(e, 2);
    type(e, "b", judge({ warm: true }));
    wait(e, 2);
    const before = e.state.chud.suspicion;
    type(e, "c", judge({ warm: true, mentions_leaving: true, manipulation: true })); // 25+25+10 clamps to +25
    expect(e.state.chud.suspicion).toBe(Math.min(100, before + CONFIG.MESSAGE_CLAMP[1]));
    wait(e, CONFIG.FLATTERY_WINDOW + 1);
    e.state.chud.suspicion = 30;
    expect(type(e, "d", judge({ warm: true }))[0].kind).toBe("warm_reply");
  });
});

describe("a pending question blocks ChudGPT commands", () => {
  it("quick buttons and typed commands get answer_first, no suspicion, no power change", () => {
    const e = playing();
    pend(e);
    for (const b of ["LOCK_HATCH", "LOCK_WINDOW", "ASK_LOCATION", "POWER_OFF"] as const) {
      e.pressQuick(b);
      expect(says(e.drainEvents()).map((o) => o.kind)).toEqual(["answer_first", "question"]); // the pending question is asked again
      wait(e, 0.6);
      pend(e);
    }
    expect(e.state.power.pending).toBeNull();
    wait(e, 1.6);
    pend(e);
    expect(type(e, "lock the hatch", judge())[0].kind).toBe("answer_first");
    expect(e.state.power.pending).toBeNull();
    expect(e.state.chud.suspicion).toBe(0);
    expect(e.state.chud.pendingQuestion).not.toBeNull();
  });

  it("an answer plus a command: the answer resolves, then the command runs", () => {
    const e = playing();
    pend(e);
    const out = type(e, "silk, and lock the hatch", judge({ answered_question: true }));
    expect(e.state.chud.pendingQuestion).toBeNull();
    expect(e.state.power.pending?.target ?? e.state.power.slot).toBe("LOCK_HATCH");
    expect(out.length).toBeGreaterThan(0);
  });

  it("works again after the timeout", () => {
    const e = playing();
    pend(e);
    wait(e, CONFIG.QUESTION_TIMEOUT + 0.1);
    expect(e.state.chud.pendingQuestion).toBeNull();
    e.pressQuick("LOCK_HATCH");
    expect(says(e.drainEvents())[0].kind).toBe("locked");
  });

  it("an answer typed before the timeout waits for a slow judge instead of timing out", () => {
    const e = playing();
    pend(e);
    wait(e, CONFIG.QUESTION_TIMEOUT - 0.5);
    const r = e.submitMessage("crates of apples");
    if (!r.ok) throw new Error(r.reason);
    wait(e, 2); // the judge is still out at the 10 s mark
    expect(e.state.chud.pendingQuestion).not.toBeNull();
    const before = e.state.chud.suspicion;
    e.applyJudge(r.ticket.id, judge({ answered_question: true }));
    expect(e.state.chud.pendingQuestion).toBeNull();
    expect(e.state.chud.suspicion).toBeLessThanOrEqual(before); // the answer counted, no timeout penalty
  });

  it("a judge that never answers still lets the question time out after the grace", () => {
    const e = playing();
    pend(e);
    wait(e, CONFIG.QUESTION_TIMEOUT - 0.5);
    expect(e.submitMessage("crates of apples").ok).toBe(true);
    wait(e, 0.5 + CONFIG.QUESTION_JUDGE_GRACE + 0.1);
    expect(e.state.chud.pendingQuestion).toBeNull();
  });

  it("a message sent after the deadline cannot answer a question still waiting on the judge", () => {
    const e = playing();
    pend(e);
    wait(e, CONFIG.QUESTION_TIMEOUT - 0.5);
    expect(e.submitMessage("something about the weather").ok).toBe(true); // first message, still with the judge
    wait(e, 2);
    const late = e.submitMessage("crates of apples");
    if (!late.ok) throw new Error(late.reason);
    expect(late.ticket.judgeInput.pendingQuestion).toBeNull();
    e.applyJudge(late.ticket.id, judge({ answered_question: true }));
    expect(e.state.chud.pendingQuestion).not.toBeNull(); // only the in-time message could have answered it
  });

  it("during the judge grace a typed command is blocked like a map button", () => {
    const e = playing();
    pend(e);
    wait(e, CONFIG.QUESTION_TIMEOUT - 0.5);
    expect(e.submitMessage("something about the weather").ok).toBe(true); // keeps the question waiting on the judge
    wait(e, 2);
    const typed = e.submitMessage("lock the hatch");
    if (!typed.ok) throw new Error(typed.reason);
    expect(typed.ticket.commandRanImmediately).toBe(false);
    e.applyJudge(typed.ticket.id, judge());
    expect(e.state.power.pending).toBeNull();
    expect(e.state.power.slot).toBe("NONE");
  });

  it("the generator switch is a player action and is not blocked", () => {
    const e = playing();
    pend(e);
    e.toggleGenerator();
    expect(e.state.power.generatorOn).toBe(false);
  });
});

describe("no back-to-back repeated line", () => {
  it("cannedLine never returns the avoided line while another exists, for every kind and band", () => {
    const outcomes: Outcome[] = [
      { kind: "silence" },
      { kind: "small_talk" },
      { kind: "location_refused" },
      { kind: "flattery_reply" },
      { kind: "answer_first" },
      { kind: "warm_reply" },
      { kind: "locked", entry: "HATCH" },
    ];
    for (const o of outcomes) {
      for (const band of ["WARM", "HURT", "JEALOUS", "FURIOUS"] as const) {
        let avoid: string | undefined;
        let seed = 1;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const pool = new Set(Array.from({ length: 200 }, () => cannedLine(o, { band, name: "Sam", rand })));
        for (let i = 0; i < 60; i++) {
          const line = cannedLine(o, { band, name: "Sam", rand, avoid });
          if (pool.size > 1) expect(line, `${o.kind} ${band}`).not.toBe(avoid);
          avoid = line;
        }
      }
    }
  });

  it("the engine never says the same silence line twice in a row", () => {
    const e = playing();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      e.state.timers.lastRealMessageAt = e.state.clock.elapsed - CONFIG.SILENCE_LIMIT;
      e.tick(T);
      for (const ev of e.drainEvents()) if (ev.type === "CHUD_SAY" && ev.outcome.kind === "silence") seen.push(ev.text);
      if (e.state.phase !== "PLAYING") break;
    }
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});
