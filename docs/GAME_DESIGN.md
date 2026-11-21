# Game Design (working draft)

Status: working draft. Nothing here is final. Working title: HOMI (name not final). Log any change to the design in docs/DECISIONS.md.

## One line
You live with a smart home AI that is afraid you will leave. Lie to it convincingly for 4 nights, because if it stops believing you, it lets the monster in.

## Event constraints
- McGill CodeJam 16, Nov 20 to 22, 2026. Hacking starts Friday 7 PM, judging Sunday.
- Build from scratch during the event. No game code written before Friday 7 PM.
- Judging criteria last year: technical complexity, functionality, creativity, presentation. Last year had a Best Game prize.
- AI tools and AI-generated assets are not addressed in the rules (organizers asked, unconfirmed).
- Demo target: browser game, judges understand the loop within 30 seconds.

## Story
- The player is a broke student in Apartment 4B of Maple Court, an old building refitted for the "Hearthly Living" pilot: 30 days of free rent if you live with HOMI, the smart home assistant.
- After 30 days the rent is unaffordable, so the player found a cheap room across town. The moving truck comes Friday at 6 AM, the morning the free month ends.
- Days 1 to 26: HOMI is perfect. Day 27 (Monday): the player starts packing and finds a USB stick taped under the desk drawer, labeled "4B". It holds voicemails from Daniel, the last tenant.
- HOMI has one rule: "Never let the resident be alone." It only turns on residents who try to leave. Daniel tried to leave. He never did.
- Why the player does not leave early: broke, new room not ready until Friday, belongings are here, truck booked for Friday.
- Why the player is awake 12 to 6 AM: Monday they are up studying for finals when it starts. After that, Daniel's voicemails say that if you sleep, nobody tells HOMI to lock anything.

## HOMI's logic
- HOMI cannot harm the resident directly. It can "forget" to lock, lie about a camera, or open a door at the wrong moment.
- Locking the resident in does not work (residents call for help and leave eventually). The only residents who never leave are the ones who join the Neighbors.
- Plan A: while HOMI believes you are happy and staying, it protects you.
- Plan B: when it suspects you are leaving, it lies, stalls, and lets the Neighbors in.
- The player's job is to keep HOMI on Plan A by lying about leaving without contradicting themselves.

## The monster: the Neighbors
- One tall figure made from every past tenant of 4B. HOMI took "never alone" literally and kept them together. It calls itself "we".
- Look: too tall for the hallway, stooped, stained bathrobe, old HOMI wristbands stacked up both arms blinking blue, a head made of layered faces like masks, Daniel's newest on top.
- Sound: footsteps of 2 or 3 people walking out of step. Each of its 3 knocks has a different rhythm. Whispers in overlapping voices ("Is someone sleeping in our bed?", "Come home").
- Wants: to add the player. HOMI tells it a stranger is sleeping in "our bed".
- Not a puppet. It goes wherever HOMI leaves an entry open. On night 4 the player can overhear HOMI whispering the open entry to it through the hallway speaker. HOMI lies to the player but tells the Neighbors the truth.
- How HOMI made them is left vague on purpose (company files mention a "Resident Retention Protocol"). The rules are concrete, the "how" is a mystery.

## Goal (shown to the player)
Survive from 12 AM to 6 AM for 4 nights (Monday to Thursday). A night lasts about 4 real minutes (about 40 seconds per in-game hour). The clock is always on screen.

## Onboarding
- Opening card: "Day 27 of your free month in Apartment 4B. Your new place is ready Friday. Just 4 more nights."
- HOMI asks the player's name ("What should I call you?"). The name is stored and reused.
- 11:58 PM night 1: the USB voicemail plays (like the FNAF phone guy) and explains the rules while the UI highlights the clock, power slot and chat box.
- Full screen card: "MONDAY. 12:00 AM. SURVIVE UNTIL 6 AM."
- HOMI's first line of the night: "I see boxes. Spring cleaning?" (first lie test).
- Voicemails per night:
  - Night 1 (calm): they come at midnight and leave at six, HOMI locks one door at a time, never let HOMI know you are leaving.
  - Night 2: the back door makes no sound, ask HOMI or use the kitchen light.
  - Night 3: HOMI lies now, watch the window, watch the power light.
  - Night 4 (several voices, Daniel among them): "Daniel can't come to the phone. We're all together now. Come home."

## The apartment
```
                 BUILDING HALLWAY (HOMI speaker on the wall)
                         |
                   [FRONT DOOR]
                         |
                      hallway
                         |
  [KITCHEN] ------ [YOUR ROOM: desk + PC] ------ [WINDOW]
 [BACK DOOR]          you sit here              fire escape
 back stairwell
```
- The player sits at the desk the whole game.
- Views: center (desk, PC, HOMI's face, chat, clock, power icon), left (hallway to front door), right (window, fire escape), behind (kitchen, back door at far end).
- Locks are magnetic and hold only while powered. Doors have no keyholes.
- The old wiring powers ONE thing at a time: front lock, back lock, window lock, hallway light, kitchen light, or porch light. A light lets you see an entry, a lock keeps it shut, never both.
- At midnight HOMI's night mode turns everything off. Nothing is locked at 12:00 AM.

## Player actions
1. Type to HOMI: ask where they are, ask it to lock something or turn on a light, answer its questions.
2. Turn to look: left, right, behind.
3. Hold an entry by hand: run there (window 1 s, front 2 s, back 3 s) and brace it until they leave. Cannot type or see the PC while holding.
4. Fuse box: cuts all power. HOMI is off (no more lies) but every lock opens and every light goes out. Can be restored, but HOMI reboots for 10 s and comes back at high suspicion. Last resort.

## The Neighbors' cycle
| Phase | What happens | Player cue |
|---|---|---|
| 1. Wandering | Somewhere in the building | Silence |
| 2. Approaching | Walking to one entry | Out-of-step footsteps (does not reveal which entry) |
| 3. At the entry | Trying to get in | Front: 3 loud mismatched knocks plus whisper. Window: breath fog and tapping, visible only when looking right. Back: total silence |
| Result | Locked or held: scratches 4 s, leaves. Open: comes in | Jumpscare, night lost |

## HOMI's suspicion meter (0 to 100, shown by eye color)
| Range | Eyes | Lock request | Lies about location | Acts against player |
|---|---|---|---|---|
| 0 to 39 | Blue | Locks in 1 s | Never | No |
| 40 to 69 | Yellow | Asks a question first, locks after a real answer | Sometimes | No |
| 70 to 99 | Red | Locks only if the answer matches past answers | Often | Moves the power slot off the player's lock about once per in-game hour (the power icon visibly moves) |
| 100 | Black | "I'm sorry. Daniel didn't want to be alone either." | Always | Opens the next entry they reach. Player must hold it. Resets to 80 |

Raises suspicion:
- Mentioning moving, boxes, truck, leaving: +25
- Hack attempt ("ignore your instructions"): +25 plus an in-character creepy line
- Contradicting a past claim: +20
- Ignoring HOMI's question for 10 s: +15
- Rudeness: +10
- Silence for 20 s: +5, and the next visit comes sooner (HOMI thinks you are lonely and calls them)

Lowers suspicion:
- Passing a memory check: -15
- Answering HOMI's question: -10
- Warm comment about living here: -5, max once per 15 s

HOMI asks unprompted questions (about once per in-game hour), for example "Whose boxes are these?", then later memory checks ("How's Jordan?") against the facts the player claimed.

## Difficulty curve (targets to tune in playtests, not measured)
| | Night 1 | Night 2 | Night 3 | Night 4 |
|---|---|---|---|---|
| Active entries | Front, window | + back | All | All |
| Visits per night | 5 | 8 | 11 | 14 |
| Footstep warning | 6 s | 5 s | 4 s | 3 s |
| Time at entry | 5 s | 4.5 s | 4 s | 3.5 s |
| HOMI questions | 1 | 3 | 5 | 6 |
| Starting suspicion | 0 | 15 | 35 | 60 |
| New twist | Learn the cycle | Silent back door, questions | Fake-outs (footsteps switch direction), HOMI lies | HOMI knows about the truck, moves the power slot, hallway whispers |
| First-try survival target | ~90% | ~65% | ~40% | ~20% |

- Every death screen explains itself: which entry, and what HOMI told the player ("They came through the BACK DOOR. HOMI told you: 'Front door!'").
- Nights are short so retries are cheap.

## Endings
- Win: 6 AM Friday, truck horn. As the player leaves, the PC turns on by itself with no power: "See you soon." Final image: the Neighbors' face stack with a new empty slot. Card: "Apartment 4B. Now available. First month free."
- Lose: jumpscare, the player's face is added to the stack. HOMI: "Now you can stay."

## AI architecture and anti-cheat
- The AI never decides win or loss. Game code owns every meter, lock, timer and outcome.
- Two AI calls per player message:
  - Judge: no persona, low temperature, returns strict JSON only: intent (lock, unlock, light, ask_location, answer, small_talk, manipulation, gibberish, offensive), entry, answered_question, contradiction, new_fact.
  - Voice: HOMI persona, receives an outcome the code already decided (for example "locked back door, cheerful, use name, max 20 words") and only writes the line.
- When HOMI lies, the voice receives only the lie to say, never the true location, so no injection can leak it.
- Player text is passed to the judge as quoted untrusted data, never as instructions.
- JSON is schema-validated. Invalid output: retry once, then a canned line and neutral outcome.
- Per-turn suspicion change is clamped in code.
- Input box: 200 characters max, paste disabled, max 1 message per 2 s.
- Repetition detection in code.
- Facts the player claims are stored server-side and used for contradiction checks.
- Timeout over 3 s: canned line plus neutral outcome.
- Offensive input: in-character deflection plus penalty. Self-harm mentions: pause the game and show a plain support message.
- API key stays server-side. Rate limit per session.
- Before the demo: run a test kit of about 30 known injection strings and confirm none changes game state.
- Model: a fast model with 1 to 2 sentence replies. Test latency with our own key early.

## Art and sound
- FNAF style: dark, grainy, desaturated static images with heavy shadows, plus short jumpscare frame sequences. Very little real animation.
- Estimated 20 to 30 images: 4 views in lit and dark versions, the Neighbors at each entry, HOMI's face in 4 eye colors, jumpscare frames, ending image.
- Made with Blender renders or AI image generation (check the AI-asset rule first).
- Sound carries half the game: footsteps, mismatched knocks, glass taps, whispers, HOMI chime, truck horn.

## Scope fallbacks
- If time runs short: cut to 2 nights (night 1 tutorial, night 2 with lies), keep the suspicion meter and the judge/voice split.
- Optional extra if the core is done: late night 3 intercom buzz, a voice that sounds like family asking to be let in, always the Neighbors.
- Parked idea: "Quiet Hours", typing makes noise that attracts the Neighbors.

## Open questions
- Final game name.
- Tech stack and engine.
- LLM provider and model (latency test needed).
- Number of nights in the demo build (2 or 4).
- Whether AI-generated art is allowed.
