// Edge turning (docs/CONTROLS_PROPOSAL.md): hold the mouse in a stage edge zone for EDGE_DWELL to turn.
// UI only: it reports the view to turn to, main.ts calls engine.turn().

import type { View } from "../sim/types";
import { CONTROLS } from "../uiConfig";
import { H, W } from "./layout";

export type Edge = "left" | "right" | "bottom";
export const EDGES: Edge[] = ["left", "right", "bottom"];

// Which edge leads where from each view. WINDOW and HATCH return by the opposite edge, BALCONY by the bottom again.
export const EDGE_TARGET: Record<View, Partial<Record<Edge, View>>> = {
  DESK: { left: "WINDOW", right: "HATCH", bottom: "BALCONY" },
  WINDOW: { right: "DESK" },
  HATCH: { left: "DESK" },
  BALCONY: { bottom: "DESK" },
};

export class EdgeTurner {
  private x = W / 2; // mouse in stage px, clamped to the stage (so the letterbox counts as the edge)
  private y = H / 2;
  private overControl = false; // over a button or input: never turn while aiming at a control
  private lastView: View | null = null;
  private armed = true; // false after a turn until the mouse leaves every edge zone
  private since = 0;
  active: Edge | null = null; // the zone the dwell is running in
  progress = 0; // 0..1 through the dwell, for the indicator

  constructor(stage: HTMLElement) {
    window.addEventListener("mousemove", (ev) => {
      const r = stage.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      this.x = clamp(((ev.clientX - r.left) / r.width) * W, 0, W);
      this.y = clamp(((ev.clientY - r.top) / r.height) * H, 0, H);
      this.overControl = ev.target instanceof Element && !!ev.target.closest("button, input");
    });
  }

  private zoneFor(view: View): Edge | null {
    if (this.overControl) return null;
    const to = EDGE_TARGET[view];
    if (to.left && this.x <= CONTROLS.EDGE_ZONE_SIDE) return "left";
    if (to.right && this.x >= W - CONTROLS.EDGE_ZONE_SIDE) return "right";
    if (to.bottom && this.y >= H - CONTROLS.EDGE_ZONE_BOTTOM) return "bottom";
    return null;
  }

  // Call once a frame with real time. Returns the view to turn to when a dwell completes.
  update(view: View, enabled: boolean, t: number): View | null {
    if (view !== this.lastView) {
      this.lastView = view;
      this.armed = false; // the mouse is probably still in the zone that caused this turn
    }
    const zone = this.zoneFor(view);
    if (zone === null) this.armed = true;
    if (!enabled || !this.armed || zone === null) {
      this.active = null;
      this.progress = 0;
      return null;
    }
    if (zone !== this.active) {
      this.active = zone; // entering a zone (or switching zones) restarts the dwell
      this.since = t;
    }
    this.progress = Math.min(1, (t - this.since) / CONTROLS.EDGE_DWELL);
    if (this.progress < 1) return null;
    this.armed = false;
    this.active = null;
    this.progress = 0;
    return EDGE_TARGET[view][zone] ?? null;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
