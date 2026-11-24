// Which beam asset slot (scenes/03-watch-room/final_beam/) or jumpscare sequence shows for a game state.
// Pure, no Pixi, unit tested.

import type { Entry, RamState, View } from "../sim/types";
import { ENTRIES } from "../sim/types";

export type BeamEntryState = "empty" | "approach" | "tell" | "inside";

// Seated view slot in final_beam/manifest.json: desk, or <entry>_<empty|approach|tell|inside>.
export function beamSlot(view: View, state: BeamEntryState = "empty"): string {
  if (view === "DESK") return "desk";
  return `${view.toLowerCase()}_${state}`;
}

// Derive the beam entry state from Ram's state for an entry view.
// The shader keeps the threat hidden until the beam touches those pixels, so the slot tracks actual room state.
export function beamEntryState(
  entry: Entry,
  ram: { state: RamState; target: Entry | null; inside: { entry: Entry } | null },
  scareEntry: Entry | null = null,
): BeamEntryState {
  if (scareEntry === entry || (ram.state === "INSIDE" && ram.inside?.entry === entry)) return "inside";
  if (ram.state === "AT_ENTRY" && ram.target === entry) return "tell";
  if (ram.state === "APPROACHING" && ram.target === entry) return "approach";
  return "empty";
}

// Hold close-up slot in final_beam/manifest.json: hold_<entry>_<stand|brace>_<empty|tell>.
export function holdBeamSlot(entry: Entry, bracing: boolean, tell: boolean): string {
  return `hold_${entry.toLowerCase()}_${bracing ? "brace" : "stand"}_${tell ? "tell" : "empty"}`;
}

// The 24-frame jumpscare sequence for the breach entry: jumpscare_<entry>_0001.webp ...
// Played fast (40 fps -> 0.6 s for 24 frames) with a hard cut straight to black on the last frame.
export function jumpscareJob(entry: Entry): string {
  return `jumpscare_${entry.toLowerCase()}`;
}
export const JUMPSCARE_FPS = 40;
export const JUMPSCARE_MIN_FRAMES = 24;

// Total playback duration of a jumpscare sequence (seconds). Hard cut on the last frame (no tail hold).
export function jumpscareDuration(count: number, fps = JUMPSCARE_FPS): number {
  return count > 0 ? count / fps : 0;
}

// Frame index (0-based) of a sequence `secs` after it started, holding the last frame.
export function sequenceFrame(secs: number, fps: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(secs * fps)));
}

// Legacy slot names that resolve to a final plate when it exists (for fallback and title/dash).
export const FINAL_ALIASES: Record<string, string> = Object.fromEntries([
  ["view_desk", "view_desk_off"],
  ...ENTRIES.flatMap((e) => {
    const k = e.toLowerCase();
    return [
      [`view_${k}`, `view_${k}_off`],
      [`ram_inside_${k}`, `inside_${k}_on`],
      [`hold_${k}`, `hold_${k}_stand_empty_off`],
    ];
  }),
]);
