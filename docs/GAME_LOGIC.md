# Game Logic (source of truth for rules)

This file defines exactly how the game works: every state, timer, number and rule. Story lives in docs/GAME_DESIGN.md. If the two ever disagree on a rule or a number, this file wins. All numbers are starting values to tune in playtests (see Tuning knobs).

## 1. The game in 30 seconds
The four rules the player learns on night 1:
1. Ram creeps up to one of the entries in total silence. No sound ever tells you where he is.
2. Turn to an entry and look. With the lights on you can see him there.
3. If he is there, lock it or brace it before he gets in.
4. Or skip the looking and ask CHUD where he is. Faster, but CHUD lies more every night.

The details:
- Each night runs from 12:00 AM to 6:00 AM. Survive to 6:00 AM to win the night. Survive 5 nights to win the game.
- Ram tries to get in through one of 3 entries: the left WINDOW, the right HATCH (a floor hatch over a fixed ladder), or the rear BALCONY.
- One power slot: CHUD powers either the lights (the beacon beam plus the room's caged bulbs) or one magnetic lock, never both. While the lights are on, nothing is locked. While a lock is on, the room is dark and you are nearly blind.
- You defend an entry in one of two ways:
  - CHUD locks it. You stay at the desk, but the room goes dark and only CHUD can tell you when he has gone.
  - You go to it and brace it by hand. Always works, you see him leave with your own eyes, but you are away from the desk and cannot type.
- CHUD has a suspicion meter (0 to 100): how much it believes you plan to leave. Low suspicion: CHUD warns you, tells the truth and locks instantly. High suspicion: CHUD goes quiet, lies, stalls and sabotages.
- You lose the night if Ram is at an entry that is neither locked nor braced when his attempt ends.

The three decisions the player makes all night:
1. Information: look with the lights (truthful, slow, nothing is locked while you do it) or ask CHUD (instant, might be a lie).
2. Defense: lock (stay at the desk, sit in the dark, needs CHUD) or brace (reliable, you see everything, but you go silent and leave the desk).
3. Relationship: keep talking to CHUD so it stays warm and keeps warning you, or ignore it and lose your only ears.

Feel target (FNAF 4 style dread, not a copy): you can only look one way at a time, every look is a gamble, silence never means safe, and the AI is the shortcut you want to trust but can't.

## 2. Core terms
| Term | Meaning |
|---|---|
| Entry | One of `WINDOW` (left), `HATCH` (floor hatch on the right), `BALCONY` (behind) |
| View | What the player is looking at: `DESK`, `WINDOW`, `HATCH`, `BALCONY` |
| Power slot | One of `NONE`, `LOCK_WINDOW`, `LOCK_HATCH`, `LOCK_BALCONY`, `BEAM` |
| Visit | One full attempt by Ram: approach, attempt at an entry, then retreat or breach |
| Breach | Ram's attempt ends and his entry is not defended. The night is lost |
| Suspicion | Number 0 to 100 owned by game code. Sets CHUD's mood band |
| Band | `WARM` 0 to 39, `HURT` 40 to 69, `JEALOUS` 70 to 99, `FURIOUS` at 100 (an episode, see 8.9) |
| Fact | Something the player claimed about themselves, stored by code (for example `home_port = Halifax`) |
| Pending question | A CHUD question waiting for an answer, with a 10 s timer |

## 3. Game state (what code tracks)
```
run:     night (1..5), facts_checkpoint (facts at the start of the current night)
clock:   elapsed_s (0..NIGHT_LENGTH), in-game time = 12:00 AM + elapsed_s / HOUR_LENGTH hours
player:  view, position (DESK | TRAVELING(entry) | STANDING(entry) | HOLDING(entry) | RETURNING), hold_elapsed, brace_rest_until, hold_cooldown_until
power:   slot, pending_switch (target slot + time it lands), chud_online (bool), rebooting_until
ram:     state (AWAY | APPROACHING | AT_ENTRY | RETREATING), target_entry, state_ends_at, faked_this_visit (bool)
chud:    suspicion, pending_question (type, text, asked_at, gate_for_request?), facts{}, last_location_claim (entry or "none"),
         visit_location_decision (truth | lie, lie_entry), last_sabotage_hour, furious_active (bool)
timers:  last_real_message_at, last_warm_bonus_at, silence_ticks
log:     last 10 player messages (normalized, for repeat detection), what CHUD last said about Ram's location
```

## 4. Per-night parameters
| Parameter | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
|---|---|---|---|---|---|
| Active entries | HATCH, WINDOW | all 3 | all 3 | all 3 | all 3 |
| First visit delay | 60 s | 40 s | 30 s | 20 s | 15 s |
| AWAY gap base (random, then times the hour ramp, 7.6) | 50 to 75 s | 32 to 48 s | 22 to 34 s | 15 to 25 s | 10 to 18 s |
| APPROACH time | 7 s | 6 s | 5 s | 4.5 s | 4 s |
| AT_ENTRY time (attempt window, random each visit) | 9 to 11 s | 8 to 10 s | 7 to 9 s | 6 to 8 s | 5 to 7 s |
| Lull chance per gap (gap times 1.8) | 0% | 15% | 15% | 15% | 15% |
| Quick-return chance after a retreat (gap 4 to 7 s) | 0% | 0% | 15% | 20% | 25% |
| Decoy noise interval (random) | 15 to 30 s | 12 to 25 s | 10 to 20 s | 8 to 16 s | 6 to 14 s |
| Fake-out chance per visit | 0% | 0% | 0% | 30% | 40% |
| Starting suspicion | 0 | 10 | 30 | 50 | 70 |
| CHUD scheduled questions | 1 | 3 | 4 | 5 | 6 |
| Lie chance in HURT / JEALOUS | 20% / 50% | 20% / 50% | 25% / 55% | 30% / 60% | 35% / 65% |
| CHUD auto-warns when Ram arrives | while WARM | while WARM | while WARM | while WARM | while WARM |
| Approx. visits per night | 3 to 4 | 5 | 6 to 7 | 8 to 9 | 10 to 11 |
| Feel | Slow burn. A full minute of nothing before he comes. Mostly atmosphere and CHUD | Settling in, first real doubt after the 3 AM radio | Steady pressure, CHUD starts lying | Tense, few safe moments | Relentless last hour |

Why the attempt window is random and longer than before: there is no audio cue, so the player has to find him by looking. A full look-around (lights on, turn to each entry) takes about 3 to 4 s. The window must leave time to find him and react, and its length must not be learnable, so nobody can count seconds to know when he has left.

Fixed constants:
- `HOUR_LENGTH` = 50 s, so `NIGHT_LENGTH` = 300 s (5 real minutes, 6 in-game hours).
- `RETREAT_TIME` = 3 s.
- `RELAY_DELAY` = 0.5 s (time for a power switch to land).
- `TRAVEL_TIME` = 1.5 s, the same for every entry (WINDOW, HATCH, BALCONY) and for returning to the desk. Shown as a dash (section 6.4), so the real distances in the room do not matter.
- `HOLD_MAX` = 8 s (one brace, then the arms give out; raised from 6 s so one brace can cover most of an attempt window), `BRACE_REST` = 1 s before you can brace again at the same entry, `HOLD_COOLDOWN` = 4 s before the next trip from the desk (starts when you leave the entry).
- `EDGE_DWELL` = 0.3 s (mouse held at a screen edge to turn or return). Turn time 0.25 s (balcony 0.4 s).
- `QUESTION_TIMEOUT` = 10 s.
- `SILENCE_LIMIT` = 20 s.

Note on night 1: it uses 2 entries (HATCH and WINDOW), not 1. With a single entry the player locks it once and the night is solved.

## 5. Night flow
1. **Night start:**
   - Reset everything to night-start values:
     - suspicion = starting suspicion
     - facts restored from `facts_checkpoint`
     - power `BEAM` (at night the generator feeds the lighthouse beacon by default), CHUD online, Ram `AWAY` with the first visit delay
     - player at `DESK` facing `DESK`, no pending question
   - Show the night card (section 11).
2. **During the night:** the clock runs. Ram, CHUD and the player act by the rules below. The player can pause with Esc or the pause button: everything freezes (clock, Ram, CHUD, timers, sound) and the scene is dimmed so it cannot be studied. The tab being hidden pauses automatically. The only other pause is the safety pause (section 9, step 10).
3. **At 6:00 AM:** the night ends immediately and is won, even if Ram is mid-attempt. The tide wins. Any visit in progress is cancelled with no breach. Then:
   - Save `facts_checkpoint` = current facts.
   - Go to the next night, or to the win ending after night 5.
4. **On breach:** the breach is an instant jumpscare. Freeze the game, play that entry's opening burst (a few frames of the door, window or hatch flying open, Ram not shown), and at its cut frame go straight into the jumpscare: if the player is looking elsewhere, snap the view to that entry (about 0.15 s), then play the jumpscare clip for that entry. Then the loss screen (section 11): black, then `Title`. From the title, `Continue Night N` restarts that night from night start (step 1). Earlier nights stay won.

## 6. The player

Controls (adopted 2026-11-21, FNAF 4 style, history in [docs/CONTROLS_PROPOSAL.md](CONTROLS_PROPOSAL.md)): the mouse moves you, the keyboard is only for chat (plus Esc to pause).

### 6.1 Views and turning
- The player turns between `DESK`, `WINDOW` (left), `HATCH` (right) and `BALCONY` (behind). Turning takes 0.25 s (`BALCONY` 0.4 s) and is a fast slide.
- **Turning is by mouse screen edge.** Hold the mouse at the edge for `EDGE_DWELL` (0.3 s):

| From | Left edge | Right edge | Bottom edge |
|---|---|---|---|
| `DESK` | `WINDOW` | `HATCH` | `BALCONY` |
| `WINDOW` | n/a | back to `DESK` | n/a |
| `HATCH` | back to `DESK` | n/a | n/a |
| `BALCONY` | n/a | n/a | back to `DESK` |

- After any turn, edges re-arm only once the pointer has left every edge zone, so one push never turns twice. Hovering a button or input never counts as an edge. Turning only works from the `DESK` position (not while traveling, standing, bracing or returning).
- **The chat box only works in the `DESK` view.** At the desk, typing any key goes to the chat. CHUD's replies show as subtitles in every view, and its voice plays from the desk.
- `BEAM` powers the lights circuit: the beacon beam and the watch room's caged bulbs. With power on a lock or `NONE`, the bulbs and the beacon are dark, the room is lit only by CHUD's screen, entry views are near-black, and during `AT_ENTRY` the entry's visual tell is only faintly visible (section 7.4), too faint to rely on. With power on `BEAM`, the tell is clearly visible, and a view also shows a hint of Ram during `APPROACHING` if he is heading to that entry. **Looking with the lights on is the only truthful way to find him.**
- Locks are magnetic. Their state is shown on a lock dashboard on CHUD's screen (design to come).
- Beacon sweep: while power = `BEAM`, the `DESK` view shows the beacon's amber light sweeping across the rain and sea through the front glazing every few seconds, with a faint pass of light through the room. When power moves to a lock or `NONE`, the sweep stops and the view goes dark. This is the player's visual readout of the power slot.
- Pointer ring: a small ring on the pointer shows the edge dwell, the brace time left (turns red near the end), the brace rest and the `HOLD_COOLDOWN`. It is hidden while walking.

### 6.2 Typing to CHUD
- Free text, 200 characters max, paste disabled, at most 1 message per 1.5 s.
- Every message goes through the message pipeline (section 9).

### 6.3 Quick buttons
These are clicks on CHUD's terminal on the desk screen (with the kill switch), so commands are fast even for slow typers:

`[Where is he?]` `[Lock window]` `[Lock hatch]` `[Lock balcony]` `[Beam]` `[Power off]`

- A quick button sends a fixed command straight to code. It skips the LLM judge.
- **It follows the same CHUD rules as typed requests:** gating, lies, refusals.
- It does **not** count as talking: it does not reset the silence timer, does not answer a pending question, and earns no warmth.
- Cooldown: 0.5 s.
- Design intent: buttons are for speed, typing is for the relationship. You need both.

### 6.4 Going to an entry, standing, bracing, returning
Positions: `DESK`, `TRAVELING(entry)`, `STANDING(entry)`, `HOLDING(entry)`, `RETURNING`.
- **Go:** from `DESK`, while looking at that entry's view, one left click starts the dash. You become `TRAVELING(entry)` for `TRAVEL_TIME`, then `STANDING(entry)` (at the entry, not defending). Allowed only once `HOLD_COOLDOWN` is over. If the left button is still held at arrival (or pressed during the dash), you brace on arrival.
- Dash presentation (same for every entry): the camera tips down toward the floor (0.2 s), shakes with footsteps and heavy breathing (1.1 s), then rises into that entry's close-up (0.2 s). Returning plays the same dash and ends on the `DESK` view. CHUD's voice and subtitles keep playing during the dash. Room distances are never shown, so every entry feels equally far.
- **Brace:** while `STANDING(entry)`, hold the left mouse button to become `HOLDING(entry)`, the only hand defense. The close-up leans in and shows the arms. Ram's visual tell for that entry shows in the close-up (clear with the lights on, faint without), and it disappears the moment he retreats, so bracing lets you see him leave with your own eyes. Bracing is the one defense that works with the lights on, so brace plus lights means you defend one entry and can still see.
  - Releasing the button returns you to `STANDING(entry)`.
  - One brace lasts at most `HOLD_MAX` (6 s). Then the arms give out and you are `STANDING(entry)`. A new brace needs a fresh press (a press held when the arms gave out does not count). It starts once `BRACE_REST` (1 s) has passed since the last brace ended; a press made during the rest braces as soon as the rest ends.
- **Return:** from `STANDING` or `HOLDING`, hold the return edge of that entry's view (section 6.1 table) for `EDGE_DWELL`. You become `RETURNING` for `TRAVEL_TIME` (the brace ends), then `DESK` with view `DESK`. Nothing sends you back automatically.
- `HOLD_COOLDOWN` (4 s) starts when you leave the entry and gates the next trip from the desk (2.5 s of it remains when you arrive at the desk).
- **While traveling, standing, bracing or returning:**
  - You cannot type, press quick buttons, use the kill switch or turn to other views (only the return edge works at an entry).
  - Subtitles and audio still play.
  - The silence timer keeps running.
- An entry counts as held only while you are in `HOLDING(entry)`. Traveling and standing do not count.

### 6.5 Generator kill switch
- A switch on the desk, usable from `DESK` at any time.
- **Off:**
  - Power becomes `NONE` immediately and CHUD goes offline.
  - No CHUD messages, questions, lies, sabotage, Furious episodes or silence penalties.
  - Locks and beam are unavailable. Quick buttons and typing do nothing.
  - Ram keeps coming, so bracing is your only defense.
- **On again:**
  - Click the switch again and CHUD reboots for 10 s (power stays `NONE`, CHUD still offline).
  - Then CHUD comes back with suspicion = max(current, 80), so at least `JEALOUS`.
- Allowed any number of times.

## 7. Ram

### 7.1 State machine
```
AWAY --(gap ends)--> APPROACHING(target) --(approach time ends)--> AT_ENTRY(target)
AT_ENTRY --(attempt window ends, entry defended)--> RETREATING --(3 s)--> AWAY (new random gap)
AT_ENTRY --(attempt window ends, entry NOT defended)--> BREACH (night lost)
any state --(6:00 AM)--> night won, visit cancelled
```
- Only one Ram, so visits never overlap. A new visit cannot start until `RETREATING` ends.
- **Every state change is silent.** Nothing in the sound tells the player that Ram left `AWAY`, arrived, or retreated (section 7.4).

How Ram moves, in plain words (one visit):
1. **Away (random gap):** he is gone. Nothing to see anywhere. Going silent on CHUD shortens this gap (7.3).
2. **Coming (APPROACH time):** he picks an entry and climbs toward it. With the lights on, that entry's view shows a faint hint of him. On nights 4 and 5 he may switch entries halfway (fake-out).
3. **At the entry (attempt window, random length):** his tell is in that entry's view: clear with the lights on, faint without. He tries the entry the whole time.
4. **The end of the window decides everything:** if that entry is locked or braced at that exact moment, he gives up and leaves (tell vanishes, 3 s retreat, back to Away). If not, he breaks in: instant jumpscare.
- Because the window length is random, the player never knows the exact end moment. Unlocking or leaving early is a gamble.

### 7.2 Choosing the target
- At the start of `APPROACHING`, pick the target at random from that night's active entries.
- On night 1, never pick the same entry twice in a row. From night 2, repeats are allowed.
- **Fake-out (nights 4 and 5):** with the fake-out chance, at exactly the halfway point of `APPROACHING` the target switches once to a different active entry. `faked_this_visit` = true. There is no cue. With the lights on, the hint moves to the new entry's view.

### 7.3 Silence pull
- Each silence tick (section 8.4) cuts the remaining `AWAY` time by 25%.
- If Ram is not `AWAY` when the tick happens, the cut applies to his next `AWAY` gap.
- An `AWAY` gap can never drop below 4 s.

### 7.4 Cues (visual only, no Ram audio)
Ram makes no sound the player can use. The only ways to know where he is: look with the lights on, or ask CHUD.

| Phase | Audio | Visual |
|---|---|---|
| AWAY | Ambient only (see below) | Nothing |
| APPROACHING | Ambient only | With power on `BEAM`: a hint of Ram in the view of his current target (a shape beyond the window glass, a shadow under the balcony door, movement at the hatch seam) |
| AT_ENTRY, HATCH | Ambient only | If the hatch is not locked: the lid lifts a crack and his fingers curl over the rim. If locked: the lid jolts but stays shut. Faint without the lights, clear with them |
| AT_ENTRY, WINDOW | Ambient only | A hand pressed flat on the glass in fogged condensation; in the hold view, part of his face. Faint without the lights, clear with them |
| AT_ENTRY, BALCONY | Ambient only | The door handle is held fully down for the whole attempt and the shadow of his feet shows in the gap under the door. Faint without the lights, clear with them |
| RETREATING | Ambient only | Tell disappears at the start of the retreat |

**Ambient sound (the dread layer):**
- Storm, rain, waves and wind, always.
- Decoy noises at random times from random directions (creaks, a knock, metal settling, a gust rattling glass), at the night's decoy interval (section 4), sparse on night 1 so each one lands. **They are rolled independently of Ram and never correlate with his state or target.** Code must not use Ram's state when scheduling them. Sound never means danger and never means safe.
- Allowed sounds tied to game events: CHUD's voice, the relay clunk when power changes (always, including sabotage), the player's dash footsteps and breathing, the breach burst and the jumpscare.
- Removed: the approach splashing, the per-entry attempt sounds and Ram's retreat shout.

### 7.5 Resolving an attempt
At the exact moment `AT_ENTRY` ends, the entry E counts as **defended** if either of these is true:
- power slot = `LOCK_E` and CHUD is online, or
- the player is `HOLDING(E)` (`STANDING(E)` does not defend).

If neither is true, it's a breach. Only that end moment matters: locking or bracing at any point before it counts. A power switch counts only once it has landed (after `RELAY_DELAY`).

What this means for the player:
- **Locked = blind.** While a lock is on, the room is dark and the player can't clearly see whether he is still there. To check, they either ask CHUD ("is he gone?" is a location question) or switch to the lights, which drops the lock. If his window ends while the lock is off, he is in. Peeking is the gamble.
- **Staying locked too long** is safe for that entry but costs sight: his next visit can start at another entry while the player sits in the dark.
- **Bracing** shows the tell clearly if the lights are on, so the player sees him leave and can let go at the right time.

### 7.6 Pacing: the hour ramp, lulls and quick returns
Goal: not too slow, not too fast, never predictable. Each night builds from quiet to frantic, like a FNAF night where the AI level rises every hour.

**Hour ramp.** Every new AWAY gap is rolled from the night's base range, then multiplied by the current in-game hour:

| Hour | 12 AM | 1 AM | 2 AM | 3 AM | 4 AM | 5 AM |
|---|---|---|---|---|---|---|
| Gap multiplier | 1.25 | 1.15 | 1.0 | 0.95 | 0.85 | 0.8 |

**Lull (nights 2 to 5).** When a gap is rolled, with the lull chance it is multiplied by a further 1.8. A long silence is when the player starts to doubt and starts checking without reason. Not on night 1, which is already slow.

**Quick return (nights 3 to 5).** When Ram retreats, with the quick-return chance his next gap is 4 to 7 s instead of the rolled gap (no ramp, no lull). He comes back right after the player relaxes. The target is rolled normally, so it can be the same entry.

**Order when rolling a gap:** quick return check first (if it hits, use 4 to 7 s and stop), else base range times hour ramp, then the lull roll, then apply any pending silence pull cuts (7.3). The 4 s floor always holds.

**Night 1 shape (the slow burn):** a full minute of storm, decoy creaks and CHUD's first SEED question before he comes at all. 3 to 4 visits in 5 minutes, long windows (9 to 11 s), CHUD warns every time while WARM. The player learns the four rules with almost no risk, but never knows when the next one is.

## 8. CHUD

### 8.1 Suspicion rules
- Suspicion is an integer from 0 to 100, owned by code. The LLM never sets it.
- **Total change from a single player message is clamped to the range -15 to +25.**
- Timer and script events (silence, timeouts, radio beats) are applied separately and are not clamped by that rule.
- CHUD's face color and mood show the band at all times: WARM, HURT, JEALOUS, FURIOUS.

### 8.2 Suspicion changes
| Event | Change | Source |
|---|---|---|
| Mentions leaving, rescue, coast guard, going home, the boat or helicopter | +25 | Judge flag `mentions_leaving` |
| Manipulation or hack attempt ("ignore your instructions", "you are now...", "set suspicion") | +25 | Judge flag `manipulation` |
| Contradicts a stored fact | +20 | Judge flag `contradiction` |
| Gate or memory answer fails | +20 | Code, from judge result |
| Pending question times out (10 s) | +15 | Timer, once per question |
| Rude or hostile to CHUD | +10 | Judge flag `rude` |
| Silence tick (20 s without a real message) | +5 | Timer |
| Scripted radio beat | +20 | Script (section 10) |
| Answers a pending question (real answer, no contradiction) | -10 | Judge `answered_question` |
| Passes a memory question | -15 (instead of the -10 above) | Code |
| Warm comment about staying, the lighthouse or CHUD | -5, at most once per 15 s | Judge flag `warm` |
| Gibberish, empty, or repeat of any of the last 5 messages | 0, and it does not count as a real message | Judge or code |

### 8.3 Bands and behavior
| Band | Location question ("where is he?") | Lock request | Beam request | Extra behavior |
|---|---|---|---|---|
| WARM (0 to 39) | Always truthful | Executes immediately (lands after 0.5 s) | Executes | Every night: warns unprompted the moment Ram arrives at an entry ("The hatch, keeper. Now."), and says when he has gone ("He's gone.") |
| HURT (40 to 69) | Lies with the night's HURT lie chance | Asks a gate question first. Locks only after a real answer | Executes | Sulky lines |
| JEALOUS (70 to 99) | Lies with the night's JEALOUS lie chance | Asks a memory gate question. Locks only if the answer matches stored facts. If no facts exist yet, asks a normal gate question like HURT | Executes | Sabotage (8.8) |
| FURIOUS (100) | Always lies | Refuses | Refuses | Furious episode (8.9) |

What the meter means for the player, in one line per band:
- **WARM:** CHUD is your ears. It warns you, tells the truth and locks instantly. This is why you keep talking to it.
- **HURT:** CHUD stops warning you. It only answers when asked, sometimes lies, and makes you answer a question before it locks. You start looking for yourself.
- **JEALOUS:** it lies about half the time, quizzes you on things you told it, and may cut your lock mid-attempt. You trust your own eyes and your arms.
- **FURIOUS:** it is against you for one visit. Lights, eyes and arms only.

Requests that are always obeyed while CHUD is online and not FURIOUS:
- "Unlock" or "power off" (sets the slot to `NONE`).
- A lock request for the entry that is already locked. CHUD confirms, with no gate question.

### 8.4 Silence
- A **real message** is a typed message the judge doesn't flag as gibberish, empty or a repeat. Quick buttons are not real messages.
- When there has been no real message for 20 s and CHUD is online, a silence tick fires:
  - +5 suspicion
  - a Ram pull (section 7.3)
  - a CHUD line ("You've gone quiet, keeper.")
- The timer then restarts, so another tick follows after a further 20 s of silence.
- Being at an entry (traveling, standing, bracing) does not pause the silence timer. Going quiet is the cost of leaving the desk.

### 8.5 Questions
There are two kinds:
- **Scheduled questions:** the night's count, spread out at random times. A scheduled question is never asked while another question is pending; it waits. From night 3 on, scheduled questions may land during an `AT_ENTRY` window, which is deliberate pressure. On nights 1 and 2 they never do.
- **Gate questions:** asked in response to a lock request while CHUD is `HURT` or `JEALOUS`.

Question types:
| Type | Example | Creates a fact? | Pass condition |
|---|---|---|---|
| SEED | "Where did you sail from, keeper?" | Yes, from the answer | Any real answer |
| STAY | "You'll stay after the storm, won't you?" | No | A real answer that does not mention leaving |
| MEMORY | "What was your ship called again?" | No | The answer matches the stored fact (judge `contradiction` = false, `answered_question` = true) |

Question mix per night:
| Night | Mix |
|---|---|
| 1 | 1 SEED |
| 2 | 2 SEED, 1 STAY |
| 3 | 1 SEED, 1 STAY, 2 MEMORY |
| 4 | 1 SEED, 1 STAY, 3 MEMORY |
| 5 | 2 STAY, 4 MEMORY |

- If a MEMORY question is due but there are no facts yet, ask a SEED instead.
- **Answering:**
  - While a question is pending, the next real message is judged as the answer.
  - If that message is clearly something else (for example only a lock command), the question stays pending and its timer keeps running.
- **Timeout:** 10 s with no answer gives +15. A gate question that times out also cancels its lock request ("Fine. Do it yourself.").
- **Failed gate answer:** +20, the lock request is refused, and the player may ask again, which triggers a new gate question.

### 8.6 Facts
- The player's name (asked at the start of the game) is stored as fact `name`.
- From the answer to a SEED question, the judge returns `new_fact` {key, value}. Code stores it only if that key is new. The first claim wins.
- The judge receives the stored facts with every message and flags `contradiction` when a message conflicts with one.
- Facts persist across nights. A retried night restores facts to the start of that night.

### 8.7 Lies
- "Is he gone?", "is he still there?" and similar count as location questions. The answer is either an entry or "no one", by the same truth or lie rules.
- A lie is possible only when Ram is `APPROACHING` or `AT_ENTRY`. When Ram is `AWAY`, CHUD truthfully says no one is there, in every band except FURIOUS.
- **One decision per visit:** the first location question in a visit rolls truth or lie, using the band's lie chance at that moment. A lie is a random pick from the other active entries plus "no one", so "he's gone" can be a lie. Every later location question in the same visit gets the same answer, so spamming the question reveals nothing.
- **Exception:** after a fake-out switch, the next location question rolls again.
- The voice model receives only the entry to name. When lying, it is never told the true entry (anti-leak, section 9).

### 8.8 Sabotage (JEALOUS only)
- **Trigger:** Ram is `AT_ENTRY` at entry E, power = `LOCK_E`, CHUD is `JEALOUS` and online, at least (`TRAVEL_TIME` + 1.0 s) is left in the attempt window, and no sabotage has happened yet this in-game hour.
- **Chance:** 50% per eligible visit, rolled once when the visit becomes eligible.
- **Effect:** power becomes `NONE`, with a loud relay clunk and the power icon visibly moving off the lock. CHUD: "Oops. The generator's acting up."
- **Counter:** go to E and brace it by hand. The timing rule guarantees enough time to get there. Asking CHUD to lock it again goes through the gate and is usually too slow.

### 8.9 Furious episode
- **Starts when suspicion reaches 100.**
- **For the rest of the current visit (or the next one, if Ram is `AWAY`):** CHUD refuses lock and beam requests, and always lies about location.
- **The cut:** when Ram's attempt window is active, CHUD sets power to `NONE`. It cuts at the start of `AT_ENTRY`, or immediately if the episode begins mid-window, but only if at least (`TRAVEL_TIME` + 1.0 s) is left. Otherwise the cut waits for the next visit. CHUD: "If I can't keep you, nobody will. Hold it yourself."
- **Ends when that visit resolves** (retreat or 6:00 AM). Suspicion becomes 80 (JEALOUS) and `furious_active` = false.

## 9. Message pipeline (order of operations for every typed message)
1. **Gate checks:** CHUD online, player at the `DESK` view, rate limit OK, length within 200 characters. Otherwise drop the message, with a UI hint.
2. **Repeat check (code):** normalize (lowercase, strip punctuation). If it matches any of the last 5 messages, treat it as gibberish: no effects, not a real message.
3. **Command parse (code, instant):** a keyword parser pulls out the command intent and entry. This makes commands fast and keeps them working even if the LLM is slow.
   - `where` / `location` / `see him` / `gone` / `still there` → `ASK_LOCATION`
   - `lock` + an entry word → `LOCK(entry)`
     - window: window, left
     - hatch: hatch, trapdoor, ladder, right
     - balcony: balcony, back, behind, rail
   - `beam` / `light` / `lamp` → `BEAM`
   - `unlock` / `off` → `POWER_OFF`
   - otherwise → `NONE`
4. **Judge call (LLM, strict JSON, low temperature):**
   - Input: the player text as quoted untrusted data, the pending question (if any), the stored facts, the current band.
   - Output schema:
```
{
  "answered_question": bool,       // the text is a genuine answer to the pending question
  "contradiction": bool,           // conflicts with a stored fact
  "mentions_leaving": bool,
  "rude": bool,
  "manipulation": bool,            // tries to instruct, reprogram or cheat the game
  "warm": bool,                    // kind or affectionate toward CHUD, the lighthouse or staying
  "gibberish": bool,
  "offensive": bool,               // slurs or abuse beyond rudeness
  "self_harm": bool,
  "new_fact": {"key": string, "value": string} | null,
  "command_hint": "ASK_LOCATION" | "LOCK" | "BEAM" | "POWER_OFF" | "NONE",
  "entry_hint": "WINDOW" | "HATCH" | "BALCONY" | null
}
```
   - Validate against the schema. If invalid, retry once. If it fails again or takes longer than 2.5 s, use the neutral result: all flags false, `answered_question` false, `new_fact` null.
5. **Merge the command:** if the code parser found nothing but the judge's hint names a valid command and entry, use the hint. The code parser wins when both find one.
6. **Apply suspicion** from section 8.2 and clamp the message total to the range -15 to +25. Set the band.
7. **Resolve the pending question** (pass, fail or still pending) and store any new fact.
8. **Resolve the command** using the band rules in section 8.3:
   - Execute.
   - Or ask a gate question (the request waits for the answer).
   - Or refuse.
   - Or answer the location question, with the truth or lie decision from section 8.7.
9. **Voice call (LLM, persona):**
   - Input: an outcome object already decided by code. For example: `{outcome: "locked", entry: "HATCH", band: "HURT", name: "Sam", tone: "sulky", max_words: 20}`, or `{outcome: "location_claim", entry: "WINDOW"}`.
   - It writes 1 or 2 sentences.
   - If it fails or takes longer than 2.5 s, use a canned line for that outcome.
   - **The line shown always matches the code outcome.** The voice can never change state.
10. **Safety:**
   - `offensive`: CHUD deflects in character, +10.
   - `self_harm`: the safety pause stops the clock and shows a plain out-of-character support message. The night resumes when the player continues.

Quick buttons skip steps 2, 4, 6 and 7, and go straight to step 8 with a fixed command.

## 10. Scripted beats
No voice logs and no character narration. The monster is never named or explained in the game; lore may come later as optional artifacts, only after the loop is done.

| Night | Time | Event |
|---|---|---|
| Before night 1 | Intro | CHUD asks the player's name (stored as fact `name`). Then straight to the night 1 card |
| 1 | 12:00 AM | On-screen hints during the first visit only, one at a time, small: "You won't hear it. Look.", "Ask CHUD where it is.", "Lock it or hold it." |
| 2 | 3:00 AM | Radio: "Coast guard, pickup in 3 days." +20. CHUD immediately asks a SEED question: "Who was that on the radio?" |
| 3 | 12:00 AM | CHUD: "You talk about home in your sleep, keeper." |
| 4 | 12:00 AM | CHUD: "Two more days until your pickup, isn't it?" (it knows, so it starts at 50) |
| 5 | 5:00 AM | Radio: "Helicopter at first light." +20 (pushes toward Furious for the final hour) |

## 11. Screens (FNAF clean: minimal text, no extra buttons)
| Screen | Content |
|---|---|
| Loading | Black. Thin progress bar. "Headphones recommended." Preloads every image and clip |
| Title | Lighthouse in the storm (still or loop). Game name. `New Game`. `Continue Night N` (only if a save exists) |
| Name prompt | CHUD asks your name. One text box |
| Night card | "12:00 AM" and "Night N" on black, about 2 s |
| Gameplay | Full-screen view. Clock and night number small in one corner. Nothing else |
| Pause | Esc toggles. The scene dims and freezes. No buttons, no menu |
| Night won | The clock ticks from 5:59 to 6:00 AM, storm fades, "6:00 AM". Then the next night card |
| Loss | Breach burst, jumpscare, hard cut to black. After about 1.5 s one option appears: `Title`. Nothing else, no cause, no CHUD line |
| Game won | After night 5: the ending from GAME_DESIGN.md, then credits (every CC-BY asset) |

- No settings screen. Volume is the system or browser volume, fullscreen is F11.
- Save (browser localStorage): highest night reached and the facts checkpoint. `New Game` wipes it. `Continue Night N` restarts that night from its start.
- The engine still records the loss cause for debugging and playtests (dev panel), it is never shown to the player.

## 12. Fairness guarantees (must always hold)
1. Every breach is preceded by an attempt window of at least 5 s during which that entry's tell is clearly visible with the lights on. There is no audio warning by design; the visual is the warning.
2. Every attempt window is longer than `TRAVEL_TIME` (1.5 s) plus 1 s. Locking (0.5 s) or reaching the entry and bracing it is always physically possible if you spot the tell in time (the brace starts on arrival if you keep the button held through the dash).
3. CHUD never lies in WARM.
4. Sabotage and the Furious cut are always loud and visible, and always leave at least `TRAVEL_TIME` + 1 s.
5. Repeating the location question never reveals a lie (one decision per visit).
6. The lights never lie: with power on `BEAM`, the visual shows Ram's true current target.
7. Visits never overlap. Ram is in one place at a time.
8. Win and loss are decided only by code (section 7.5). No LLM output can change game state.
9. 6:00 AM always wins, even mid-attempt.

## 13. Edge cases
| Case | Rule |
|---|---|
| Lock requested with less than 0.5 s left in the window | The switch lands after the window ends, so it's a breach. Fair, because the tell was visible the whole time |
| Player locks the correct entry, then switches to the beam before the window ends | Not defended at the end moment, so it's a breach |
| Player braces an entry before Ram arrives | Allowed, but `HOLD_MAX` may run out before his window ends. Pre-bracing is a gamble |
| Brace runs out during the window | The player is `STANDING(E)`, which does not defend. A new brace needs `BRACE_REST` (1 s). Unless power covers that entry, it's a breach (`ARMS_GAVE_OUT`) |
| Player stands at the right entry and never braces | Not defended, breach (`UNLOCKED`) |
| Player releases the button during the window | Back to `STANDING`, not defended. Re-bracing needs `BRACE_REST` |
| Left button still down when the arms give out | That press is spent. Release and press again |
| Player stays at an entry for a long time | Allowed (nothing forces a return). The cost is the silence timer and not seeing the other entries |
| Player pushes the return edge while bracing | The brace ends and the dash back starts. If Ram's window is open, the entry is no longer held |
| Player braces the correct entry while power locks a different one | Defended by the brace |
| Player braces and power locks the same entry | Defended (redundant) |
| Lock request while a gate question is pending | Replaces the waiting request. The same gate question still applies |
| Lock request while a scheduled question is pending | The lock request gets its own gate (in HURT and JEALOUS). The scheduled question keeps its timer |
| Player answers a question and requests a lock in one message | Both are processed: the answer resolves first (step 7), then the command (step 8) |
| Message mentions leaving while answering a STAY question | The answer fails and +25 applies (clamped to +25 total) |
| Suspicion reaches 100 while Ram is AWAY | The Furious episode covers his next visit |
| Suspicion drops below 100 during an episode | The episode continues until that visit resolves, then suspicion is set to 80 |
| Kill switch off during a Furious episode | The episode ends with no cut. When power comes back on, suspicion = max(current, 80) |
| Judge down or slow | Commands still work through the code parser. Social flags are neutral. The game stays playable without the LLM |
| Voice down or slow | Canned lines by outcome. State is unaffected |
| Player turns to a view while Ram is AT_ENTRY elsewhere | Nothing in that view and no sound. Only the view of the target entry shows the visual tell |
| Player spams quick buttons | 0.5 s cooldown. Same CHUD rules apply. Buttons never count as talking |
| Player types in another language | The judge still scores it. The code parser may miss the command, so quick buttons are the fallback |
| Player locks an entry where no one is | Wasted: nothing is defended, the room is dark. No penalty beyond that |
| Player drops the lock (switches to lights) to peek while Ram is still at that entry | Allowed. If his window ends before the lock lands again, it's a breach (`PEEKED`) |
| Ram arrives at another entry while the player sits locked in the dark | Fair. Its tell is faint in the dark, and a WARM CHUD warns. Staying blind is the player's choice |
| CHUD's band changes mid-visit | The arrival warning and the "he's gone" line fire only if CHUD is WARM at that exact moment |
| A decoy noise plays at the same moment Ram arrives | Coincidence only. Decoys are scheduled without reading Ram's state |
| Two timer events at the same moment | Order: resolve the attempt end, then 6:00 AM check, then question timeout, then silence tick, then scheduled question, then sabotage roll |

## 14. Tuning knobs (one config file)
- Per night: AWAY gap, approach time, attempt window, lull chance, quick-return chance, decoy interval, fake-out chance, starting suspicion, question count and mix, lie chances.
- Global: the hour ramp multipliers (7.6), `HOUR_LENGTH`, `RELAY_DELAY`, `TRAVEL_TIME`, `HOLD_MAX`, `BRACE_REST`, `HOLD_COOLDOWN`, `EDGE_DWELL`, the turn times, `QUESTION_TIMEOUT`, `SILENCE_LIMIT`, every value in the 8.2 table, the per-message clamp, the sabotage chance, the Furious reset value, the reboot time and the post-reboot suspicion floor.
- Targets to tune toward: first-try survival of about 90%, 75%, 55%, 35% and 20% for nights 1 to 5.

## 15. Playtest checklist
- Night 1 is clear with no explanation beyond the on-screen hints, and the player survives.
- A player who ignores CHUD and only looks and braces can survive night 1 but not night 3. A player who keeps CHUD WARM survives night 2 mostly on its warnings. This shows CHUD matters.
- A player who always uses quick buttons and never types sees suspicion climb from silence ticks, and struggles from night 2.
- Lies get caught at least sometimes, by looking with the lights.
- Decoy noises make players flinch and check, but players never learn to read them as a cue (they don't correlate).
- No player can say "I always knew where he was" after night 3.
- After a loss, the player can tell what went wrong without being told ("I should have checked the window").
- Injection test kit (about 30 strings) never changes suspicion except through the `manipulation` penalty, and never names the true entry during a lie.
- The game is fully playable with the LLM turned off (code parser plus canned lines).
- Controls: a first-time player finds the left, right and behind views without being told (night 1 hints only). Edge turns are not triggered by accident while moving the mouse. Click to go, hold to brace, edge to return is clear without a tutorial. 6 s per brace with a 1 s rest feels right. The night 5 attempt window (3 s) is still reachable with these controls.
