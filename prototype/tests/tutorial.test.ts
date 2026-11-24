import { describe, expect, it } from "vitest";
import { PRACTICE_LINES } from "../src/chud/lines";
import { CONFIG } from "../src/config";
import { GameEngine } from "../src/sim/engine";
import { NEUTRAL_JUDGE, type GameEvent } from "../src/sim/types";
import type { SpeechPlayback } from "../src/ui/audio";
import { EveningTutorial } from "../src/ui/tutorial";
import { PRACTICE_UI } from "../src/uiConfig";

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
    expect(engine.isLampOn()).toBe(true);
    expect(engine.state.power.slot).toBe("LOCK_HATCH");

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

  it("stages a window visit until its relay lands, without a night clock, scare, or attack deadline", () => {
    const engine = practice();
    engine.stagePracticeVisit("WINDOW");
    expect(engine.drainEvents()).toEqual([{ type: "RAM_AT_ENTRY", entry: "WINDOW", visitId: 1 }]);
    engine.turn("WINDOW");
    expect(engine.ramVisual("WINDOW")).toBe("none");
    // Advance until the rotating beam crosses the window tell azimuth.
    for (let i = 0; i < Math.ceil(CONFIG.BEAM_PERIOD / CONFIG.TICK) && engine.ramVisual("WINDOW") !== "tell_clear"; i++) {
      engine.tick(CONFIG.TICK);
    }
    expect(engine.ramVisual("WINDOW")).toBe("tell_clear");
    engine.tick(600);
    expect(engine.state.ram.state).toBe("AT_ENTRY");
    expect(engine.state.phase).toBe("PLAYING");
    expect(engine.state.clock.elapsed).toBe(0);
    expect(engine.state.chud.suspicion).toBe(0);

    engine.turn("DESK");
    engine.pressQuick("LOCK_WINDOW");
    expect(engine.state.ram.state).toBe("AT_ENTRY");
    engine.tick(CONFIG.RELAY_DELAY);
    expect(engine.state.power.slot).toBe("LOCK_WINDOW");
    expect(engine.state.ram.state).toBe("RETREATING");
    expect(engine.drainEvents()).toContainEqual({ type: "RAM_RETREAT", entry: "WINDOW", visitId: 1 });
    engine.tick(CONFIG.RETREAT_TIME);
    expect(engine.state.ram).toMatchObject({ state: "AWAY", target: null });
  });

  it("refuses the practice hatch lock and retreats only after a continuous brace at its entry", () => {
    const engine = practice();
    engine.pressQuick("LOCK_HATCH");
    engine.tick(CONFIG.RELAY_DELAY + CONFIG.QUICK_BUTTON_COOLDOWN);
    engine.stagePracticeVisit("HATCH");
    expect(engine.state.power.slot).toBe("NONE");
    engine.pressQuick("LOCK_HATCH");
    expect(engine.drainEvents()).toContainEqual(expect.objectContaining({
      type: "CHUD_SAY", outcome: { kind: "practice_line", line: "hatchRefusal" },
    }));
    expect(engine.state.power.pending).toBeNull();
    engine.turn("WINDOW");
    engine.goToEntry("WINDOW");
    engine.startBrace();
    const repelTime = CONFIG.nights[0].repelTime;
    engine.tick(CONFIG.TRAVEL_TIME + repelTime);
    expect(engine.state.ram.state).toBe("AT_ENTRY");
    engine.returnToDesk();
    engine.tick(CONFIG.HOLD_COOLDOWN + CONFIG.TRAVEL_TIME);

    engine.turn("HATCH");
    engine.goToEntry("HATCH");
    engine.tick(CONFIG.TRAVEL_TIME + repelTime);
    expect(engine.state.ram.state).toBe("AT_ENTRY");
    engine.startBrace();
    engine.tick(repelTime - CONFIG.TICK);
    engine.endBrace();
    engine.tick(CONFIG.BRACE_REST);
    engine.startBrace();
    engine.tick(repelTime - CONFIG.TICK);
    expect(engine.state.ram.state).toBe("AT_ENTRY");
    engine.tick(CONFIG.TICK);
    expect(engine.state.ram.state).toBe("RETREATING");
    expect(engine.ramVisual("HATCH")).toBe("none");
    expect(engine.drainEvents()).toContainEqual({ type: "RAM_REPELLED", visitId: 1, entry: "HATCH", how: "brace" });
    engine.returnToDesk();
    engine.tick(CONFIG.TRAVEL_TIME);
    engine.pressQuick("LOCK_HATCH");
    engine.tick(CONFIG.RELAY_DELAY);
    expect(engine.state.power.slot).toBe("LOCK_HATCH");
    expect(engine.state.chud.suspicion).toBe(0);
  });

  it("ignores practice visits and lines in a real night", () => {
    const engine = new GameEngine({ seed: 7, skipNamePrompt: true });
    engine.beginNight();
    engine.drainEvents();
    engine.stagePracticeVisit("WINDOW");
    engine.sayPracticeLine("danger");
    expect(engine.state.ram.state).toBe("AWAY");
    expect(engine.drainEvents()).toEqual([]);
  });
});

function lesson(playback?: SpeechPlayback) {
  const engine = practice();
  const tutorial = new EveningTutorial();
  const emitted: GameEvent[] = [];
  const spoken: string[] = [];
  let interruptions = 0;
  let t = 0;
  function step(dt = 0) {
    t += dt;
    const events = engine.drainEvents();
    emitted.push(...events);
    for (const event of events) if (event.type === "CHUD_SAY") tutorial.hear(event);
    tutorial.update(engine, t, (line) => {
      spoken.push(line.text);
      return playback;
    }, () => { interruptions++; });
  }
  function skipStory() {
    tutorial.skipStory(engine, t);
    step();
  }
  tutorial.start(engine);
  return { engine, tutorial, emitted, spoken, step, skipStory, interruptions: () => interruptions };
}

describe("ChudGPT's practice lessons", () => {
  it("holds the story at the desk until the voice finishes and pauses briefly between lines", () => {
    const playback: SpeechPlayback = { state: "playing", cancelPending: () => {} };
    const { engine, tutorial, step, spoken, skipStory } = lesson(playback);
    step();
    expect(spoken).toEqual([PRACTICE_LINES.wreck.replace("{n}", "Morgan")]);
    step(20);
    expect(spoken).toHaveLength(1);
    playback.state = "finished";
    step();
    step(PRACTICE_UI.LINE_PAUSE / 2);
    expect(spoken).toHaveLength(1);
    step(PRACTICE_UI.LINE_PAUSE);
    step();
    expect(spoken.at(-1)).toBe(PRACTICE_LINES.rescue);
    skipStory();
    expect(spoken.at(-1)).toBe(PRACTICE_LINES.danger);
    expect(engine.state.player.view).toBe("DESK");
    expect(engine.state.clock.elapsed).toBe(0);
    expect(tutorial.step).toBe("story");
  });

  it("falls back to the time needed to read the story line and cancels a pending voice", () => {
    const playback: SpeechPlayback = {
      state: "queued",
      cancelPending: () => { playback.state = "unavailable"; },
    };
    const { step, spoken } = lesson(playback);
    step();
    const readTime = spoken[0].length * PRACTICE_UI.READ_SECONDS_PER_CHARACTER;
    step(readTime - 0.1);
    expect(playback.state).toBe("queued");
    step(0.1);
    expect(playback.state).toBe("unavailable");
    expect(spoken).toHaveLength(1);
    step(PRACTICE_UI.LINE_PAUSE);
    step();
    expect(spoken.at(-1)).toBe(PRACTICE_LINES.rescue);
  });

  it("advances on each lesson action and emits one nudge for every waiting step", () => {
    const playback: SpeechPlayback = { state: "finished", cancelPending: () => {} };
    const { engine, tutorial, emitted, spoken, step, skipStory, interruptions } = lesson(playback);
    const settleSpeech = () => {
      for (let i = 0; i < 8; i++) step(0.5);
    };
    const waitForNudge = (name: keyof typeof PRACTICE_LINES) => {
      step(PRACTICE_UI.NUDGE_AFTER);
      settleSpeech();
      step(PRACTICE_UI.NUDGE_AFTER * 2);
      settleSpeech();
      expect(emitted.filter((ev) => ev.type === "CHUD_SAY" && ev.outcome.kind === "practice_line" && ev.outcome.line === name)).toHaveLength(1);
      expect(spoken).toContain(PRACTICE_LINES[name]);
    };
    for (let i = 0; i < 4; i++) skipStory();
    expect(tutorial.step).toBe("views");
    expect(tutorial.prompt(engine.state).chip).toBe("MOUSE TO THE LEFT EDGE");
    waitForNudge("nudgeViews");
    for (const entry of ["WINDOW", "HATCH", "BALCONY"] as const) {
      engine.turn(entry);
      step();
      expect(tutorial.step).toBe("views");
      if (entry === "BALCONY") expect(tutorial.prompt(engine.state).chip).toBe("MOVE AWAY, THEN BACK TO BOTTOM EDGE");
      engine.turn("DESK");
      step();
    }

    expect(tutorial.step).toBe("light");
    expect(engine.state.ram.target).toBe("WINDOW");
    expect(tutorial.allowsQuick("LOCK_WINDOW")).toBe(false);
    engine.turn("HATCH");
    step();
    expect(tutorial.step).toBe("light");
    waitForNudge("nudgeLight");
    engine.turn("DESK");
    engine.turn("WINDOW");
    step();
    expect(tutorial.prompt(engine.state).chip).toBe("WAIT FOR THE LIGHT");
    const beforeLighting = interruptions();
    for (let i = 0; i < Math.ceil(CONFIG.BEAM_PERIOD / CONFIG.TICK) && tutorial.step === "light"; i++) {
      engine.tick(CONFIG.TICK);
      step();
    }

    expect(tutorial.step).toBe("lock");
    expect(tutorial.prompt(engine.state).chip).toBe("MOUSE TO THE RIGHT EDGE");
    expect(interruptions()).toBe(beforeLighting + 1);
    step();
    expect(spoken.at(-1)).toBe("See it? Come back to my screen and click W. I'll lock the window.");
    expect(tutorial.allowsQuick("LOCK_WINDOW")).toBe(true);
    waitForNudge("nudgeLock");
    expect(spoken).toContain("At the desk, click W on my screen.");
    engine.turn("DESK");
    expect(tutorial.prompt(engine.state).target).toBe("LOCK_WINDOW");
    engine.pressQuick("LOCK_WINDOW");
    step();
    expect(tutorial.step).toBe("lock");
    engine.tick(CONFIG.RELAY_DELAY);
    step();
    expect(tutorial.step).toBe("windowSafe");
    settleSpeech();
    expect(tutorial.step).toBe("hatch");
    expect(engine.state.ram.target).toBe("HATCH");
    expect(tutorial.allowsQuick("LOCK_HATCH")).toBe(true);
    waitForNudge("nudgeHatch");
    expect(spoken).toContain("It's at the hatch. I can't lock it. Click to run over, then hold it shut until it gives up.");
    engine.turn("HATCH");
    expect(tutorial.prompt(engine.state).chip).toBe("CLICK");
    engine.goToEntry("HATCH");
    engine.tick(CONFIG.TRAVEL_TIME);
    step();
    expect(tutorial.step).toBe("hatch");
    expect(tutorial.prompt(engine.state).chip).toBe("HOLD MOUSE");
    engine.startBrace();
    engine.tick(CONFIG.nights[0].repelTime);
    step();
    expect(tutorial.step).toBe("return");
    expect(tutorial.allowsQuick("LOCK_HATCH")).toBe(false);
    waitForNudge("nudgeReturn");
    engine.returnToDesk();
    step();
    expect(tutorial.step).toBe("return");
    engine.tick(CONFIG.TRAVEL_TIME);
    step();

    expect(tutorial.step).toBe("location");
    expect(tutorial.prompt(engine.state).target).toBe("ASK_LOCATION");
    waitForNudge("nudgeLocation");
    expect(spoken).toContain("At the desk, click 'where is it' on my screen.");
    engine.pressQuick("ASK_LOCATION");
    settleSpeech();
    expect(engine.state.chud.lastLocationClaim).toBe("NONE");
    expect(tutorial.step).toBe("chat");
    expect(tutorial.prompt(engine.state).target).toBe("chat");
    waitForNudge("nudgeChat");
    const reply = engine.submitMessage("I make the best locks.");
    if (!reply.ok) throw new Error(reply.reason);
    expect(reply.ticket.parsed.command).toBe("NONE");
    engine.applyJudge(reply.ticket.id, NEUTRAL_JUDGE);
    tutorial.messageSent();
    step();
    expect(tutorial.step).toBe("farewell");
    settleSpeech();
    expect(tutorial.step).toBe("ready");
    expect(spoken.slice(-4)).toEqual([PRACTICE_LINES.chatReply.replace("{n}", "Morgan"), PRACTICE_LINES.answerMe, PRACTICE_LINES.lonely, PRACTICE_LINES.ready]);
  });
});
