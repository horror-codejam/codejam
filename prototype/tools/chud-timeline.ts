// Seeded timeline of every ChudGPT line on a night, played by a bot. Run from prototype/:
//   npx vite-node tools/chud-timeline.ts > tools/chud-timeline.out.md
// The bot locks every visit, answers each question 4 s after it is asked, and (the chatty bot) types a reply 4 s after a
// reaction, at most twice in a row and then 25 s of nothing to say (a person runs out). The quiet bot only answers questions. The report ends with the pacing checks of GAME_LOGIC 8.10.
import { CONFIG } from "../src/config";
import { offlineJudge } from "../src/chud/offlineJudge";
import { wordCount } from "../src/chud/lines";
import { GameEngine } from "../src/sim/engine";
import { lockSlot, type GameEvent } from "../src/sim/types";

type Row = { t: number; cls: string; kind: string; band: string; calm: boolean; ram: string; text: string; unprompted: boolean; origin?: string };

function playNight(night: number, seed: number, chatty: boolean): { rows: Row[]; outcome: string; limit: number; calmGaps: [number, number][] } {
  const e = new GameEngine({ seed, startNight: night, skipNamePrompt: true, facts: { name: "Sam" } });
  e.beginNight();
  const rows: Row[] = [];
  const T = CONFIG.TICK;
  let answerAt: number | null = null;
  let replyAt: number | null = null;
  let typingFrom: number | null = null;
  let n = 0;
  let chain = 0; // chat replies in a row
  let silentUntil = 0;
  const calmGaps: [number, number][] = [];
  let lastLineAt = 0;
  let calmSince: number | null = 0; // start of the current uninterrupted calm stretch since the last line
  const send = (text: string) => {
    const r = e.submitMessage(text);
    if (r.ok) e.applyJudge(r.ticket.id, r.ticket.repeat ? null : offlineJudge(r.ticket.judgeInput));
    return r.ok;
  };
  while (e.state.phase === "PLAYING") {
    e.tick(T);
    const now = e.state.clock.elapsed;
    const ram = e.state.ram.state;
    const calm = ram === "AWAY" || ram === "RETREATING";
    if (!calm) calmSince = null;
    else if (calmSince === null) calmSince = now;
    for (const ev of e.drainEvents() as GameEvent[]) {
      if (ev.type === "QUESTION_ASKED") answerAt = now + 4;
      if (ev.type === "QUESTION_RESOLVED") answerAt = null;
      if (ev.type !== "CHUD_SAY") continue;
      if (calmSince !== null && now - lastLineAt > 0) calmGaps.push([lastLineAt, now]);
      lastLineAt = now;
      calmSince = calm ? now : null;
      rows.push({
        t: now, cls: ev.lineClass, kind: ev.outcome.kind, band: ev.band, calm, ram, text: ev.text, unprompted: ev.unprompted,
        origin: ev.outcome.kind === "question" ? e.state.chud.pendingQuestion?.origin : undefined,
      });
      if (chatty && ev.lineClass === "reaction" && ev.outcome.kind !== "question_timeout" && now >= silentUntil) {
        replyAt = now + 4;
        typingFrom = now + 2;
      }
    }
    // The bot's typing is reported to the engine from 2 s before it sends.
    e.setTyping(typingFrom !== null && now >= typingFrom && replyAt !== null);
    if (answerAt !== null && now >= answerAt && e.state.chud.pendingQuestion) {
      if (send(e.state.chud.pendingQuestion.type === "STAY" ? "yes I will stay" : `Halifax ${n++}`)) answerAt = null;
    } else if (replyAt !== null && now >= replyAt) {
      if (send(`that is kind of you ${n++}`)) {
        replyAt = null;
        typingFrom = null;
        if (++chain >= 2) {
          chain = 0;
          silentUntil = now + 25;
        }
      }
    }
    // Defense: lock the target on arrival (answer a pending question first, it blocks commands).
    const { power, ram: r } = e.state;
    if (r.state === "AT_ENTRY" && r.target && power.slot !== lockSlot(r.target) && !power.pending) {
      if (e.state.chud.pendingQuestion) {
        if (send(`Halifax ${n++}`)) answerAt = null;
      } else e.pressQuick(lockSlot(r.target) as "LOCK_WINDOW" | "LOCK_HATCH" | "LOCK_BALCONY");
    }
  }
  const outcome = e.state.phase === "NIGHT_WON" ? "won" : `ended ${e.state.phase}${e.state.loss ? ` (${e.state.loss.cause})` : ""}`;
  return { rows, outcome, limit: CONFIG.QUIET_LIMIT[night - 1], calmGaps };
}

function report(title: string, night: number, seed: number, chatty: boolean): string {
  const { rows, outcome, limit, calmGaps } = playNight(night, seed, chatty);
  const out: string[] = [`## ${title}`, "", `Night ${night}, seed ${seed}, ${chatty ? "chatty" : "quiet"} bot. Result: ${outcome}. Quiet limit ${limit} s.`, "", "| t (s) | class | kind | band | ram | text |", "|---|---|---|---|---|---|"];
  for (const r of rows) out.push(`| ${r.t.toFixed(1)} | ${r.cls}${r.unprompted ? "" : " (reply)"} | ${r.kind} | ${r.band} | ${r.ram} | ${r.text.replace(/\|/g, "/")} |`);
  const problems: string[] = [];
  // 1. Two lines within 3 s, other than a reply plus an immediate info line.
  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i].t - rows[i - 1].t;
    if (dt < 3 && !(rows[i].cls === "info" || rows[i - 1].cls === "info" || rows[i].cls === "reaction")) problems.push(`two lines ${dt.toFixed(1)} s apart at ${rows[i].t.toFixed(1)}: ${rows[i - 1].kind} then ${rows[i].kind}`);
  }
  const closeInfo = rows.filter((r, i) => i > 0 && r.t - rows[i - 1].t < 3).map((r, i, arr) => r.t.toFixed(1));
  // 2. Two questions in a row (no other line between them).
  for (let i = 1; i < rows.length; i++) if (rows[i].kind === "question" && rows[i - 1].kind === "question") problems.push(`two questions in a row at ${rows[i].t.toFixed(1)}`);
  // 3. Question spacing.
  const qs = rows.filter((r) => r.kind === "question");
  for (let i = 1; i < qs.length; i++) if (qs[i].origin !== "QUIET" && qs[i].t - qs[i - 1].t < CONFIG.scheduledQuestionMinSpacing - 0.1) problems.push(`scheduled question ${(qs[i].t - qs[i - 1].t).toFixed(1)} s after the previous question at ${qs[i].t.toFixed(1)}`);
  // 4. Long lines during a visit.
  for (const r of rows) if (!r.calm && wordCount(r.text) > 16) problems.push(`long line (${wordCount(r.text)} words) during ${r.ram} at ${r.t.toFixed(1)}`);
  // 5. Quiet gaps over the limit while calm the whole gap (a keeper typing or an open question may add a few seconds).
  const overs = calmGaps.filter(([a, b]) => b - a > limit + CONFIG.PACING.UNPROMPTED_GAP);
  for (const [a, b] of overs) problems.push(`calm gap ${(b - a).toFixed(1)} s from ${a.toFixed(1)} to ${b.toFixed(1)} (limit ${limit})`);
  const maxCalm = calmGaps.reduce((m, [a, b]) => Math.max(m, b - a), 0);
  out.push("", `Lines: ${rows.length}. Questions: ${qs.length} (${qs.filter((q) => q.origin === "QUIET").length} light). Lines within 3 s of the previous one: ${closeInfo.length}. Longest all-calm gap between lines: ${maxCalm.toFixed(1)} s.`);
  out.push(problems.length ? `Problems:\n${problems.map((p) => `- ${p}`).join("\n")}` : "Checks: no unexpected pair of lines within 3 s, no two questions in a row, scheduled questions at least 45 s apart, no long line in a visit, no calm gap over the quiet limit plus 12 s.");
  out.push("");
  return out.join("\n");
}

const parts = [
  "# ChudGPT timeline (seeded, canned lines)",
  "",
  "Generated by tools/chud-timeline.ts. Reply means ChudGPT answered the keeper. Class: question, info, reaction (GAME_LOGIC 8.10).",
  "",
  report("Night 1, chatty bot", 1, 5, true),
  report("Night 1, quiet bot", 1, 5, false),
  report("Night 3, chatty bot", 3, 5, true),
  report("Night 3, quiet bot", 3, 5, false),
];
console.log(parts.join("\n"));
