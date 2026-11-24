import { expect, it } from "vitest";
import { GameEngine } from "../src/sim/engine";
import { lockSlot } from "../src/sim/types";

it("keeps the fixed-seed night simulation identical to the pre-practice baseline", async () => {
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
        engine.setLight(true);
      } else if (ram.state === "RETREATING" && player.view !== "DESK") {
        engine.setLight(false);
        engine.turn("DESK");
      }
      engine.tick(1);
      trace.push(JSON.stringify([engine.state, engine.drainEvents()]));
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trace.join("\n")));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  // Captured on 8a1c5f9, before the practice changes.
  expect(hash).toBe("065d223e616db1b1376132585a906e6a477fd40362663bba37190562d6f3a376");
});
