// UI-only tuning knobs for the edge controls (docs/CONTROLS_PROPOSAL.md, branch proto/v3-controls-edge).
// Not game rules: nothing in src/sim reads this file. Game timers (TRAVEL_TIME, HOLD_MAX, HOLD_COOLDOWN, BRACE_REST) stay in config.ts.

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
  SIZE: 32, // screen px, diameter (kept the same at any window size)
  STROKE: 3, // screen px
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
  ARMS_EASE: 16, // per second, arms sliding in on press and out on release
  ARMS_DROP: 240, // plate px the arms start below their pose (off the bottom of the frame)
  ARMS_SLIP: 9, // plate px the hands slip down at fatigue 1
  ARMS_PUSH: 7, // plate px the arms are shoved down by each push
  ARMS_TREMOR: 0.6, // the arms shake this many times the camera tremor on top (in plate px), so they work against the door
};
