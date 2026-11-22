import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { GameEngine } from "../src/sim/engine";
import { NEUTRAL_JUDGE } from "../src/sim/types";

function practice(): GameEngine {
  const engine = new GameEngine({ seed: 7, practiceBeforeNight: true });
  engine.setName("Morgan");
  engine.drainEvents();
  return engine;
}

describe("the practice evening", () => {
  it("keeps the night clock, threat, and scheduled events idle even after a whole night has passed", () => {
    const engine = practice();
    engine.tick(CONFIG.HOUR_LENGTH * CONFIG.NIGHT_HOURS + 10);

    expect(engine.isPracticing).toBe(true);
    expect(engine.state.phase).toBe("PLAYING");
    expect(engine.state.clock).toEqual({ elapsed: 0, hour: 0 });
    expect(engine.state.ram.state).toBe("AWAY");
    expect(engine.drainEvents()).toEqual([]);
    expect(engine.devForceBreach("HATCH")).toBe(false);
    engine.devWinNight();
    expect(engine.state.phase).toBe("PLAYING");
  });

  it("uses the real controls and starts Night 1 with a clean room and the saved name", () => {
    const engine = practice();
    engine.pressQuick("LOCK_HATCH");
    engine.tick(CONFIG.RELAY_DELAY);
    expect(engine.state.power.slot).toBe("LOCK_HATCH");

    engine.turn("HATCH");
    engine.setLight(true);
    expect(engine.state.power.slot).toBe("LIGHT_HATCH");
    engine.setLight(false);
    expect(engine.state.power.slot).toBe("NONE");

    engine.goToEntry("HATCH");
    engine.tick(CONFIG.TRAVEL_TIME);
    engine.startBrace();
    expect(engine.state.player.position.kind).toBe("HOLDING");

    engine.finishPractice();
    expect(engine.isPracticing).toBe(false);
    expect(engine.state.phase).toBe("NIGHT_CARD");
    expect(engine.state.player.position).toEqual({ kind: "DESK" });
    expect(engine.state.player.view).toBe("DESK");
    expect(engine.state.power.slot).toBe("NONE");
    expect(engine.state.run.factsCheckpoint).toEqual({ name: "Morgan" });
    expect(engine.drainEvents()).toEqual([{ type: "NIGHT_CARD", night: 1 }]);
    engine.beginNight();
    engine.tick(CONFIG.TICK);
    expect(engine.state.clock.elapsed).toBe(CONFIG.TICK);
  });

  it("keeps practice conversation from changing suspicion or storing new facts", () => {
    const engine = practice();
    const submission = engine.submitMessage("I'll leave when the storm clears.");
    if (!submission.ok) throw new Error(submission.reason);
    engine.applyJudge(submission.ticket.id, {
      ...NEUTRAL_JUDGE,
      mentions_leaving: true,
      new_fact: { key: "home_port", value: "Halifax" },
    });
    expect(engine.state.chud.suspicion).toBe(0);
    expect(engine.state.chud.facts).toEqual({ name: "Morgan" });
  });

  it("keeps saved games on the saved night flow", () => {
    const engine = new GameEngine({ practiceBeforeNight: true, skipNamePrompt: true, startNight: 3 });
    expect(engine.isPracticing).toBe(false);
    expect(engine.state.phase).toBe("NIGHT_CARD");
    expect(engine.state.run.night).toBe(3);
  });
});
