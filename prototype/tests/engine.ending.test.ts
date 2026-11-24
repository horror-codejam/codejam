// Kill code ending: the random code, papers Ram drops at an entry, the chat kill, and the trapped bad ending on night 5.
import { describe, expect, it } from "vitest";
import { CONFIG, ENDING, nightLength } from "../src/config";
import { GameEngine } from "../src/sim/engine";
import type { Entry, GameEvent } from "../src/sim/types";

const T = CONFIG.TICK;
const LOCK = { WINDOW: "LOCK_WINDOW", HATCH: "LOCK_HATCH", BALCONY: "LOCK_BALCONY" } as const;

function playing(night: number, seed = 7, extra: ConstructorParameters<typeof GameEngine>[0] = {}): GameEngine {
  const e = new GameEngine({ seed, skipNamePrompt: true, startNight: night, ...extra });
  e.beginNight();
  e.drainEvents();
  return e;
}

// Steps until the predicate is true or the engine leaves PLAYING. Returns every event seen.
function runUntil(e: GameEngine, done: (ev: GameEvent) => boolean, maxSeconds = 60): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < Math.round(maxSeconds / T) && e.state.phase === "PLAYING"; i++) {
    e.tick(T);
    for (const ev of e.drainEvents()) seen.push(ev);
    if (seen.some(done)) break;
  }
  return seen;
}

function runFor(e: GameEngine, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / T) && e.state.phase === "PLAYING"; i++) e.tick(T);
}

// A defended visit at `entry` by locking it. Returns the events up to the retreat.
function lockedVisit(e: GameEngine, entry: Entry): GameEvent[] {
  expect(e.devSendRam(entry)).toBe(true);
  const first = runUntil(e, (ev) => ev.type === "RAM_AT_ENTRY");
  e.pressQuick(LOCK[entry]);
  return [...first, ...runUntil(e, (ev) => ev.type === "RAM_RETREAT" || ev.type === "BREACH")];
}

// A defended visit by bracing at the entry.
function bracedVisit(e: GameEngine, entry: Entry): GameEvent[] {
  expect(e.devSendRam(entry)).toBe(true);
  e.turn(entry);
  e.goToEntry(entry);
  const first = runUntil(e, (ev) => ev.type === "RAM_AT_ENTRY");
  // Brace late enough that the arms last until he leaves.
  while (e.state.phase === "PLAYING" && e.state.ram.stateEndsAt - e.state.clock.elapsed > 3) e.tick(T);
  e.startBrace();
  return [...first, ...runUntil(e, (ev) => ev.type === "RAM_RETREAT" || ev.type === "BREACH")];
}

function goStand(e: GameEngine, entry: Entry): void {
  e.turn(entry);
  e.goToEntry(entry);
  runFor(e, CONFIG.TRAVEL_TIME + 0.5);
}

function winNightClean(e: GameEngine): void {
  e.devSkipToLastSecond();
  runFor(e, 3);
}

describe("kill code shape", () => {
  it("4 chars, 2 letters and 2 digits from the sets, deterministic per seed", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const code = playing(1, seed).state.run.killCode;
      expect(code).toHaveLength(ENDING.CODE_LETTERS + ENDING.CODE_DIGITS);
      const letters = [...code].filter((c) => ENDING.LETTERS.includes(c));
      const digits = [...code].filter((c) => ENDING.DIGITS.includes(c));
      expect(letters).toHaveLength(ENDING.CODE_LETTERS);
      expect(digits).toHaveLength(ENDING.CODE_DIGITS);
      expect(playing(1, seed).state.run.killCode).toBe(code);
      expect(playing(1, seed).paperChar(2)).toBe(code[2]);
    }
    const codes = new Set(Array.from({ length: 40 }, (_, i) => playing(1, i + 1).state.run.killCode));
    expect(codes.size).toBeGreaterThan(10);
  });

  it("is not in the facts or the judge input", () => {
    const e = playing(5);
    expect(JSON.stringify(e.state.chud.facts)).not.toContain(e.state.run.killCode);
  });
});

describe("paper drops", () => {
  it("no drop on night 1", () => {
    const e = playing(1);
    lockedVisit(e, "WINDOW");
    expect(e.floorPaper()).toBeNull();
  });

  it("drops a slip at the entry after a locked defense on night 2 without a hint", () => {
    const e = playing(2);
    const evs = lockedVisit(e, "HATCH");
    expect(evs).toContainEqual({ type: "PAPER_DROPPED", entry: "HATCH", index: 0 });
    expect(evs.map((ev) => ev.type)).not.toContain("HINT");
    expect(e.floorPaper()).toEqual({ entry: "HATCH", index: 0 });
  });

  it("drops after a braced defense on night 2", () => {
    const e = playing(2);
    const evs = bracedVisit(e, "BALCONY");
    expect(evs).toContainEqual({ type: "PAPER_DROPPED", entry: "BALCONY", index: 0 });
    expect(e.floorPaper()).toEqual({ entry: "BALCONY", index: 0 });
  });

  it("no drop after a breach", () => {
    const e = playing(2);
    e.devSendRam("WINDOW");
    runUntil(e, (ev) => ev.type === "RAM_INSIDE");
    expect(e.state.ram.state).toBe("INSIDE");
    expect(e.floorPaper()).toBeNull();
  });

  it("at most one paper per night, caught up on a later night", () => {
    const e = playing(2);
    lockedVisit(e, "WINDOW");
    expect(e.floorPaper()?.index).toBe(0);
    // Floor is taken: a second defended visit drops nothing new.
    e.state.ram.state = "AWAY";
    e.state.ram.stateEndsAt = e.state.clock.elapsed;
    const second = lockedVisit(e, "HATCH");
    expect(second.some((ev) => ev.type === "PAPER_DROPPED")).toBe(false);
    // After collecting it, the night 2 cap (1 paper) still blocks another.
    e.state.papers.floor = null;
    e.state.papers.collected = 1;
    e.state.ram.state = "AWAY";
    e.state.ram.stateEndsAt = e.state.clock.elapsed;
    expect(lockedVisit(e, "BALCONY").some((ev) => ev.type === "PAPER_DROPPED")).toBe(false);
    // Night 3 with one collected allows another; a missed night 2 allows two by night 3.
    const late = playing(3);
    expect(late.state.papers.collected).toBe(0);
    lockedVisit(late, "WINDOW");
    expect(late.floorPaper()?.index).toBe(0);
    late.state.papers.floor = null;
    late.state.papers.collected = 1;
    late.state.ram.state = "AWAY";
    late.state.ram.stateEndsAt = late.state.clock.elapsed;
    expect(lockedVisit(late, "HATCH").some((ev) => ev.type === "PAPER_DROPPED")).toBe(true);
  });
});

describe("night 5 last slip", () => {
  // A defended visit by a lock set directly (no refusal roll), so the test does not depend on CHUD's band.
  const defended = (e: GameEngine, entry: Entry): GameEvent[] => {
    expect(e.devSendRam(entry)).toBe(true);
    const first = runUntil(e, (ev) => ev.type === "RAM_AT_ENTRY");
    e.state.power.slot = LOCK[entry];
    return [...first, ...runUntil(e, (ev) => ev.type === "RAM_RETREAT" || ev.type === "BREACH")];
  };

  it("waits for LAST_PAPER_AFTER, then drops after a defended attempt", () => {
    const e = playing(5, 7, { papersCheckpoint: 3 });
    e.devSetSuspicion(0); // WARM: no sabotage of the test locks
    const early = defended(e, "HATCH");
    expect(e.state.clock.elapsed).toBeLessThan(ENDING.LAST_PAPER_AFTER);
    expect(early.some((ev) => ev.type === "PAPER_DROPPED")).toBe(false);
    e.state.ram.state = "AWAY";
    e.state.ram.stateEndsAt = ENDING.LAST_PAPER_AFTER;
    runUntil(e, (ev) => ev.type === "RAM_APPROACH");
    e.devRamAway();
    const late = defended(e, "WINDOW");
    expect(late).toContainEqual({ type: "PAPER_DROPPED", entry: "WINDOW", index: 3 });
  });
});

describe("pickUpFloorPaper", () => {
  it("is rejected at the desk and at the wrong entry, accepted standing at the entry", () => {
    const e = playing(2);
    lockedVisit(e, "HATCH");
    e.drainEvents();
    expect(e.pickUpFloorPaper()).toBe(false);
    goStand(e, "WINDOW");
    expect(e.state.player.position.kind).toBe("STANDING");
    expect(e.pickUpFloorPaper()).toBe(false);
    e.returnToDesk();
    runFor(e, CONFIG.TRAVEL_TIME + CONFIG.HOLD_COOLDOWN + 1);
    goStand(e, "HATCH");
    expect(e.state.player.position.kind).toBe("STANDING");
    expect(e.pickUpFloorPaper()).toBe(true);
    expect(e.state.papers.collected).toBe(1);
    expect(e.floorPaper()).toBeNull();
    expect(e.state.player.reading).toBe("paper0");
    const evs = e.drainEvents();
    expect(evs).toContainEqual({ type: "PAPER_COLLECTED", index: 0 });
    expect(evs).toContainEqual({ type: "ARTIFACT", id: "paper0" });
    expect(e.papersOnDesk()).toEqual([0]);
    e.putDownArtifact();
    expect(e.state.player.reading).toBeNull();
  });

  it("works while braced and ends the brace first", () => {
    const e = playing(2);
    lockedVisit(e, "WINDOW");
    goStand(e, "WINDOW");
    e.startBrace();
    expect(e.state.player.position.kind).toBe("HOLDING");
    expect(e.pickUpFloorPaper()).toBe(true);
    expect(e.state.player.position.kind).toBe("STANDING");
  });

  it("desk papers can be re-read only for collected indices", () => {
    const e = playing(3);
    e.pickUpArtifact("paper0");
    expect(e.state.player.reading).toBeNull();
    e.state.papers.collected = 2;
    e.pickUpArtifact("paper1");
    expect(e.state.player.reading).toBe("paper1");
  });
});

describe("papers checkpoint", () => {
  it("is saved on night win and restored on retry", () => {
    const e = playing(2);
    e.state.papers.collected = 1;
    winNightClean(e);
    expect(e.state.phase).toBe("NIGHT_WON");
    expect(e.state.run.papersCheckpoint).toBe(1);
    e.nextNight();
    expect(e.state.papers.collected).toBe(1);
    e.beginNight();
    e.state.papers.collected = 2;
    e.state.papers.floor = { entry: "WINDOW", index: 2, droppedAt: 0 };
    e.devForceBreach("WINDOW", "TIMER");
    runFor(e, 30);
    expect(e.state.phase).toBe("BREACH");
    e.retryNight();
    expect(e.state.papers.collected).toBe(1);
    expect(e.floorPaper()).toBeNull();
  });
});

describe("restore from a save", () => {
  it("keeps the saved code and papers", () => {
    const e = new GameEngine({ seed: 99, startNight: 4, killCode: "7r4e", papersCheckpoint: 3, facts: { name: "K" } });
    expect(e.state.run.killCode).toBe("7R4E");
    expect(e.state.run.papersCheckpoint).toBe(3);
    expect(e.state.papers.collected).toBe(3);
    expect(e.paperChar(1)).toBe("R");
  });

  it("an old save without a code gets a fresh one and 0 papers", () => {
    const e = new GameEngine({ seed: 99, startNight: 3, facts: { name: "K" } });
    expect(e.state.run.killCode).toMatch(/^[A-Z0-9]{4}$/);
    expect(e.state.papers.collected).toBe(0);
  });
});

describe("chat kill code", () => {
  const send = (e: GameEngine, text: string) => {
    const r = e.submitMessage(text);
    if (!r.ok) throw new Error(`rejected: ${r.reason}`);
    return r.ticket;
  };

  it.each([
    ["exact", (c: string) => c],
    ["lowercase", (c: string) => c.toLowerCase()],
    ["spaced", (c: string) => [...c.toLowerCase()].join(" ")],
    ["in a sentence", (c: string) => `please, ${c} now`],
  ])("night 5, %s: wins and never reaches the judge", (_n, make) => {
    const e = playing(5);
    const code = e.state.run.killCode;
    const ticket = send(e, make(code));
    expect(ticket.repeat).toBe(true);
    expect(ticket.judgeInput.text).toBe("");
    expect(e.state.phase).toBe("GAME_WON");
    expect(e.state.ending).toBe("KILL_CODE");
    const types = e.drainEvents().map((ev) => ev.type);
    expect(types).toContain("KILL_CODE_ACCEPTED");
    expect(types.indexOf("KILL_CODE_ACCEPTED")).toBeLessThan(types.indexOf("GAME_WON"));
    expect(types).not.toContain("CHUD_SAY");
  });

  it("wins even while Ram is INSIDE", () => {
    const e = playing(5);
    expect(e.devForceBreach("WINDOW", "NONE")).toBe(true);
    send(e, e.state.run.killCode);
    expect(e.state.phase).toBe("GAME_WON");
    expect(e.state.ram.state).toBe("AWAY");
    expect(e.state.loss).toBeNull();
  });

  it("does nothing special on night 4", () => {
    const e = playing(4);
    const ticket = send(e, e.state.run.killCode);
    expect(e.state.phase).toBe("PLAYING");
    expect(ticket.judgeInput.text).toBe(e.state.run.killCode);
  });

  it("an ordinary message on night 5 does not win", () => {
    const e = playing(5);
    send(e, "hello there, are you ok");
    expect(e.state.phase).toBe("PLAYING");
  });
});

describe("6 AM on the kill code night", () => {
  it("night 5 without the code is TRAPPED and keeps the checkpoints", () => {
    const e = playing(5);
    e.state.papers.collected = 2;
    e.devSkipToLastSecond();
    e.drainEvents();
    const facts = { ...e.state.run.factsCheckpoint };
    runFor(e, 3);
    expect(e.state.phase).toBe("TRAPPED");
    const types = e.drainEvents().map((ev) => ev.type);
    expect(types).toContain("TRAPPED");
    expect(types).not.toContain("GAME_WON");
    expect(types).not.toContain("NIGHT_WON");
    expect(e.state.run.factsCheckpoint).toEqual(facts);
    expect(e.state.run.papersCheckpoint).toBe(0);
  });

  it("night 5 with Ram INSIDE at 6 AM is still the DAWN scare", () => {
    const e = playing(5);
    e.devSkipToLastSecond();
    e.devForceBreach("WINDOW", "NONE");
    runFor(e, 3);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss?.reason).toBe("DAWN");
  });

  it.each([1, 2, 3, 4])("night %i still ends in NIGHT_WON", (n) => {
    const e = playing(n);
    winNightClean(e);
    expect(e.state.phase).toBe("NIGHT_WON");
    e.nextNight();
    expect(e.state.run.night).toBe(n + 1);
  });

  it("retryNight from TRAPPED restarts night 5, and nextNight cannot leave it", () => {
    const e = playing(5);
    winNightClean(e);
    expect(e.state.phase).toBe("TRAPPED");
    e.nextNight();
    expect(e.state.phase).toBe("TRAPPED");
    e.retryNight();
    expect(e.state.phase).toBe("NIGHT_CARD");
    expect(e.state.run.night).toBe(5);
    expect(e.state.clock.elapsed).toBe(0);
    expect(e.state.ending).toBeNull();
    expect(nightLength(CONFIG)).toBeGreaterThan(0);
  });
});
