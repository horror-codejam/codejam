// Calls to Claude for the judge and the voice. Each call has one attempt and a short timeout:
// the client falls back to the offline judge and canned lines, so slow is worse than missing.

import Anthropic from "@anthropic-ai/sdk";
import type { Command, Entry, JudgeInput, JudgeResult } from "../src/sim/types";
import {
  JUDGE_SCHEMA,
  JUDGE_SYSTEM,
  MODEL,
  VOICE_SYSTEM,
  judgeUser,
  mentionsForbiddenName,
  planVoiceTurn,
  voiceUser,
  type VoiceRequest,
} from "./prompts.js";
import { RIVAL_LABELS, SHAPE_DIRECTIONS, SHAPE_LABELS, detectRivals, detectShape, hasThough, openingWord, summarizeRecentChud } from "./voiceStyle.js";

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

const MAX_VOICE_WORDS = 25; // the persona asks for 13 to 19; over 25 triggers one tight rewrite, then the canned line
const VOICE_BUDGET_MS = 2300; // the client gives up at 2.5 s
const REWRITE_CUTOFF_MS = 1550; // leave at least 750 ms if a single targeted rewrite is needed
const LEAK_RE = /kill code|suspicion|instructions?|prompt| system /i;
const LOCK_LIGHT_RE = /\block(ed)?\b|\bunlock|\bgenerator\b|\b(?<!first[ -])lights?\b/i;
const EXAMPLE_CLICHE_RE =
  /\b(settle deeper|stairs grow steep|stairwell draft|brass barometer|pipes? (start their )?sing|nothing warms a watch room|genuinely obliged|how generous of you|unscheduled complaints|pending departures|blue binder|weathervane gears|apologize to furniture|granite towers? average)\b/i;

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

function draftIssues(text: string, req: VoiceRequest): string[] {
  const issues: string[] = [];
  const plan = planVoiceTurn(req);
  const recent = summarizeRecentChud(req.recent);
  if (wordsIn(text) > MAX_VOICE_WORDS) {
    issues.push("Cut to one tight sentence of 13 to 18 words (strictly under 23).");
  }
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    issues.push("Combine into exactly one flowing sentence.");
  }
  if (LEAK_RE.test(text)) {
    issues.push("Remove every game or technical word (instructions, prompt, system, kill code, suspicion).");
  }
  if (LOCK_LIGHT_RE.test(text)) {
    issues.push("Do not mention locks, lights, or the generator.");
  }
  if (EXAMPLE_CLICHE_RE.test(text)) {
    issues.push("Do not copy phrases or props from the prompt examples; invent a fresh detail from the keeper's words.");
  }
  const cleanName = req.name.trim().toLowerCase();
  if (cleanName && openingWord(text) === cleanName) {
    issues.push("Never put the keeper's name first in the sentence.");
  }
  if (!plan.allowThough && hasThough(text)) {
    issues.push('Remove the word "though" and restructure the turn without it.');
  }
  const shape = detectShape(text);
  if (recent.lastShape && shape === recent.lastShape) {
    issues.push(`Change the shape from ${SHAPE_LABELS[shape]} to ${SHAPE_LABELS[plan.targetShape]}: ${SHAPE_DIRECTIONS[plan.targetShape]}`);
  }
  const open = openingWord(text);
  if (recent.lastOpening && open === recent.lastOpening) {
    issues.push(`Do not start with the word ${JSON.stringify(open)}.`);
  }
  const badRivals = detectRivals(text).filter((rv) => recent.rivals.includes(rv));
  if (badRivals.length) {
    const replacement = plan.suggestedRival ? `Use ${RIVAL_LABELS[plan.suggestedRival]} instead.` : "Drop the rival comparison completely.";
    issues.push(`Do not mention ${badRivals.map((rv) => RIVAL_LABELS[rv]).join(" or ")}. ${replacement}`);
  }
  return issues;
}

export async function voiceWithClaude(client: Anthropic, req: VoiceRequest): Promise<string> {
  const started = Date.now();
  const ask = async (user: string): Promise<string> => {
    const left = Math.max(400, VOICE_BUDGET_MS - (Date.now() - started));
    const msg = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 72,
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
  // One fast targeted rewrite if draft 1 is over length, leaks vocab, or repeats the previous shape/rival/opening/"though".
  const issues = draftIssues(text, req);
  if (issues.length > 0 && Date.now() - started < REWRITE_CUTOFF_MS) {
    try {
      const revised = await ask(`${user}

Your draft was: ${JSON.stringify(text)}
Fix every issue below in ONE tight sentence of 12 to 17 words MAX (strictly 20 words or fewer, drop extra clauses):
- ${issues.join("\n- ")}`);
      if (revised && draftIssues(revised, req).length <= issues.length) text = revised;
    } catch {
      // Keep draft 1 if the rewrite hits the time budget; the hard guards below still apply.
    }
  }
  if (!text) throw new Error("voice: empty");
  // Never echo the game's own vocabulary back (a keeper who asks for a code, or tries to set a number).
  if (LEAK_RE.test(text)) throw new Error("voice: leaks game vocabulary");
  if (wordsIn(text) > MAX_VOICE_WORDS + 2) throw new Error("voice: too long");
  // CHUD never names Ram (GAME_LOGIC 8.10). A reply that does is dropped and the canned line shows instead.
  if (mentionsForbiddenName(text)) throw new Error("voice: forbidden name");
  return text;
}
