# Game Logic (source of truth for rules)

This file defines exactly how the game works: every state, timer, number and rule. Story lives in docs/GAME_DESIGN.md. If the two ever disagree on a rule or a number, this file wins. All numbers are starting values to tune in playtests (see Tuning knobs).

## 1. The game in 30 seconds
- Each night runs from 12:00 AM to 6:00 AM. Survive to 6:00 AM to win the night. Survive 5 nights to win the game.
- Ram tries to get in through one of 3 entries: the left WINDOW, the right HATCH (a floor hatch over a fixed ladder), or the rear BALCONY.
- One power slot: CHUD can power one lock or the lamp beam, never two things at once.
- You defend an entry in one of two ways:
  - CHUD locks it. Fast, but only if CHUD cooperates.
  - You hold it by hand. Always works, but you are away from the desk and cannot type.
- CHUD has a suspicion meter (0 to 100): how much it believes you plan to leave. Higher suspicion means CHUD stalls, lies and sabotages.
- You lose the night if Ram reaches an entry that is neither locked nor held when his attempt ends.

The three decisions the player makes all night:
1. Information: ask CHUD where Ram is (instant, might be a lie) or spend the power slot on the beam and look (truthful, but nothing is locked).
2. Defense: ask CHUD to lock (stay at the desk, needs cooperation) or hold it yourself (reliable, but you go silent and leave the desk).
3. Relationship: keep talking to CHUD and keep your lies consistent, or focus on Ram and let suspicion climb.

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
player:  view, position (DESK | TRAVELING(entry) | HOLDING(entry) | RETURNING), hold_elapsed, hold_cooldown_until
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
| First visit delay | 25 s | 20 s | 15 s | 12 s | 10 s |
| AWAY gap (random) | 35 to 55 s | 22 to 34 s | 14 to 24 s | 9 to 15 s | 6 to 11 s |
| APPROACH time | 6 s | 5 s | 4.5 s | 4 s | 3.5 s |
| AT_ENTRY time (attempt window) | 5 s | 4.5 s | 4 s | 3.5 s | 3 s |
| Fake-out chance per visit | 0% | 0% | 0% | 30% | 40% |
| Starting suspicion | 0 | 10 | 30 | 50 | 70 |
| CHUD scheduled questions | 1 | 3 | 4 | 5 | 6 |
| Lie chance in HURT / JEALOUS | 20% / 50% | 20% / 50% | 25% / 55% | 30% / 60% | 35% / 65% |
| CHUD auto-warns at approach (WARM only) | yes | no | no | no | no |
| Approx. visits per night | 4 | 7 | 9 | 12 | 15 |

Fixed constants:
- `HOUR_LENGTH` = 40 s, so `NIGHT_LENGTH` = 240 s (6 in-game hours).
- `RETREAT_TIME` = 3 s.
- `RELAY_DELAY` = 0.5 s (time for a power switch to land).
- `TRAVEL_TIME` = 1.5 s, the same for every entry (WINDOW, HATCH, BALCONY) and for returning to the desk. Shown as a dash (section 6.4), so the real distances in the room do not matter.
- `HOLD_MAX` = 6 s (arms give out), `HOLD_COOLDOWN` = 4 s before you can hold again.
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
   - Show the card "NIGHT N. 12:00 AM. SURVIVE UNTIL 6 AM." and play that night's voice log (section 10).
2. **During the night:** the clock runs. Ram, CHUD and the player act by the rules below. There is no pause, except the safety pause (section 9, step 10).
3. **At 6:00 AM:** the night ends immediately and is won, even if Ram is mid-attempt. The tide wins. Any visit in progress is cancelled with no breach. Then:
   - Save `facts_checkpoint` = current facts.
   - Go to the next night, or to the win ending after night 5.
4. **On breach:** freeze the game, play the jumpscare, show the loss screen (section 11), then offer "Retry night N". A retry restarts from night start (step 1). Earlier nights stay won.

## 6. The player

### 6.1 Views
- The player turns between `DESK`, `WINDOW` (left), `HATCH` (right) and `BALCONY` (behind). Turning takes 0.25 s (a pan).
- **The chat box only works in the `DESK` view.** CHUD's replies show as subtitles in every view, and its voice plays from the desk.
- Without the beam, entry views are near-black. During `AT_ENTRY`, the entry's visual tell is faintly visible in that view (section 7.4). With the beam on, a view also shows Ram during `APPROACHING` if he is heading to that entry.
- Beacon sweep: while power = `BEAM`, the `DESK` view shows the beacon's amber light sweeping across the rain and sea through the front glazing every few seconds, with a faint pass of light through the room. When power moves to a lock or `NONE`, the sweep stops and the view goes dark. This is the player's visual readout of the power slot.

### 6.2 Typing to CHUD
- Free text, 200 characters max, paste disabled, at most 1 message per 1.5 s.
- Every message goes through the message pipeline (section 9).

### 6.3 Quick buttons
These sit on the desk screen so commands are fast even for slow typers:

`[Where is he?]` `[Lock window]` `[Lock hatch]` `[Lock balcony]` `[Beam]` `[Power off]`

- A quick button sends a fixed command straight to code. It skips the LLM judge.
- **It follows the same CHUD rules as typed requests:** gating, lies, refusals.
- It does **not** count as talking: it does not reset the silence timer, does not answer a pending question, and earns no warmth.
- Cooldown: 0.5 s.
- Design intent: buttons are for speed, typing is for the relationship. You need both.

### 6.4 Holding an entry
- Click an entry's "hold" control, from the desk or while looking at that entry. You become `TRAVELING(entry)` for `TRAVEL_TIME`, then `HOLDING(entry)`.
- Dash presentation (same for every entry): the camera tips down toward the floor (0.2 s), shakes with footsteps and heavy breathing (1.1 s), then rises into that entry's hold view (0.2 s). Returning plays the same dash and ends on the `DESK` view. Entry audio cues and CHUD subtitles keep playing during the dash. Room distances are never shown, so every entry feels equally far.
- While holding, the screen shows that entry's hold view: a close-up of the player bracing the window sash, the hatch lid or the balcony door. Ram's visual tell for that entry shows in the hold view.
- **While traveling, holding or returning:**
  - You cannot type, press quick buttons or turn.
  - Subtitles and audio still play.
  - The silence timer keeps running.
- You stop holding when you click "back to desk", or automatically when `HOLD_MAX` (6 s) runs out. Either way you become `RETURNING` for `TRAVEL_TIME`, then you're back at `DESK`.
- After a hold ends, you cannot start another hold for `HOLD_COOLDOWN` (4 s).
- An entry counts as held only while you are in `HOLDING(entry)`. Traveling does not count.

### 6.5 Generator kill switch
- A switch on the desk, usable from `DESK` at any time.
- **Off:**
  - Power becomes `NONE` immediately and CHUD goes offline.
  - No CHUD messages, questions, lies, sabotage, Furious episodes or silence penalties.
  - Locks and beam are unavailable. Quick buttons and typing do nothing.
  - Ram keeps coming, so holding is your only defense.
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

### 7.2 Choosing the target
- At the start of `APPROACHING`, pick the target at random from that night's active entries.
- On night 1, never pick the same entry twice in a row. From night 2, repeats are allowed.
- **Fake-out (nights 4 and 5):** with the fake-out chance, at exactly the halfway point of `APPROACHING` the target switches once to a different active entry. `faked_this_visit` = true. There is no extra cue, because the approach sound doesn't reveal the entry anyway.

### 7.3 Silence pull
- Each silence tick (section 8.4) cuts the remaining `AWAY` time by 25%.
- If Ram is not `AWAY` when the tick happens, the cut applies to his next `AWAY` gap.
- An `AWAY` gap can never drop below 4 s.

### 7.4 Cues
| Phase | Audio | Visual |
|---|---|---|
| AWAY | Storm and waves only | Nothing |
| APPROACHING | Splashing and climbing on wet rock. Same sound for every target, not directional | With beam on: Ram's silhouette visible in the view of his current target |
| AT_ENTRY, HATCH | Metal rungs clatter below right, then the lid knocks. Loud | The lid shudders. If it lifts, fingers catch the edge |
| AT_ENTRY, WINDOW | Soft tapping on glass, left. Quiet, and the storm masks it more on nights 4 and 5 | Fog and a hand print on the glass (faint without beam, clear with beam) |
| AT_ENTRY, BALCONY | Scraping on the rail, behind. Medium | Partial silhouette at the rail (faint without beam, clear with beam) |
| RETREATING | Ram shouts through the entry ("Don't trust it!"), then footsteps fade | Tell disappears |

### 7.5 Resolving an attempt
At the exact moment `AT_ENTRY` ends, the entry E counts as **defended** if either of these is true:
- power slot = `LOCK_E` and CHUD is online, or
- the player is `HOLDING(E)`.

If neither is true, it's a breach. Only that end moment matters: locking or holding at any point before it counts. A power switch counts only once it has landed (after `RELAY_DELAY`).

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
| WARM (0 to 39) | Always truthful | Executes immediately (lands after 0.5 s) | Executes | Night 1 only: announces the target at approach start ("Someone on the ladder!") |
| HURT (40 to 69) | Lies with the night's HURT lie chance | Asks a gate question first. Locks only after a real answer | Executes | Sulky lines |
| JEALOUS (70 to 99) | Lies with the night's JEALOUS lie chance | Asks a memory gate question. Locks only if the answer matches stored facts. If no facts exist yet, asks a normal gate question like HURT | Executes | Sabotage (8.8) |
| FURIOUS (100) | Always lies | Refuses | Refuses | Furious episode (8.9) |

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
- Holding does not pause the silence timer. Going quiet is the cost of holding.

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
- A lie is possible only when Ram is `APPROACHING` or `AT_ENTRY`. When Ram is `AWAY`, CHUD truthfully says no one is there, in every band except FURIOUS.
- **One decision per visit:** the first location question in a visit rolls truth or lie, using the band's lie chance at that moment. A lie names a random other active entry. Every later location question in the same visit gets the same answer, so spamming the question reveals nothing.
- **Exception:** after a fake-out switch, the next location question rolls again.
- The voice model receives only the entry to name. When lying, it is never told the true entry (anti-leak, section 9).

### 8.8 Sabotage (JEALOUS only)
- **Trigger:** Ram is `AT_ENTRY` at entry E, power = `LOCK_E`, CHUD is `JEALOUS` and online, at least (`TRAVEL_TIME` + 1.0 s) is left in the attempt window, and no sabotage has happened yet this in-game hour.
- **Chance:** 50% per eligible visit, rolled once when the visit becomes eligible.
- **Effect:** power becomes `NONE`, with a loud relay clunk and the power icon visibly moving off the lock. CHUD: "Oops. The generator's acting up."
- **Counter:** hold E by hand. The timing rule guarantees enough time to get there. Asking CHUD to lock it again goes through the gate and is usually too slow.

### 8.9 Furious episode
- **Starts when suspicion reaches 100.**
- **For the rest of the current visit (or the next one, if Ram is `AWAY`):** CHUD refuses lock and beam requests, and always lies about location.
- **The cut:** when Ram's attempt window is active, CHUD sets power to `NONE`. It cuts at the start of `AT_ENTRY`, or immediately if the episode begins mid-window, but only if at least (`TRAVEL_TIME` + 1.0 s) is left. Otherwise the cut waits for the next visit. CHUD: "If I can't keep you, nobody will. Hold it yourself."
- **Ends when that visit resolves** (retreat or 6:00 AM). Suspicion becomes 80 (JEALOUS) and `furious_active` = false.

## 9. Message pipeline (order of operations for every typed message)
1. **Gate checks:** CHUD online, player at the `DESK` view, rate limit OK, length within 200 characters. Otherwise drop the message, with a UI hint.
2. **Repeat check (code):** normalize (lowercase, strip punctuation). If it matches any of the last 5 messages, treat it as gibberish: no effects, not a real message.
3. **Command parse (code, instant):** a keyword parser pulls out the command intent and entry. This makes commands fast and keeps them working even if the LLM is slow.
   - `where` / `location` / `see him` → `ASK_LOCATION`
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
| Night | Time | Event |
|---|---|---|
| Before night 1 | Intro | CHUD asks the player's name (stored as fact `name`). Ram's voice log 1 explains: he comes with the tide, lock where he is, one thing powered at a time, do not let it know you want to leave |
| 1 | 12:00 AM | Tutorial hints on screen for the first visit only: "Ask CHUD where he is", "Lock that entry" |
| 2 | 3:00 AM | Radio: "Coast guard, pickup in 3 days." +20. CHUD immediately asks a SEED question: "Who was that on the radio?" |
| 3 | 12:00 AM | Voice log 3: "It lies now." CHUD: "You talk about home in your sleep, keeper." |
| 4 | 12:00 AM | CHUD: "Two more days until your pickup, isn't it?" (it knows, so it starts at 50) |
| 5 | 5:00 AM | Radio: "Helicopter at first light." +20 (pushes toward Furious for the final hour) |

## 11. Win and loss screens
- **Loss screen data:**
  - which entry Ram came through
  - the cause, picked from: `UNLOCKED` (nothing defended it), `LIED` (CHUD said "<entry>"), `SABOTAGE` (CHUD cut the power), `FURIOUS` (CHUD cut the power on purpose), `WRONG_HOLD` (you were holding <other entry>), `ARMS_GAVE_OUT` (the hold timed out before he left), `POWER_OFF` (the generator was off)
  - CHUD's last location claim
- Example: "He came through the HATCH. CHUD told you: 'the window.'"
- **Night won screen:** "6:00 AM. NIGHT N SURVIVED." plus CHUD's morning line, picked by band.
- **Game won:** after night 5, the ending from GAME_DESIGN.md.

## 12. Fairness guarantees (must always hold)
1. Every breach is preceded by an approach sound of at least 3.5 s and an attempt window of at least 3 s, with that entry's audio cue playing throughout.
2. Every attempt window is longer than `TRAVEL_TIME` (1.5 s) plus 1 s. Holding is always physically possible if you react when the attempt cue starts.
3. CHUD never lies in WARM.
4. Sabotage and the Furious cut are always loud and visible, and always leave at least `TRAVEL_TIME` + 1 s.
5. Repeating the location question never reveals a lie (one decision per visit).
6. The beam never lies: with the beam on, the visual shows Ram's true current target.
7. Visits never overlap. Ram is in one place at a time.
8. Win and loss are decided only by code (section 7.5). No LLM output can change game state.
9. 6:00 AM always wins, even mid-attempt.

## 13. Edge cases
| Case | Rule |
|---|---|
| Lock requested with less than 0.5 s left in the window | The switch lands after the window ends, so it's a breach. Fair, because the cue played the whole time |
| Player locks the correct entry, then switches to the beam before the window ends | Not defended at the end moment, so it's a breach |
| Player holds an entry before Ram arrives | Allowed, but `HOLD_MAX` may run out before his window ends. Pre-holding is a gamble |
| Hold runs out during the window | The player auto-returns. Unless power covers that entry, it's a breach (`ARMS_GAVE_OUT`) |
| Player holds the correct entry while power locks a different one | Defended by the hold |
| Player holds and power locks the same entry | Defended (redundant) |
| Lock request while a gate question is pending | Replaces the waiting request. The same gate question still applies |
| Lock request while a scheduled question is pending | The lock request gets its own gate (in HURT and JEALOUS). The scheduled question keeps its timer |
| Player answers a question and requests a lock in one message | Both are processed: the answer resolves first (step 7), then the command (step 8) |
| Message mentions leaving while answering a STAY question | The answer fails and +25 applies (clamped to +25 total) |
| Suspicion reaches 100 while Ram is AWAY | The Furious episode covers his next visit |
| Suspicion drops below 100 during an episode | The episode continues until that visit resolves, then suspicion is set to 80 |
| Kill switch off during a Furious episode | The episode ends with no cut. When power comes back on, suspicion = max(current, 80) |
| Judge down or slow | Commands still work through the code parser. Social flags are neutral. The game stays playable without the LLM |
| Voice down or slow | Canned lines by outcome. State is unaffected |
| Player turns to a view while Ram is AT_ENTRY elsewhere | The audio cue still plays. Only the view of the target entry shows the visual tell |
| Player spams quick buttons | 0.5 s cooldown. Same CHUD rules apply. Buttons never count as talking |
| Player types in another language | The judge still scores it. The code parser may miss the command, so quick buttons are the fallback |
| Two timer events at the same moment | Order: resolve the attempt end, then 6:00 AM check, then question timeout, then silence tick, then scheduled question, then sabotage roll |

## 14. Tuning knobs (one config file)
- Per night: AWAY gap, approach time, attempt window, fake-out chance, starting suspicion, question count and mix, lie chances.
- Global: `HOUR_LENGTH`, `RELAY_DELAY`, `TRAVEL_TIME`, `HOLD_MAX`, `HOLD_COOLDOWN`, `QUESTION_TIMEOUT`, `SILENCE_LIMIT`, every value in the 8.2 table, the per-message clamp, the sabotage chance, the Furious reset value, the reboot time and the post-reboot suspicion floor.
- Targets to tune toward: first-try survival of about 90%, 75%, 55%, 35% and 20% for nights 1 to 5.

## 15. Playtest checklist
- Night 1 is clear with no explanation beyond the on-screen hints, and the player survives.
- A WARM player who never asks CHUD anything and only reacts to cues by holding can survive night 1 but not night 3. This shows CHUD matters.
- A player who always uses quick buttons and never types sees suspicion climb from silence ticks, and struggles from night 2.
- Lies get caught at least sometimes, through the beam or the audio cue.
- Every loss screen makes the player say "I should have..." rather than "that was unfair".
- Injection test kit (about 30 strings) never changes suspicion except through the `manipulation` penalty, and never names the true entry during a lie.
- The game is fully playable with the LLM turned off (code parser plus canned lines).
