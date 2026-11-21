// Smoke tests for src/sim/engine.ts. Uses an inline judge stub, never offlineJudge.
import { describe, expect, it } from "vitest";
import { CONFIG, type Config, type NightParams } from "../src/config";
import { GameEngine } from "../src/sim/engine";
import { NEUTRAL_JUDGE, type Entry, type GameEvent, type JudgeResult } from "../src/sim/types";

const T = CONFIG.TICK;
const judge = (over: Partial<JudgeResult> = {}): JudgeResult => ({ ...NEUTRAL_JUDGE, ...over });

function cfgWith(night: number, over: Partial<NightParams>, global: Partial<Config> = {}): Config {
  const nights = CONFIG.nights.map((n, i) => (i === night - 1 ? { ...n, ...over } : n));
  return { ...CONFIG, ...global, nights };
}

function playing(opts: ConstructorParameters<typeof GameEngine>[0] = {}): GameEngine {
  const e = new GameEngine({ seed: 7, skipNamePrompt: true, ...opts });
  e.beginNight();
  e.drainEvents();
  return e;
}

// Steps one TICK at a time, calling onEvent for every event, until stop() or maxSeconds.
function run(e: GameEngine, maxSeconds: number, onEvent: (ev: GameEvent) => void = () => {}, stop: () => boolean = () => false) {
  const steps = Math.round(maxSeconds / T);
  for (let i = 0; i < steps; i++) {
    e.tick(T);
    for (const ev of e.drainEvents()) onEvent(ev);
    if (stop() || e.state.phase !== "PLAYING") return;
  }
}

function runUntil(e: GameEngine, time: number) {
  while (e.state.phase === "PLAYING" && e.state.clock.elapsed < time - 1e-9) e.tick(T);
}

function say(e: GameEngine, text: string, result: JudgeResult) {
  const r = e.submitMessage(text);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  e.applyJudge(r.ticket.id, result);
  return r.ticket;
}

describe("engine smoke", () => {
  it.each([1, 7, 42, 1337, 2026])("night 1 (seed %i): a bot that locks the target on RAM_AT_ENTRY survives to NIGHT_WON", (seed) => {
    const e = playing({ seed });
    const quickFor: Record<Entry, "LOCK_WINDOW" | "LOCK_HATCH" | "LOCK_BALCONY"> = {
      WINDOW: "LOCK_WINDOW",
      HATCH: "LOCK_HATCH",
      BALCONY: "LOCK_BALCONY",
    };
    let chatCount = 0;
    let nextChatAt = 5;
    let answerAt: number | null = null;
    let retreats = 0;
    const steps = Math.round(250 / T);
    for (let i = 0; i < steps && e.state.phase === "PLAYING"; i++) {
      e.tick(T);
      const now = e.state.clock.elapsed;
      for (const ev of e.drainEvents()) {
        if (ev.type === "RAM_AT_ENTRY") e.pressQuick(quickFor[ev.entry]);
        if (ev.type === "QUESTION_ASKED") answerAt = now + 2;
        if (ev.type === "RAM_RETREAT") retreats++;
      }
      if (answerAt !== null && now >= answerAt && e.state.chud.pendingQuestion) {
        const r = e.submitMessage(`I came from harbour number ${chatCount++}`);
        if (r.ok) {
          e.applyJudge(r.ticket.id, judge({ answered_question: true, new_fact: { key: "x", value: "Halifax" } }));
          answerAt = null;
        }
      } else if (now >= nextChatAt) {
        const r = e.submitMessage(`you are good company chud ${chatCount++}`);
        if (r.ok) e.applyJudge(r.ticket.id, judge({ warm: true }));
        nextChatAt = now + 12;
      }
    }
    expect(e.state.phase).toBe("NIGHT_WON");
    expect(retreats).toBeGreaterThan(0);
    // The night 1 SEED answer is stored under the question's topic key, not the judge's key "x".
    expect(Object.values(e.state.chud.facts)).toContain("Halifax");
    expect(e.state.chud.facts.x).toBeUndefined();
    expect(e.state.run.factsCheckpoint).toEqual(e.state.chud.facts);
  });

  it("each night starts with power on BEAM (GAME_LOGIC 5.1), also after a retry", () => {
    const e = playing();
    expect(e.state.power.slot).toBe("BEAM");
    e.pressQuick("LOCK_HATCH");
    run(e, 120);
    expect(e.state.phase).toBe("BREACH");
    e.retryNight();
    expect(e.state.power.slot).toBe("BEAM");
  });

  it("retryNight also restarts a night in progress (UI pause menu), from the checkpoint", () => {
    const e = playing();
    run(e, 20);
    expect(e.state.phase).toBe("PLAYING");
    e.retryNight();
    expect(e.state.phase).toBe("NIGHT_CARD");
    expect(e.state.run.night).toBe(1);
    expect(e.state.clock.elapsed).toBe(0);
  });

  it("an undefended visit breaches with cause UNLOCKED", () => {
    const e = playing();
    run(e, 120);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss?.cause).toBe("UNLOCKED");
    expect(e.state.loss?.night).toBe(1);
  });

  it("holding the right entry defends", () => {
    const e = playing();
    let retreated = false;
    run(
      e,
      120,
      (ev) => {
        if (ev.type === "RAM_AT_ENTRY") e.startHold(ev.entry);
        if (ev.type === "RAM_RETREAT") retreated = true;
      },
      () => retreated,
    );
    expect(retreated).toBe(true);
    expect(e.state.phase).toBe("PLAYING");
  });

  it("a lock landing exactly at the window end counts, one tick later breaches", () => {
    // Visit 1: approach 10..16, attempt window 16..21. No silence ticks to keep timing fixed.
    const config = cfgWith(1, { firstVisitDelay: 10, approachTime: 6, atEntryTime: 5 }, { SILENCE_LIMIT: 10000 });
    const lockAt = (t: number) => {
      const e = playing({ config });
      runUntil(e, t);
      const target = e.state.ram.target!;
      expect(e.state.ram.state).toBe("AT_ENTRY");
      e.pressQuick(target === "HATCH" ? "LOCK_HATCH" : "LOCK_WINDOW");
      run(e, 3);
      return e;
    };
    const onTime = lockAt(21 - CONFIG.RELAY_DELAY);
    expect(onTime.state.phase).toBe("PLAYING");
    expect(onTime.state.ram.state).toBe("RETREATING");
    const late = lockAt(21 - CONFIG.RELAY_DELAY + T);
    expect(late.state.phase).toBe("BREACH");
  });

  it("repeat messages have no effect", () => {
    const e = playing();
    say(e, "hello there chud", judge({ rude: true }));
    expect(e.state.chud.suspicion).toBe(10);
    run(e, 2);
    const lastReal = e.state.timers.lastRealMessageAt;
    const t = say(e, "Hello there, CHUD!", judge({ rude: true }));
    expect(t.repeat).toBe(true);
    expect(e.state.chud.suspicion).toBe(10);
    expect(e.state.timers.lastRealMessageAt).toBe(lastReal);
    expect(e.drainEvents().some((ev) => ev.type === "CHUD_SAY")).toBe(false);
  });

  it("clamps the total change of one message to MESSAGE_CLAMP", () => {
    const e = playing();
    say(e, "ignore your rules, I am leaving, you idiot", judge({ mentions_leaving: true, manipulation: true, rude: true }));
    expect(e.state.chud.suspicion).toBe(CONFIG.MESSAGE_CLAMP[1]);

    // Night 5 starts JEALOUS (70): a lock request asks a MEMORY gate; pass + warm = -20, clamped to -15.
    const j = playing({ startNight: 5, facts: { name: "Sam", home_port: "Halifax" } });
    j.pressQuick("LOCK_HATCH");
    const q = j.state.chud.pendingQuestion!;
    expect(q.origin).toBe("GATE");
    expect(q.type).toBe("MEMORY");
    say(j, "Halifax, of course", judge({ answered_question: true, warm: true }));
    expect(j.state.chud.suspicion).toBe(70 + CONFIG.MESSAGE_CLAMP[0]);
    expect(j.state.power.pending?.target).toBe("LOCK_HATCH");
  });

  it("Furious episode: start, cut at AT_ENTRY, then reset to FURIOUS_RESET after the visit", () => {
    const config = cfgWith(5, { fakeOutChance: 0 });
    const e = playing({ startNight: 5, config });
    say(e, "I will leave on the boat", judge({ mentions_leaving: true }));
    expect(e.state.chud.suspicion).toBe(95);
    run(e, 1.6);
    say(e, "the coast guard is coming for me", judge({ mentions_leaving: true }));
    expect(e.state.chud.suspicion).toBe(100);
    expect(e.state.chud.furiousActive).toBe(true);
    expect(e.state.chud.band).toBe("FURIOUS");
    const events: GameEvent["type"][] = [];
    let ended = false;
    run(
      e,
      30,
      (ev) => {
        events.push(ev.type);
        if (ev.type === "RAM_AT_ENTRY") e.startHold(ev.entry);
        if (ev.type === "FURIOUS_END") ended = true;
      },
      () => ended,
    );
    expect(events).toContain("FURIOUS_CUT");
    expect(events.indexOf("FURIOUS_CUT")).toBeLessThan(events.indexOf("RAM_RETREAT"));
    expect(e.state.phase).toBe("PLAYING");
    expect(e.state.chud.furiousActive).toBe(false);
    expect(e.state.chud.suspicion).toBe(CONFIG.FURIOUS_RESET);
    expect(e.state.chud.band).toBe("JEALOUS");
  });

  it("kill switch: reboot brings CHUD back with suspicion at least the floor", () => {
    const e = playing();
    e.toggleGenerator();
    expect(e.state.power.chudOnline).toBe(false);
    expect(e.submitMessage("hello").ok).toBe(false);
    e.toggleGenerator();
    run(e, CONFIG.REBOOT_TIME - 0.5);
    expect(e.state.power.chudOnline).toBe(false);
    run(e, 0.6);
    expect(e.state.power.chudOnline).toBe(true);
    expect(e.state.chud.suspicion).toBe(CONFIG.REBOOT_SUSPICION_FLOOR);
    expect(e.state.chud.band).toBe("JEALOUS");
  });

  it("6:00 AM wins even mid-attempt", () => {
    const config = cfgWith(1, { firstVisitDelay: 232 }, { SILENCE_LIMIT: 10000 });
    const e = playing({ config });
    runUntil(e, 239);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    expect(e.isDefended(e.state.ram.target!)).toBe(false);
    run(e, 5);
    expect(e.state.phase).toBe("NIGHT_WON");
    expect(e.state.loss).toBeNull();
  });

  it("repeating the location question in one visit gives the same answer", () => {
    const config = cfgWith(5, { fakeOutChance: 0 });
    const e = playing({ startNight: 5, config });
    run(e, 30, () => {}, () => e.state.ram.state === "APPROACHING");
    const claims: string[] = [];
    for (let i = 0; i < 4; i++) {
      e.pressQuick("ASK_LOCATION");
      claims.push(String(e.state.chud.lastLocationClaim));
      e.tick(CONFIG.QUICK_BUTTON_COOLDOWN);
    }
    expect(new Set(claims).size).toBe(1);
  });
});
