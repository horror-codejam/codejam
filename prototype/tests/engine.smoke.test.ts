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
    const steps = Math.round(310 / T);
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

  it("each night starts dark, power NONE (GAME_LOGIC 5.1), also after a retry", () => {
    const e = playing();
    expect(e.state.power.slot).toBe("NONE");
    run(e, 320);
    expect(e.state.phase).toBe("BREACH");
    e.retryNight();
    expect(e.state.power.slot).toBe("NONE");
  });

  it("retryNight also restarts a night in progress from the checkpoint", () => {
    const e = playing();
    run(e, 20);
    expect(e.state.phase).toBe("PLAYING");
    e.retryNight();
    expect(e.state.phase).toBe("NIGHT_CARD");
    expect(e.state.run.night).toBe(1);
    expect(e.state.clock.elapsed).toBe(0);
  });

  it("an undefended visit breaches with cause UNLOCKED (the scare comes by 6 AM at the latest)", () => {
    const e = playing();
    run(e, 320);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss?.cause).toBe("UNLOCKED");
    expect(e.state.loss?.night).toBe(1);
  });

  it("holding the right entry defends", () => {
    const e = playing({ config: cfgWith(1, { atEntryTime: [5, 5] }) });
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
    const config = cfgWith(1, { firstVisitDelay: 10, approachTime: 6, atEntryTime: [5, 5] }, { SILENCE_LIMIT: 10000 });
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
    expect(late.state.ram.state).toBe("INSIDE");
    expect(late.state.ram.inside?.cause).toBe("UNLOCKED");
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

    // Night 5 starts JEALOUS (70): a scheduled MEMORY question passed + warm = -20, clamped to -15.
    const j = playing({ startNight: 5, facts: { name: "Sam", home_port: "Halifax" } });
    j.state.chud.pendingQuestion = { id: 99, origin: "SCHEDULED", type: "MEMORY", factKey: "home_port", text: "Where was home?", askedAt: j.state.clock.elapsed };
    say(j, "Halifax, of course", judge({ answered_question: true, warm: true }));
    expect(j.state.chud.suspicion).toBe(70 + CONFIG.MESSAGE_CLAMP[0]);
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
    const config = cfgWith(1, { firstVisitDelay: 280 }, { SILENCE_LIMIT: 10000 });
    const e = playing({ config });
    runUntil(e, 299);
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

// Edge-controls flow (docs/CONTROLS_PROPOSAL.md): click to go, hold to brace, edge to return.
describe("edge-controls brace flow", () => {
  // Visit 1: approach 10..16, attempt window 16..21. No silence ticks, so timing is fixed.
  const config = cfgWith(1, { firstVisitDelay: 10, approachTime: 6, atEntryTime: [5, 5] }, { SILENCE_LIMIT: 10000 });
  const other = (e: Entry): Entry => (e === "HATCH" ? "WINDOW" : "HATCH");

  // Walks to `entry` at `leaveAt` (TRAVELING until leaveAt + TRAVEL_TIME). Returns the engine and Ram's target.
  function goAt(leaveAt: number, pick: (target: Entry) => Entry = (t) => t) {
    const e = playing({ config });
    runUntil(e, leaveAt);
    if (leaveAt >= 10) expect(e.state.ram.state).toBe("APPROACHING");
    const target = e.state.ram.target ?? "HATCH"; // before the visit, no target yet
    const entry = pick(target);
    e.turn(entry);
    e.goToEntry(entry);
    expect(e.state.player.position.kind).toBe("TRAVELING");
    return { e, target, entry };
  }

  it("one click travels, then the player stands idle at the entry (not holding)", () => {
    const e = playing({ config });
    e.goToEntry("WINDOW"); // must look at it first
    expect(e.state.player.position.kind).toBe("DESK");
    e.turn("WINDOW");
    e.goToEntry("WINDOW");
    expect(e.state.player.position).toMatchObject({ kind: "TRAVELING", entry: "WINDOW", stay: true });
    run(e, CONFIG.TRAVEL_TIME - T);
    expect(e.state.player.position.kind).toBe("TRAVELING");
    run(e, T);
    expect(e.state.player.position).toMatchObject({ kind: "STANDING", entry: "WINDOW" });
    expect(e.state.player.view).toBe("WINDOW");
    expect(e.isDefended("WINDOW")).toBe(false);
    // no typing, quick buttons or turning while away from the desk
    expect(e.submitMessage("hello")).toEqual({ ok: false, reason: "NOT_AT_DESK" });
    e.turn("HATCH");
    expect(e.state.player.view).toBe("WINDOW");
    e.pressQuick("LOCK_WINDOW");
    expect(e.state.power.pending).toBeNull();
  });

  it("bracing defends; standing idle at the right entry breaches", () => {
    const braced = goAt(12).e;
    runUntil(braced, 17);
    expect(braced.state.player.position.kind).toBe("STANDING");
    braced.startBrace();
    expect(braced.state.player.position).toMatchObject({ kind: "HOLDING", stay: true });
    run(braced, 5, () => {}, () => braced.state.ram.state === "RETREATING");
    expect(braced.state.phase).toBe("PLAYING");
    expect(braced.state.ram.state).toBe("RETREATING");

    // standing idle at his entry when he gets in: he is right next to you, the scare fires at once
    const idle = goAt(12).e;
    run(idle, 12);
    expect(idle.state.phase).toBe("BREACH");
    expect(idle.state.loss).toMatchObject({ cause: "UNLOCKED", reason: "ARRIVED", insideFor: 0 });
  });

  it("releasing ends the brace but stays at the entry, and the next brace waits for BRACE_REST", () => {
    const { e, entry } = goAt(2, () => "WINDOW");
    run(e, CONFIG.TRAVEL_TIME);
    e.startBrace();
    run(e, 1);
    e.drainEvents();
    e.endBrace();
    expect(e.state.player.position).toMatchObject({ kind: "STANDING", entry });
    expect(e.drainEvents()).toContainEqual({ type: "HOLD_ENDED", entry, reason: "manual" });
    e.startBrace();
    expect(e.state.player.position.kind).toBe("STANDING");
    run(e, CONFIG.BRACE_REST - T);
    e.startBrace();
    expect(e.state.player.position.kind).toBe("STANDING");
    run(e, T);
    e.startBrace();
    expect(e.state.player.position.kind).toBe("HOLDING");
  });

  it("HOLD_MAX ends a brace (armsGaveOut while he is there), the player stays and can re-brace after the rest", () => {
    // pressed during the dash: the brace starts on arrival at 13.5, the arms give out at 19.5 (window 16..21)
    const gaveOut = goAt(12).e;
    gaveOut.startBrace();
    run(gaveOut, CONFIG.TRAVEL_TIME);
    expect(gaveOut.state.player.position).toMatchObject({ kind: "HOLDING", since: 12 + CONFIG.TRAVEL_TIME });
    const ended: GameEvent[] = [];
    run(gaveOut, CONFIG.HOLD_MAX + T, (ev) => ev.type === "HOLD_ENDED" && ended.push(ev));
    expect(ended).toEqual([{ type: "HOLD_ENDED", entry: gaveOut.state.ram.target, reason: "arms" }]);
    expect(gaveOut.state.player.position.kind).toBe("STANDING");
    expect(gaveOut.state.log.visit.armsGaveOut).toBe(true);
    run(gaveOut, 5);
    expect(gaveOut.state.phase).toBe("BREACH");
    expect(gaveOut.state.loss).toMatchObject({ cause: "ARMS_GAVE_OUT", reason: "ARRIVED" });

    const rebrace = goAt(12).e;
    rebrace.startBrace();
    runUntil(rebrace, 12 + CONFIG.TRAVEL_TIME + CONFIG.HOLD_MAX + CONFIG.BRACE_REST);
    rebrace.startBrace();
    expect(rebrace.state.player.position.kind).toBe("HOLDING");
    run(rebrace, 3);
    expect(rebrace.state.phase).toBe("PLAYING");
    expect(rebrace.state.ram.state).toBe("RETREATING");
  });

  it("a press during the dash that is released before arrival arrives idle", () => {
    const { e } = goAt(2);
    e.startBrace();
    e.endBrace();
    run(e, CONFIG.TRAVEL_TIME);
    expect(e.state.player.position.kind).toBe("STANDING");
  });

  it("returnToDesk goes RETURNING then DESK, also mid-brace, and HOLD_COOLDOWN gates the next trip", () => {
    const { e, entry } = goAt(2, () => "WINDOW");
    run(e, CONFIG.TRAVEL_TIME);
    e.startBrace();
    run(e, 1);
    const leftAt = e.state.clock.elapsed;
    e.returnToDesk();
    expect(e.state.player.position).toMatchObject({ kind: "RETURNING", from: entry });
    run(e, CONFIG.TRAVEL_TIME);
    expect(e.state.player.position.kind).toBe("DESK");
    expect(e.state.player.view).toBe("DESK");
    e.turn("WINDOW");
    e.goToEntry("WINDOW");
    expect(e.state.player.position.kind).toBe("DESK");
    runUntil(e, leftAt + CONFIG.HOLD_COOLDOWN);
    e.goToEntry("WINDOW");
    expect(e.state.player.position.kind).toBe("TRAVELING");
  });

  it("standing or bracing at another entry loses with WRONG_HOLD (the scare comes when you go back)", () => {
    for (const brace of [false, true]) {
      const { e, target, entry } = goAt(12, other);
      runUntil(e, 17);
      if (brace) e.startBrace();
      run(e, 5);
      expect(e.state.ram.state).toBe("INSIDE");
      // force the NONE trigger so only the always-on triggers remain
      e.state.ram.inside!.trigger = "NONE";
      e.state.ram.inside!.timerAt = null;
      e.endBrace();
      e.returnToDesk();
      run(e, CONFIG.TRAVEL_TIME + 0.1);
      expect(e.state.phase).toBe("PLAYING");
      e.turn(target);
      run(e, CONFIG.TRAVEL_TIME);
      e.goToEntry(target); // still in HOLD_COOLDOWN: ignored
      runUntil(e, e.state.player.holdCooldownUntil);
      e.goToEntry(target);
      run(e, CONFIG.TRAVEL_TIME + 0.1);
      expect(e.state.phase).toBe("BREACH");
      expect(e.state.loss).toMatchObject({ cause: "WRONG_HOLD", entry: target, heldEntry: entry, reason: "ARRIVED" });
    }
  });
});

describe("dev methods", () => {
  it("devSkipToLastSecond runs the clock to 1 s before 6 AM and the next tick wins", () => {
    const e = playing({ seed: 3 });
    e.devSendRam("WINDOW"); // a visit in progress is cancelled by the skip, so it cannot breach
    e.devSkipToLastSecond();
    expect(e.state.ram.state).toBe("AWAY");
    const len = CONFIG.HOUR_LENGTH * CONFIG.NIGHT_HOURS;
    expect(e.state.phase).toBe("PLAYING");
    expect(e.state.clock.elapsed).toBeGreaterThanOrEqual(len - 1 - 1e-6);
    expect(e.state.clock.elapsed).toBeLessThan(len);
    run(e, 2);
    expect(e.state.phase).toBe("NIGHT_WON");
  });

  it("devWinNight wins now, and GAME_WON on the last night; no-op outside PLAYING", () => {
    const e = playing();
    e.drainEvents();
    e.devWinNight();
    expect(e.state.phase).toBe("NIGHT_WON");
    expect(e.drainEvents()).toEqual([{ type: "NIGHT_WON", night: 1 }]);
    e.devWinNight();
    expect(e.state.phase).toBe("NIGHT_WON");
    const last = playing({ startNight: CONFIG.nights.length });
    last.devWinNight();
    expect(last.state.phase).toBe("GAME_WON");
  });

  it("devSendRam starts an approach to the chosen entry, then Ram arrives and a lock holds", () => {
    const e = playing({ seed: 5 });
    expect(e.devSendRam("BALCONY")).toBe(true);
    expect(e.state.ram.state).toBe("APPROACHING");
    expect(e.state.ram.target).toBe("BALCONY");
    expect(e.devSendRam("HATCH")).toBe(false); // already on a visit
    const evs: GameEvent[] = [];
    run(e, 60, (ev) => evs.push(ev), () => e.state.ram.state === "AT_ENTRY");
    expect(e.state.ram.state).toBe("AT_ENTRY");
    expect(e.state.ram.target).toBe("BALCONY");
  });

  it("devRamAway cancels a visit without a breach and Ram returns later", () => {
    const e = playing({ seed: 5 });
    e.devSendRam("WINDOW");
    run(e, 5);
    e.devRamAway();
    expect(e.state.ram.state).toBe("AWAY");
    expect(e.state.ram.target).toBeNull();
    expect(e.state.ram.stateEndsAt).toBeGreaterThan(e.state.clock.elapsed);
    run(e, 10);
    expect(e.state.phase).toBe("PLAYING");
  });

  it("devSetSuspicion sets the value and the band, and clamps", () => {
    const e = playing();
    e.devSetSuspicion(0);
    expect([e.state.chud.suspicion, e.state.chud.band]).toEqual([0, "WARM"]);
    e.devSetSuspicion(50);
    expect([e.state.chud.suspicion, e.state.chud.band]).toEqual([50, "HURT"]);
    e.devSetSuspicion(80);
    expect([e.state.chud.suspicion, e.state.chud.band]).toEqual([80, "JEALOUS"]);
    e.devSetSuspicion(-20);
    expect(e.state.chud.suspicion).toBe(0);
  });

  it("dev methods unused leave the normal run unchanged (same seed, same state)", () => {
    const a = playing({ seed: 11 });
    const b = playing({ seed: 11 });
    b.devSetSuspicion(b.state.chud.suspicion);
    run(a, 120);
    run(b, 120);
    expect(b.state.ram).toEqual(a.state.ram);
    expect(b.state.chud.suspicion).toBe(a.state.chud.suspicion);
  });
});
