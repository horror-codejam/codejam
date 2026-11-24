import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { GameEngine } from "../src/sim/engine";

const T = CONFIG.TICK;
const REPEL = CONFIG.nights[0].repelTime;

function visit(night = 1, attemptTime = 20) {
  const nights = CONFIG.nights.map((params, i) => i === night - 1 ? {
    ...params, approachTime: 2, atEntryTime: [attemptTime, attemptTime] as [number, number], fakeOutChance: 0,
    quickReturnChance: 0, lullChance: 0,
  } : params);
  const e = new GameEngine({ startNight: night, skipNamePrompt: true, config: { ...CONFIG, nights } });
  e.beginNight();
  e.devSendRam("HATCH");
  return e;
}

function brace(e: GameEngine) {
  e.turn("HATCH");
  e.goToEntry("HATCH");
  e.startBrace();
  e.tick(CONFIG.TRAVEL_TIME);
}

const repelEvent = (how: "brace" | "lock" | "both") => ({ type: "RAM_REPELLED", entry: "HATCH", visitId: 1, how });

describe("repelling a visit", () => {
  it.each([[1, 3], [2, 3.5], [3, 4], [4, 4.5], [5, 5]])("night %i repels after %s seconds of bracing", (night, seconds) => {
    const e = visit(night);
    e.tick(2);
    brace(e);
    e.tick(seconds - T);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    expect(e.ramVisual("HATCH")).toBe("tell_faint");
    e.tick(T);
    expect(e.state.ram.state).toBe("RETREATING");
    expect(e.ramVisual("HATCH")).toBe("none");
    expect(e.state.player.position.kind).toBe("HOLDING");
    const events = e.drainEvents();
    e.tick(3); // the "it's gone" line waits until the warning has finished speaking (GAME_LOGIC 8.10)
    events.push(...e.drainEvents());
    expect(events.filter((event) => event.type === "RAM_REPELLED")).toEqual([repelEvent("brace")]);
    const lines = events.filter((event) => event.type === "CHUD_SAY" && event.outcome.kind === "entry_repelled");
    expect(lines).toHaveLength(night === 1 ? 1 : 0);
    if (night === 1) expect(lines[0]).toMatchObject({ text: "It's gone, and I'd like the record to show that I helped.", band: "WARM" });
  });

  it("counts a lock only from relay landing and schedules the next visit from the early retreat", () => {
    const e = visit();
    e.tick(2);
    const oldAttemptEnd = e.state.ram.stateEndsAt;
    e.pressQuick("LOCK_HATCH");
    e.tick(CONFIG.RELAY_DELAY + REPEL - T);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    e.tick(T);
    expect(e.drainEvents()).toContainEqual(repelEvent("lock"));
    const retreatEnd = e.now + CONFIG.RETREAT_TIME;
    expect(e.state.ram.stateEndsAt).toBeCloseTo(retreatEnd);
    expect(retreatEnd).toBeLessThan(oldAttemptEnd);
    e.tick(CONFIG.RETREAT_TIME);
    expect(e.state.ram.state).toBe("AWAY");
    const gap = e.state.ram.lastGap!;
    expect(gap.kind).toBe("normal");
    expect(e.drainEvents()).toContainEqual({
      type: "RAM_AWAY", nextVisitAt: e.state.ram.stateEndsAt,
    });
    expect(e.state.ram.stateEndsAt).toBeCloseTo(retreatEnd + gap.length);
    e.tick(gap.length + T);
    expect(e.drainEvents()).toContainEqual({ type: "RAM_APPROACH", visitId: 2 });
  });

  it("starts at arrival when the lock was already engaged during approach", () => {
    const e = visit();
    e.pressQuick("LOCK_HATCH");
    e.tick(2 + REPEL - T);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    e.tick(T);
    expect(e.drainEvents()).toContainEqual(repelEvent("lock"));
  });

  it.each(["release", "arms", "unlock", "cut"])("resets defense after %s", (reason) => {
    const e = visit();
    if (reason === "release" || reason === "arms") {
      if (reason === "arms") e.tick(2);
      brace(e);
      if (reason === "release") {
        e.tick(2);
        e.endBrace();
      } else {
        // Replace this visit with one that arrives near the end of the existing brace.
        e.devRamAway();
        e.tick(2);
        e.devSendRam("HATCH");
        e.tick(CONFIG.HOLD_MAX - 2);
        expect(e.state.player.position.kind).toBe("STANDING");
      }
      e.tick(CONFIG.BRACE_REST);
      e.startBrace();
    } else {
      e.tick(2);
      e.pressQuick("LOCK_HATCH");
      e.tick(CONFIG.RELAY_DELAY + 2);
      if (reason === "unlock") e.pressQuick("POWER_OFF");
      else e.toggleGenerator();
      if (reason === "cut") {
        expect(e.isDefended("HATCH")).toBe(false);
        e.toggleGenerator();
        e.tick(CONFIG.REBOOT_TIME);
      } else {
        e.tick(CONFIG.RELAY_DELAY);
      }
      e.devSetPower("LOCK_HATCH");
    }
    e.tick(REPEL - T);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    e.tick(T);
    expect(e.state.ram.state).toBe("RETREATING");
  });

  it.each([true, false])("a brace and lock handoff preserves elapsed time only with overlap (%s)", (overlap) => {
    const e = visit();
    const braceEndsAt = 2 + CONFIG.TRAVEL_TIME + CONFIG.HOLD_MAX;
    e.tick(2);
    brace(e);
    e.devRamAway();
    e.tick(braceEndsAt - e.now - 3);
    e.devSendRam("HATCH"); // Reach the entry one second before the arms give out.
    e.tick(2 + (overlap ? 1 - T : 1));
    e.devSetPower("LOCK_HATCH");
    e.tick(REPEL - 1 + (overlap ? T : 0));
    expect(e.state.ram.state).toBe(overlap ? "RETREATING" : "AT_ENTRY");
    if (!overlap) {
      e.tick(1);
      expect(e.state.ram.state).toBe("RETREATING");
    }
    expect(e.drainEvents()).toContainEqual({ ...repelEvent("lock"), visitId: 2 });
  });

  it.each([true, false])("a shorter attempt still checks whether the entry is defended at the end (%s)", (defended) => {
    const e = visit(1, 2);
    if (defended) e.pressQuick("LOCK_HATCH");
    e.tick(4);
    const events = e.drainEvents();
    expect(events.some((event) => event.type === "RAM_REPELLED")).toBe(false);
    expect(e.state.ram.state).toBe(defended ? "RETREATING" : "INSIDE");
  });
});
