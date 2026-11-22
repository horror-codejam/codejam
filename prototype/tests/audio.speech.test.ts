// Speech queue rules (b6443ae): urgent CHUD lines skip waiting lines and cut short a line still being synthesized,
// but never one already playing. Checked without an AudioContext: startSpeech returns early, the queue is observable.
import { describe, expect, it } from "vitest";
import { Sound } from "../src/ui/audio";
import { CHUD_SPEECH } from "../src/uiConfig";

type Internals = {
  speechQueue: { text: string; band: string }[];
  speechRun: AbortController | null;
  speechSource: object | null;
};
const internals = (s: Sound): Internals => s as unknown as Internals;

describe("speech queue", () => {
  it("ordinary lines queue up, capped at MAX_WAITING_LINES", () => {
    const s = new Sound();
    for (let i = 0; i < CHUD_SPEECH.MAX_WAITING_LINES + 2; i++) s.speak(`line ${i}`, "WARM");
    const q = internals(s).speechQueue;
    expect(q.length).toBe(CHUD_SPEECH.MAX_WAITING_LINES);
    expect(q[q.length - 1].text).toBe(`line ${CHUD_SPEECH.MAX_WAITING_LINES + 1}`);
  });

  it("an urgent line replaces the waiting lines and plays next", () => {
    const s = new Sound();
    s.speak("small talk", "WARM");
    s.speak("more small talk", "WARM");
    s.speak("Where did you sail from, keeper?", "WARM", true);
    expect(internals(s).speechQueue.map((l) => l.text)).toEqual(["Where did you sail from, keeper?"]);
  });

  it("an urgent line cuts short a line still being synthesized", () => {
    const s = new Sound();
    const run = new AbortController();
    internals(s).speechRun = run;
    internals(s).speechSource = null; // fetching or decoding, nothing playing yet
    s.speak("Answer me first, keeper.", "HURT", true);
    expect(run.signal.aborted).toBe(true);
  });

  it("an urgent line never cuts a line already playing", () => {
    const s = new Sound();
    const run = new AbortController();
    internals(s).speechRun = run;
    internals(s).speechSource = {}; // a line is playing
    s.speak("Answer me first, keeper.", "HURT", true);
    expect(run.signal.aborted).toBe(false);
    expect(internals(s).speechQueue.map((l) => l.text)).toEqual(["Answer me first, keeper."]);
  });
});
