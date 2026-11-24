import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { PRACTICE_LINES } from "../src/chud/lines";
import { beamAngleAt, beamIntensityAtAzimuth, normalizeAngle, wrapAngle } from "../src/sim/beam";
import { GameEngine } from "../src/sim/engine";
import { ENTRIES, type Entry, type GameEvent } from "../src/sim/types";
import { EveningTutorial } from "../src/ui/tutorial";

const T = CONFIG.TICK;

const quiet = {
  scheduledQuestionWindow: [999, 999] as [number, number],
  SILENCE_LIMIT: 999,
  QUIET_LIMIT: [999, 999, 999, 999, 999],
};

function playing(opts: ConstructorParameters<typeof GameEngine>[0] = {}) {
  const e = new GameEngine({ seed: 42, skipNamePrompt: true, ...opts });
  e.beginNight();
  e.drainEvents();
  return e;
}

// Compute the earliest time >= fromTime when the beam center crosses `entry`'s tell azimuth.
function timeOfBeamAt(entry: Entry, fromTime = 0, cfg = CONFIG): number {
  const target = cfg.BEAM_ENTRY_AZIMUTHS[entry];
  const current = beamAngleAt(fromTime, cfg);
  let delta = normalizeAngle((target - current) * cfg.BEAM_DIRECTION);
  if (delta < 1e-6) delta += 2 * Math.PI;
  return fromTime + (delta / (2 * Math.PI)) * cfg.BEAM_PERIOD;
}

describe("rotating ceiling beam", () => {
  it("computes deterministic beam angle from night time and freezes while paused", () => {
    const e = playing({ config: { ...CONFIG, ...quiet } });
    expect(e.beamAngle()).toBeCloseTo(CONFIG.BEAM_START_ANGLE, 8);
    expect(CONFIG.BEAM_PERIOD).toBe(16);
    expect(CONFIG.BEAM_DIRECTION).toBe(1);

    e.tick(4);
    expect(e.beamAngle()).toBeCloseTo(CONFIG.BEAM_START_ANGLE + Math.PI / 2, 8);

    // Pause: stopping ticks freezes beamAngle and visualTime completely.
    const pausedAngle = e.beamAngle();
    const pausedVisual = e.visualTime;
    e.tick(0);
    expect(e.beamAngle()).toBe(pausedAngle);
    expect(e.visualTime).toBe(pausedVisual);

    // Full rotation returns to the same wrapped azimuth.
    e.tick(12);
    expect(wrapAngle(e.beamAngle() - CONFIG.BEAM_START_ANGLE)).toBeCloseTo(0, 6);
  });

  it("rotates in practice evening too using practice elapsed time", () => {
    const e = new GameEngine({ seed: 7, practiceBeforeNight: true });
    e.setName("Morgan");
    e.drainEvents();
    const start = e.beamAngle();
    e.tick(4);
    expect(e.state.clock.elapsed).toBe(0);
    expect(e.beamAngle()).toBeCloseTo(start + Math.PI / 2, 8);
  });

  it("evaluates beam intensity at each entry's manifest tell azimuth, including 0/360 wrap", () => {
    const e = playing({ config: { ...CONFIG, ...quiet } });
    for (const entry of ENTRIES) {
      const target = CONFIG.BEAM_ENTRY_AZIMUTHS[entry];
      expect(beamIntensityAtAzimuth(target, target)).toBeCloseTo(1, 6);
      expect(beamIntensityAtAzimuth(target, target + Math.PI)).toBe(0);
      expect(beamIntensityAtAzimuth(target, target + CONFIG.BEAM_WIDTH * 0.6)).toBe(0);

      const hitTime = timeOfBeamAt(entry, e.now);
      e.tick(Math.round((hitTime - e.now) / T) * T);
      expect(e.beamIntensity(entry)).toBeGreaterThan(0.8);
      for (const other of ENTRIES.filter((x) => x !== entry)) {
        expect(e.beamIntensity(other)).toBe(0);
      }
    }

    // Wrap-around near 0/360 deg (HATCH is at 359.7886 deg).
    const hatchAz = CONFIG.BEAM_ENTRY_AZIMUTHS.HATCH;
    expect(beamIntensityAtAzimuth(hatchAz, (1 * Math.PI) / 180)).toBeGreaterThan(0.9);
    expect(beamIntensityAtAzimuth(hatchAz, (359 * Math.PI) / 180)).toBeGreaterThan(0.9);
  });

  it("fires the inside LOOK scare only when facing his entry while the beam crosses it", () => {
    const e = playing({ startNight: 2, config: { ...CONFIG, ...quiet, LIGHT_CUT: { WARM: 0, HURT: 0, JEALOUS: 0, FURIOUS: 0 } } });
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devForceBreach("WINDOW", "NONE");

    // At t = 0, beam is at 12 deg; window is at 189.4 deg (~7.88 s away).
    e.turn("WINDOW");
    expect(e.beamIntensity("WINDOW")).toBe(0);
    expect(e.ramVisual("WINDOW")).toBe("none");
    expect(e.state.phase).toBe("PLAYING");

    // Looking at WINDOW while the beam is elsewhere stays in PLAYING.
    e.tick(5);
    expect(e.state.phase).toBe("PLAYING");
    expect(e.ramVisual("WINDOW")).toBe("none");

    // Advance until the beam passes across WINDOW -> LOOK scare with flash.
    for (let i = 0; i < 100 && e.state.phase === "PLAYING"; i++) e.tick(T);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss).toMatchObject({ reason: "LOOK", flash: true, entry: "WINDOW" });
  });

  it.each(ENTRIES)("keeps the %s tell visible while standing or bracing with the beam away or cut", (entry) => {
    const e = playing({ config: { ...CONFIG, ...quiet, BEAM_START_ANGLE: CONFIG.BEAM_ENTRY_AZIMUTHS[entry] + Math.PI } });
    expect(e.devSendRam(entry)).toBe(true);
    e.tick(e.state.ram.stateEndsAt - e.now + T);
    expect(e.state.ram.state).toBe("AT_ENTRY");

    e.turn(entry);
    expect(e.beamIntensity(entry)).toBe(0);
    expect(e.ramVisual(entry)).toBe("none");
    e.goToEntry(entry);
    expect(e.ramVisual(entry)).toBe("none");

    e.tick(CONFIG.TRAVEL_TIME + T);
    expect(e.state.player.position.kind).toBe("STANDING");
    expect(e.beamIntensity(entry)).toBe(0);
    expect(e.ramVisual(entry)).toBe("tell_clear");
    e.state.power.lampCutUntil = e.now + CONFIG.LIGHT_CUT_DURATION;
    expect(e.isLampOn()).toBe(false);
    expect(e.ramVisual(entry)).toBe("tell_clear");

    e.startBrace();
    expect(e.state.player.position.kind).toBe("HOLDING");
    expect(e.ramVisual(entry)).toBe("tell_clear");
    e.state.power.lampCutUntil = null;
    expect(e.beamIntensity(entry)).toBe(0);
    expect(e.ramVisual(entry)).toBe("tell_clear");

    e.devRamAway();
    expect(e.ramVisual(entry)).toBe("none");
  });

  it("does not fire LOOK while at the desk, and ARRIVED still scares unchanged", () => {
    const e = playing({ startNight: 2, config: { ...CONFIG, ...quiet } });
    e.devRamAway();
    e.state.ram.stateEndsAt = Infinity;
    e.devForceBreach("WINDOW", "NONE");

    // Stay at DESK through a full rotation: never triggers LOOK.
    e.tick(CONFIG.BEAM_PERIOD + 1);
    expect(e.state.phase).toBe("PLAYING");

    // Walking up to his entry triggers ARRIVED even while the beam is away.
    const awayTime = timeOfBeamAt("HATCH", e.now);
    e.tick(Math.round((awayTime - e.now) / T) * T);
    e.turn("WINDOW");
    e.goToEntry("WINDOW");
    e.tick(CONFIG.TRAVEL_TIME + T);
    expect(e.state.phase).toBe("BREACH");
    expect(e.state.loss).toMatchObject({ reason: "ARRIVED", entry: "WINDOW" });
  });

  it("CHUD light-cut sabotage stops the ceiling lamp for its duration and restores it after", () => {
    const alwaysCut = { ...CONFIG, ...quiet, LIGHT_CUT: { WARM: 0, HURT: 1, JEALOUS: 1, FURIOUS: 1 } };
    const e = playing({ startNight: 2, config: alwaysCut });
    e.devSetSuspicion(80); // JEALOUS
    e.devSetPower("LOCK_WINDOW");
    e.turn("WINDOW");
    expect(e.isLampOn()).toBe(true);
    expect(e.state.power.lightCutAt).not.toBeNull();

    const evs: GameEvent[] = [];
    for (let i = 0; i < Math.ceil((CONFIG.LIGHT_CUT_DELAY[1] + 0.2) / T); i++) {
      e.tick(T);
      evs.push(...e.drainEvents());
    }
    expect(e.isLampOn()).toBe(false);
    expect(e.state.power.lampCutUntil).not.toBeNull();
    expect(e.state.power.slot).toBe("LOCK_WINDOW"); // locks preserved
    expect(evs.some((ev) => ev.type === "LIGHT_CUT" && ev.band === "JEALOUS")).toBe(true);
    const cutLine = evs.find((ev): ev is Extract<GameEvent, { type: "CHUD_SAY" }> => ev.type === "CHUD_SAY" && ev.outcome.kind === "light_cut");
    expect(cutLine).toBeTruthy();
    expect(cutLine!.text).not.toMatch(/\bshift\b|\bram\b|\baltman\b/i);

    // While lamp is cut, intensity is 0 everywhere, even at the entry's tell azimuth.
    for (const entry of ENTRIES) {
      expect(e.beamIntensity(entry, timeOfBeamAt(entry, e.now))).toBe(0);
    }

    // After LIGHT_CUT_DURATION, the lamp restores automatically.
    const afterEvs: GameEvent[] = [];
    for (let i = 0; i < Math.ceil((CONFIG.LIGHT_CUT_DURATION + 0.2) / T); i++) {
      e.tick(T);
      afterEvs.push(...e.drainEvents());
    }
    expect(e.isLampOn()).toBe(true);
    expect(e.state.power.lampCutUntil).toBeNull();
    expect(afterEvs.some((ev) => ev.type === "LAMP_RESTORED")).toBe(true);
  });

  it("practice light step teaches waiting for the rotating beam and completes when the beam crosses the window", () => {
    const engine = new GameEngine({ seed: 7, practiceBeforeNight: true });
    engine.setName("Morgan");
    engine.drainEvents();
    const tutorial = new EveningTutorial();
    tutorial.start(engine);
    let t = 0;
    const spoken: string[] = [];
    const step = (dt = 0) => {
      if (dt > 0) engine.tick(dt);
      t += dt;
      for (const ev of engine.drainEvents()) if (ev.type === "CHUD_SAY") tutorial.hear(ev);
      tutorial.update(engine, t, (line) => {
        spoken.push(line.text);
        return { state: "finished", cancelPending: () => {} };
      }, () => {});
    };
    for (let i = 0; i < 4; i++) {
      tutorial.skipStory(engine, t);
      step();
    }
    for (const entry of ENTRIES) {
      engine.turn(entry);
      step();
      engine.turn("DESK");
      step();
    }
    expect(tutorial.step).toBe("light");
    expect(PRACTICE_LINES.light).toContain("The light comes around slowly. Watch for him when it passes.");
    engine.turn("WINDOW");
    step();
    expect(tutorial.prompt(engine.state).chip).toBe("WAIT FOR THE LIGHT");
    expect(tutorial.step).toBe("light");

    // Advance until the beam passes across the window.
    for (let i = 0; i < Math.ceil(CONFIG.BEAM_PERIOD / T) && tutorial.step === "light"; i++) {
      step(T);
    }
    expect(tutorial.step).toBe("lock");
  });

  it("has no Shift entry-light code, UI indicator, or practice prompt anywhere", async () => {
    // @ts-ignore node types are not installed in this project
    const fs = await import("node:fs");
    const files = [
      "../index.html",
      "../src/main.ts",
      "../src/sim/engine.ts",
      "../src/sim/types.ts",
      "../src/ui/terminal.ts",
      "../src/ui/terminal.css",
      "../src/ui/tutorial.ts",
      "../src/ui/scene.ts",
      "../src/chud/lines.ts",
    ];
    for (const rel of files) {
      const content: string = fs.readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(content, rel).not.toMatch(/\bsetLight\b|\blightHeld\b|\blightEntry\b|HOLD SHIFT|data-cell="LIGHT"|e\.key\s*===\s*"Shift"/);
    }
  });
});
