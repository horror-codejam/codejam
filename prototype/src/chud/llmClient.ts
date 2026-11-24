// Browser side of the /api server. Every call has a 2.5 s budget (GAME_LOGIC.md section 9);
// on any failure the caller falls back to the offline judge or the canned line.

import type { Band, JudgeInput, JudgeResult } from "../sim/types";

const TIMEOUT_MS = 2500;

export const llm = {
  available: false, // server has a key (from /api/health)
  enabled: true, // dev panel toggle
  get on(): boolean {
    return this.available && this.enabled;
  },
};

export async function checkLlm(): Promise<boolean> {
  try {
    const r = await fetch("/api/health", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    llm.available = r.ok && (await r.json()).llm === true;
  } catch {
    llm.available = false;
  }
  return llm.available;
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function judgeRemote(input: JudgeInput): Promise<JudgeResult | null> {
  const r = await post<{ result: JudgeResult }>("/api/judge", { input });
  return r?.result ?? null;
}

export interface VoiceAsk {
  kind: string;
  pass?: boolean;
  qtype?: string;
  canned: string;
  band: Band;
  name: string;
  night: number;
  recent: string[];
}

// CHUD never names Ram (GAME_LOGIC 8.10). Checked again here so no server reply can slip it onto the screen.
const FORBIDDEN_NAME_RE = /\bram\b|\baltman\b/i;

export async function voiceRemote(ask: VoiceAsk): Promise<string | null> {
  const safe: VoiceAsk = { ...ask, name: FORBIDDEN_NAME_RE.test(ask.name) ? "" : ask.name };
  const r = await post<{ text: string }>("/api/voice", safe);
  const text = r?.text ?? null;
  return text && !FORBIDDEN_NAME_RE.test(text) ? text : null;
}

// Outcomes CHUD words with the LLM. Urgent replies and scripted lines stay canned.
export const VOICED = new Set([
  "small_talk",
  "warm_reply",
  "rude_reply",
  "leaving_reply",
  "answer_ack",
  "manipulation_hurt",
  "offensive_deflect",
]);
