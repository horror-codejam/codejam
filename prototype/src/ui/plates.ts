// Which final plate (scenes/03-watch-room/final/webp/<job>.webp) shows for a game state. Pure, no Pixi, unit tested.
//
// The final renders are FULL PLATES, one per state, not transparent overlays: the whole picture swaps when Ram's
// visual or the light changes, so his lighting and the entry light interact correctly (docs/DECISIONS.md).
// "_on" = that entry's light on (Shift held while looking at it), "_off" = dark.

import type { Entry, RamVisual } from "../sim/types";
import { ENTRIES } from "../sim/types";

// Entry view at the desk. The dark plate is always empty.
export function entryPlate(entry: Entry, lit: boolean, vis: RamVisual): string {
  const k = entry.toLowerCase();
  if (!lit) return `view_${k}_off`;
  if (vis === "inside") return `inside_${k}_on`;
  if (vis === "tell_clear") return `tell_${k}_on`;
  if (vis === "approach_silhouette") return `approach_${k}_on`;
  return `view_${k}_on`;
}

// Close-up at the entry (standing or bracing). The brace plates include the player's arms.
export function holdPlate(entry: Entry, bracing: boolean, tell: boolean, lit: boolean): string {
  return `hold_${entry.toLowerCase()}_${bracing ? "brace" : "stand"}_${tell ? "tell" : "empty"}_${lit ? "on" : "off"}`;
}

// The 24 fps jumpscare sequence for the breach entry: jumpscare_<entry>_0001.webp ...
export function jumpscareJob(entry: Entry): string {
  return `jumpscare_${entry.toLowerCase()}`;
}
export const JUMPSCARE_FPS = 24;
export const JUMPSCARE_MIN_FRAMES = 24;

// Frame index (0-based) of a sequence `secs` after it started, holding the last frame.
export function sequenceFrame(secs: number, fps: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(secs * fps)));
}

// Legacy slot names that resolve to a final plate when it exists (the final wins over the old scenes/ file).
export const FINAL_ALIASES: Record<string, string> = Object.fromEntries([
  ["view_desk", "view_desk_off"],
  ...ENTRIES.flatMap((e) => {
    const k = e.toLowerCase();
    return [
      [`view_${k}`, `view_${k}_off`],
      [`view_${k}_beam`, `view_${k}_on`],
      [`ram_inside_${k}`, `inside_${k}_on`],
      [`hold_${k}`, `hold_${k}_stand_empty_off`],
    ];
  }),
]);
