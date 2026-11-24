import { describe, expect, it } from "vitest";
import { beamEntryState, beamSlot, FINAL_ALIASES, holdBeamSlot, jumpscareJob, sequenceFrame } from "../src/ui/plates";

describe("final beam slot per state", () => {
  it("maps desk and entry states to final_beam manifest slots", () => {
    expect(beamSlot("DESK")).toBe("desk");
    expect(beamSlot("WINDOW", "empty")).toBe("window_empty");
    expect(beamSlot("HATCH", "tell")).toBe("hatch_tell");
    expect(beamSlot("BALCONY", "approach")).toBe("balcony_approach");
    expect(beamSlot("BALCONY", "inside")).toBe("balcony_inside");
  });
  it("derives the entry state from Ram's state and active scare entry", () => {
    expect(beamEntryState("WINDOW", { state: "AWAY", target: null, inside: null })).toBe("empty");
    expect(beamEntryState("WINDOW", { state: "APPROACHING", target: "WINDOW", inside: null })).toBe("approach");
    expect(beamEntryState("WINDOW", { state: "AT_ENTRY", target: "WINDOW", inside: null })).toBe("tell");
    expect(beamEntryState("WINDOW", { state: "AT_ENTRY", target: "HATCH", inside: null })).toBe("empty");
    expect(beamEntryState("BALCONY", { state: "INSIDE", target: "BALCONY", inside: { entry: "BALCONY" } })).toBe("inside");
    expect(beamEntryState("HATCH", { state: "AWAY", target: null, inside: null }, "HATCH")).toBe("inside");
  });
  it("maps hold views to stand or brace, empty or tell", () => {
    expect(holdBeamSlot("WINDOW", true, true)).toBe("hold_window_brace_tell");
    expect(holdBeamSlot("HATCH", false, false)).toBe("hold_hatch_stand_empty");
    expect(holdBeamSlot("BALCONY", false, true)).toBe("hold_balcony_stand_tell");
  });
  it("old slot names alias to fallback finals", () => {
    expect(FINAL_ALIASES.view_desk).toBe("view_desk_off");
    expect(FINAL_ALIASES.view_hatch).toBe("view_hatch_off");
    expect(FINAL_ALIASES.ram_inside_window).toBe("inside_window_on");
  });
  it("the jumpscare sequence plays at its fps and holds the last frame", () => {
    expect(jumpscareJob("BALCONY")).toBe("jumpscare_balcony");
    expect(sequenceFrame(0, 24, 24)).toBe(0);
    expect(sequenceFrame(0.5, 24, 24)).toBe(12);
    expect(sequenceFrame(1.08, 24, 24)).toBe(23);
  });
});
