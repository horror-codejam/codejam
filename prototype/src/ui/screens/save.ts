import { CONFIG } from "../../config";
import type { GameState } from "../../sim/types";

export const SAVE_KEY = "the-keeper.checkpoint.v1";
// killCode and papersCheckpoint are optional so older saves (night and facts only) still load.
export type SavedRun = Pick<GameState["run"], "night" | "factsCheckpoint"> & { killCode?: string; papersCheckpoint?: number };

export function readSave(): SavedRun | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (!value || typeof value !== "object" || !("night" in value) || !("factsCheckpoint" in value)) return null;
    const { night, factsCheckpoint } = value;
    if (typeof night !== "number" || !Number.isInteger(night) || night < 1 || night > CONFIG.nights.length) return null;
    if (!factsCheckpoint || typeof factsCheckpoint !== "object" || Array.isArray(factsCheckpoint)) return null;
    const facts = Object.entries(factsCheckpoint);
    if (facts.some(([, answer]) => typeof answer !== "string")) return null;
    const out: SavedRun = { night, factsCheckpoint: Object.fromEntries(facts) };
    const extra = value as { killCode?: unknown; papersCheckpoint?: unknown };
    if (typeof extra.killCode === "string" && extra.killCode.length === 4) out.killCode = extra.killCode;
    if (typeof extra.papersCheckpoint === "number" && Number.isInteger(extra.papersCheckpoint) && extra.papersCheckpoint >= 0 && extra.papersCheckpoint <= 4) {
      out.papersCheckpoint = extra.papersCheckpoint;
    }
    return out;
  } catch {
    return null;
  }
}

export function writeSave({ night, factsCheckpoint, killCode, papersCheckpoint }: SavedRun): void {
  try {
    if ((readSave()?.night ?? 0) > night) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ night, factsCheckpoint, killCode, papersCheckpoint }));
  } catch {
    // Gameplay still works when the browser blocks storage.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage may be unavailable in restricted browser sessions.
  }
}
