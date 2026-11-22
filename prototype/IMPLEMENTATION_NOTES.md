# Implementation notes (prototype)

docs/GAME_LOGIC.md is the rule source. This file only records how the prototype fills gaps in it. If a note here conflicts with GAME_LOGIC.md, GAME_LOGIC.md wins and this note is a bug.

## Layout
- `src/config.ts`: every number. Engine code never hardcodes a tuning value.
- `src/sim/types.ts`: the shared contract (state, events, outcomes, engine interface).
- `src/sim/engine.ts`: `GameEngine implements IGameEngine`. Pure, no DOM, no wall-clock, no Math.random. All randomness through `Rng` seeded from `EngineOptions.seed`.
- `src/chud/parser.ts`: normalize and keyword command parser (section 9 steps 2 and 3).
- `src/chud/offlineJudge.ts`: keyword stand-in for the LLM judge, same schema.
- `src/chud/lines.ts`: canned lines, question banks, shouts, voice logs, radio text.

## Time
- `tick(dt)` advances in fixed `TICK` (0.05 s) steps. Every scheduled thing has an absolute due time in `elapsed`. Inside one step, resolve due events in the section 13 order: attempt end, 6:00 AM, question timeout, silence tick, scheduled question, sabotage roll. Other state moves (power relay landing, player travel ends, hold max, Ram APPROACHING to AT_ENTRY, fake-out, RETREATING to AWAY, AWAY to APPROACHING, reboot end, hour change) are resolved before that list in the same step, in this order: power relay landing, player travel and hold timers, Ram state transitions that are not attempt ends.
- A power switch counts only once landed. Relay landing is resolved before the attempt end in the same step, so a switch that lands exactly at the end moment counts.
- Hour = floor(elapsed / HOUR_LENGTH). Emit `HOUR` on change.

## Command timing (section 9)
- The keyword parser runs inside `submitMessage`. If it finds a command and no question is pending, the command resolves immediately (step 8, current band) and `commandRanImmediately = true`. The judge result applied later only does steps 6, 7 and 10, and never re-runs the command.
- If a question is pending, nothing resolves until `applyJudge`, which then runs steps 5 to 10 in order (answer first, then command), matching the edge case "answers a question and requests a lock in one message".
- If the parser found nothing, the command waits for the judge hint (step 5 merge).
- `applyJudge(id, null)` means judge failed or timed out: use `NEUTRAL_JUDGE`.
- Calling `applyJudge` after the night ended, or for an unknown ticket, is a no-op.

## Real messages and silence
- On submit, a non-repeat message resets `lastRealMessageAt` provisionally. If the judge then flags `gibberish`, restore the previous value, unless another message was submitted since.
- Repeat (normalized text matches any of the last `REPEAT_WINDOW` messages): no effects at all, no judge call needed, not a real message, CHUD says nothing. The message still enters the recent list.
- Empty after normalize: rejected with `EMPTY`.
- Silence ticks only while CHUD is online and phase is PLAYING. When CHUD comes back online (reboot end) or a night starts, the silence timer restarts from that moment.

## Messages and CHUD replies
- Exactly one `CHUD_SAY` per typed message at most, except that a command executed at submit time can be followed by one more line at judge time only for: manipulation_hurt, offensive_deflect, answer_ack, or a fact-related reply. Priority when picking the single line at judge time: offensive_deflect > manipulation_hurt > command outcome > answer_ack > leaving_reply > rude_reply > warm_reply > small_talk.
- Quick buttons never produce small talk. They produce exactly the command outcome.
- Gibberish produces no CHUD line.

## Questions
- Scheduled question times are planned at night start: `questionMix.length` due times drawn uniformly in `scheduledQuestionWindow`, sorted, at least `scheduledQuestionMinSpacing` apart (re-draw or push forward). Mix order is shuffled.
- A due scheduled question waits while any question is pending, and on nights 1 and 2 also while Ram is AT_ENTRY.
- SEED: pick an unused topic from `SEED_TOPICS` (a key not already in facts and not in usedSeedKeys). If none left, ask a STAY instead.
- MEMORY: pick a stored fact key other than `name`, preferring keys not checked yet this night. If no such fact, ask a SEED (section 8.5).
- STAY: random from `STAY_QUESTIONS`.
- Gate questions. HURT: a SEED if a topic is left, else a STAY. JEALOUS: a MEMORY on a stored fact (not `name`), else the HURT rule.
- Pass rules (section 8.5): SEED = `answered_question`. STAY = `answered_question` and not `mentions_leaving`. MEMORY = `answered_question` and not `contradiction`. If `answered_question` is false, the question stays pending, with one exception: a STAY question answered with `mentions_leaving` true fails even if `answered_question` is false.
- On SEED pass, store `new_fact` under the question's `factKey` (use the judge's value; ignore the judge's key). If `new_fact` is null, store the trimmed raw text, max 60 chars. Only if the key is new.
- Outside a SEED answer, a judge `new_fact` is stored only if its key is new.
- Name: `setName` stores fact `name` before night 1. It is part of the checkpoint.
- Radio question (night 2, 3:00 AM): origin SCRIPT, type SEED, topic `RADIO_TOPIC`. Asked immediately if no question is pending, otherwise queued and asked as soon as the slot is free (it beats scheduled questions).
- Timeout after `QUESTION_TIMEOUT`: +15 once. A gate timeout also cancels its lock request and CHUD says `gate_timeout`. Others say `question_timeout`.
- A lock request while a gate question is pending replaces the waiting entry (`gateFor`), same question and timer.

## Suspicion
- Per message: sum the section 8.2 deltas (leaving, manipulation, contradiction, answer failed, rude, offensive, answered or memory passed, warm), then clamp the sum to `MESSAGE_CLAMP`. Memory pass gives -15 instead of -10, never both.
- Warm -5 only if `WARM_BONUS_COOLDOWN` passed since the last warm bonus.
- Timer and script deltas are applied alone, not clamped by the per-message rule.
- Suspicion always stays within 0..100.
- Band: furiousActive ? FURIOUS : by number (0-39 WARM, 40-69 HURT, 70-99 JEALOUS). Reaching 100 while not furious starts an episode at once.
- During an episode, deltas still apply (clamped to 0..100) but the band stays FURIOUS until the episode ends, then suspicion = FURIOUS_RESET.
- Emit `SUSPICION` on every change and `BAND` on band change.

## CHUD rules by band (section 8.3)
- Always obeyed while online and not FURIOUS: POWER_OFF (slot to NONE after relay) and a lock of the entry already locked or already pending (confirm, no gate).
- Lock in WARM: execute. In HURT or JEALOUS: gate question (or replace the waiting entry if a gate is pending). FURIOUS: refuse.
- Beam: WARM, HURT, JEALOUS execute. FURIOUS refuses.
- Executing a lock or beam sets `power.pending` to land after `RELAY_DELAY`. A new request replaces an older pending one.
- When CHUD is offline, quick buttons and messages do nothing (messages rejected with CHUD_OFFLINE).

## Location claims (section 8.7)
- Ram AWAY or RETREATING: truthful "NONE" in every band except FURIOUS. In FURIOUS while AWAY, claim a random active entry.
- Ram APPROACHING or AT_ENTRY: first question this visit rolls lie with the band's lie chance (WARM 0, HURT and JEALOUS from the night table, FURIOUS 1). A lie names a random other active entry. Later questions this visit repeat the same answer. After a fake-out switch, the next question re-rolls once.
- A truthful claim during APPROACHING names the current target.
- Track `lastLocationClaim` and `log.visit.claimThisVisit` for the loss screen.

## Night 1 auto-warn
- Night 1, CHUD WARM and online, at APPROACHING start: CHUD says `approach_warning` with the true target. Counts as this visit's truthful claim.

## Sabotage (section 8.8)
- Checked every step after the other events. When all trigger conditions first hold during a visit, roll `SABOTAGE_CHANCE` once for that visit (`sabotageRolledVisit`). On success: power slot NONE now (no relay delay), cancel any pending switch, `lastSabotageHour` = current hour, emit SABOTAGE and POWER_CHANGED(cause sabotage), CHUD says `sabotage`, `log.visit.sabotaged = true`.

## Furious episode (section 8.9)
- Starts when suspicion reaches 100: furiousActive = true, emit FURIOUS_START, CHUD says `furious_start`. Covered visit = current visit if Ram is APPROACHING or AT_ENTRY, else the next visit.
- Cut: during the covered visit's AT_ENTRY, if not done and remaining window >= TRAVEL_TIME + SABOTAGE_MARGIN: power NONE now, cancel pending, emit FURIOUS_CUT, CHUD says `furious_cut`, `log.visit.furiousCut = true`. If the episode starts mid-window with too little time left, the cut moves to the next visit and the episode extends to cover it.
- Ends when the covered visit resolves (retreat) or at 6:00 AM: suspicion = FURIOUS_RESET, emit FURIOUS_END.
- Generator off ends the episode with no cut and no reset (reboot floor handles it).

## Holding (section 6.4)
- The GAME_LOGIC 6.4 flow (going, standing, bracing, returning) is implemented by `goToEntry`, `startBrace`, `endBrace` and `returnToDesk`, see "Controls (adopted)" below.
- Legacy API, kept because the engine tests use it and it still works: `startHold(entry)` allowed when phase PLAYING, position DESK, now >= holdCooldownUntil, and (view is DESK or view is that entry). Becomes TRAVELING until now + TRAVEL_TIME, then HOLDING. `backToDesk` only while HOLDING. The UI no longer calls it.
- A brace ends automatically when HOLD_MAX passes since HOLDING began (the player stays STANDING at the entry in the edge flow). If a brace of Ram's current target ends by HOLD_MAX while Ram is AT_ENTRY there, set `log.visit.armsGaveOut`.

## Generator kill switch (section 6.5)
- Off: slot NONE, pending switch cancelled, CHUD offline, pending question cancelled (no penalty, QUESTION_RESOLVED cancelled), queued radio question kept, furious episode ends with no cut.
- On: rebootingUntil = now + REBOOT_TIME. At reboot end: CHUD online, suspicion = max(current, REBOOT_SUSPICION_FLOOR), CHUD says `reboot_back`, silence timer restarts.
- Toggling off during a reboot cancels the reboot.
- Allowed only from position DESK (any view).

## Ram (section 7)
- Visit lifecycle exactly as 7.1. First visit after `firstVisitDelay`. Gaps from `awayGap`.
- Silence pull: each tick cuts the remaining AWAY time by SILENCE_PULL (remaining *= 0.75), but never below MIN_AWAY_GAP measured as total gap length from when AWAY began... Use: new remaining = max(remaining * (1 - SILENCE_PULL), MIN_AWAY_GAP - timeAlreadyAway, 0). If Ram is not AWAY, add 1 to pendingPull and apply each owed pull when the next AWAY gap is drawn (gap *= 0.75 per pull, floored at MIN_AWAY_GAP).
- Fake-out: decided at APPROACHING start (roll fakeOutChance), fires at exactly half the approach time.
- Night 1 never targets the same entry twice in a row (`lastTarget`).
- 6:00 AM cancels any visit with no breach.

## Breach and loss cause (section 11)
- At AT_ENTRY end, defended = (slot is LOCK_E and CHUD online) or player HOLDING(E) (STANDING(E) does not defend).
- Not defended: phase BREACH, emit BREACH with LossInfo. Cause priority: POWER_OFF (generator off or rebooting) > FURIOUS (furiousCut this visit) > SABOTAGE (sabotaged this visit) > ARMS_GAVE_OUT > WRONG_HOLD (player TRAVELING to, STANDING at, HOLDING or RETURNING from a different entry during the end moment; heldEntry set) > LIED (claimThisVisit is an entry other than E, or "NONE") > UNLOCKED.

## Night flow (section 5)
- New engine: phase NAME_PROMPT unless skipNamePrompt or startNight > 1, which go straight to NIGHT_CARD.
- startNight(n) internal: reset everything except facts (restored from checkpoint) to night-start values, plan questions, Ram AWAY with firstVisitDelay, emit NIGHT_CARD with voiceLog(n). beginNight: phase PLAYING, emit NIGHT_START, CHUD says `night_opener` (night 3 and 4 openers carry the section 10 lines), silence timer starts.
- Night 1: hints on the first visit only: HINT approach text at APPROACHING start, HINT atEntry text at AT_ENTRY start.
- Night 2 at 3:00 AM (elapsed 120): RADIO, +20, radio question. Night 5 at 5:00 AM (elapsed 200): RADIO, +20. CHUD says `radio_reaction` if online. Each fires once per night attempt.
- At 6:00 AM: end furious episode, phase NIGHT_WON (or GAME_WON after night 5), factsCheckpoint = facts, CHUD says `morning`, emit NIGHT_WON or GAME_WON.

## Ram visuals (`ramVisual(view)`)
- DESK view: always "none".
- Entry view E: if Ram AT_ENTRY at E: "tell_clear" if slot is BEAM (landed) else "tell_faint". If Ram APPROACHING with target E and slot BEAM: "approach_silhouette". Else "none".
- The hold view of E uses the same rule as view E.

## Interpretations settled during M1 (engine build)
- Two questions at once (section 13, lock while a scheduled question is pending): the scheduled question moves to `chud.suspendedQuestion` with its timer still running, the gate question becomes pending, and the scheduled one returns when the gate resolves. Typed messages are judged against the gate question only.
- Gibberish flagged by the judge skips social effects only. A command the code parser found still runs.
- `applyJudge` while CHUD is offline is a no-op. Generator off drops tickets waiting for a judge.
- Failed MEMORY answer: contradiction +20 and answer failed +20, clamped to +25.
- SEED answer that contradicts a stored fact: passes and stores the new key, but no -10, and +20 applies.
- +20 "answer fails" applies to gate questions and MEMORY questions only. A failed scheduled STAY costs only the +25 for leaving.
- POWER_OFF is obeyed while FURIOUS (only lock and beam are refused).
- Suspicion sitting at 100 with no active episode shows JEALOUS. A new episode needs a positive change, so the reboot floor does not restart Furious by itself.
- Radio beat while CHUD is offline: +20 still applies, no reaction line, the radio question is queued.
- MEMORY questions only check facts that have a topic (SEED_TOPICS or RADIO_TOPIC).
- Quick buttons need position DESK and view DESK. The view stays put at an entry and returns to DESK on arrival.
- The `morning` line is produced even if CHUD is offline at 6 AM (the win screen needs it). Night 5 emits GAME_WON only.
- Parser bias: miss a command rather than invent one. Direction words (left, right, back, behind) count only outside idioms like "right now" or "he's back". "off" counts only with a power verb or noun. "where" counts only as a question about him.

## UI layer (playable loop, M2 first pass)
- `src/main.ts` owns the loop: each frame `engine.tick(min(dt, 0.1) * devSpeed)`, then `drainEvents()` for one-shot effects (sound, subtitles, log, jumpscare), then the scene and HUD redraw from `engine.state`. The UI never changes game state except through `IGameEngine` methods.
- The dt clamp means a hidden or stalled tab pauses the night instead of fast-forwarding it.
- `src/ui/scene.ts` (PixiJS) draws views, hold views, the dash, CHUD's face and screen effects. `src/ui/placeholders.ts` holds the coded stand-ins. `src/ui/art.ts` swaps in any render found in `prototype/assets/` by slot name (see `prototype/assets/README.md`).
- DOM overlay (`index.html`, `src/ui/style.css`) for chat, buttons and screens, on the same 1280 x 720 stage scaled to the window.
- `src/ui/audio.ts`: Web Audio synth placeholders for every 7.4 cue. Window taps are quieter on nights 4 and 5 (storm masking).
- `src/chud/judgeClient.ts` is the one seam for the judge. It calls `offlineJudge` now; M3 replaces its body with the `/turn` call and keeps `offlineJudge` as the fallback.
- At the desk, CHUD lines, Ram shouts and radio go to the chat log and subtitles hide. Away from the desk, subtitles show.
- Pause (UI only, nothing in `src/sim`): Esc (chat unfocused) or the Pause button at the top right toggles `paused` in `main.ts`. While paused the frame loop skips `engine.tick` (clock, Ram, CHUD timers, question timeouts and silence all stop), still drains events (late judge and voice replies may apply), `Sound.suspend()` / `resume()` freeze the audio, and `#pause` dims the stage to 94 % with Resume and Restart night. Restart uses `retryNight()`, which now also accepts phase PLAYING and reuses the loss-screen path (facts checkpoint, `NIGHT_CARD` event, `nightToken` bump so late replies are dropped). The tab going hidden pauses; the player resumes manually. The first frame after a resume uses dt 0. Pause is only available in PLAYING; leaving PLAYING (safety pause, dev jump) clears it.
- Keys: chat only, see "Controls (adopted)". Esc pauses and resumes (first Esc leaves the chat input). Backtick opens the dev panel (jump to night, x1 / x3 / x8 speed, Ram, suspicion, lie decision, facts). In dev builds `window.engine` is exposed for the console.

## LLM judge and voice (M3 first pass)
- Model: `claude-haiku-5-5`, thinking disabled, effort low, one attempt, 2.4 s server timeout, 2.5 s client timeout. No temperature (the current API rejects non-default sampling on this model).
- `server/app.ts` is a Hono app (`/api/health`, `/api/judge`, `/api/voice`, 90 POSTs per minute per IP). In dev it is mounted inside the Vite server by a plugin in `vite.config.ts`, so `npm run dev` is one command. The key is read from `prototype/.env` on the server side only.
- Judge (`server/prompts.ts`): structured outputs with a JSON schema, so the reply is always valid JSON. The schema uses `new_fact_value` (string, "" for none) and `entry_hint` "NONE" instead of nulls; `server/llm.ts` maps them back to `JudgeResult`. `new_fact` is only produced for an answered SEED question and always uses that question's fact key.
- Client (`src/chud/judgeClient.ts`): LLM judge when available, otherwise or on failure the offline keyword judge (not the neutral result), so a slow call still scores the message sensibly.
- Voice: only for conversational outcomes (`VOICED` in `src/chud/llmClient.ts`: small talk, warm, rude, leaving, answer ack, manipulation, offensive, silence). The engine's canned line is sent as the meaning to keep; the LLM rewords it in CHUD's mood with the last 6 lines of chat as context. Urgent lines (locks, beam, location claims, questions, sabotage, Furious) stay canned and instant. If the voice fails or is slow, the canned line shows. Replies that arrive after a night restarts are dropped.
- The voice is never given Ram's position and is told never to claim it locked or powered anything, so it cannot leak a lie or contradict game state.
- Measured on 2026-11-21 from a home connection: judge 1.2 to 2.2 s (one timeout in about 15 calls), voice 0.7 to 0.9 s. A typed answer that gets a voiced reply takes about 2 to 3 s end to end. Commands found by the code parser still run instantly.
- Dev panel: "LLM on/off" toggle and the source of the last judge verdict.

## 2.5D renderer (Prototype 3.0)
- Plates: every view is a 960 x 480 still (`PLATE_W` x `PLATE_H` in `src/ui/layout.ts`), drawn at `K` = 1.68 stage px per plate px (720 / 480 x `ZOOM` 1.12), so the plate is larger than the 1280 x 720 stage and the camera can pan.
- Art resolution (`src/ui/art.ts`): `prototype/assets/<slot>` override, else the team render in `scenes/` mapped in `SCENE_ART`, else the coded placeholder. Coded full-view placeholders are still drawn for 1280 x 720 and scaled 0.75 into the plate.
- `src/ui/scene.ts` pipeline: an off-stage `world` holds `cam` (all plates, scaled by `K`, centered, night-graded) and `light` (same transform, not graded: beacon sweep and lightning). Each frame `world` is rendered into a RenderTexture shown on a `Mesh` with a 33 x 9 `PlaneGeometry`. Vertex y is pushed out with `y' = cy + (y - cy) * (1 + 0.08 * nx^2)`, so the edges stretch a little (cylindrical feel). Rain, jumpscare, turn fade, grain and vignette sit on the stage above the mesh and are not warped.
- Mouse pan: the mouse position over the canvas (-1..1) sets a target pan of up to `PAN_X` (166 stage px) and `PAN_Y` (43). The pan eases toward it (rate 4 per second). Dash shake and the idle sway are added on top, then the total is clamped so the plate edge never shows. During the dash the camera zooms 1.05 to hide the corners while it rolls.
- Night grade: one ColorMatrixFilter on `cam` with RGB multipliers, eased (rate 6 per second). Renders without the beam: dark and blue (0.22, 0.27, 0.38); entry and hold views with the beam: warm and lighter (0.66, 0.57, 0.46); desk with the beam (0.40, 0.36, 0.32). Coded placeholders are not graded (they are already dark). Lightning adds 0.35 on the desk view for 0.12 s.
- Beam on an entry: the team only rendered one lighting state per view, so the beam is the warm grade plus an additive amber wash on the glass or door (`onRenderLit` in `src/ui/placeholders.ts`). A `view_<entry>_beam` file, when one exists, replaces this.
- Beacon sweep (GAME_LOGIC 6.1): only on the desk view while `power.slot === "BEAM"`. An additive amber band, sized to `DESK_GLAZING` (no mask: a rect mask becomes a stencil mask when the camera rolls during the dash or a brace, and that broke the frame inside the RenderTexture), crosses the glazing every 7 s, plus a faint full-room wash that peaks as the band passes the middle. It stops as soon as the slot changes.
- Foreground parallax: rain streaks (a TilingSprite fading out by 60 % of the height so it stays off the terminal), shown on the desk and window views, offset by 1.6 x the pan.
- Tells, approach silhouettes and hold tells on renders are coded overlays in plate px placed on the render geometry (`onRender*` in `src/ui/placeholders.ts`). Faint tells use alpha 0.45 on renders (0.22 on placeholders) so the night grade does not hide them. Art named `tell_<entry>` etc. still overrides them.
- The desk render's green panel is blacked out in the plate (`SCREEN_FRAME`) and CHUD's terminal is DOM (`#terminal` in `index.html`) placed every frame at `scene.deskScreenRect()` (DESK_SCREEN at the current pan, 1082 x 316 stage px). It ignores the small edge warp. Its opacity follows the turn and dash fade.
- Terminal contents: face (Vidush's sheet via CSS background-position, 540 px frames, left edges 20 / 550 / 1080 / 1610, top 90; a text face if the sheet is missing; OFFLINE or REBOOT n% while CHUD is offline; a small bob while `speakingUntil`, flicker on FURIOUS), chat log, question timer, input, the six GAME_LOGIC 6.3 quick buttons, kill switch, clock, map, power bar.
- Map: watch room circle with the desk (green dot, the player) at the top, window left, hatch right, balcony bottom. Dots are red, amber while a switch to that lock is pending, green while that lock is the powered slot. Display only (clicking a dot does nothing). The map never shows Ram.
- Power bar: 4 cells (W, H, B, BEAM), green for the slot being fed, amber for a pending switch, all red for NONE, flashing red for 2.5 s after a sabotage or Furious cut.
- Music: no music player yet. When one is added it must duck under every entry cue (fairness rule 12.1).
- Screens: the name prompt shows the shipwreck render, the loss screen the cage hall loss render, GAME_WON the cage hall win render, each darkened behind the card.
- Navigation and hint: see "Controls (adopted)" (edge turns, `#brace-hint`, night 1 hints). There are no nav buttons.

## Controls (adopted)
Adopted 2026-11-21 after playtest on branch `proto/v3-controls-edge`; rules in docs/GAME_LOGIC.md section 6 (history in docs/CONTROLS_PROPOSAL.md). Click to go, hold to brace, edge to return (an earlier press-and-hold to run and brace was not smooth in playtest). A / D / S, 1 2 3, Space, the map-dot holds, the desk hold buttons and the Behind and Back to desk buttons were removed.
- Tunables in `src/uiConfig.ts` (UI only). `CONTROLS`: `EDGE_DWELL` 0.3 s, `EDGE_ZONE_SIDE` 70 stage px, `EDGE_ZONE_BOTTOM` 40 stage px, `TURN_TIME` 0.25 s, `TURN_TIME_BALCONY` 0.4 s, `TURN_BLUR` 24, `TURN_DIM` 0.35. `RING`: size 32 screen px, stroke 3, colors, `BRACE_WARN` 1.5 s. `BRACE`: the bracing feel (see "Bracing feel" below). The zone sizes are repeated in `style.css` (`.edge`). Game timers in `config.ts`: `TRAVEL_TIME`, `HOLD_MAX`, `HOLD_COOLDOWN` unchanged, `BRACE_REST` 1.0 s new.
- Engine additions (`src/sim`, the GAME_LOGIC 6.4 API `startHold` / `backToDesk` still works and the old tests use it):
  - `PlayerPosition` gains `STANDING(entry, restUntil)`: at the entry, not bracing. `TRAVELING` gains optional `stay` and `braceOnArrival`, `HOLDING` gains optional `stay` (set by the edge flow).
  - `goToEntry(entry)`: from DESK, view must be that entry, after `HOLD_COOLDOWN`. `TRAVELING(stay)` for `TRAVEL_TIME`, then `STANDING` (rest already over), or `HOLDING(stay)` from the arrival instant if `braceOnArrival`.
  - `startBrace()`: `STANDING` once `restUntil` has passed: `HOLDING(stay)`. While `TRAVELING(stay)`: sets `braceOnArrival`. `endBrace()`: `HOLDING(stay)` back to `STANDING` with `restUntil` = now + `BRACE_REST`, `HOLD_ENDED` manual. While `TRAVELING(stay)`: clears `braceOnArrival`.
  - `HOLD_MAX` on `HOLDING(stay)`: `STANDING` with `restUntil` = since + `HOLD_MAX` + `BRACE_REST`, `HOLD_ENDED` arms, and `log.visit.armsGaveOut` as before (a brace of Ram's target ends by `HOLD_MAX` while he is AT_ENTRY there).
  - `returnToDesk()`: from `STANDING` or `HOLDING(stay)` (ends the brace first, `HOLD_ENDED` manual). `RETURNING` for `TRAVEL_TIME`, then DESK and view DESK. `holdCooldownUntil` = now + `HOLD_COOLDOWN`, so the cooldown gates the next trip and 2.5 s of it remain at the desk. `backToDesk()` does the same in the edge flow.
  - Defended is unchanged (lock or `HOLDING(E)`): `STANDING` at the right entry does not defend. Loss cause: `STANDING` at another entry counts as WRONG_HOLD like `TRAVELING` / `HOLDING` / `RETURNING` (heldEntry is that entry). Typing, quick buttons, turning and the kill switch already need position DESK, so they are blocked at the entry.
- Turning (`src/ui/edges.ts`, `EdgeTurner`): the mouse is mapped to stage px and clamped, so the letterbox outside the stage counts as the edge. From DESK: left edge WINDOW, right edge HATCH, bottom edge BALCONY. Back: right edge from WINDOW, left edge from HATCH, bottom edge from BALCONY. The dwell runs in real time, restarts when the mouse leaves or changes zone, and does not run over a button or input, while paused, or while dashing. After any view change the turner is disarmed until the mouse is outside every zone, so a turn never re-triggers by itself (this also stops the return from WINDOW by the right edge from turning on to HATCH).
- At an entry (`STANDING` or bracing) only the return edge is live; its dwell calls `engine.returnToDesk()`.
- The bottom zone is thin because the terminal's quick buttons end about 2 px above it when the desk is panned fully down. Hovering a button never counts, so a click on a quick button cannot turn.
- Edge hint (`#edges`): a faint static amber arrow and label (WINDOW, HATCH, BEHIND, DESK) on each edge that leads somewhere from the current view, a little brighter while the mouse is in the zone. No fill bar.
- Cursor ring (`#ring`, `renderRing` in `main.ts`): an SVG circle in `#ui`, placed on the pointer each frame, sized `RING.SIZE / frame scale` so it is the same on screen at any window size, pointer-events none, above the scene and below `#screen` and `#pause`. The normal cursor stays. Shows one timer: edge dwell (amber, fills clockwise over `EDGE_DWELL`), bracing (arms left, drains over `HOLD_MAX`, red in the last `BRACE_WARN`), and faint progress for the brace rest and `HOLD_COOLDOWN` (on an entry view at the desk). Hidden while walking (`TRAVELING` to an entry and `RETURNING`, after playtest feedback), otherwise, while paused, off the stage and outside PLAYING. It replaces the edge fill bars and the arms bar (the hold panel now only says "Let go to stop bracing"). CHUD's question timer bar on the terminal is unchanged.
- Turn feel (`scene.ts`): two RenderTextures. On an edge turn the last frame of the old view is kept and both slide across the stage (ease in-out, the picture moves right when turning left), with horizontal motion blur and a 35 % dip in the middle. The return to DESK at the end of a dash keeps the old fade from black. The DOM terminal moves with the sliding desk. `Sound.turn()` in `audio.ts` plays a noise whoosh plus a synthesized chair creak (a slow sawtooth through a narrow band). Mouse pan inside each view is unchanged.
- Hold view at the entry (`scene.ts`): `STANDING` and `HOLDING` both show the entry's hold close-up. Standing is a step back (zoom 1.0), still, and shows no arms. Bracing leans in (`LEAN_ZOOM` 0.06), strains, and shows the arms.
- Bracing feel (`scene.ts`, tunables in `BRACE` in `src/uiConfig.ts`, stage px for the camera, plate px for the arms). All of it runs on an effect clock that stops while paused.
  - Press: a push-in (`LUNGE_ZOOM` 0.045 extra zoom and a `LUNGE_PX` 10 dip over `LUNGE_TIME` 0.24 s, fast attack, slower settle). Release (or arms giving out): a relax-back (`RELAX_ZOOM` -0.025 and a `RELAX_PX` -8 rise over `RELAX_TIME` 0.4 s).
  - Strain while bracing: a slow sway (`SWAY_PX` 2.5 at `SWAY_HZ` 0.7, a different rate on y) plus a fine tremor (`TREMOR_PX` 0.9, three incommensurate sines around `TREMOR_HZ` 9, so it is organic rather than random jitter) and a tiny roll. Both grow with fatigue (time braced / `HOLD_MAX`) by `1 + FATIGUE_GAIN` (2.5) x fatigue.
  - Ram pushing (his hold tell is up at the braced entry): one shove every `PUSH_PERIOD` (0.85 s), a sharp knock then a slow give. The camera is knocked up `PUSH_PX` 12, pulled back (`PUSH_ZOOM` -0.02) and rolled `PUSH_ROT` 0.008 rad to alternating sides, with `PUSH_TREMOR` 2.2 extra tremor. The tells move with the plate, so they stay readable. This replaces the old sine shove of the hold root. The pan clamp leaves extra margin for the roll so the plate corners never show.
  - Arms: the hold renders have no arms (checked: `render_hold_*.png` show only the window, lid and door), so the arms are a coded overlay painted on a 2D canvas (`braceArms` in `placeholders.ts`, 2 canvas px per plate px): per entry, two forearms entering from the bottom of the frame toward the middle, a dark wool sleeve with a cuff and folds, hands seen from the back, flat on the sash, lid or door, fingers slightly spread, a contact shadow on the surface. Muted skin, graded with the render by the night grade (tinted darker on coded placeholders, which are not graded). Poses are placed clear of the hold tells (hand print, seam fingers, door gap). They slide in from below on press and drop out on release (`ARMS_EASE` 16 per second, `ARMS_DROP` 240), slip down with fatigue (`ARMS_SLIP` 9), are shoved down by each push (`ARMS_PUSH` 7) and shake a little against the door on top of the camera (`ARMS_TREMOR` 0.6). A second layer (whitened knuckles and fingertips, raised tendons) fades in from 25 % fatigue and flashes with each shove. A `brace_arms_<entry>` art file replaces the painted arms (no strain layer then); the hold placeholders no longer bake arms in.
  - Audio (`audio.ts`): `braceStart` (a short voiced grunt and a body knock, then a strained hiss every 1.25 s with a small voiced strain every other breath), `braceEnd` (a release breath, a heavier gasp when the arms give out), `bracePush` (a dull knock and a creak, wood for the window and balcony, a higher ringing metal creak for the hatch), fired by the scene once per shove (`onRamPush`) so sound and shake are in sync. Driven by `PLAYER_MOVED` to `HOLDING` and `HOLD_ENDED`.
- Mouse (`wireBrace`, `reconcileBrace` in `main.ts`): `mousedown` (left button, not on a button or a screen) on an entry view at the desk calls `goToEntry`. The button state (`mouseup` on `window`, window `blur`, or a mousemove with the button no longer down count as a release) is reconciled after each unpaused tick and on each press or release: held while `TRAVELING(stay)` sets `braceOnArrival` (so the first click, if still held, or a press during the dash braces on arrival), held while `STANDING` calls `startBrace` (a press during the rest braces when it ends), released while bracing calls `endBrace`. When the arms give out while the button is still down, that press is spent: let go and press again. While paused nothing is reconciled, so a release then applies on resume.
- `#brace-hint`: at the desk on an entry view "Click to go to the <entry>" (or "Catching your breath..." during `HOLD_COOLDOWN`); standing at the entry "Hold left click to brace. Edge to go back." (or "Arms resting..." during `BRACE_REST`).
- Keyboard: chat only. A / D / S, arrows, 1 2 3 and Space no longer do anything, and the Behind and side nav buttons are removed. At the desk (position and view DESK, CHUD online), any printable key focuses the chat input and is typed into it; Enter focuses it, Enter in it sends. Esc leaves the chat, then pauses. Backtick still toggles the dev panel.
- Night 1: the night card explains edges, click to go, hold to brace, edge to return and typing; at the start of night 1 the top hint says "Push the mouse to the left, right or bottom edge to look around". The engine's own night 1 hints are unchanged.
- Balance note: nothing forces the player back from an entry any more (GAME_LOGIC 6.4 returned them after every hold). The pressure to return is the silence timer (no typing away from the desk) and not seeing the other entries. A player can chain braces at one entry with 1 s gaps.
- Not done: the wider desk panorama and desk hotspots (no art yet). Real arm renders (the painted arms are a stand-in).
- Dev: `window.engine` and `window.scene` are exposed in dev builds only.
