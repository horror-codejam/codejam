// The new loop (GAME_LOGIC 4, 7.4, 7.6, 7.7, 11, 12): pacing, decoys, independent entry lights and locks,
// the silent breach and its scare triggers, desk artifacts. Uses an inline judge stub, never offlineJudge.
import { describe, expect, it } from "vitest";
import { CONFIG, nightLength, type Config, type NightParams } from "../src/config";
import { GameEngine } from "../src/sim/engine";
import { ENTRIES, lockSlot, type Entry, type GameEvent, type InsideTrigger } from "../src/sim/types";

const T = CONFIG.TICK;

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

function run(e: GameEngine, seconds: number, onEvent: (ev: GameEvent) => void = () => {}, stop: () => boolean = () => false) {
  const steps = Math.round(seconds / T);
  for (let i = 0; i < steps; i++) {
    e.tick(T);
    for (const ev of e.drainEvents()) onEvent(ev);
    if (stop() || e.state.phase !== "PLAYING") return;
  }
}

function runUntil(e: GameEngine, time: number) {
  while (e.state.phase === "PLAYING" && e.state.clock.elapsed < time - 1e-9) e.tick(T);
}

// A perfect defender that never talks to CHUD: the moment Ram is at an entry, its lock is powered (test-only state edit).
function autoLock(e: GameEngine) {
  const r = e.state.ram;
  if (r.state === "AT_ENTRY" && r.target) {
    e.state.power.slot = lockSlot(r.target);
    e.state.power.pending = null;
  }
}

// Plays a whole night with the perfect defender. Returns every event.
function playNight(e: GameEngine, defend = true): GameEvent[] {
  const events: GameEvent[] = [];
  while (e.state.phase === "PLAYING") {
    e.tick(T);
    for (const ev of e.drainEvents()) events.push(ev);
    if (defend) autoLock(e);
  }
  return events;
}

const quiet = { SILENCE_LIMIT: 100000 }; // no silence ticks, so pulls do not move Ram

describe("night length and pacing (sections 4 and 7.6)", () => {
  it("a night is 5 minutes: HOUR_LENGTH 50 s, 300 s", () => {
    expect(CONFIG.HOUR_LENGTH).toBe(50);
    expect(nightLength(CONFIG)).toBe(300);
    expect(CONFIG.nights[0].firstVisitDelay).toBe(60);
  });

  it("the hour ramp scales each new gap by the hour it starts in (no lull, no quick return)", () => {
    const config = cfgWith(2, { awayGap: [10, 10], lullChance: 0, quickReturnChance: 0, atEntryTime: [8, 8], approachTime: 6 }, quiet);
    for (let hour = 0; hour < 6; hour++) {
      const e = playing({ startNight: 2, config });
      const sendAt = hour * CONFIG.HOUR_LENGTH + 1;
      e.devRamAway();
      e.state.ram.stateEndsAt = Infinity;
      runUntil(e, sendAt);
      e.devSendRam("HATCH");
      e.drainEvents();
      let away: GameEvent | undefined;
      run(e, 30, (ev) => {
        if (ev.type === "RAM_AWAY") away = ev;
      }, () => {
        autoLock(e);
        return !!away;
      });
      const retreatEnd = sendAt + 6 + 8 + CONFIG.RETREAT_TIME;
      const h = Math.min(5, Math.floor(retreatEnd / CONFIG.HOUR_LENGTH));
      expect(e.state.ram.lastGap?.kind).toBe("normal");
      expect(e.state.ram.lastGap?.length).toBeCloseTo(10 * CONFIG.HOUR_RAMP[h], 6);
    }
    // the ramp shrinks hour by hour
    for (let i = 1; i < CONFIG.HOUR_RAMP.length; i++) expect(CONFIG.HOUR_RAMP[i]).toBeLessThanOrEqual(CONFIG.HOUR_RAMP[i - 1]);
  });

  // Runs one defended visit at hour 0 and returns the gap that follows.
  function oneGap(config: Config, night: number, seed: number) {
    const e = playing({ startNight: night, config, seed });
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devSendRam("WINDOW");
    e.drainEvents();
    let done = false;
    run(e, 40, (ev) => ev.type === "RAM_AWAY" && (done = true), () => {
      autoLock(e);
      return done;
    });
    return e.state.ram.lastGap!;
  }

  it("a lull multiplies the gap by LULL_MULT, a quick return is QUICK_RETURN_GAP instead", () => {
    const base = { awayGap: [10, 10] as [number, number], approachTime: 4, atEntryTime: [5, 5] as [number, number] };
    const lull = oneGap(cfgWith(3, { ...base, lullChance: 1, quickReturnChance: 0 }, quiet), 3, 1);
    expect(lull.kind).toBe("lull");
    expect(lull.length).toBeCloseTo(10 * CONFIG.HOUR_RAMP[0] * CONFIG.LULL_MULT, 6);
    for (let seed = 1; seed <= 20; seed++) {
      const quick = oneGap(cfgWith(3, { ...base, lullChance: 1, quickReturnChance: 1 }, quiet), 3, seed);
      expect(quick.kind).toBe("quick"); // the quick-return roll comes first and skips the ramp and the lull
      expect(quick.length).toBeGreaterThanOrEqual(CONFIG.QUICK_RETURN_GAP[0]);
      expect(quick.length).toBeLessThanOrEqual(CONFIG.QUICK_RETURN_GAP[1]);
    }
  });

  it("lull and quick-return rolls hit at about their configured chance", () => {
    const config = cfgWith(5, { awayGap: [10, 10], approachTime: 4, atEntryTime: [5, 5] }, quiet);
    const kinds = { normal: 0, lull: 0, quick: 0, first: 0 };
    const N = 400;
    for (let seed = 1; seed <= N; seed++) kinds[oneGap(config, 5, seed).kind]++;
    const np = CONFIG.nights[4];
    expect(kinds.quick / N).toBeGreaterThan(np.quickReturnChance - 0.07);
    expect(kinds.quick / N).toBeLessThan(np.quickReturnChance + 0.07);
    const lullRate = kinds.lull / (N - kinds.quick);
    expect(lullRate).toBeGreaterThan(np.lullChance - 0.07);
    expect(lullRate).toBeLessThan(np.lullChance + 0.07);
    // night 1 has neither
    expect(CONFIG.nights[0].lullChance).toBe(0);
    expect(CONFIG.nights[0].quickReturnChance).toBe(0);
  });

  it("silence pulls and the minimum gap floor still apply", () => {
    const config = cfgWith(3, { awayGap: [10, 10], approachTime: 4, atEntryTime: [5, 5], lullChance: 0, quickReturnChance: 0 }, quiet);
    const e = playing({ startNight: 3, config });
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devSendRam("WINDOW");
    e.drainEvents();
    e.state.ram.pendingPull = 3; // three silence ticks owed while he was out
    let done = false;
    run(e, 40, (ev) => ev.type === "RAM_AWAY" && (done = true), () => {
      autoLock(e);
      return done;
    });
    const g = e.state.ram.lastGap!.length;
    expect(g).toBeCloseTo(Math.max(10 * CONFIG.HOUR_RAMP[0] * 0.75 ** 3, CONFIG.MIN_AWAY_GAP), 6);
    expect(g).toBeGreaterThanOrEqual(CONFIG.MIN_AWAY_GAP);
  });

  it("the attempt window is random per visit, inside the night's range", () => {
    for (let n = 1; n <= 5; n++) {
      const [lo, hi] = CONFIG.nights[n - 1].atEntryTime;
      const seen = new Set<string>();
      for (let seed = 1; seed <= 12; seed++) {
        const e = playing({ startNight: n, seed, config: { ...CONFIG, ...quiet } });
        playNight(e);
        expect(e.state.ram.attemptLength).toBeGreaterThanOrEqual(lo);
        expect(e.state.ram.attemptLength).toBeLessThanOrEqual(hi);
        seen.add(e.state.ram.attemptLength.toFixed(3));
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  // Low frequency so tension builds (section 4). A player who keeps talking (no silence pulls) and defends every visit.
  // Going silent adds visits through the silence pull (section 7.3); that is the intended cost of silence.
  it.each([
    [1, 3, 3],
    [2, 3, 4],
    [3, 5, 6],
    [4, 6, 7],
    [5, 7, 8],
  ])("night %i averages %i to %i visits over many seeds", (night, lo, hi) => {
    const SEEDS = 150;
    let total = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const e = playing({ startNight: night, seed, config: { ...CONFIG, ...quiet } });
      const evs = playNight(e);
      expect(e.state.phase === "NIGHT_WON" || e.state.phase === "TRAPPED").toBe(true);
      total += evs.filter((ev) => ev.type === "RAM_APPROACH").length;
    }
    const avg = total / SEEDS;
    expect(avg).toBeGreaterThanOrEqual(lo);
    expect(avg).toBeLessThanOrEqual(hi);
  });
});

describe("decoy noises (section 7.4): never correlated with Ram", () => {
  const decoys = (evs: GameEvent[]) => evs.filter((ev) => ev.type === "DECOY").map((ev) => JSON.stringify(ev));
  const decoyTimes = (e: GameEngine) => {
    const out: string[] = [];
    while (e.state.phase === "PLAYING") {
      e.tick(T);
      for (const ev of e.drainEvents()) if (ev.type === "DECOY") out.push(`${e.state.clock.elapsed.toFixed(2)} ${JSON.stringify(ev)}`);
      autoLock(e);
    }
    return out;
  };

  it("the decoy schedule is identical whatever Ram and the player do (same seed)", () => {
    const a = playing({ startNight: 3, seed: 99, config: { ...CONFIG, ...quiet } });
    // b: a very different Ram (other first visit, gaps, windows) and a busy player
    const b = playing({
      startNight: 3,
      seed: 99,
      config: cfgWith(3, { firstVisitDelay: 5, awayGap: [5, 6], atEntryTime: [5, 5], fakeOutChance: 1, quickReturnChance: 1 }, quiet),
    });
    b.turn("WINDOW");
    b.setLight(true);
    const da = decoyTimes(a);
    const db = decoyTimes(b);
    expect(da.length).toBeGreaterThan(10);
    expect(db).toEqual(da);
  });

  it("decoys keep coming while he is inside, on their own schedule", () => {
    const e = playing({ startNight: 2 });
    e.devForceBreach("HATCH", "NONE");
    const evs: GameEvent[] = [];
    run(e, 120, (ev) => evs.push(ev));
    expect(e.state.ram.state).toBe("INSIDE");
    expect(decoys(evs).length).toBeGreaterThan(3);
  });

  it("decoys land during an attempt about as often as the attempt takes up the night", () => {
    let atEntryTime = 0;
    let total = 0;
    let duringAttempt = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const e = playing({ startNight: 5, seed, config: { ...CONFIG, ...quiet } });
      while (e.state.phase === "PLAYING") {
        e.tick(T);
        if (e.state.ram.state === "AT_ENTRY") atEntryTime += T;
        for (const ev of e.drainEvents()) {
          if (ev.type !== "DECOY") continue;
          total++;
          if (e.state.ram.state === "AT_ENTRY") duringAttempt++;
        }
        autoLock(e);
      }
    }
    const share = atEntryTime / (60 * nightLength(CONFIG));
    expect(Math.abs(duringAttempt / total - share)).toBeLessThan(0.05);
  });

  it("stepDecoys reads nothing about Ram (source check)", async () => {
    // @ts-ignore node types are not installed in this project
    const fs = await import("node:fs");
    const src: string = fs.readFileSync(new URL("../src/sim/engine.ts", import.meta.url), "utf8");
    for (const fn of ["private stepDecoys(", "private rollDecoyInterval("]) {
      const start = src.indexOf(fn);
      expect(start).toBeGreaterThan(0);
      const body = src.slice(start, src.indexOf("\n  }", start));
      expect(body).not.toMatch(/ram|this\.rng\b/i);
      expect(body).toMatch(/decoyRng/);
    }
  });

  it("each decoy has a sound and a stereo pan in -1..1", () => {
    const e = playing({ startNight: 4, config: { ...CONFIG, ...quiet } });
    const evs = playNight(e);
    const ds = evs.filter((ev): ev is Extract<GameEvent, { type: "DECOY" }> => ev.type === "DECOY");
    expect(ds.length).toBeGreaterThan(15);
    for (const d of ds) {
      expect(["creak", "knock", "metal", "glass"]).toContain(d.sound);
      expect(d.pan).toBeGreaterThanOrEqual(-1);
      expect(d.pan).toBeLessThanOrEqual(1);
    }
  });
});

describe("Shift light and locks (section 6.1)", () => {
  it("holding or releasing Shift preserves an active lock and the entry stays defended", () => {
    const config = cfgWith(2, { atEntryTime: [8, 8], approachTime: 6, fakeOutChance: 0 }, quiet);
    const e = playing({ startNight: 2, config });
    e.devSetSuspicion(0);
    e.devSendRam("BALCONY");
    e.pressQuick("LOCK_BALCONY");
    runUntil(e, 8);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    e.turn("BALCONY");
    e.setLight(true);
    expect(e.state.player.lightEntry).toBe("BALCONY");
    expect(e.state.power.slot).toBe("LOCK_BALCONY");
    expect(e.isDefended("BALCONY")).toBe(true);
    e.setLight(false);
    expect(e.state.player.lightEntry).toBeNull();
    expect(e.state.power.slot).toBe("LOCK_BALCONY");
    runUntil(e, 14.1);
    expect(e.state.ram.state).toBe("RETREATING");
  });

  it("Shift at the desk does nothing; turning while held moves the light; the desk turns it off", () => {
    const e = playing();
    e.setLight(true);
    expect(e.state.player.lightEntry).toBeNull();
    e.turn("WINDOW");
    expect(e.state.player.lightEntry).toBe("WINDOW");
    e.turn("BALCONY");
    expect(e.state.player.lightEntry).toBe("BALCONY");
    e.turn("DESK");
    expect(e.state.player.lightEntry).toBeNull();
    expect(e.state.power.slot).toBe("NONE");
  });

  it("standing or bracing at an entry, Shift lights that entry", () => {
    const e = playing();
    e.turn("WINDOW");
    e.goToEntry("WINDOW");
    run(e, CONFIG.TRAVEL_TIME + 0.2);
    expect(e.state.player.position.kind).toBe("STANDING");
    e.setLight(true);
    expect(e.state.player.lightEntry).toBe("WINDOW");
    e.startBrace();
    expect(e.state.player.lightEntry).toBe("WINDOW");
  });

  it("generator off or rebooting means no light", () => {
    const e = playing();
    e.toggleGenerator();
    e.turn("HATCH");
    e.setLight(true);
    expect(e.state.player.lightEntry).toBeNull();
    e.setLight(false);
    e.turn("DESK");
    e.toggleGenerator(); // rebooting
    e.turn("HATCH");
    e.setLight(true);
    expect(e.state.player.lightEntry).toBeNull();
    run(e, CONFIG.REBOOT_TIME + 0.2);
    expect(e.state.player.lightEntry).toBe("HATCH"); // still held when supply returns
  });

  it("CHUD cannot light anything: typed light requests and invalid quick buttons do nothing", () => {
    const e = playing();
    const r = e.submitMessage("turn on the hatch light");
    expect(r.ok && r.ticket.parsed).toEqual({ command: "NONE", entry: null });
    run(e, 2);
    // @ts-expect-error LIGHT_* quick commands do not exist
    e.pressQuick("LIGHT_HATCH");
    run(e, 2);
    expect(e.state.player.lightEntry).toBeNull();
    expect(e.state.power.slot).toBe("NONE");
  });

  it("a pending lock lands on schedule while Shift lights the entry", () => {
    const e = playing();
    e.pressQuick("LOCK_WINDOW");
    e.turn("WINDOW");
    e.setLight(true);
    expect(e.state.power.pending).toEqual({ target: "LOCK_WINDOW", landsAt: CONFIG.RELAY_DELAY });
    expect(e.state.player.lightEntry).toBe("WINDOW");
    run(e, CONFIG.RELAY_DELAY - T);
    expect(e.state.power.slot).toBe("NONE");
    e.tick(T);
    expect(e.state.power.slot).toBe("LOCK_WINDOW");
    expect(e.state.power.pending).toBeNull();
    expect(e.state.player.lightEntry).toBe("WINDOW");
    expect(e.state.player.lightHeld).toBe(true);
  });

  it.each(ENTRIES)("the desk view of %s needs light even when the entry is locked", (entry) => {
    const e = playing({ config: cfgWith(1, { fakeOutChance: 0 }, quiet) });
    e.devSendRam(entry);
    e.turn(entry);
    expect(e.ramVisual(entry)).toBe("none"); // approaching in the dark
    e.devSetPower(lockSlot(entry));
    e.setLight(true);
    expect(e.ramVisual(entry)).toBe("approach_silhouette");
    expect(e.ramVisual("DESK")).toBe("none");
    for (const other of ENTRIES.filter((other) => other !== entry)) expect(e.ramVisual(other)).toBe("none");

    runUntil(e, e.state.ram.stateEndsAt + T);
    expect(e.state.ram.state).toBe("AT_ENTRY");
    expect(e.ramVisual(entry)).toBe("tell_clear");
    e.setLight(false);
    expect(e.ramVisual(entry)).toBe("none"); // locked and dark
    e.devSetPower("NONE");
    expect(e.ramVisual(entry)).toBe("none"); // unlocked and dark
    e.setLight(true);
    expect(e.ramVisual(entry)).toBe("tell_clear");
  });

  it("keeps the faint tell in dark standing and bracing views", () => {
    const e = playing();
    e.devSendRam("WINDOW");
    e.turn("WINDOW");
    runUntil(e, e.state.ram.stateEndsAt + T);
    e.goToEntry("WINDOW");
    run(e, CONFIG.TRAVEL_TIME);
    expect(e.state.player.position.kind).toBe("STANDING");
    expect(e.ramVisual("WINDOW")).toBe("tell_faint");
    e.startBrace();
    expect(e.state.player.position.kind).toBe("HOLDING");
    expect(e.ramVisual("WINDOW")).toBe("tell_faint");
  });

  it("fairness 12.1 and 12.2: every attempt window is at least 5 s and longer than TRAVEL_TIME + 1 s, tell clear with its light", () => {
    for (const n of CONFIG.nights) {
      expect(n.atEntryTime[0]).toBeGreaterThanOrEqual(5);
      expect(n.atEntryTime[0]).toBeGreaterThan(CONFIG.TRAVEL_TIME + 1);
    }
    for (let seed = 1; seed <= 40; seed++) {
      const e = playing({ startNight: 5, seed, config: { ...CONFIG, ...quiet } });
      let start = -1;
      while (e.state.phase === "PLAYING" && e.state.ram.state !== "INSIDE") {
        e.tick(T);
        e.drainEvents();
        const r = e.state.ram;
        if (r.state === "AT_ENTRY") {
          if (start < 0) start = e.state.clock.elapsed;
          // with that entry's light on, the tell is clear for the whole window
          const keep = e.state.player.lightEntry;
          e.state.player.lightEntry = r.target;
          expect(e.ramVisual(r.target!)).toBe("tell_clear");
          e.state.player.lightEntry = keep;
        }
      }
      if (e.state.ram.state === "INSIDE") expect(e.state.ram.inside!.since - start).toBeGreaterThanOrEqual(5 - T);
    }
  });
});

describe("silent breach: Ram INSIDE (section 7.7)", () => {
  function inside(trigger: InsideTrigger, entry: Entry = "HATCH", night = 2) {
    const e = playing({ startNight: night, config: { ...CONFIG, ...quiet } });
    run(e, 2);
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    expect(e.devForceBreach(entry, trigger)).toBe(true);
    return e;
  }

  it("an undefended attempt is silent: no scare yet, no sound event, no CHUD line, no new visits", () => {
    const config = cfgWith(2, { atEntryTime: [8, 8], approachTime: 6 }, { ...quiet, INSIDE_TRIGGER_WEIGHTS: { TIMER: 0, NONE: 1, MOVE: 0 } });
    const e = playing({ startNight: 2, config });
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devSendRam("WINDOW");
    const evs: GameEvent[] = [];
    run(e, 30, (ev) => evs.push(ev));
    expect(e.state.phase).toBe("PLAYING");
    expect(e.state.ram.state).toBe("INSIDE");
    expect(e.state.ram.inside).toMatchObject({ entry: "WINDOW", trigger: "NONE", cause: "UNLOCKED", timerAt: null });
    const after = evs.slice(evs.findIndex((ev) => ev.type === "RAM_INSIDE"));
    expect(after.some((ev) => ev.type === "CHUD_SAY" && /window|inside|room/i.test(ev.text))).toBe(false);
    // no new visits while he is inside
    const more: GameEvent[] = [];
    run(e, 200, (ev) => more.push(ev));
    expect(more.some((ev) => ev.type === "RAM_APPROACH")).toBe(false);
  });

  it("TIMER: the scare fires 4 to 12 s after he got in, wherever the player is", () => {
    for (let i = 0; i < 5; i++) {
      const e = inside("TIMER");
      const at = e.state.ram.inside!.timerAt!;
      const since = e.state.ram.inside!.since;
      expect(at - since).toBeGreaterThanOrEqual(CONFIG.INSIDE_TIMER[0]);
      expect(at - since).toBeLessThanOrEqual(CONFIG.INSIDE_TIMER[1]);
      runUntil(e, at - T);
      expect(e.state.phase).toBe("PLAYING");
      run(e, 2 * T);
      expect(e.state.phase).toBe("BREACH");
      expect(e.state.loss).toMatchObject({ reason: "TIMER", flash: false, entry: "HATCH", cause: "UNLOCKED" });
    }
  });

  it("NONE: nothing fires by itself; looking at his entry with its light on flashes and scares", () => {
    const e = inside("NONE");
    run(e, 30);
    e.turn("WINDOW");
    e.turn("DESK");
    expect(e.state.phase).toBe("PLAYING");
    e.setLight(true);
    run(e, 1);
    expect(e.state.phase).toBe("PLAYING"); // Shift held at the desk lights nothing
    e.turn("HATCH");
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss).toMatchObject({ reason: "LOOK", flash: true });
    expect(e.state.loss!.insideFor).toBeGreaterThan(30);
  });

  it("looking at his entry in the dark shows nothing; switching its light on while looking scares", () => {
    const e = inside("NONE");
    e.turn("HATCH");
    expect(e.ramVisual("HATCH")).toBe("none");
    expect(e.state.phase).toBe("PLAYING");
    e.setLight(true);
    expect(e.ramVisual("HATCH")).toBe("inside");
    run(e, T);
    expect(e.state.loss).toMatchObject({ reason: "LOOK", flash: true });
  });

  it("MOVE: the next turn of view (or trip) sets it off", () => {
    const e = inside("MOVE");
    run(e, 20);
    expect(e.state.phase).toBe("PLAYING");
    e.turn("WINDOW");
    expect(e.state.loss).toMatchObject({ reason: "MOVE", flash: false });
  });

  it("walking up to his entry always sets it off", () => {
    const e = inside("NONE");
    e.turn("HATCH");
    e.goToEntry("HATCH");
    run(e, CONFIG.TRAVEL_TIME + T);
    expect(e.state.loss).toMatchObject({ reason: "ARRIVED" });
  });

  it("6:00 AM with Ram inside is a loss, not a win", () => {
    const e = inside("NONE");
    runUntil(e, nightLength(CONFIG) + 1);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss).toMatchObject({ reason: "DAWN", flash: false });
  });

  it("every rolled trigger ends in the scare and the loss screen, decided by code", () => {
    for (const trigger of ["TIMER", "NONE", "MOVE"] as InsideTrigger[]) {
      const e = inside(trigger);
      const evs: GameEvent[] = [];
      run(e, 400, (ev) => evs.push(ev));
      if (e.state.phase === "PLAYING") e.turn("WINDOW");
      expect(e.state.phase).toBe("BREACH");
      expect(evs.concat(e.drainEvents()).filter((ev) => ev.type === "BREACH").length).toBeLessThanOrEqual(1);
      expect(e.state.loss?.cause).toBe("UNLOCKED");
    }
  });

  it("the extra trigger is rolled from the seeded RNG with the configured weights", () => {
    const counts: Record<InsideTrigger, number> = { TIMER: 0, NONE: 0, MOVE: 0 };
    const N = 600;
    for (let seed = 1; seed <= N; seed++) {
      const e = playing({ startNight: 2, seed });
      e.devRamAway();
      e.devForceBreach("WINDOW");
      counts[e.state.ram.inside!.trigger]++;
    }
    const w = CONFIG.INSIDE_TRIGGER_WEIGHTS;
    const sum = w.TIMER + w.NONE + w.MOVE;
    for (const k of ["TIMER", "NONE", "MOVE"] as InsideTrigger[]) expect(Math.abs(counts[k] / N - w[k] / sum)).toBeLessThan(0.06);
    // same seed, same roll
    const a = playing({ seed: 5 });
    const b = playing({ seed: 5 });
    a.devForceBreach("HATCH");
    b.devForceBreach("HATCH");
    expect(a.state.ram.inside).toEqual(b.state.ram.inside);
  });

  it("CHUD in WARM answers truthfully and creepily: someone in the room", () => {
    const e = inside("NONE", "WINDOW", 1);
    expect(e.state.chud.band).toBe("WARM");
    e.pressQuick("ASK_LOCATION");
    const said = e.drainEvents().find((ev) => ev.type === "CHUD_SAY");
    expect(e.state.chud.lastLocationClaim).toBe("INSIDE");
    expect(said?.type === "CHUD_SAY" && said.text).toMatch(/in the room|inside/i);
    expect(said?.type === "CHUD_SAY" && said.text).not.toMatch(/\bram\b/i);
  });

  it("other bands follow the lie rules while he is inside (a lie names an entry or no one)", () => {
    const claims = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const e = playing({ startNight: 5, seed });
      e.devRamAway();
      e.devForceBreach("HATCH", "NONE");
      e.pressQuick("ASK_LOCATION");
      claims.add(String(e.state.chud.lastLocationClaim));
    }
    expect(claims.has("INSIDE")).toBe(true);
    expect([...claims].some((c) => c !== "INSIDE")).toBe(true);
  });

  it("Ram never speaks: no CHUD line or event carries a Ram line in full nights", () => {
    for (let n = 1; n <= 5; n++) {
      const e = playing({ startNight: n, seed: 3 + n });
      const evs = playNight(e);
      for (const ev of evs) {
        expect(JSON.stringify(ev)).not.toMatch(/shout|RAM:/);
        if (ev.type === "CHUD_SAY") expect(ev.text).not.toMatch(/\bram\b/i);
        if (ev.type === "RAM_RETREAT") expect(Object.keys(ev).sort()).toEqual(["entry", "type", "visitId"]);
      }
    }
  });
});

describe("desk artifacts (section 6.6)", () => {
  it("only offers the scheduled paper on Nights 1 to 3", () => {
    const schedule = ["clipping", "calendar", "notebook", null, null];
    for (const [index, expected] of schedule.entries()) {
      const e = playing({ startNight: index + 1 });
      for (const id of ["clipping", "calendar", "notebook"]) {
        e.pickUpArtifact(id);
        expect(e.state.player.reading).toBe(id === expected ? id : null);
        e.putDownArtifact();
      }
    }
    const practice = new GameEngine({ seed: 7, practiceBeforeNight: true });
    practice.setName("Keeper");
    expect(practice.isPracticing).toBe(true);
    practice.pickUpArtifact("clipping");
    expect(practice.state.player.reading).toBeNull();
  });

  it("reading: the night keeps running, and you cannot type, turn, use buttons or the kill switch", () => {
    const e = playing();
    e.pickUpArtifact("clipping");
    expect(e.state.player.reading).toBe("clipping");
    const t0 = e.state.clock.elapsed;
    run(e, 5);
    expect(e.state.clock.elapsed).toBeCloseTo(t0 + 5, 6);
    expect(e.submitMessage("hello")).toEqual({ ok: false, reason: "READING" });
    e.turn("WINDOW");
    expect(e.state.player.view).toBe("DESK");
    e.pressQuick("LOCK_WINDOW");
    expect(e.state.power.pending).toBeNull();
    e.toggleGenerator();
    expect(e.state.power.generatorOn).toBe(true);
    e.putDownArtifact();
    expect(e.state.player.reading).toBeNull();
    e.turn("WINDOW");
    expect(e.state.player.view).toBe("WINDOW");
    e.pickUpArtifact("clipping"); // only from the desk view
    expect(e.state.player.reading).toBeNull();
  });

  it("he sneaks in while you read; putting the artifact down fires the scare at once", () => {
    const config = cfgWith(1, { atEntryTime: [9, 9] }, { ...quiet, INSIDE_TRIGGER_WEIGHTS: { TIMER: 0, NONE: 1, MOVE: 0 } });
    const e = playing({ config });
    e.pickUpArtifact("clipping");
    runUntil(e, CONFIG.nights[0].firstVisitDelay + CONFIG.nights[0].approachTime + 9 + 3);
    expect(e.state.ram.state).toBe("INSIDE");
    expect(e.state.phase).toBe("PLAYING");
    e.putDownArtifact();
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss).toMatchObject({ reason: "ARTIFACT", flash: false });
  });

  it("a TIMER scare while reading ends the read", () => {
    const e = playing();
    e.pickUpArtifact("clipping");
    e.devForceBreach("WINDOW", "TIMER");
    run(e, 13);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss?.reason).toBe("TIMER");
    expect(e.state.player.reading).toBeNull();
  });
});

describe("night 1 hints and CHUD's warnings", () => {
  it("night 1 emits no timed hints before the first visit", () => {
    const e = playing();
    const events: GameEvent["type"][] = [];
    run(e, CONFIG.nights[0].firstVisitDelay, (ev) => events.push(ev.type));
    expect(events).not.toContain("HINT");
  });

  it("CHUD never warns unprompted about an arrival or a departure", () => {
    for (const seed of [1, 2, 3]) {
      const e = playing({ seed, config: { ...CONFIG, ...quiet } });
      const evs = playNight(e);
      const kinds = evs.filter((ev) => ev.type === "CHUD_SAY").map((ev) => (ev.type === "CHUD_SAY" ? ev.outcome.kind : ""));
      expect(kinds).not.toContain("location_claim");
      for (const ev of evs) if (ev.type === "CHUD_SAY") for (const e2 of ENTRIES) expect(ev.text.toLowerCase()).not.toContain(`at the ${e2.toLowerCase()}`);
    }
  });
});

describe("lock hijack (section 8.3): CHUD can refuse a lock, never gates it", () => {
  const SUSP: Record<string, number> = { WARM: 0, HURT: 50, JEALOUS: 80, FURIOUS: 100 };
  const rate = (band: string, seeds = 500) => {
    let refused = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const e = playing({ startNight: 2, seed, config: { ...CONFIG, ...quiet } });
      e.devSetSuspicion(SUSP[band]);
      expect(e.state.chud.band).toBe(band);
      e.drainEvents();
      e.pressQuick("LOCK_HATCH");
      const evs = e.drainEvents();
      expect(e.state.chud.pendingQuestion).toBeNull(); // no gate question, ever
      if (evs.some((ev) => ev.type === "LOCK_REFUSED")) {
        refused++;
        expect(e.state.power.pending).toBeNull();
      } else {
        expect(e.state.power.pending?.target).toBe("LOCK_HATCH");
      }
    }
    return refused / seeds;
  };

  it("refusal chance by band over many seeds: WARM 0, HURT 25%, JEALOUS 55%, FURIOUS always", () => {
    expect(rate("WARM")).toBe(0);
    expect(Math.abs(rate("HURT") - CONFIG.LOCK_REFUSAL.HURT)).toBeLessThan(0.06);
    expect(Math.abs(rate("JEALOUS") - CONFIG.LOCK_REFUSAL.JEALOUS)).toBeLessThan(0.06);
    expect(rate("FURIOUS", 50)).toBe(1);
  });

  it("a refusal says a lock_refused line and emits LOCK_REFUSED (the malicious smile)", () => {
    const config = { ...CONFIG, ...quiet, LOCK_REFUSAL: { WARM: 0, HURT: 1, JEALOUS: 1, FURIOUS: 1 } };
    const e = playing({ startNight: 2, config });
    e.devSetSuspicion(50);
    e.drainEvents();
    e.pressQuick("LOCK_WINDOW");
    const evs = e.drainEvents();
    expect(evs.find((ev) => ev.type === "LOCK_REFUSED")).toEqual({ type: "LOCK_REFUSED", entry: "WINDOW" });
    const said = evs.find((ev): ev is Extract<GameEvent, { type: "CHUD_SAY" }> => ev.type === "CHUD_SAY");
    expect(said?.outcome).toEqual({ kind: "lock_refused", entry: "WINDOW" });
    expect(said?.text).not.toMatch(/\bram\b/i);
  });

  it("re-locking the entry already locked and POWER_OFF are always obeyed", () => {
    const config = { ...CONFIG, ...quiet, LOCK_REFUSAL: { WARM: 0, HURT: 1, JEALOUS: 1, FURIOUS: 1 } };
    const e = playing({ startNight: 2, config });
    e.devSetPower("LOCK_HATCH");
    e.devSetSuspicion(80);
    e.drainEvents();
    e.pressQuick("LOCK_HATCH");
    const evs = e.drainEvents();
    expect(evs.some((ev) => ev.type === "LOCK_REFUSED")).toBe(false);
    expect(e.state.power.slot).toBe("LOCK_HATCH");
    run(e, 2);
    e.pressQuick("POWER_OFF");
    run(e, CONFIG.RELAY_DELAY + T);
    expect(e.state.power.slot).toBe("NONE");
  });

  it("REFUSED: he gets in at the entry CHUD refused to lock", () => {
    const config = cfgWith(2, { atEntryTime: [8, 8], approachTime: 6 }, { ...quiet, LOCK_REFUSAL: { WARM: 0, HURT: 1, JEALOUS: 1, FURIOUS: 1 } });
    const e = playing({ startNight: 2, config });
    e.devSetSuspicion(50);
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devSendRam("HATCH");
    runUntil(e, 7);
    e.pressQuick("LOCK_HATCH");
    runUntil(e, 14.1);
    expect(e.state.ram.state).toBe("INSIDE");
    expect(e.state.ram.inside?.cause).toBe("REFUSED");
  });

  it("the Furious cut hits a lock only, never the player's light", () => {
    const config = cfgWith(5, { fakeOutChance: 0 }, { ...quiet, LIGHT_CUT: { WARM: 0, HURT: 0, JEALOUS: 0, FURIOUS: 0 } });
    const e = playing({ startNight: 5, config });
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devSendRam("WINDOW");
    e.devSetSuspicion(100);
    e.turn("WINDOW");
    e.setLight(true);
    const evs: GameEvent[] = [];
    run(e, 15, (ev) => evs.push(ev), () => e.state.ram.state !== "APPROACHING" && e.state.ram.state !== "AT_ENTRY");
    expect(evs.some((ev) => ev.type === "POWER_CHANGED" && ev.cause === "furious")).toBe(false);
    expect(e.state.log.visit.furiousCut).toBe(false);
  });
});

describe("CHUD forces the light off (section 6.1)", () => {
  const SUSP: Record<string, number> = { WARM: 0, HURT: 50, JEALOUS: 80, FURIOUS: 100 };
  // One light-on per seed, held for 4 s: how often does CHUD cut it?
  const cutRate = (band: string, seeds = 500) => {
    let cuts = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const e = playing({ startNight: 2, seed, config: { ...CONFIG, ...quiet } }); // night 2 first visit at 40 s, well after the 4 s window
      e.devSetSuspicion(SUSP[band]);
      e.turn("HATCH");
      e.setLight(true);
      const t0 = e.state.clock.elapsed;
      let at = -1;
      run(e, 4, (ev) => {
        if (ev.type === "LIGHT_CUT" && at < 0) at = e.state.clock.elapsed - t0;
      });
      if (at >= 0) {
        cuts++;
        expect(at).toBeGreaterThanOrEqual(CONFIG.LIGHT_CUT_DELAY[0] - T);
        expect(at).toBeLessThanOrEqual(CONFIG.LIGHT_CUT_DELAY[1] + T);
        expect(e.state.player.lightEntry).toBeNull();
      } else {
        expect(e.state.player.lightEntry).toBe("HATCH");
      }
    }
    return cuts / seeds;
  };

  it("WARM never cuts; HURT, JEALOUS and FURIOUS cut at their configured chance over many seeds", () => {
    expect(cutRate("WARM")).toBe(0);
    for (const band of ["HURT", "JEALOUS", "FURIOUS"] as const) {
      expect(Math.abs(cutRate(band) - CONFIG.LIGHT_CUT[band]), band).toBeLessThan(0.06);
    }
  });

  const alwaysCut = { ...CONFIG, ...quiet, LIGHT_CUT: { WARM: 0, HURT: 1, JEALOUS: 1, FURIOUS: 1 } };

  it("holding Shift through a cut stays dark; release and press relights at once (and can be cut again)", () => {
    const e = playing({ startNight: 2, config: alwaysCut });
    e.devSetSuspicion(50);
    e.turn("BALCONY");
    e.setLight(true);
    expect(e.state.player.lightEntry).toBe("BALCONY"); // CHUD can never stop it coming on
    run(e, CONFIG.LIGHT_CUT_DELAY[1] + 0.2);
    expect(e.state.player.lightEntry).toBeNull();
    run(e, 3); // still holding: no relight by itself
    expect(e.state.player.lightEntry).toBeNull();
    e.setLight(false);
    e.setLight(true);
    expect(e.state.player.lightEntry).toBe("BALCONY");
    expect(e.state.power.lightCutAt).not.toBeNull(); // the new press rolls again
  });

  it("a light cut preserves an engaged lock", () => {
    const e = playing({ startNight: 2, config: alwaysCut });
    e.devSetPower("LOCK_WINDOW");
    e.devSetSuspicion(50);
    e.turn("WINDOW");
    e.setLight(true);
    run(e, CONFIG.LIGHT_CUT_DELAY[1] + 0.2);
    expect(e.state.player.lightEntry).toBeNull();
    expect(e.state.power.slot).toBe("LOCK_WINDOW");
    expect(e.isDefended("WINDOW")).toBe(true);
  });

  it("never while CHUD is offline or rebooting", () => {
    const e = playing({ startNight: 2, config: alwaysCut });
    e.devSetSuspicion(50);
    e.toggleGenerator();
    e.toggleGenerator(); // rebooting: CHUD offline, no light either
    run(e, CONFIG.REBOOT_TIME - 1);
    e.turn("HATCH");
    e.setLight(true);
    expect(e.state.player.lightEntry).toBeNull();
    run(e, 1.2); // back online, light comes on, and now CHUD rolls
    expect(e.state.player.lightEntry).toBe("HATCH");
  });

  it("each cut says a short possessive line, rate limited, that never names anyone", () => {
    const e = playing({ startNight: 2, config: alwaysCut });
    e.devSetSuspicion(80);
    e.turn("HATCH");
    const lines: string[] = [];
    let cuts = 0;
    let smiles = 0;
    for (let i = 0; i < 6; i++) {
      e.setLight(false);
      e.setLight(true);
      run(e, CONFIG.LIGHT_CUT_DELAY[1] + 0.1, (ev) => {
        if (ev.type === "LIGHT_CUT") {
          cuts++;
          if (ev.band === "JEALOUS") smiles++;
        }
        if (ev.type === "CHUD_SAY" && ev.outcome.kind === "light_cut") lines.push(ev.text);
      });
    }
    expect(cuts).toBe(6);
    expect(smiles).toBe(6);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(cuts); // rate limited
    for (const l of lines) expect(l).not.toMatch(/\bram\b|\baltman\b/i);
  });
});
