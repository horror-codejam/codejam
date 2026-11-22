import { describe, expect, it } from "vitest";
import { entryPlate, FINAL_ALIASES, holdPlate, jumpscareJob, sequenceFrame } from "../src/ui/plates";

describe("final plate per state", () => {
  it("entry views swap the whole plate by Ram's visual and the light", () => {
    expect(entryPlate("WINDOW", false, "none")).toBe("view_window_off");
    expect(entryPlate("WINDOW", true, "none")).toBe("view_window_on");
    expect(entryPlate("HATCH", false, "tell_faint")).toBe("tell_hatch_off");
    expect(entryPlate("HATCH", true, "tell_clear")).toBe("tell_hatch_on");
    expect(entryPlate("BALCONY", true, "approach_silhouette")).toBe("approach_balcony_on");
    expect(entryPlate("BALCONY", true, "inside")).toBe("inside_balcony_on");
  });
  it("hold views pick stand or brace, empty or tell, on or off", () => {
    expect(holdPlate("WINDOW", true, true, true)).toBe("hold_window_brace_tell_on");
    expect(holdPlate("HATCH", false, false, false)).toBe("hold_hatch_stand_empty_off");
  });
  it("old slot names alias to the finals", () => {
    expect(FINAL_ALIASES.view_desk).toBe("view_desk_off");
    expect(FINAL_ALIASES.view_hatch).toBe("view_hatch_off");
    expect(FINAL_ALIASES.view_hatch_beam).toBe("view_hatch_on");
    expect(FINAL_ALIASES.ram_inside_window).toBe("inside_window_on");
  });
  it("the jumpscare sequence plays at its fps and holds the last frame", () => {
    expect(jumpscareJob("BALCONY")).toBe("jumpscare_balcony");
    expect(sequenceFrame(0, 24, 24)).toBe(0);
    expect(sequenceFrame(0.5, 24, 24)).toBe(12);
    expect(sequenceFrame(1.08, 24, 24)).toBe(23);
  });
});
