// Seeded timeline of every ChudGPT line on a night, played by a bot. Run from prototype/:
//   npx vite-node tools/chud-timeline.ts > tools/chud-timeline.out.md
// Modes:
// - chatty: answers questions 4 s after asked, replies 4 s after reactions (up to 2 in a row, then 25 s quiet), locks visits.
// - quiet: only answers questions and locks visits.
// - where_help: only presses "where is it" twice early and asks one help question ("what should i do?"), locks visits.
// The report ends with the pacing checks of GAME_LOGIC 8.10.
import { CONFIG } from "../src/config";
import { offlineJudge } from "../src/chud/offlineJudge";
import { wordCount } from "../src/chud/lines";
import { GameEngine } from "../src/sim/engine";
import { lockSlot, type GameEvent } from "../src/sim/types";

type BotMode = "chatty" | "quiet" | "where_help";
type Row = { t: number; cls: string; kind: string; band: string; calm: boolean; ram: string; visitId: number; text: string; unprompted: boolean; origin?: string };
type CalmGap = { a: number; b: number; earlyNight1: boolean };

function playNight(night: number, seed: number, mode: BotMode): { rows: Row[]; outcome: string; limit: number; earlyLimit: number; calmGaps: CalmGap[] } {
  const e = new GameEngine({ seed, startNight: night, skipNamePrompt: true, facts: { name: "Sam" } });
  e.beginNight();
  const rows: Row[] = [];
  const T = CONFIG.TICK;
  let answerAt: number | null = e.state.chud.pendingQuestion && mode !== "where_help" ? 4 : null;
  let replyAt: number | null = null;
  let typingFrom: number | null = null;
  let n = 0;
  let chain = 0; // chat replies in a row
  let silentUntil = 0;
  let whereCount = 0;
  let helpAsked = false;
  const calmGaps: CalmGap[] = [];
  let lastLineAt = 0;
  let calmSince: number | null = 0; // start of the current uninterrupted calm stretch since the last line
  const send = (text: string) => {
    const r = e.submitMessage(text);
    if (r.ok) e.applyJudge(r.ticket.id, r.ticket.repeat ? null : offlineJudge(r.ticket.judgeInput));
    return r.ok;
  };
  const drain = (now: number) => {
    const ram = e.state.ram.state;
    const visitId = e.state.ram.visitId;
    const calm = ram === "AWAY" || ram === "RETREATING";
    for (const ev of e.drainEvents() as GameEvent[]) {
      if (ev.type === "QUESTION_ASKED" && mode !== "where_help") answerAt = now + 4;
      if (ev.type === "QUESTION_RESOLVED") answerAt = null;
      if (ev.type !== "CHUD_SAY") continue;
      if (calmSince !== null && now - lastLineAt > 0) {
        calmGaps.push({ a: lastLineAt, b: now, earlyNight1: night === 1 && visitId === 0 });
      }
      lastLineAt = now;
      calmSince = calm ? now : null;
      rows.push({
        t: now, cls: ev.lineClass, kind: ev.outcome.kind, band: ev.band, calm, ram, visitId, text: ev.text, unprompted: ev.unprompted,
        origin: ev.outcome.kind === "question" ? e.state.chud.pendingQuestion?.origin : undefined,
      });
      if (mode === "chatty" && ev.lineClass === "reaction" && ev.outcome.kind !== "question_timeout" && now >= silentUntil) {
        replyAt = now + 4;
        typingFrom = now + 2;
      }
    }
  };
  drain(0);
  while (e.state.phase === "PLAYING") {
    e.tick(T);
    const now = e.state.clock.elapsed;
    const ram = e.state.ram.state;
    const calm = ram === "AWAY" || ram === "RETREATING";
    if (!calm) calmSince = null;
    else if (calmSince === null) calmSince = now;
    drain(now);

    if (mode === "where_help") {
      // Mirrors the playtest report: press "where is it" twice early and ask "what should i do?" once.
      if (!e.state.chud.pendingQuestion) {
        if (whereCount === 0 && now >= 16) {
          e.pressQuick("ASK_LOCATION");
          whereCount++;
          drain(now);
        } else if (whereCount === 1 && now >= 20) {
          e.pressQuick("ASK_LOCATION");
          whereCount++;
          drain(now);
        } else if (!helpAsked && whereCount >= 2 && now >= 24) {
          if (send("what should i do?")) {
            helpAsked = true;
            drain(now);
          }
        }
      }
    } else {
      // The bot's typing is reported to the engine from 2 s before it sends.
      e.setTyping(typingFrom !== null && now >= typingFrom && replyAt !== null);
      if (answerAt !== null && now >= answerAt && e.state.chud.pendingQuestion) {
        if (send(e.state.chud.pendingQuestion.type === "STAY" ? "yes I will stay" : `Halifax ${n++}`)) {
          answerAt = null;
          drain(now);
        }
      } else if (replyAt !== null && now >= replyAt) {
        if (send(`that is kind of you ${n++}`)) {
          replyAt = null;
          typingFrom = null;
          drain(now);
          if (++chain >= 2) {
            chain = 0;
            silentUntil = now + 25;
          }
        }
      }
    }

    // Defense: lock the target on arrival (answer a pending question first if the bot answers questions).
    const { power, ram: r } = e.state;
    if (r.state === "AT_ENTRY" && r.target && power.slot !== lockSlot(r.target) && !power.pending) {
      if (e.state.chud.pendingQuestion) {
        if (mode !== "where_help" && send(`Halifax ${n++}`)) {
          answerAt = null;
          drain(now);
        }
      } else {
        e.pressQuick(lockSlot(r.target) as "LOCK_WINDOW" | "LOCK_HATCH" | "LOCK_BALCONY");
        drain(now);
      }
    }
  }
  const outcome = e.state.phase === "NIGHT_WON" ? "won" : `ended ${e.state.phase}${e.state.loss ? ` (${e.state.loss.cause})` : ""}`;
  return { rows, outcome, limit: CONFIG.QUIET_LIMIT[night - 1], earlyLimit: CONFIG.NIGHT1_EARLY_QUIET_LIMIT, calmGaps };
}

function report(title: string, night: number, seed: number, mode: BotMode): string {
  const { rows, outcome, limit, earlyLimit, calmGaps } = playNight(night, seed, mode);
  const label = mode === "where_help" ? "where-is-it + help bot" : `${mode} bot`;
  const limitNote = night === 1 ? `Early quiet limit ${earlyLimit} s (before first visit), then ${limit} s.` : `Quiet limit ${limit} s.`;
  const out: string[] = [`## ${title}`, "", `Night ${night}, seed ${seed}, ${label}. Result: ${outcome}. ${limitNote}`, "", "| t (s) | class | kind | band | ram | text |", "|---|---|---|---|---|---|"];
  for (const r of rows) out.push(`| ${r.t.toFixed(1)} | ${r.cls}${r.unprompted ? "" : " (reply)"} | ${r.kind} | ${r.band} | ${r.ram} | ${r.text.replace(/\|/g, "/")} |`);
  const problems: string[] = [];
  // 1. Two lines within 3 s, other than a reply plus an immediate info line.
  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i].t - rows[i - 1].t;
    if (dt < 3 && !(rows[i].cls === "info" || rows[i - 1].cls === "info" || rows[i].cls === "reaction")) problems.push(`two lines ${dt.toFixed(1)} s apart at ${rows[i].t.toFixed(1)}: ${rows[i - 1].kind} then ${rows[i].kind}`);
  }
  const closeInfo = rows.filter((r, i) => i > 0 && r.t - rows[i - 1].t < 3).map((r) => r.t.toFixed(1));
  // 2. Two questions in a row (no other line between them).
  for (let i = 1; i < rows.length; i++) if (rows[i].kind === "question" && rows[i - 1].kind === "question") problems.push(`two questions in a row at ${rows[i].t.toFixed(1)}`);
  // 3. Question spacing.
  const qs = rows.filter((r) => r.kind === "question");
  for (let i = 1; i < qs.length; i++) if (qs[i].origin !== "QUIET" && qs[i].t - qs[i - 1].t < CONFIG.scheduledQuestionMinSpacing - 0.1) problems.push(`scheduled question ${(qs[i].t - qs[i - 1].t).toFixed(1)} s after the previous question at ${qs[i].t.toFixed(1)}`);
  // 4. Long lines during a visit.
  for (const r of rows) if (!r.calm && wordCount(r.text) > 16) problems.push(`long line (${wordCount(r.text)} words) during ${r.ram} at ${r.t.toFixed(1)}`);
  // 5. Quiet gaps over the limit while calm the whole gap.
  for (const g of calmGaps) {
    const gap = g.b - g.a;
    const cap = g.earlyNight1 ? earlyLimit + 2 : limit + CONFIG.PACING.UNPROMPTED_GAP;
    if (gap > cap) problems.push(`calm gap ${gap.toFixed(1)} s from ${g.a.toFixed(1)} to ${g.b.toFixed(1)} (cap ${cap.toFixed(1)})`);
  }
  const maxEarly = calmGaps.filter((g) => g.earlyNight1).reduce((m, g) => Math.max(m, g.b - g.a), 0);
  const maxCalm = calmGaps.reduce((m, g) => Math.max(m, g.b - g.a), 0);
  const earlySummary = night === 1 ? ` Longest Night 1 pre-visit calm gap: ${maxEarly.toFixed(1)} s.` : "";
  out.push("", `Lines: ${rows.length}. Questions: ${qs.length} (${qs.filter((q) => q.origin === "QUIET").length} light). Lines within 3 s of the previous one: ${closeInfo.length}. Longest all-calm gap between lines: ${maxCalm.toFixed(1)} s.${earlySummary}`);
  out.push(problems.length ? `Problems:\n${problems.map((p) => `- ${p}`).join("\n")}` : "Checks: no unexpected pair of lines within 3 s, no two questions in a row, scheduled questions at least 45 s apart, no long line in a visit, no calm gap over the limit.");
  out.push("");
  return out.join("\n");
}

const parts = [
  "# ChudGPT timeline (seeded, canned lines)",
  "",
  "Generated by tools/chud-timeline.ts. Reply means ChudGPT answered the keeper. Class: question, info, reaction (GAME_LOGIC 8.10).",
  "",
  report("Night 1, chatty bot", 1, 5, "chatty"),
  report("Night 1, quiet bot", 1, 5, "quiet"),
  report("Night 1, where-is-it + help bot", 1, 5, "where_help"),
  report("Night 3, chatty bot", 3, 5, "chatty"),
  report("Night 3, quiet bot", 3, 5, "quiet"),
];
console.log(parts.join("\n"));
