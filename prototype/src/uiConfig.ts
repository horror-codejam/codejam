// UI-only tuning knobs for the edge controls (docs/CONTROLS_PROPOSAL.md, branch proto/v3-controls-edge).
// Not game rules: nothing in src/sim reads this file. Game timers (TRAVEL_TIME, HOLD_MAX, HOLD_COOLDOWN, BRACE_REST) stay in config.ts.

import type { DeskArtifact } from "./sim/engine";

export const CHUD_SPEECH = {
  REQUEST_TIMEOUT_MS: 3000,
  HOSTED_TIMEOUT_MS: 32000, // a cold Python function may need to fetch the pinned model
  MAX_WAITING_LINES: 4,
  DESK: { gain: 0.9, pan: 0 },
  WINDOW: { gain: 0.58, pan: 0.55 },
  HATCH: { gain: 0.58, pan: -0.55 },
  BALCONY: { gain: 0.45, pan: 0 },
};

export const PRACTICE_UI = {
  NUDGE_AFTER: 12,
  LINE_PAUSE: 0.35,
  MIN_READ_TIME: 3,
  READ_SECONDS_PER_CHARACTER: 0.06,
};

export const CONTROLS = {
  EDGE_DWELL: 0.3, // real seconds the mouse must stay in an edge zone before the turn fires
  EDGE_ZONE_SIDE: 70, // stage px (of 1280) from the left or right edge of the stage
  EDGE_ZONE_BOTTOM: 40, // stage px (of 720) from the bottom edge; kept thin so it stays below the terminal's quick buttons
  TURN_TIME: 0.25, // seconds, slide between DESK and WINDOW or HATCH (GAME_LOGIC 6.1)
  TURN_TIME_BALCONY: 0.4, // seconds, the longer turn around to the BALCONY and back
  TURN_BLUR: 24, // peak horizontal motion blur during a turn (BlurFilter strength)
  TURN_DIM: 0.35, // peak darkening in the middle of a turn (0..1)
};

// Cursor ring (replaces the edge fill and the arms bar): one small ring on the pointer that shows the running timer.
export const RING = {
  SIZE: 28, // screen px, diameter (kept the same at any window size)
  STROKE: 2, // screen px
  TRACK: "rgba(255, 255, 255, 0.14)", // the faint full circle behind the arc
  DWELL: "#ffc46b", // edge dwell: fills clockwise over EDGE_DWELL
  BRACE: "#e0b090", // bracing: arms time left, drains over HOLD_MAX
  BRACE_LOW: "#ff4a3a", // bracing, last BRACE_WARN seconds
  BRACE_WARN: 1.5, // seconds of HOLD_MAX left when the ring shifts to BRACE_LOW
  FAINT: "rgba(224, 176, 144, 0.45)", // dash, brace rest and HOLD_COOLDOWN: faint progress
};

// Bracing feel at an entry (HOLDING): camera strain, Ram's shoves, the arms overlay. Camera offsets are stage px
// (of 1280 x 720), arm offsets plate px (of 960 x 480). `fatigue` is 0 at the start of a brace and 1 at HOLD_MAX.
export const BRACE = {
  LEAN_ZOOM: 0.06, // held zoom while bracing (standing is 1.0)
  LUNGE_TIME: 0.24, // seconds, the push-in when the brace starts
  LUNGE_ZOOM: 0.045, // extra zoom at the peak of the push-in
  LUNGE_PX: 10, // the camera dips down this much at the peak
  RELAX_TIME: 0.4, // seconds, the relax-back on release
  RELAX_ZOOM: -0.025, // zoom dip at the peak of the relax-back
  RELAX_PX: -8, // the camera rises a little while relaxing
  SWAY_PX: 2.5, // slow straining sway at fatigue 0
  SWAY_HZ: 0.7,
  TREMOR_PX: 0.9, // fine muscle tremor at fatigue 0
  TREMOR_HZ: 9,
  FATIGUE_GAIN: 2.5, // sway and tremor are multiplied by (1 + FATIGUE_GAIN * fatigue)
  PUSH_PERIOD: 0.85, // seconds between Ram's shoves while his tell is up at the braced entry
  PUSH_PX: 12, // the camera is knocked back (up) this much at the peak of a shove
  PUSH_ZOOM: -0.02, // and pulled back from the door
  PUSH_ROT: 0.008, // radians, alternating sides
  PUSH_TREMOR: 2.2, // extra tremor px while he pushes
  REPEL_PUSH: 2, // final shove relative to the ordinary shove
  REPEL_SETTLE: 0.24, // seconds to settle after the final shove
  ARMS_EASE: 16, // per second, arms sliding in on press and out on release
  ARMS_DROP: 240, // plate px the arms start below their pose (off the bottom of the frame)
  ARMS_SLIP: 9, // plate px the hands slip down at fatigue 1
  ARMS_PUSH: 7, // plate px the arms are shoved down by each push
  ARMS_TREMOR: 0.6, // the arms shake this many times the camera tremor on top (in plate px), so they work against the door
};

// In the final desk plate (960 x 480), the lower tabletop starts at y 431. The paper centers sit left of
// the keyboard. Width and height describe the paper before foreshortening.
export const ARTIFACTS = {
  clipping: { slot: "artifact_clipping", label: "Newspaper clipping", paper: { x: 280, y: 447, w: 94, h: 103 }, tilt: -6 },
  calendar: { slot: "artifact_calendar", label: "Leaving calendar", paper: { x: 279, y: 448, w: 100, h: 77 }, tilt: 5 },
  notebook: { slot: "artifact_notebook", label: "Daniel Vale's diary", paper: { x: 282, y: 448, w: 76, h: 101 }, tilt: -3 },
} satisfies Record<DeskArtifact, { slot: string; label: string; paper: { x: number; y: number; w: number; h: number }; tilt: number }>;

// The silent breach scare (GAME_LOGIC 7.7 and 5.4), real seconds.
export const SCARE = {
  SNAP_TIME: 0.15, // presentation only, turn to an off-camera breach
  FLASH_TIME: 0.4, // the creepy full-frame flash of Ram inside the lit entry, before the jumpscare (0.3 to 0.5)
  FRAME_TIME: 0.11, // each of the four jumpscare frames; the last one holds
  HOLD_TIME: 0.75, // the last frame stays up this long before the loss screen
};

// CHUD's malicious smile (lock refusals, sabotage, forced light cuts in JEALOUS and FURIOUS), real seconds.
export const MALICE = {
  REFUSE_TIME: 1.5,
  SABOTAGE_TIME: 1.0,
  LIGHT_CUT_TIME: 0.9,
};

// Kill-code papers (always on, unlike ARTIFACTS). Plate px (960 x 480). Collected papers lie on the desk slab (slab
// y 372 to 428, keyboard from x 356, mouse pad x 645 to 768 below y 429): two either side of the keyboard, inside
// x 130 to 830 so they stay in view at the usual pan, clear of the terminal (the monitor ends at y 342). Only the
// papers in engine.papersOnDesk() are drawn, so they pile up. Paper i shows engine.paperChar(i).
export const CODE_PAPERS: { id: string; label: string; rect: { x: number; y: number; w: number; h: number }; tilt: number; line: string }[] = [
  { id: "paper0", label: "Scrawled paper 1", rect: { x: 150, y: 382, w: 46, h: 36 }, tilt: -5, line: "it hears everything. keep this." },
  { id: "paper1", label: "Scrawled paper 2", rect: { x: 226, y: 386, w: 46, h: 36 }, tilt: 4, line: "i am not the one at your door." },
  { id: "paper2", label: "Scrawled paper 3", rect: { x: 634, y: 380, w: 46, h: 36 }, tilt: 3, line: "the boat is real. it will not let you take it." },
  { id: "paper3", label: "Scrawled paper 4", rect: { x: 702, y: 385, w: 46, h: 36 }, tilt: -4, line: "all four. into the machine. before light." },
];

// The slip Ram leaves at an entry (engine.floorPaper()). One rect per view, chosen by where the player is: `view` is the
// desk-facing plate (view_<entry>_*), `hold` the close-up plate (hold_<entry>_*). Placed by eye on the final plates:
// window: the floor under the glass / the sill in the close-up; hatch: the boards in front of the hatch panel / the
// lower right of the panel; balcony: the floor by the door / the foot of the door. Rendered dim, brighter in the entry's light.
type PlateRect = { x: number; y: number; w: number; h: number; tilt: number };
export const FLOOR_PAPER: Record<"WINDOW" | "HATCH" | "BALCONY", { view: PlateRect; hold: PlateRect }> = {
  WINDOW: { view: { x: 330, y: 372, w: 54, h: 34, tilt: -8 }, hold: { x: 380, y: 345, w: 120, h: 70, tilt: -6 } },
  HATCH: { view: { x: 500, y: 372, w: 50, h: 30, tilt: 6 }, hold: { x: 640, y: 335, w: 120, h: 76, tilt: 5 } },
  BALCONY: { view: { x: 560, y: 410, w: 50, h: 30, tilt: -5 }, hold: { x: 300, y: 352, w: 120, h: 62, tilt: 4 } },
};
