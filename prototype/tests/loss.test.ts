import { expect, it } from "vitest";
import type { LossInfo } from "../src/sim/types";
import { lossLine } from "../src/ui/screens/loss";

const breach: LossInfo = {
  night: 2, entry: "HATCH", cause: "UNLOCKED", lastClaim: null, heldEntry: null, reason: "TIMER", flash: false, insideFor: 5,
};

it.each<[Partial<LossInfo>, string]>([
  [{}, "He came in through the hatch. Nothing was holding it shut."],
  [{ reason: "ARTIFACT" }, "He came in through the hatch. Nothing was holding it shut."],
  [{ reason: "MOVE" }, "He came in through the hatch. Nothing was holding it shut."],
  [{ reason: "LOOK", insideFor: 0 }, "He came in through the hatch. Nothing was holding it shut."],
  [{ entry: "BALCONY", cause: "LIED", lastClaim: "WINDOW" }, "ChudGPT lied. He was at the balcony, not the window."],
  [{ cause: "LIED", lastClaim: "NONE" }, "ChudGPT lied. He was at the hatch when it said no one was there."],
  [{ entry: "WINDOW", cause: "REFUSED", reason: "DAWN" }, "ChudGPT refused to lock the window."],
  [{ cause: "FURIOUS" }, "ChudGPT cut the lock on the hatch."],
  [{ entry: "WINDOW", cause: "SABOTAGE" }, "ChudGPT cut the lock on the window."],
  [{ cause: "POWER_OFF" }, "The power was off. He came in through the hatch."],
  [{ cause: "ARMS_GAVE_OUT" }, "Your arms gave out. He came in through the hatch."],
  [{ cause: "WRONG_HOLD", heldEntry: "BALCONY" }, "He came in through the hatch. You were at the balcony."],
  [{ entry: "WINDOW", reason: "LOOK" }, "He was already inside. He got in through the window earlier."],
  [{ reason: "ARRIVED" }, "He was already inside. He got in through the hatch earlier."],
  [{ reason: "DAWN" }, "He was already inside. He got in through the hatch earlier."],
])("explains the loss for %j", (details, expected) => {
  expect(lossLine({ ...breach, ...details })).toBe(expected);
});
