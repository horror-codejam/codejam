// The one place the UI asks for a judge verdict: Claude through /api/judge when the LLM is on,
// otherwise (or on any failure or timeout) the offline keyword judge, so the game always plays.

import type { JudgeInput, JudgeResult } from "../sim/types";
import { judgeRemote, llm } from "./llmClient";
import { offlineJudge } from "./offlineJudge";

export let lastJudgeSource: "llm" | "offline" = "offline";

export async function judge(input: JudgeInput): Promise<JudgeResult | null> {
  if (llm.on) {
    const r = await judgeRemote(input);
    if (r) {
      lastJudgeSource = "llm";
      return r;
    }
  }
  lastJudgeSource = "offline";
  try {
    return offlineJudge(input);
  } catch (err) {
    console.warn("judge failed", err);
    return null;
  }
}
