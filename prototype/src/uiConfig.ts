// UI-only tuning knobs for the edge controls (docs/CONTROLS_PROPOSAL.md, branch proto/v3-controls-edge).
// Not game rules: nothing in src/sim reads this file. Game timers (TRAVEL_TIME, HOLD_MAX, HOLD_COOLDOWN) stay in config.ts.

export const CONTROLS = {
  EDGE_DWELL: 0.3, // real seconds the mouse must stay in an edge zone before the turn fires
  EDGE_ZONE_SIDE: 70, // stage px (of 1280) from the left or right edge of the stage
  EDGE_ZONE_BOTTOM: 40, // stage px (of 720) from the bottom edge; kept thin so it stays below the terminal's quick buttons
  TURN_TIME: 0.25, // seconds, slide between DESK and WINDOW or HATCH (GAME_LOGIC 6.1)
  TURN_TIME_BALCONY: 0.4, // seconds, the longer turn around to the BALCONY and back
  TURN_BLUR: 24, // peak horizontal motion blur during a turn (BlurFilter strength)
  TURN_DIM: 0.35, // peak darkening in the middle of a turn (0..1)
};
