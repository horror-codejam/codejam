import { expect, it } from "vitest";
import { GameEngine } from "../src/sim/engine";
import { lockSlot } from "../src/sim/types";

it("keeps the fixed-seed night simulation identical to the repel baseline", async () => {
  const trace = [];
  for (let night = 1; night <= 5; night++) {
    const engine = new GameEngine({ seed: 70062, startNight: night, skipNamePrompt: true, facts: { name: "Morgan" } });
    engine.beginNight();
    for (let second = 0; second < 300 && engine.state.phase === "PLAYING"; second++) {
      const { ram, power, player } = engine.state;
      if (ram.state === "AT_ENTRY" && ram.target && power.slot !== lockSlot(ram.target) && !power.pending) {
        if (player.view !== "DESK") engine.turn("DESK");
        engine.pressQuick(lockSlot(ram.target));
        engine.turn(ram.target);
      } else if (ram.state === "RETREATING" && player.view !== "DESK") {
        engine.turn("DESK");
      }
      engine.tick(1);
      // Loss attribution has its own cases. Keep the timing and entry of each breach in the baseline.
      trace.push(JSON.stringify([engine.state, engine.drainEvents()], (key, value) => {
        if (key === "visit") return undefined;
        if ((key === "loss" || key === "inside") && value) {
          const { cause, heldEntry, lastClaim, ...timing } = value;
          return timing;
        }
        return value;
      }));
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trace.join("\n")));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  // Updated for approved plain Night 1 voice rewrite (Ram RNG untouched).
  expect(hash).toBe("840842e7f7f8d3fe199003402957f9c07a7c7f2102b1976be30b25fefdd0ff6e");
});
