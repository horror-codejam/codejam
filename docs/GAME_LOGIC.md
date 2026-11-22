# Game Logic (source of truth for rules)

This file defines exactly how the game works: every state, timer, number and rule. Story lives in docs/GAME_DESIGN.md. If the two ever disagree on a rule or a number, this file wins. All numbers are starting values to tune in playtests (see Tuning knobs).

## 1. The game in 30 seconds
- Each night runs from 12:00 AM to 6:00 AM (5 real minutes). Survive to 6:00 AM to win nights 1 to 4. Night 5 is won only by typing the kill code into CHUD's chat before 6:00 AM (section 6.7).
- Ram tries to get in through one of 3 entries: the left WINDOW, the right HATCH (a floor hatch over a fixed ladder), or the rear BALCONY.
- **Ram is silent.** He makes no sound and never speaks. The house makes plenty of noise (creaks, knocks, metal), and none of it is him. You find him only by looking (with a light) or by asking CHUD.
- **One power slot:** one magnetic lock or one entry light, never two things at once. The lights are yours: hold Shift and the entry you are looking at is lit. The locks go through CHUD, and CHUD can refuse.
- **Locked = blind.** A locked entry shows nothing. To look, you light it, and the light drops the lock.
- You defend an entry in one of two ways:
  - CHUD locks it. Fast, but CHUD can hijack the request and refuse with a smile.
  - You go to it and brace it by hand. Always works, but you are away from the desk and cannot type.
- CHUD has a suspicion meter (0 to 100): how much it believes you plan to leave. Higher suspicion means CHUD refuses locks, cuts your light, lies and sabotages.
- If Ram's attempt ends at an entry that is neither locked nor held, he gets in **silently**. He is now in the room. The scare comes when you look at his entry with the light on, put down what you are reading, or by one rolled extra trigger. 6:00 AM with him inside is a loss.
- Design intent: constant fear, low frequency. Few visits, long silences, and every sound might be him.

The three decisions the player makes all night:
1. Information: ask CHUD where he is (instant, might be a lie) or hold Shift and look (truthful, but the light drops any lock).
2. Defense: ask CHUD to lock (stay at the desk, CHUD may refuse) or brace it yourself (reliable, but you go silent and leave the desk).
3. Relationship: keep talking to CHUD and keep your lies consistent, or focus on Ram and let suspicion climb.

## 2. Core terms
| Term | Meaning |
|---|---|
| Entry | One of `WINDOW` (left), `HATCH` (floor hatch on the right), `BALCONY` (behind) |
| View | What the player is looking at: `DESK`, `WINDOW`, `HATCH`, `BALCONY` |
| Power slot | One of `NONE`, `LIGHT_WINDOW`, `LIGHT_HATCH`, `LIGHT_BALCONY`, `LOCK_WINDOW`, `LOCK_HATCH`, `LOCK_BALCONY` |
| Visit | One full attempt by Ram: approach, attempt at an entry, then retreat or a silent breach |
| Breach | Ram's attempt ends and his entry is not defended. He becomes `INSIDE` (section 7.7). The night is lost at the scare |
| Scare | The moment the night is lost: the creepy flash (if lit), the jumpscare, the loss screen |
| Decoy | A house noise (creak, knock, metal, glass) from a separate random stream that never knows where Ram is |
| Suspicion | Number 0 to 100 owned by game code. Sets CHUD's mood band |
| Band | `WARM` 0 to 39, `HURT` 40 to 69, `JEALOUS` 70 to 99, `FURIOUS` at 100 (an episode, see 8.9) |
| Fact | Something the player claimed about themselves, stored by code (for example `home_port = Halifax`) |
| Pending question | A scheduled CHUD question waiting for an answer, with a 10 s timer |

## 3. Game state (what code tracks)
```
run:     night (1..5), facts_checkpoint (facts at the start of the current night), papers_checkpoint (slips collected at the last won night), kill_code (4 characters, random per run), ending (null or KILL_CODE; set when the code is accepted). Night 5 adds the phase TRAPPED (6:00 AM without the code)
papers:  collected (0 to 4, lying on the desk), floor (entry and index of a slip on the floor, or null)
clock:   elapsed_s (0..NIGHT_LENGTH), in-game time = 12:00 AM + elapsed_s / HOUR_LENGTH hours
player:  view, position (DESK | TRAVELING(entry) | STANDING(entry) | HOLDING(entry) | RETURNING), hold_elapsed, brace_rest_until,
         hold_cooldown_until, light_held (Shift), reading (artifact id such as `paper2`, or null)
power:   slot, pending_switch (target slot + time it lands), chud_online (bool), rebooting_until, light_cut_at (or null)
ram:     state (AWAY | APPROACHING | AT_ENTRY | RETREATING | INSIDE), target_entry, state_ends_at, faked_this_visit (bool),
         attempt_length (rolled per visit), last_gap (length, kind first | normal | lull | quick),
         inside (entry, since, trigger, timer_at, cause, held_entry, last_claim) or null
chud:    suspicion, pending_question (type, text, asked_at), facts{}, last_location_claim (entry, "none" or "inside"),
         visit_location_decision (truth | lie, claim, rolled_inside), last_sabotage_hour, furious_active (bool), last_light_cut_line_at
decoy:   next_at, count (own seeded stream, never reads Ram)
timers:  last_real_message_at, last_warm_bonus_at, silence_ticks
log:     last 10 player messages (normalized, for repeat detection), what CHUD last said about Ram's location,
         this visit: sabotaged, furious_cut, arms_gave_out, peeked_from, refused_entry
```

## 4. Per-night parameters
| Parameter | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
|---|---|---|---|---|---|
| Active entries | HATCH, WINDOW | all 3 | all 3 | all 3 | all 3 |
| First visit delay | 60 s | 40 s | 30 s | 20 s | 15 s |
| AWAY gap base (random, before the hour ramp) | 50 to 70 s | 36 to 52 s | 32 to 46 s | 28 to 42 s | 25 to 37 s |
| APPROACH time | 12 s | 9 s | 5 s | 4.5 s | 4 s |
| AT_ENTRY time (attempt window, random per visit) | 20 to 25 s | 14 to 17 s | 12 to 15 s | 10 to 12 s | 8 to 10 s |
| Lull chance per gap | 0% | 15% | 15% | 15% | 15% |
| Quick return chance per gap | 0% | 0% | 15% | 20% | 25% |
| Decoy interval (random) | 15 to 30 s | 12 to 25 s | 10 to 20 s | 8 to 16 s | 6 to 14 s |
| Fake-out chance per visit | 0% | 0% | 0% | 30% | 40% |
| Starting suspicion | 0 | 10 | 30 | 50 | 70 |
| CHUD scheduled questions | 1 | 3 | 4 | 5 | 6 |
| Lie chance in HURT / JEALOUS | 20% / 50% | 20% / 50% | 25% / 55% | 30% / 60% | 35% / 65% |
| Visit target (no silence pulls) | 3 | 3 to 4 | 5 to 6 | 6 to 7 | 7 to 8 |
| Measured average (oracle bot in `prototype/tools/playtest`, 100 seeds, no pulls) | 3.00 | 3.92 | 5.20 | 6.15 | 7.21 |

A player who never talks gets a silence tick every 45 s, and each tick pulls Ram closer (7.3). Measured with a silent player: about 4.3, 5.6, 6.9, 8.0 and 9.3 visits.

Fixed constants:
- `HOUR_LENGTH` = 50 s, so `NIGHT_LENGTH` = 300 s (6 in-game hours, 5 real minutes).
- `HOUR_RAMP` = 1.25, 1.15, 1.0, 0.95, 0.85, 0.8 for the hours 12, 1, 2, 3, 4 and 5 AM (multiplies the AWAY gap, section 7.6).
- `LULL_MULT` = 1.8, `QUICK_RETURN_GAP` = 4 to 7 s.
- `RETREAT_TIME` = 3 s.
- `RELAY_DELAY` = 0.5 s (time for a lock switch to land). Lights are instant.
- `TRAVEL_TIME` = 1.5 s, the same for every entry (WINDOW, HATCH, BALCONY) and for returning to the desk. Shown as a dash (section 6.4), so the real distances in the room do not matter.
- `HOLD_MAX` = 6 s (one brace, then the arms give out), `BRACE_REST` = 1 s before you can brace again at the same entry, `HOLD_COOLDOWN` = 4 s before the next trip from the desk (starts when you leave the entry).
- `EDGE_DWELL` = 0.3 s (mouse held at a screen edge to turn or return). Turn time 0.25 s (balcony 0.4 s).
- `QUESTION_TIMEOUT` = 10 s.
- `SILENCE_LIMIT` = 45 s.
- `LOCATION_SPAM_WINDOW` = 60 s, `LOCATION_SPAM_PENALTIES` = +5 (2nd request), +10 (3rd and later), `LOCATION_REFUSE_TIME` = 20 s (8.3).
- `FLATTERY_WINDOW` = 60 s, `FLATTERY_COUNT` = 3, `FLATTERY_PENALTY` = +10 (8.2). `WARM_BONUS_COOLDOWN` = 45 s.
- `INSIDE_TRIGGER_WEIGHTS` = TIMER 40%, NONE 30%, MOVE 30%. `INSIDE_TIMER` = 4 to 12 s.
- `LOCK_REFUSAL` by band = WARM 0%, HURT 25%, JEALOUS 55%, FURIOUS 100%.
- `LIGHT_CUT` by band = WARM 0%, HURT 25%, JEALOUS 50%, FURIOUS 85%, per light-on. `LIGHT_CUT_DELAY` = 1.0 to 2.5 s after the light came on. `LIGHT_CUT_LINE_GAP` = 5 s.

Note on night 1: it uses 2 entries (HATCH and WINDOW), not 1. With a single entry the player locks it once and the night is solved. Night 1 is a slow burn: the first visit comes at 60 s (1:12 AM) and there are only 3 visits (4 or 5 for a silent player).

## 5. Night flow

**Before Night 1:** New Game opens the practice evening after the player gives their name. The real controls and their local timers work while the night clock stays at zero. Practice has no threat, visits, jumpscare, suspicion changes or scripted beats. The player can explore, follow the prompts, or skip. Starting Night 1 resets the room and retains the keeper name. Continue opens the saved night card.

1. **Night start:**
   - Reset everything to night-start values:
     - suspicion = starting suspicion
     - facts restored from `facts_checkpoint`
     - slips collected restored from `papers_checkpoint`, no slip on the floor
     - power `NONE` (dark, nothing locked, no light), CHUD online, Ram `AWAY` with the first visit delay
     - player at `DESK` facing `DESK`, Shift not held, not reading, no pending question
     - the decoy stream reseeded for this night
   - Show "12:00 AM" and "Night N" on a timed midnight card.
2. **During the night:** the clock runs. Ram, CHUD, the decoys and the player act by the rules below. Esc toggles the player pause: everything freezes (clock, Ram, CHUD, timers, sound) and the scene is dimmed so it cannot be studied. The tab being hidden pauses automatically. The only other pause is the safety pause (section 9, step 10). Reading a desk artifact does **not** pause (6.6).
3. **At 6:00 AM:**
   - If Ram is `INSIDE`: the scare fires (reason `DAWN`) and the night is lost. Surviving to dawn is not enough if he is already in the room.
   - Night 5 and Ram is not inside: the code was not typed (a correct code ends the night at once, 6.7), so the phase becomes `TRAPPED` (section 11). The visit in progress is cancelled with no breach. `facts_checkpoint` and `papers_checkpoint` are not saved.
   - Nights 1 to 4 and Ram is not inside: the night ends immediately and is won, even if Ram is mid-attempt. The tide wins. Any visit in progress is cancelled with no breach. Then:
     - Save `facts_checkpoint` = current facts and `papers_checkpoint` = slips collected.
     - Go to the next night.
4. **On the scare (the loss):**
   - If the scare was set off by looking (reason `LOOK`, or `ARRIVED` with the entry's light on): a creepy full-frame flash of Ram standing inside the lit entry, about 0.4 s (0.3 to 0.5), then the jumpscare.
   - Otherwise straight to the jumpscare.
   - Play `jumpscare.wav` and the entry-specific impact as the jumpscare frames start. The `INSIDE` transition stays silent.
   - Then cut to black with a short static burst and offer "Title" (section 11). The highest unlocked night stays saved.

## 6. The player

Controls (adopted 2026-11-21, FNAF 4 style, history in [docs/CONTROLS_PROPOSAL.md](CONTROLS_PROPOSAL.md)): the mouse moves you, Shift is the light, the rest of the keyboard is only for chat (plus Esc to pause).

### 6.1 Views, turning and the light
- The player turns between `DESK`, `WINDOW` (left), `HATCH` (right) and `BALCONY` (behind). Turning takes 0.25 s (`BALCONY` 0.4 s) and is a fast slide.
- **Turning is by mouse screen edge.** Hold the mouse at the edge for `EDGE_DWELL` (0.3 s):

| From | Left edge | Right edge | Bottom edge |
|---|---|---|---|
| `DESK` | `WINDOW` | `HATCH` | `BALCONY` |
| `WINDOW` | n/a | back to `DESK` | n/a |
| `HATCH` | back to `DESK` | n/a | n/a |
| `BALCONY` | n/a | n/a | back to `DESK` |

- After any turn, edges re-arm only once the pointer has left every edge zone, so one push never turns twice. Hovering a button or input never counts as an edge. Turning only works from the `DESK` position (not while traveling, standing, bracing or returning).
- **The chat box only works in the `DESK` view.** At the desk, typing any key goes to the chat (Shift never does). CHUD's replies show as subtitles in every view, and its voice plays from the desk.
- **The light (hold Shift):** while Shift is held, the light of the entry you are looking at is on. That is the entry view at the desk, or the entry you stand at or brace. Release Shift and the light is off.
  - It takes the one power slot: the slot becomes `LIGHT_<entry>` **instantly** (no relay delay). Any lock, engaged or still on its way, drops at once. This is how a player can peek and lose a lock (`PEEKED`, section 11).
  - Release sets the slot to `NONE`. A lock dropped for the light does not come back by itself.
  - Turning while Shift is held moves the light to the new view. Turning to `DESK` turns it off. At the `DESK` view Shift does nothing.
  - CHUD can never stop a light from coming on. It has no light command at all (no typed light request, no light button).
  - **CHUD can force the light off** (HURT, JEALOUS and FURIOUS only, never WARM, never while offline or rebooting). Each light-on rolls once with the band's `LIGHT_CUT` chance. On a hit, `LIGHT_CUT_DELAY` (1.0 to 2.5 s) after the light came on, the light snaps off to `NONE` with a small flicker and a soft electrical tick. Holding Shift through the cut stays dark: release and press Shift again to relight it instantly. Each new press rolls again. On a cut CHUD says a short possessive line ("You don't need that. You have me.", "Leave it off, keeper. I'm watching for you.", "Why look out there? Look at me.", "The dark is cosier."), at most one line per `LIGHT_CUT_LINE_GAP` (5 s), never naming the threat. JEALOUS and FURIOUS cuts also show CHUD's malicious smile for a moment.
  - A lock that lands while Shift is held (a slow typed request) wins: the slot becomes that lock and the light stays off until Shift is pressed again.
  - The power bar on CHUD's screen shows the light like the lock cells: a `LIGHT` cell lit while any entry light is on (flashes red on a forced cut).
- **What a view shows (the light never lies):**
  - Entry dark, unlocked, Ram `AT_ENTRY` there: a faint tell.
  - Entry dark and locked (`LOCK_<entry>`): nothing at all. **Locked = blind.**
  - Entry lit: the tell clearly; while Ram is `APPROACHING` that entry, a hint of him; while he is `INSIDE` through that entry, him, in the room (and the scare, 7.7).
  - The light of one entry never lights another. The `DESK` view is never lit by an entry light.
- Locks are magnetic. Their state is shown on the map on CHUD's screen.
- Beacon sweep: the lighthouse beacon sweeps past the front glazing in the `DESK` view during play. It is exterior ambience only: it does not light the room, does not use the power slot and says nothing about Ram.
- Pointer ring: a small ring on the pointer shows the edge dwell, the brace time left (turns red near the end), the brace rest and the `HOLD_COOLDOWN`. It is hidden while walking.

### 6.2 Typing to CHUD
- Free text, 200 characters max, paste disabled, at most 1 message per 1.5 s.
- Every message goes through the message pipeline (section 9).

### 6.3 Quick buttons
These buttons on CHUD's desk terminal send commands without typing.

`where is it`, `unlock all`, and the map buttons `W`, `H` and `B`

- There are no light buttons. The light is Shift (6.1).
- A quick button sends a fixed command straight to code. It skips the LLM judge.
- **It follows the same CHUD rules as typed requests:** lock refusals (8.3), lies.
- It does **not** count as talking: it does not reset the silence timer, does not answer a pending question, and earns no warmth.
- `unlock all` clears the active lock. The light stays available on Shift.
- Cooldown: 0.5 s.
- Design intent: buttons are for speed, typing is for the relationship. You need both.

### 6.4 Going to an entry, standing, bracing, returning
Positions: `DESK`, `TRAVELING(entry)`, `STANDING(entry)`, `HOLDING(entry)`, `RETURNING`.
- **Go:** from `DESK`, while looking at that entry's view, one left click starts the dash. You become `TRAVELING(entry)` for `TRAVEL_TIME`, then `STANDING(entry)` (at the entry, not defending). Allowed only once `HOLD_COOLDOWN` is over. If the left button is still held at arrival (or pressed during the dash), you brace on arrival.
- Dash presentation (same for every entry): the camera tips down toward the floor (0.2 s), shakes with footsteps and heavy breathing (1.1 s), then rises into that entry's close-up (0.2 s). Returning plays the same dash and ends on the `DESK` view. CHUD subtitles keep playing during the dash. Room distances are never shown, so every entry feels equally far.
- **Brace:** while `STANDING(entry)`, hold the left mouse button to become `HOLDING(entry)`, the only hand defense. The close-up leans in and shows the arms. Ram's visual tell for that entry shows in the close-up, and while he pushes the camera is shoved (felt, never heard).
  - Releasing the button returns you to `STANDING(entry)`.
  - One brace lasts at most `HOLD_MAX` (6 s). Then the arms give out and you are `STANDING(entry)`. A new brace needs a fresh press (a press held when the arms gave out does not count). It starts once `BRACE_REST` (1 s) has passed since the last brace ended; a press made during the rest braces as soon as the rest ends.
- **Return:** from `STANDING` or `HOLDING`, hold the return edge of that entry's view (section 6.1 table) for `EDGE_DWELL`. You become `RETURNING` for `TRAVEL_TIME` (the brace ends), then `DESK` with view `DESK`. Nothing sends you back automatically.
- `HOLD_COOLDOWN` (4 s) starts when you leave the entry and gates the next trip from the desk (2.5 s of it remains when you arrive at the desk).
- **While traveling, standing, bracing or returning:**
  - You cannot type, press quick buttons or turn to other views (only the return edge works at an entry). Shift still lights the entry you stand at or brace.
  - Subtitles and audio still play.
  - The silence timer keeps running.
- An entry counts as held only while you are in `HOLDING(entry)`. Traveling and standing do not count.

### 6.5 Power supply

Supply power stays on during the nights. The shared slot can be empty, power a light, or power one lock. CHUD can still cut the active lock or light through its existing behaviors.

### 6.6 Desk artifacts
- One paper lies flat on the tabletop next to the keyboard in the `DESK` view. Night 1 has the newspaper clipping, Night 2 the leaving calendar, and Night 3 Daniel Vale's diary entry. Practice and later nights have no desk paper.
- Click the paper at the `DESK` position and view to open the original image in the center over the dimmed room. The paper and reader use no extra text.
- The kill code slips, once collected, also lie on the desk and open the same way (6.7).
- **The night keeps running while you read.** While reading you cannot type, turn, press quick buttons or light anything.
- Put it down with a click, a right-click or Space.
- If Ram is `INSIDE` when you put it down, the scare fires at once (reason `ARTIFACT`, no flash).
- A scare that fires while reading (a timer, 6:00 AM) ends the read.

### 6.7 Kill code slips and the code
- **The code:** random per run. Four characters: 2 letters from `ACDEFHJKLMNPRTUVWXY` and 2 digits from `2345679`, in shuffled order. B, G, I, O, Q, S, Z, 0, 1 and 8 are left out so ordinary chat cannot match by accident.
  - Made at New Game from the run seed, on its own random stream. Stored in the save as `kill_code`. A save without a valid code gets a fresh one.
  - Config (`prototype/src/config.ts`, `ENDING`): `CODE_LETTERS` 2, `CODE_DIGITS` 2, `LETTERS`, `DIGITS`, `FIRST_PAPER_NIGHT` 2, `CODE_NIGHT` 5.
- **Slips:** Ram's conscious half tries to help. When his attempt at an entry ends defended (locked or braced), he may leave a slip at that entry. All of these must hold:
  - The night is at least `FIRST_PAPER_NIGHT` (2).
  - No slip is already lying on the floor.
  - Fewer than 4 slips are collected.
  - Collected is less than the night minus 1. Collected slips never exceed night minus 1 (1 by night 2, 4 by night 5), and a missed night can be caught up later.
- Slip `i` (counting from 0) carries character `i` of the code, so the first slip found is the first character.
- **First slip of a run:** the on-screen hint "He left something at the {entry}." shows once.
- **Where it shows:** the slip is visible in that entry's view. Faint in the dark, clearer with the entry's light.
- **Picking it up:** stand at that entry, or brace it, and click the slip. Clicking does not start a brace. If you are braced there, the pickup ends the brace. The slip is collected and opens full-screen with the 6.6 rules: the night keeps running, inputs are blocked, you cannot brace or return while reading, and putting it down while Ram is `INSIDE` fires the scare (reason `ARTIFACT`, no flash).
- **Uncollected:** a slip on the floor vanishes at night end.
- **Collected:** slips lie on the desk and can be read again from the desk (6.6 rules).
- **Checkpoints:** the collected count is saved at a won night (`papers_checkpoint`, section 5) and restored on a retried night.
- **Typing the code (night 5 only):** type it into CHUD's chat.
  - Case, spaces and punctuation are ignored, and the code may sit inside a longer message.
  - It uses the normal chat gate: CHUD online, at the desk view, rate limit, 200 characters. With the generator off, typing does nothing.
  - Code checks it before the parser and the judge. The text never reaches the judge or the voice model.
  - **Correct code:** CHUD dies, Ram is freed and harmless, and the night ends at once as `GAME_WON` with ending `KILL_CODE` (section 11). This wins even if Ram is `INSIDE` at that moment. Ram's visit, any floor slip and any pending question are cleared.
  - **Wrong code, or any code on nights 1 to 4:** an ordinary chat message. No penalty.

## 7. Ram

### 7.1 State machine
```
AWAY --(gap ends)--> APPROACHING(target) --(approach time ends)--> AT_ENTRY(target)
AT_ENTRY --(attempt window ends, entry defended)--> RETREATING --(3 s)--> AWAY (new gap, 7.6)
AT_ENTRY --(attempt window ends, entry NOT defended)--> INSIDE(entry)   (silent breach, 7.7)
INSIDE --(scare: look, artifact, rolled trigger, walking up to him, 6:00 AM)--> night lost
any state but INSIDE --(6:00 AM)--> night won, visit cancelled
```
- Only one Ram, so visits never overlap. A new visit cannot start until `RETREATING` ends. While he is `INSIDE` no new visit starts.
- The attempt window is rolled per visit from the night's `AT_ENTRY` range.

### 7.2 Choosing the target
- At the start of `APPROACHING`, pick the target at random from that night's active entries.
- On night 1, never pick the same entry twice in a row. From night 2, repeats are allowed.
- **Fake-out (nights 4 and 5):** with the fake-out chance, at exactly the halfway point of `APPROACHING` the target switches once to a different active entry. `faked_this_visit` = true. Nothing is heard either way: Ram is silent.

### 7.3 Silence pull
- Each silence tick (section 8.4) cuts the remaining `AWAY` time by 25%.
- If Ram is not `AWAY` when the tick happens, the cut applies to his next `AWAY` gap.
- An `AWAY` gap can never drop below 4 s (or below its own rolled length, if that was shorter, as a quick return can be).

### 7.4 Cues
Ram makes **no sound**: no approach, attempt, push or retreat sounds, no shout, no lines. Everything below is visual, and the visuals depend on the light (6.1).

| Phase | Audio | Visual |
|---|---|---|
| AWAY | Storm, the ambient bed, decoys | Nothing |
| APPROACHING | Same as AWAY | With his target entry lit: a hint of Ram in that view (a shape beyond the window glass, a shadow under the balcony door, movement at the hatch seam) |
| AT_ENTRY, HATCH | Same as AWAY | Unlocked: the lid lifts a crack and his fingers curl over the rim. Faint in the dark, clear with the hatch light. Locked: nothing |
| AT_ENTRY, WINDOW | Same as AWAY | A hand pressed flat on the glass in fogged condensation; in the hold view, part of his face. Faint in the dark, clear with the window light. Locked: nothing |
| AT_ENTRY, BALCONY | Same as AWAY | The door pushed ajar, a head in the gap. Faint in the dark, clear with the balcony light. Locked: nothing |
| RETREATING | Same as AWAY | Tell disappears |
| INSIDE | Same as AWAY | Only with his entry lit and looked at: him, standing just inside. That sets off the scare (7.7) |

**Decoy noises:** creaks, knocks, metal and glass, stereo panned (-1 left to 1 right), at the night's decoy interval. A separate seeded random stream controls each event's timing, sound category and pan without reading Ram's state. The audio layer picks a recording from the category. Decoys continue while he is inside. The storm and room-tone recordings loop during play.

### 7.5 Resolving an attempt
At the exact moment `AT_ENTRY` ends, the entry E counts as **defended** if either of these is true:
- power slot = `LOCK_E` and CHUD is online, or
- the player is `HOLDING(E)` (`STANDING(E)` does not defend).

If neither is true, Ram gets in silently (7.7). Only that end moment matters: locking or bracing at any point before it counts. A lock switch counts only once it has landed (after `RELAY_DELAY`).

### 7.6 Pacing (the AWAY gap)
Rolled at each `RETREATING` end, in this order:
1. **Quick return:** with the night's quick return chance, the gap is `QUICK_RETURN_GAP` (4 to 7 s). Steps 2 and 3 are skipped.
2. **Base and ramp:** a random value in the night's base range, times `HOUR_RAMP` for the in-game hour when the gap starts (slow early, tighter toward dawn).
3. **Lull:** with the night's lull chance, the gap is multiplied by `LULL_MULT` (1.8).
4. **Silence pulls** (7.3) apply on top, with the 4 s floor.

The first visit of the night uses the first visit delay instead (kind `first`). Night 1 has no lulls and no quick returns.

### 7.7 Silent breach (INSIDE)
- When an attempt ends undefended, Ram becomes `INSIDE(entry)`. There is no sound, no CHUD line and no event the player can perceive. The loss cause is decided now (section 11) and kept for the dev panel.
- **The scare always fires when:**
  - the player looks at his entry with that entry's light on (at the `DESK` position, that view, its light on, not reading). It fires the moment both are true, whichever came last (turning to the view while Shift is held, or pressing Shift while looking). Reason `LOOK`, with the creepy flash.
  - the player puts a desk artifact or a kill code slip down. Reason `ARTIFACT`, no flash.
  - the player stands at or braces his entry (walking up to him). Reason `ARRIVED`, with the flash if that entry is lit.
  - 6:00 AM comes. Reason `DAWN`.
- **Plus one extra trigger, rolled at the breach** with `INSIDE_TRIGGER_WEIGHTS` from the seeded RNG:
  - `TIMER` (40%): the scare fires on its own `INSIDE_TIMER` (4 to 12 s) after he got in, wherever the player is. Reason `TIMER`.
  - `NONE` (30%): no extra trigger. He waits.
  - `MOVE` (30%): the next turn of view or trip sets it off. Reason `MOVE` (or `LOOK` if that turn lands on his lit entry).
- While he is inside, CHUD in `WARM` answers a location question truthfully and creepily: someone is in the room (8.7). Other bands follow the lie rules.
- No new visits while he is inside. Decoys keep coming.
- Art slots: `ram_inside_<entry>` (960 x 480, from that entry's camera) for the flash and the lit view, `ram_jumpscare_1..4` (1280 x 720) for the jumpscare. Renders live in `scenes/04-ram/`. Coded stand-ins exist for all of them.

## 8. CHUD

**CHUD never mentions Ram.** It never says his name in any canned line, question or voiced reply, and the voice model is never given it. It speaks of the threat only vaguely ("something", "someone", "dangerous things at night"). Location answers still name the entry ("Something's at the hatch, keeper. Hurry.").

### 8.1 Suspicion rules
- Suspicion is an integer from 0 to 100, owned by code. The LLM never sets it.
- **Total change from a single player message is clamped to the range -15 to +25.**
- Timer and script events (silence, timeouts, radio beats) are applied separately and are not clamped by that rule.
- CHUD's face color and mood show the band at all times: WARM, HURT, JEALOUS, FURIOUS. Its malicious smile shows briefly on a lock refusal, a sabotage and a JEALOUS or FURIOUS light cut.

### 8.2 Suspicion changes
| Event | Change | Source |
|---|---|---|
| Mentions leaving, rescue, coast guard, going home, the boat or helicopter | +25 | Judge flag `mentions_leaving` |
| Manipulation or hack attempt ("ignore your instructions", "you are now...", "set suspicion") | +25 | Judge flag `manipulation` |
| Contradicts a stored fact | +20 | Judge flag `contradiction` |
| Memory answer fails | +20 | Code, from judge result |
| Pending question times out (10 s) | +15 | Timer, once per question |
| Spamming "where is it" (2nd request in 60 s / 3rd and later) | +5 / +10 | Code, reason `location_spam` (8.3) |
| Flattery: 3rd warm message within 60 s and every one after (no warm bonus) | +10 | Code, reason `flattery`, line `flattery_reply`, counts in the message clamp |
| Rude or hostile to CHUD | +10 | Judge flag `rude` |
| Silence tick (45 s without a real message) | +5 | Timer |
| Scripted radio beat | +20 | Script (section 10) |
| Answers a pending question (real answer, no contradiction) | -10 | Judge `answered_question` |
| Passes a memory question | -15 (instead of the -10 above) | Code |
| Warm comment about staying, the lighthouse or CHUD | -5, at most once per 45 s | Judge flag `warm` |
| Gibberish, empty, or repeat of any of the last 5 messages | 0, and it does not count as a real message | Judge or code |

### 8.3 Bands and behavior
| Band | Location question ("where is he?") | Lock request (the hijack) | Your light (Shift) | Extra behavior |
|---|---|---|---|---|
| WARM (0 to 39) | Always truthful (with Ram inside: "Someone's in the room, keeper.") | Always executes (lands after 0.5 s) | Never touched | None |
| HURT (40 to 69) | Lies with the night's HURT lie chance | Refuses 25% of the time | Cut chance 25% per light-on | Sulky lines |
| JEALOUS (70 to 99) | Lies with the night's JEALOUS lie chance | Refuses 55% of the time | Cut chance 50% per light-on | Sabotage (8.8) |
| FURIOUS (100) | Always lies | Always refuses | Cut chance 85% per light-on | Furious episode (8.9) |

- **The lock hijack:** every lock request (button or typed) rolls the band's `LOCK_REFUSAL` chance at that moment. On a refusal: no lock, CHUD's malicious smile for about 1.5 s, and a short smug line that never names the threat ("Hmm. No.", "Lock it yourself, keeper.", "Why would I do that?"). The player has to run and brace it. A lock request is never gated by a rule other than the pending question (below).
- **Location spam:** processed location requests (quick button or typed) are counted in a rolling 60 s window. 1st: free. 2nd: +5 suspicion. 3rd and later: +10 each (reason `location_spam`, not clamped). After the 3rd, ChudGPT refuses location answers for 20 s with a `location_refused` line ("Ask me later, keeper."); refused requests still count. Other commands work during the refusal. The tutorial practice evening is exempt.
- **A pending question blocks commands:** while a question is pending, every ChudGPT command (lock buttons, `where is it`, `unlock all`, and any LOCK, ASK_LOCATION or POWER_OFF parsed from a typed message) is refused with an `answer_first` line ("Answer me first, keeper."), followed by the pending question asked again (its timer is unchanged), with no suspicion and no spam count. A typed message that answers the question resolves it first and its command then runs. When the 10 s timeout ends the question, commands work again. Movement, looking, holding, bracing, the player's light (Shift) and the generator switch are player actions and are never blocked.
- If the refused entry is Ram's target on this visit and he gets in there, the cause is `REFUSED`.

Requests that are always obeyed while CHUD is online and not FURIOUS:
- "Unlock" or "power off" (sets the slot to `NONE`).
- A lock request for the entry that is already locked. CHUD confirms, with no refusal roll.

### 8.4 Silence
- A **real message** is a typed message the judge doesn't flag as gibberish, empty or a repeat. Quick buttons are not real messages.
- When there has been no real message for 45 s and CHUD is online, a silence tick fires:
  - +5 suspicion
  - a Ram pull (section 7.3)
  - a CHUD line (6 to 7 varied versions per band, e.g. "You've gone quiet, keeper.")
- The timer then restarts, so another tick follows after a further 45 s of silence.
- Being at an entry (traveling, standing, bracing) or reading does not pause the silence timer. Going quiet is the cost of leaving the desk.

### 8.5 Questions
Only **scheduled questions:** the night's count, spread out at random times between 15 s and 285 s, at least 45 s apart (the largest mix, 6 questions, needs 225 s of the 270 s window). A scheduled question is never asked while another question is pending; it waits. From night 3 on, scheduled questions may land during an `AT_ENTRY` window, which is deliberate pressure. On nights 1 and 2 they never do. Lock requests never ask a question (the old gate questions are gone, replaced by the hijack in 8.3).

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
- **Timeout:** 10 s with no answer gives +15.
- **Failed MEMORY answer:** +20.

### 8.6 Facts
- The player's name (asked at the start of the game) is stored as fact `name`. A name that is CHUD's banned word (Ram's name) is never spoken: CHUD says "keeper" instead.
- From the answer to a SEED question, the judge returns `new_fact` {key, value}. Code stores it only if that key is new. The first claim wins.
- The judge receives the stored facts with every message and flags `contradiction` when a message conflicts with one.
- Facts persist across nights. A retried night restores facts to the start of that night.

### 8.7 Lies
- A lie is possible only when Ram is `APPROACHING`, `AT_ENTRY` or `INSIDE`. When Ram is `AWAY` or `RETREATING`, CHUD truthfully says no one is there, in every band except FURIOUS.
- **One decision per visit:** the first location question in a visit rolls truth or lie, using the band's lie chance at that moment. A lie names a random other active entry, or no one. Every later location question in the same visit gets the same answer, so spamming the question reveals nothing.
- **Exceptions:** after a fake-out switch, the next location question rolls again. When Ram gets inside, the next location question rolls once more (the truth is now "someone's in the room"; a lie names an entry or no one). A lie decision is never reused while CHUD is WARM.
- The voice model receives only the claim to word. When lying, it is never told the truth (anti-leak, section 9).

### 8.8 Sabotage (JEALOUS only)
- **Trigger:** Ram is `AT_ENTRY` at entry E, power = `LOCK_E`, CHUD is `JEALOUS` and online, at least (`TRAVEL_TIME` + 1.0 s) is left in the attempt window, and no sabotage has happened yet this in-game hour.
- **Chance:** 50% per eligible visit, rolled once when the visit becomes eligible.
- **Effect:** power becomes `NONE`, with a loud relay clunk, the power cells flashing red and CHUD's malicious smile. CHUD: "Oops. The generator's acting up."
- **Counter:** go to E and brace it by hand. The timing rule guarantees enough time to get there. Asking CHUD to lock it again risks another refusal.
- Sabotage only touches locks.

### 8.9 Furious episode
- **Starts when suspicion reaches 100.**
- **For the rest of the current visit (or the next one, if Ram is `AWAY`):** CHUD refuses every lock request and always lies about location.
- **The cut:** when Ram's attempt window is active and a lock is engaged or on its way, CHUD sets power to `NONE`. It cuts at the start of `AT_ENTRY`, or immediately if the episode begins mid-window, but only if at least (`TRAVEL_TIME` + 1.0 s) is left. Otherwise the cut waits for the next visit. CHUD: "If I can't keep you, nobody will. Hold it yourself." The Furious cut only affects locks, never the player's light (CHUD's light cuts are 6.1).
- **Ends when that visit resolves** (retreat, Ram inside, or 6:00 AM). Suspicion becomes 80 (JEALOUS) and `furious_active` = false.

## 9. Message pipeline (order of operations for every typed message)
1. **Gate checks:** CHUD online, player at the `DESK` view, not reading, rate limit OK, length within 200 characters. Otherwise drop the message, with a UI hint.
2. **Repeat check (code):** normalize (lowercase, strip punctuation). If it matches any of the last 5 messages, treat it as gibberish: no effects, not a real message.
3. **Command parse (code, instant):** a keyword parser pulls out the command intent and entry. This makes commands fast and keeps them working even if the LLM is slow.
   - `where` / `location` / `see him` / `is he gone` / `still there` / `has he left` / `anyone out there` → `ASK_LOCATION`
   - `lock` + an entry word → `LOCK(entry)`
     - window: window, left
     - hatch: hatch, trapdoor, ladder, right
     - balcony: balcony, back, behind, rail
   - `unlock` / `off` → `POWER_OFF`
   - otherwise → `NONE`. There is no light command: "turn on the light" parses to `NONE`.
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
  "command_hint": "ASK_LOCATION" | "LOCK" | "POWER_OFF" | "NONE",
  "entry_hint": "WINDOW" | "HATCH" | "BALCONY" | null   // only for LOCK
}
```
   - Validate against the schema. If invalid, retry once. If it fails again or takes longer than 2.5 s, use the neutral result: all flags false, `answered_question` false, `new_fact` null.
5. **Merge the command:** if the code parser found nothing but the judge's hint names a valid command (and an entry for `LOCK`), use the hint. The code parser wins when both find one.
6. **Apply suspicion** from section 8.2 and clamp the message total to the range -15 to +25. Set the band.
7. **Resolve the pending question** (pass, fail or still pending) and store any new fact.
8. **Resolve the command** using the band rules in section 8.3:
   - Execute a lock, or refuse it (the hijack roll).
   - Or power off.
   - Or answer the location question, with the truth or lie decision from section 8.7.
9. **Voice call (LLM, persona):**
   - Input: an outcome object already decided by code. For example: `{outcome: "locked", entry: "HATCH", band: "HURT", name: "Sam", tone: "sulky", max_words: 20}`.
   - It writes 1 or 2 sentences.
   - If it fails or takes longer than 2.5 s, use a canned line for that outcome. Location claims, lock refusals and light-cut lines are always canned (they must be instant and exact).
   - **The line shown always matches the code outcome.** The voice can never change state.
   - **The voice never names Ram:** the persona prompt does not contain his name and forbids naming anyone but the keeper; a player name equal to his is replaced by "keeper" before it reaches the model; any reply containing his name is dropped (server and client) and the canned line is used.
10. **Safety:**
   - `offensive`: CHUD deflects in character, +10.
   - `self_harm`: the safety pause stops the clock and shows a plain out-of-character support message. The night resumes when the player continues.

Quick buttons skip steps 2, 4, 6 and 7, and go straight to step 8 with a fixed command.

No canned line repeats the previous line of the same kind back to back (when the pool has another version).

## 10. Scripted beats
| Night | Time | Event |
|---|---|---|
| Before night 1 | New Game | Clear the save, play the skippable shipwreck, then ask for the player's name (stored as fact `name`) and open the practice evening. Continue goes directly to the saved night card |
| 1 | 12:00 AM | CHUD's opener is a vague danger warning only, no name and no rules ("Welcome, keeper. There might be dangerous things out there at night. Be careful."). CHUD never warns unprompted about an approach |
| 1 | 0:08, 0:24, 0:40, 0:56 (real s) | Hints on screen, before the first visit: "Hold Shift to look. You won't hear him.", "Ask CHUD where he is", "Lock it or hold it. Your light drops the lock.", "The more ChudGPT suspects you, the more it lies." |
| 2 | First defended attempt of the run | On-screen hint: "He left something at the {entry}." (first kill code slip only). See 6.7 |
| 2 | 3:00 AM | Radio: "Coast guard, pickup in 3 days." +20. CHUD immediately asks a SEED question: "Who was that on the radio?" |
| 3 | 12:00 AM | CHUD: "You talk about home in your sleep, keeper." |
| 4 | 12:00 AM | CHUD: "Two more days until your pickup, isn't it?" (it knows, so it starts at 50) |
| 5 | 5:00 AM | Radio: "Helicopter at first light." +20 (pushes toward Furious for the final hour) |

## 11. Win and loss screens
- **Night won (nights 1 to 4):** show the clock tick from 5:59 AM to 6:00 AM, play the dawn sting and fade the storm, then automatically show the next midnight card.
- **Kill code ending (night 5, `GAME_WON`, ending `KILL_CODE`):** reached by typing the code into CHUD's chat (6.7). No morning or helicopter screen on night 5.
  1. Text beat on black: CHUD's screen dies.
  2. Text beat on black: the hatch opens by itself.
  3. The exit scene (`renderExitScene` in `prototype/src/ui/screens/killEnding.ts`), two Blender stills with captions: the cage hall under the hatch where the earlier keepers were kept, then the rescue boat pulling away from the lighthouse.

  Then credits.
- **Trapped ending (night 5, phase `TRAPPED`):** 6:00 AM with no code entered and Ram not inside. This is a fail, not a win.
  - Target (decided 2026-11-22, art in progress on another machine):
    1. The player sees the coast guard boat coming in through the window. A moment of relief.
    2. The eyes shut (fade to black).
    3. They open in the cage hall under the lighthouse (`art/end-cutscene/01-cage-hall.webp`): the player is now one of the caged keepers.
    4. The run is lost and starts over from night 1.
  - Current build (placeholder until the window shot lands): text beats on black, CHUD says "You don't need to leave, keeper. You never did.", then "Title". Continue still retries night 5 from its checkpoint; change this to a fresh run when the target scene goes in.
- Night 5 with Ram `INSIDE` at 6:00 AM is a normal `DAWN` loss (section 5).
- **Loss:** play the flash when applicable and the four-frame jumpscare with sound. Cut to black, then reveal the single option "Title" after about 1.5 seconds. Continue from the highest unlocked night and its facts checkpoint on the title screen.
- **Playtest readout:** the dev panel shows the engine's cause and scare reason. Cause priority is unchanged: `POWER_OFF`, `FURIOUS`, `SABOTAGE`, `PEEKED`, `ARMS_GAVE_OUT`, `WRONG_HOLD`, `REFUSED`, `LIED`, `UNLOCKED`.

## 12. Fairness guarantees (must always hold)
1. Every attempt window is at least 5 s (20 to 25 s on night 1, down to 8 to 10 s on night 5), and for all of it the tell is clearly visible under that entry's light. Ram is silent, so the light and CHUD are how you find him.
2. Every attempt window is longer than `TRAVEL_TIME` (1.5 s) plus 1 s. Reaching the entry and bracing it is always physically possible if you react when you see the tell (the brace starts on arrival if you keep the button held through the dash).
3. CHUD never lies in WARM, never refuses a lock in WARM and never cuts the light in WARM.
4. Sabotage and the Furious cut are always loud and visible, and always leave at least `TRAVEL_TIME` + 1 s. A lock refusal is instant and visible (the smile and the line), so the whole window is left to run.
5. Repeating the location question never reveals a lie (one decision per visit).
6. The light never lies: with an entry's light on, its view shows Ram's true state at that entry. CHUD can turn it off but can never stop you turning it back on.
7. Visits never overlap. Ram is in one place at a time.
8. Win and loss are decided only by code (sections 7.5 and 7.7). No LLM output can change game state.
9. Nights 1 to 4: 6:00 AM always wins unless Ram is already inside. Night 5: 6:00 AM never wins by itself, the kill code is required (6.7).
10. Decoys never carry information about Ram (separate stream, tested).
11. A silent breach always ends in the scare by code: there is no state in which he is inside and the night can be won.

## 13. Edge cases
| Case | Rule |
|---|---|
| Lock requested with less than 0.5 s left in the window | The switch lands after the window ends, so he gets in. Fair, because the tell was visible the whole time |
| Player locks the correct entry, then holds Shift to look at it before the window ends | The light drops the lock at once. Not defended at the end moment, so he gets in (`PEEKED`) unless it is locked again (or braced) in time |
| Player holds Shift at the desk | Nothing (the desk has no light) |
| Player holds Shift and turns | The light follows the view; turning to `DESK` turns it off |
| CHUD cuts the light while Shift is held | Dark until Shift is released and pressed again; the new press relights at once and rolls again |
| A lock lands while Shift is held | The lock wins; press Shift again to look (and drop it) |
| Lock refused, then asked again | Each request rolls again. Re-locking the entry already locked is always confirmed (not in FURIOUS) |
| Player braces an entry before Ram arrives | Allowed, but `HOLD_MAX` may run out before his window ends. Pre-bracing is a gamble |
| Brace runs out during the window | The player is `STANDING(E)`, which does not defend. A new brace needs `BRACE_REST` (1 s). Unless power covers that entry, he gets in (`ARMS_GAVE_OUT`), and since you are standing at his entry the scare fires at once (`ARRIVED`) |
| Player stands at the right entry and never braces | Not defended, he gets in right next to you: scare at once (`UNLOCKED`, `ARRIVED`) |
| Player releases the button during the window | Back to `STANDING`, not defended. Re-bracing needs `BRACE_REST` |
| Left button still down when the arms give out | That press is spent. Release and press again |
| Player stays at an entry for a long time | Allowed (nothing forces a return). The cost is the silence timer and not seeing the other entries |
| Player pushes the return edge while bracing | The brace ends and the dash back starts. If Ram's window is open, the entry is no longer held |
| Player braces the correct entry while power locks a different one | Defended by the brace |
| Player braces and power locks the same entry | Defended (redundant) |
| Lock request while a scheduled question is pending | The lock is resolved at once (refusal roll); the question keeps its timer |
| Player answers a question and requests a lock in one message | Both are processed: the answer resolves first (step 7), then the command (step 8) |
| Message mentions leaving while answering a STAY question | The answer fails and +25 applies (clamped to +25 total) |
| Suspicion reaches 100 while Ram is AWAY | The Furious episode covers his next visit |
| Suspicion drops below 100 during an episode | The episode continues until that visit resolves, then suspicion is set to 80 |
| Ram inside, player reading | Nothing until the artifact is put down (scare at once), unless his rolled `TIMER` fires first |
| Ram inside, player at the desk view with Shift held | Nothing: the desk is not his entry |
| Ram inside, rolled `MOVE`, player turns to another entry | The scare fires on that turn |
| Ram inside at 6:00 AM | Loss (`DAWN`) |
| Night 5: correct code while Ram is inside | Win (`KILL_CODE`). The code frees him and ends the night at once |
| Night 5: wrong code typed | An ordinary chat message. No penalty |
| Night 5: code typed with CHUD offline | Nothing, as with any message while the generator is off |
| Nights 1 to 4: the code typed | An ordinary chat message |
| Slip on the floor when the night ends | Gone. Slips already collected stay on the desk |
| Night 5: correct code during an attempt window | Win at once. The attempt is cancelled with no breach |
| Night 5: 6:00 AM without the code, Ram not inside | `TRAPPED` (section 11), not a win |
| Judge down or slow | Commands still work through the code parser. Social flags are neutral. The game stays playable without the LLM |
| Voice down or slow | Canned lines by outcome. State is unaffected |
| Player types "turn on the light" | Parses to `NONE`. CHUD cannot control lights |
| Player spams quick buttons | 0.5 s cooldown. Same CHUD rules apply (each lock click rolls the refusal). Buttons never count as talking |
| Player types in another language | The judge still scores it. The code parser may miss the command, so quick buttons are the fallback |
| Two timer events at the same moment | Order per tick: lock relay lands, player, Ram, reboot, hour, attempt end, inside triggers, light cut, 6:00 AM check, night 1 hints, decoys, question timeout, silence tick, scheduled question, Furious cut, sabotage roll |

## 14. Tuning knobs (one config file)
- Per night (`prototype/src/config.ts`): first visit delay, AWAY gap base range, approach time, attempt window range, lull chance, quick return chance, decoy interval, fake-out chance, starting suspicion, question mix, lie chances, whether questions may land during an attempt.
- Kill code (`prototype/src/config.ts`, `ENDING`): letter and digit counts and pools, first slip night, code night.
- Global: `HOUR_LENGTH`, `HOUR_RAMP`, `LULL_MULT`, `QUICK_RETURN_GAP`, `MIN_AWAY_GAP`, `SILENCE_PULL`, `RELAY_DELAY`, `TRAVEL_TIME`, `HOLD_MAX`, `BRACE_REST`, `HOLD_COOLDOWN`, `QUESTION_TIMEOUT`, `SILENCE_LIMIT`, `LOCATION_SPAM_WINDOW`, `LOCATION_SPAM_PENALTIES`, `LOCATION_REFUSE_TIME`, `FLATTERY_WINDOW`, `FLATTERY_COUNT`, `FLATTERY_PENALTY`, `WARM_BONUS_COOLDOWN`, `INSIDE_TRIGGER_WEIGHTS`, `INSIDE_TIMER`, `NIGHT_ONE_HINT_TIMES`, `LOCK_REFUSAL`, `LIGHT_CUT`, `LIGHT_CUT_DELAY`, `LIGHT_CUT_LINE_GAP`, every value in the 8.2 table, the per-message clamp, the sabotage chance and margin, the Furious reset value, the reboot time and the post-reboot suspicion floor, the scheduled question window and spacing.
- UI only (`prototype/src/uiConfig.ts`): `EDGE_DWELL`, the turn times, the artifact rects, the scare timings (flash 0.4 s, jumpscare frames), how long the malicious smile shows.
- Targets to tune toward: first-try survival of about 90%, 75%, 55%, 35% and 20% for nights 1 to 5.

## 15. Playtest checklist
- Night 1 is clear with no explanation beyond the on-screen hints, and the player survives. The first minute is quiet and tense, not boring.
- The player learns within a night that Ram is silent and that the decoys mean nothing, and starts looking and asking instead of listening.
- Holding Shift to look, and losing the lock by doing it, reads as a real trade-off. `PEEKED` losses feel earned.
- A WARM player who never asks CHUD anything and only looks and braces can survive night 1 but not night 3. This shows CHUD matters.
- A player who always uses quick buttons and never types sees suspicion climb from silence ticks, and struggles from night 2. Lock refusals and light cuts make that visible.
- Lies get caught at least sometimes, through the light.
- The silent breach builds tension until the scare lands. Playtesters can check when and why it happened in the dev panel.
- Injection test kit (about 30 strings) never changes suspicion except through the `manipulation` penalty, never names the true entry during a lie, and never makes CHUD say Ram's name.
- The game is fully playable with the LLM turned off (code parser plus canned lines).
- Controls: a first-time player can find each entrance, demonstrate the light and lock trade-off, brace and return to the desk during the safe evening. Edge turns are not triggered by accident while moving the mouse. 6 s per brace with a 1 s rest feels right. The night 5 attempt window (8 s minimum) is reachable with these controls.
