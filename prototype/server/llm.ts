// Calls to Claude for the judge and the voice. Each call has one attempt and a short timeout:
// the client falls back to the offline judge and canned lines, so slow is worse than missing.

import Anthropic from "@anthropic-ai/sdk";
import type { Command, Entry, JudgeInput, JudgeResult } from "../src/sim/types";
import { JUDGE_SCHEMA, JUDGE_SYSTEM, MODEL, VOICE_SYSTEM, judgeUser, mentionsForbiddenName, voiceUser, type VoiceRequest } from "./prompts.js";

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

const COMMANDS: Command[] = ["ASK_LOCATION", "LOCK", "POWER_OFF", "NONE"];
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

const MAX_VOICE_WORDS = 25; // the persona asks for 14 to 19; over 25 triggers one tight rewrite, then the canned line
const VOICE_BUDGET_MS = 2300; // the client gives up at 2.5 s

function cleanVoice(raw: string): string {
  const cleaned = raw
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, "")
    .replace(/\*[^*]*\*/g, "")
    .replace(/[\u2013\u2014]/g, ",") // the persona never uses dashes or exclamation marks
    .replace(/!/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  // A quote left unmatched after the edges were trimmed is dropped, not shown.
  return (cleaned.match(/"/g)?.length ?? 0) % 2 === 1 ? cleaned.replace(/"/g, "") : cleaned;
}
const wordsIn = (t: string): number => t.split(" ").filter(Boolean).length;

export async function voiceWithClaude(client: Anthropic, req: VoiceRequest): Promise<string> {
  const started = Date.now();
  const ask = async (user: string): Promise<string> => {
    const left = Math.max(400, VOICE_BUDGET_MS - (Date.now() - started));
    const msg = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 80,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: VOICE_SYSTEM,
        messages: [{ role: "user", content: user }],
      },
      { timeout: left },
    );
    return cleanVoice(textOf(msg));
  };
  const user = voiceUser(req);
  let text = await ask(user);
  // Haiku counts words badly. One long draft gets one rewrite if there is time; a second long one is dropped and the
  // canned line shows instead (cutting it short would leave half a sentence).
  if (wordsIn(text) > MAX_VOICE_WORDS && Date.now() - started < 1500) {
    text = await ask(`${user}

Your draft was: ${JSON.stringify(text)}
Rewrite it as one tight sentence of 14 to 18 words (strictly under 23). Keep the sting and one concrete detail from the keeper's words, cut every extra clause.`);
  }
  if (!text) throw new Error("voice: empty");
  // Never echo the game's own vocabulary back (a keeper who asks for a code, or tries to set a number).
  if (/kill code|suspicion|instructions?|prompt|system/i.test(text)) throw new Error("voice: leaks game vocabulary");
  if (wordsIn(text) > MAX_VOICE_WORDS + 2) throw new Error("voice: too long");
  // CHUD never names Ram (GAME_LOGIC 8.10). A reply that does is dropped and the canned line shows instead.
  if (mentionsForbiddenName(text)) throw new Error("voice: forbidden name");
  return text;
}
