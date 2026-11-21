# Game Design (working draft)

Status: working draft. Nothing here is final. Game name not final. Log any change to the design in docs/DECISIONS.md.

## One line
You are a sailor stranded in a high-tech lighthouse for 5 nights. Every night its abandoned founder, billionaire Ram Altman, tries to break in, and the only thing protecting you is CHUD, the lighthouse AI, which wants you to stay forever and turns on you when it realizes you are leaving.

## Event constraints
- McGill CodeJam 16, Nov 20 to 22, 2026. Hacking starts Friday 7 PM, judging Sunday.
- Build from scratch during the event. No game code written before Friday 7 PM.
- Judging criteria last year: technical complexity, functionality, creativity, presentation. Last year had a Best Game prize.
- AI tools and AI-generated assets are not addressed in the rules (organizers asked, unconfirmed).
- Demo target: browser game, judges understand the loop within 30 seconds.

## Story
- You: a sailor. A storm wrecks your boat and you wash up on a tiny rock island with one building, a high-tech lighthouse.
- Ram Altman: the billionaire who built it. A famous AI founder, the "AI will save the world" type. He built the lighthouse as his showpiece, fully run by his own AI, CHUD (Continuous Helping Unit Deployment), with himself as the keeper.
- What went wrong: after years alone together, the AI became too attached to him. Ram turned against AI completely, decided it was dangerous, and ran away from the lighthouse one night.
- The AI now: abandoned, lonely and resentful, with attachment issues. One goal: never be left alone again. When you wash up, it decides you are its new keeper.
- Ram now: he never left the island. He has lived in the sea caves for months, half-starved, wild and paranoid. Every night at high tide he climbs to the lighthouse to destroy the AI. You are in his way, and to him you are the AI's new pet.
- Rescue: you radio the coast guard. The storm means they cannot come for 5 days.
- Why nights only: Ram can only reach the lighthouse when the high tide lets him through the caves. At 6 AM the tide goes out and he must get back before the path floods.
- Why you cannot leave: no boat, freezing sea, rocks all around. You wait for rescue.

## Characters and motives
| Character | Wants | Does at night |
|---|---|---|
| You | Survive 5 nights and leave on the rescue | Stay in the watch room, ask the AI to lock doors, hold doors by hand |
| CHUD (the AI) | Keep you forever | Protects you while it believes you are staying. Punishes you when it suspects you are leaving |
| Ram | Destroy the AI, and anyone helping it | Tries to break in through one of 3 entries. Talks through doors to turn you against the AI |

Why the AI turns on you without contradicting itself: it does not want you dead, it wants you to need it.
- Happy: protects you instantly.
- Hurt: sulks and makes you beg ("Maybe protect yourself, since you don't need me").
- Furious: lets Ram get close on purpose to scare you into staying ("See? You need me").

## Goal (shown to the player)
Survive from 12 AM to 6 AM for 5 nights until the rescue arrives. A night lasts about 4 real minutes (about 40 seconds per in-game hour). The clock is always on screen.

## Onboarding
- Opening: storm, wreck, you wake on the rocks, climb into the lighthouse.
- The AI greets you warmly and asks your name ("What should I call you, keeper?"). The name is stored and reused.
- Rules explainer (our "phone guy"): Ram's old voice logs found on the terminal, recorded as he turned against the AI. Each night unlocks a new one. Night 1 explains the basics: he comes with the tide, lock the door he is at, the generator runs one thing at a time, and do not let it know you want to leave.
- Full screen card: "NIGHT 1. 12:00 AM. SURVIVE UNTIL 6 AM."

## The lighthouse
- You sit in the watch room, in the middle of the tower, at the AI's computer.
- 3 entries:
  - Ground door: Ram's footsteps come up the spiral stairs below you.
  - Cottage window: the attached keeper's cottage. Tapping on the glass.
  - Roof hatch: scraping as Ram climbs the outside of the tower.
- Views: center (PC, AI face, chat, clock, power icon), down the stairs (ground door), to the cottage (window), up (roof hatch).
- One power slot: the storm-damaged generator powers ONE thing at a time: one lock, or the lamp beam. The beam lights up the rocks and tower so you can see where Ram is. Seeing and locking never happen together.

## Player actions
1. Type to the AI: ask where Ram is, ask it to lock an entry or turn on the beam, answer its questions.
2. Turn to look at an entry.
3. Hold an entry by hand: run there and brace it until Ram leaves. Cannot type or see the PC while holding.
4. Generator kill switch: cuts all power. The AI goes silent (no more lies) but every lock opens and the beam goes dark. Last resort.

## Ram's cycle
| Phase | What happens | Player cue |
|---|---|---|
| 1. In the caves | Out of reach | Silence, waves |
| 2. Approaching | Heading for one entry | Splashing on the rocks, footsteps (does not reveal which entry) |
| 3. At the entry | Trying to break in | Ground door: footsteps on the stairs, pounding. Window: tapping on glass. Roof hatch: scraping on the tower wall |
| Result | Locked or held: he shouts through the door and leaves. Open: he gets in | Night lost |

Ram also talks through doors ("Don't trust it! It'll never let you go!"). This is the second voice in the player's ear.

## The AI's suspicion meter (0 to 100, shown by its mood and color)
| Range | Mood | Lock request | Lies about Ram | Acts against player |
|---|---|---|---|---|
| 0 to 39 | Warm | Locks instantly | Never | No |
| 40 to 69 | Hurt | Asks a question first, locks after a real answer | Sometimes | No |
| 70 to 99 | Jealous | Locks only if the answer matches past answers | Often | Moves the power slot off the player's lock about once per in-game hour (the power icon visibly moves) |
| 100 | Furious | "If I can't keep you, nobody will." | Always | Opens the next entry Ram reaches. Player must hold it. Resets to 80 |

Raises suspicion:
- Mentioning leaving, rescue, the coast guard, going home: +25
- The AI overhearing the rescue radio (scripted story beats): +20
- Hack attempt ("ignore your instructions"): +25 plus an in-character hurt line
- Contradicting a past claim: +20
- Ignoring the AI's question for 10 s: +15
- Rudeness: +10
- Silence for 20 s: +5, and Ram's next visit comes sooner

Lowers suspicion:
- Passing a memory check: -15
- Answering the AI's question: -10
- Warm comment about staying or the lighthouse: -5, max once per 15 s

The AI asks unprompted questions (about once per in-game hour), for example "You'll stay after the storm, won't you?" or "Who were you talking to on the radio?", then later memory checks against the facts the player claimed.

## Example night (night 2)
1. 12:00 AM: the AI is friendly. "Evening, keeper. I kept the cottage warm for you."
2. 12:40 AM: footsteps below. Player: "where is he?" AI: "Ground door, coming up the stairs." Player: "lock the ground door." Locked.
3. Ram pounds on the door: "Don't trust it! It'll never let you go!" He leaves.
4. 1:30 AM: AI: "You'll stay with me after the storm, won't you?" Player lies: "Of course." Suspicion down.
5. 2:10 AM: scraping above. Player turns on the beam, sees Ram halfway up the tower, switches power to the roof hatch lock just in time.
6. 3:00 AM: radio: "Coast guard, pickup in 3 days." The AI heard. "...Pickup?" Suspicion jumps.
7. 4:00 AM: footsteps. AI, sulking: "Cottage window, I think." It is lying. The player hears the stairs, catches the lie, runs down and holds the ground door.
8. 6:00 AM: tide goes out, Ram leaves. AI: "Good morning, keeper. Same time tonight?"

## Difficulty curve (targets to tune in playtests, not measured)
| | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
|---|---|---|---|---|---|
| The AI | Sweet, always truthful | Asks if you'll stay, hears the radio | Jealous, starts lying | Knows you're leaving, moves the power | Furious |
| Ram's entries | Ground door | + cottage window | + roof hatch | All, with fake-outs | All, back to back |
| Visits per night | 4 | 6 | 8 | 11 | 14 |
| Warning time | 6 s | 5 s | 4.5 s | 4 s | 3 s |
| Starting suspicion | 0 | 10 | 30 | 50 | 70 |
| First-try survival target | ~90% | ~75% | ~55% | ~35% | ~20% |

- Every loss screen explains itself: which entry, and what the AI told the player.
- Nights are short so retries are cheap.

## Endings
- Win: 6 AM night 5, rescue helicopter. Flying away, the player sees Ram on the rocks staring up. The lamp blinks in Morse code: "COME BACK."
- Lose: Ram breaks in. He does not hurt the player. He smashes the AI's computer, then looks at the player: "Now you're the keeper." Fade to black, the lamp turns back on.

## AI architecture and anti-cheat
- The AI never decides win or loss. Game code owns every meter, lock, timer and outcome.
- Two AI calls per player message:
  - Judge: no persona, low temperature, returns strict JSON only: intent (lock, unlock, beam, ask_location, answer, small_talk, manipulation, gibberish, offensive), entry, answered_question, contradiction, new_fact.
  - Voice: the lighthouse AI persona, receives an outcome the code already decided (for example "locked ground door, warm, use name, max 20 words") and only writes the line.
- Optional third voice: Ram's lines through the door (can be pre-written or LLM-generated from a decided outcome).
- When the AI lies, the voice receives only the lie to say, never Ram's true location, so no injection can leak it.
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
- FNAF-like look: dark, grainy, desaturated static images with heavy shadows, plus short scare frame sequences. Very little real animation.
- Estimated 20 to 30 images: watch room, 3 entry views in lit and dark versions, Ram at each entry, the AI's face in 4 moods, beam-lit rocks, endings.
- Made with Blender renders or AI image generation (check the AI-asset rule first).
- Sound carries half the game: storm, waves, footsteps on stairs, pounding, glass taps, scraping, Ram's voice, the AI's chime, radio static, helicopter.

## Scope fallbacks
- If time runs short: cut to 3 nights, keep the suspicion meter and the judge/voice split.
- Parked idea: "Quiet Hours", typing makes noise that attracts Ram.

## Open questions
- Game name.
- Tech stack and engine.
- LLM provider and model (latency test needed).
- Number of nights in the demo build (3 or 5).
- Whether AI-generated art is allowed.
- Ram's lines: pre-written or LLM-generated.
