// Calls to Claude for the judge and the voice. Each call has one attempt and a short timeout:
// the client falls back to the offline judge and canned lines, so slow is worse than missing.

import Anthropic from "@anthropic-ai/sdk";
import type { Command, Entry, JudgeInput, JudgeResult } from "../src/sim/types";
import { JUDGE_SCHEMA, JUDGE_SYSTEM, MODEL, VOICE_SYSTEM, judgeUser, voiceUser, type VoiceRequest } from "./prompts";

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 0, timeout: 2400 });
}

function textOf(msg: Anthropic.Message): string {
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const COMMANDS: Command[] = ["ASK_LOCATION", "LOCK", "BEAM", "POWER_OFF", "NONE"];
const ENTRIES: Entry[] = ["WINDOW", "HATCH", "BALCONY"];
const FLAGS = ["answered_question", "contradiction", "mentions_leaving", "rude", "manipulation", "warm", "gibberish", "offensive", "self_harm"] as const;

export async function judgeWithClaude(client: Anthropic, input: JudgeInput): Promise<JudgeResult> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: judgeUser(input) }],
  });
  const raw = JSON.parse(textOf(msg)) as Record<string, unknown>;
  const out = {} as JudgeResult;
  for (const f of FLAGS) {
    if (typeof raw[f] !== "boolean") throw new Error(`judge: bad ${f}`);
    out[f] = raw[f] as boolean;
  }
  const cmd = raw.command_hint as Command;
  out.command_hint = COMMANDS.includes(cmd) ? cmd : "NONE";
  const entry = raw.entry_hint as Entry;
  out.entry_hint = ENTRIES.includes(entry) ? entry : null;
  const q = input.pendingQuestion;
  const value = typeof raw.new_fact_value === "string" ? raw.new_fact_value.trim().slice(0, 60) : "";
  out.new_fact = q && q.type === "SEED" && q.factKey && value && out.answered_question ? { key: q.factKey, value } : null;
  return out;
}

export async function voiceWithClaude(client: Anthropic, req: VoiceRequest): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 120,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system: VOICE_SYSTEM,
    messages: [{ role: "user", content: voiceUser(req) }],
  });
  const text = textOf(msg)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\*[^*]*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  if (!text) throw new Error("voice: empty");
  return text;
}
