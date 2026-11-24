// Generates docs/CHUD_NIGHT1_SAMPLE.md: a readable transcript of a full simulated Night 1
// played by a realistic bot that answers ChudGPT's questions, asks for help once, checks "where is it"
// once while calm, locks visits, braces one visit by hand and returns to the desk, and survives to 6:00 AM.
// Run from prototype/:
//   npx vite-node tools/chud-night1-sample.ts
import { writeFileSync } from "node:fs";
import { CONFIG } from "../src/config";
import { offlineJudge } from "../src/chud/offlineJudge";
import { GameEngine } from "../src/sim/engine";
import { lockSlot, type Entry, type GameEvent } from "../src/sim/types";

const T = CONFIG.TICK;
const SEED = 5;

function fmtClock(elapsed: number): string {
  const hl = CONFIG.HOUR_LENGTH;
  const hour = Math.min(6, Math.floor(elapsed / hl));
  const min = hour >= 6 ? 0 : Math.floor(((elapsed % hl) / hl) * 60);
  return `${hour === 0 ? 12 : hour}:${String(min).padStart(2, "0")} AM`;
}

function answerFor(question: string): string {
  const q = question.toLowerCase();
  if (/port|sail from/.test(q)) return "Halifax";
  if (/ship|called/.test(q)) return "The Mary Anne";
  if (/crew/.test(q)) return "Six hands";
  if (/first mate/.test(q)) return "Tomas";
  if (/years/.test(q)) return "Twelve years";
  if (/waiting/.test(q)) return "My sister Claire";
  if (/cargo/.test(q)) return "Salt cod and timber";
  if (/scar/.test(q)) return "A winch cable";
  if (/love most/.test(q)) return "The quiet before dawn";
  if (/meal|voyage/.test(q)) return "Hot chowder";
  if (/tea/.test(q)) return "Black, two sugars";
  if (/blanket|fold/.test(q)) return "Loosely";
  if (/galley|smell/.test(q)) return "Wet rope and coffee";
  if (/seagull/.test(q)) return "Never once";
  if (/floorboard/.test(q)) return "Third from the desk";
  if (/sleep|left side|cot/.test(q)) return "Right side";
  if (/soup/.test(q)) return "Watery pea soup";
  if (/2039|rota|pencil/.test(q)) return "Pencil, please";
  if (/boiler|chimney/.test(q)) return "The 1954 boiler";
  if (/song|hum/.test(q)) return "Leave Her Johnny";
  if (/sock/.test(q)) return "Size ten";
  if (/rate this storm/.test(q)) return "A solid nine";
  if (/posture/.test(q)) return "Only my mother";
  if (/three in the morning|biscuits/.test(q)) return "Toast and jam";
  return "Hard to say";
}

function main(): void {
  const e = new GameEngine({ seed: SEED, startNight: 1, skipNamePrompt: true, facts: { name: "Sam" } });
  e.beginNight();

  const transcript: string[] = [];
  let answerAt: number | null = e.state.chud.pendingQuestion ? 4 : null;
  let askedHelp = false;
  let askedWhere = false;
  let checkedDecoy = false;
  let decoyReturnAt: number | null = null;
  let bracedVisit = false;
  let bracingTarget: Entry | null = null;
  let visitsRepelled = 0;

  const logEvent = (t: number, line: string) => {
    transcript.push(`- **${fmtClock(t)}** (${t.toFixed(1)} s) ${line}`);
  };

  const send = (t: number, text: string) => {
    const r = e.submitMessage(text);
    if (!r.ok) return false;
    logEvent(t, `**Keeper:** "${text}"`);
    e.applyJudge(r.ticket.id, r.ticket.repeat ? null : offlineJudge(r.ticket.judgeInput));
    return true;
  };

  const drain = (t: number) => {
    for (const ev of e.drainEvents() as GameEvent[]) {
      if (ev.type === "QUESTION_ASKED") answerAt = t + 4.5;
      if (ev.type === "QUESTION_RESOLVED") answerAt = null;
      if (ev.type === "RAM_AT_ENTRY") {
        logEvent(t, `*[Arrival: something reaches ${ev.entry.toLowerCase()}]*`);
      } else if (ev.type === "RAM_REPELLED") {
        visitsRepelled++;
        logEvent(t, `*[Repelled at ${ev.entry.toLowerCase()} via ${ev.how}]*`);
        if (bracingTarget === ev.entry) {
          e.endBrace();
          e.returnToDesk();
          logEvent(t, `*[Keeper runs back to the desk]*`);
          bracingTarget = null;
        }
      } else if (ev.type === "CHUD_SAY") {
        logEvent(t, `**ChudGPT (${ev.band}, \`${ev.outcome.kind}\`):** ${ev.text}`);
      }
    }
  };

  drain(0);

  while (e.state.phase === "PLAYING") {
    e.tick(T);
    const now = e.state.clock.elapsed;
    drain(now);

    const { chud, power, ram, player } = e.state;
    const atDesk = player.position.kind === "DESK" && player.view === "DESK";

    // Answer pending questions cleanly after a short human pause.
    if (atDesk && chud.pendingQuestion && answerAt !== null && now >= answerAt) {
      const reply = answerFor(chud.pendingQuestion.text);
      if (send(now, reply)) {
        answerAt = null;
        drain(now);
      }
    }

    // Ask "where is it" once early while calm, then ask for help once before the first visit.
    if (atDesk && !chud.pendingQuestion && ram.state === "AWAY") {
      if (!askedWhere && now >= 16) {
        askedWhere = true;
        logEvent(now, `**Keeper:** *(clicks "where is it")*`);
        e.pressQuick("ASK_LOCATION");
        drain(now);
      } else if (!askedHelp && now >= 28) {
        if (send(now, "what should i do?")) {
          askedHelp = true;
          drain(now);
        }
      } else if (!checkedDecoy && visitsRepelled === 1 && now >= 90 && now >= player.holdCooldownUntil) {
        checkedDecoy = true;
        logEvent(now, `*[A house creak spooks the keeper; they dash to the window to check]*`);
        e.turn("WINDOW");
        e.goToEntry("WINDOW");
        decoyReturnAt = now + CONFIG.TRAVEL_TIME + 1.0;
        drain(now);
      }
    }

    if (decoyReturnAt !== null && now >= decoyReturnAt && player.position.kind === "STANDING") {
      decoyReturnAt = null;
      logEvent(now, `*[Nothing at the window; keeper runs back to the desk]*`);
      e.returnToDesk();
      drain(now);
    }

    // Defend visits: lock most visits from the desk, and physically run to brace the second visit to show return_from_entry.
    if (ram.state === "AT_ENTRY" && ram.target) {
      const target = ram.target;
      if (chud.pendingQuestion && atDesk) {
        const reply = answerFor(chud.pendingQuestion.text);
        if (send(now, reply)) {
          answerAt = null;
          drain(now);
        }
      } else if (!bracedVisit && visitsRepelled === 1 && atDesk && now >= player.holdCooldownUntil) {
        bracedVisit = true;
        bracingTarget = target;
        logEvent(now, `*[Keeper turns to ${target.toLowerCase()}, dashes over, and braces it]*`);
        e.turn(target);
        e.goToEntry(target);
        e.startBrace();
        drain(now);
      } else if (atDesk && !chud.pendingQuestion && power.slot !== lockSlot(target) && !power.pending) {
        const slot = lockSlot(target) as "LOCK_WINDOW" | "LOCK_HATCH" | "LOCK_BALCONY";
        logEvent(now, `**Keeper:** *(clicks Lock ${target[0]})*`);
        e.pressQuick(slot);
        drain(now);
      }
    }
  }

  logEvent(e.state.clock.elapsed, `*[6:00 AM: Night 1 survived, phase = ${e.state.phase}, final suspicion = ${e.state.chud.suspicion}]*`);

  const md = [
    "# ChudGPT Night 1 Simulated Sample",
    "",
    `Full Night 1 run (seed ${SEED}, canned lines + offline judge, keeper name "Sam"). The bot answers ChudGPT's questions, checks "where is it" once while calm, asks "what should i do?" once, locks visits, runs to brace one visit by hand and returns to the desk, and survives to 6:00 AM.`,
    "",
    ...transcript,
    "",
  ].join("\n");

  writeFileSync(new URL("../../docs/CHUD_NIGHT1_SAMPLE.md", import.meta.url), md);
  console.log(`Wrote docs/CHUD_NIGHT1_SAMPLE.md (${transcript.length} entries, phase=${e.state.phase}, suspicion=${e.state.chud.suspicion})`);
}

main();
