import { describe, expect, it } from "vitest";
import { BEATS, readingMs, totalMs, typedText } from "../src/ui/intro";

describe("intro helpers", () => {
  it("has the 9 beats", () => {
    expect(BEATS.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("total runtime is 40 to 50 s", () => {
    expect(totalMs()).toBeGreaterThan(40000);
    expect(totalMs()).toBeLessThan(50000);
  });
  it("longer lines take longer", () => {
    expect(readingMs(BEATS[3])).toBeGreaterThan(readingMs(BEATS[1]));
  });
  it("types in progressively and clamps", () => {
    expect(typedText("hello", 0)).toBe("");
    expect(typedText("hello", 60000)).toBe("hello");
    expect(typedText("hello", 100).length).toBeGreaterThan(0);
  });
  it("no em dashes in the script", () => {
    expect(BEATS.map((b) => b.line ?? "").join("")).not.toContain("—");
  });
});
