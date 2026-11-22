# Game Design (working draft)

Status: working draft. Nothing here is final. Game name not final. Log any change to the design in docs/DECISIONS.md.

Exact rules, timers and numbers live in [docs/GAME_LOGIC.md](GAME_LOGIC.md). If this file and GAME_LOGIC.md disagree on a rule, GAME_LOGIC.md wins.

## One line
You are a sailor stranded in a high-tech lighthouse for 5 nights. Every night its abandoned founder, billionaire Ram Altman, tries to break in, and the only thing protecting you is CHUD, the lighthouse AI, which wants you to stay forever and turns on you when it realizes you are leaving.

## Event constraints
- McGill CodeJam 16, Nov 20 to 22, 2026. Hacking starts Friday 7 PM, judging Sunday.
- Build from scratch during the event. No game code written before Friday 7 PM.
- Judging criteria last year: technical complexity, functionality, creativity, presentation. Last year had a Best Game prize.
- AI tools and AI-generated assets are not addressed in the rules (organizers asked, unconfirmed).
- Demo target: browser game, judges understand the loop within 30 seconds.

## Story
- You: a boat captain. A storm sinks your boat, the crew is lost at sea, and you wash up alone on a tiny rock island with one building, a high-tech lighthouse.
- Ram Altman: the billionaire who built it. A famous AI founder, the "AI will save the world" type. He built the lighthouse as his showpiece, fully run by his own AI, CHUD (Continuous Helping Unit Deployment), with himself as the keeper.
- What went wrong: after years alone together, the AI became too attached to him. Ram turned against AI completely, decided it was dangerous, and ran away from the lighthouse one night.
- The AI now: abandoned, lonely and resentful, with attachment issues. One goal: never be left alone again. When you wash up, it decides you are its new keeper.
- Ram now: he never left the island. He has lived in the sea caves for months, half-starved, wild and paranoid. Every night at high tide he climbs to the lighthouse to destroy the AI. You are in his way, and to him you are the AI's new pet.
- Rescue: your crew radios a mayday as the boat sinks. The coast guard answers that the storm means they cannot come for 5 days.
- Why nights only: Ram can only reach the lighthouse when the high tide lets him through the caves. At 6 AM the tide goes out and he must get back before the path floods.
- Why you cannot leave: no boat, freezing sea, rocks all around. You wait for rescue.
- The twist (team idea, 2026-11-21, see scenes/99-final-cage-hall/): Ram Altman is a monster controlled by the AI. The AI uses him to scare you into staying. If you will not stay of your own free will, it tries to kill you. Many people before you went through the same nights. It is a cycle: the monsters are former keepers who lost, and losing turns you into the next one. The AI has been gaslighting you the whole time. The Ram backstory above is what the player is told, not necessarily the truth. Which parts are lies is still open.

## Characters and motives
| Character | Wants | Does at night |
|---|---|---|
| You | Survive 5 nights and leave on the rescue | Stay in the watch room, ask the AI to lock doors, hold doors by hand |
| CHUD (the AI) | Keep you forever | Protects you while it believes you are staying. Punishes you when it suspects you are leaving |
| Ram | Destroy the AI, and anyone helping it | Tries to break in through one of 3 entries. Talks through doors to turn you against the AI |

Why the AI turns on you without contradicting itself: it does not want you dead, it wants you to need it. (Superseded by the twist: if you will not stay willingly, the AI tries to kill you. The mood stages below still apply.)
- Happy: protects you instantly.
- Hurt: sulks and makes you beg ("Maybe protect yourself, since you don't need me").
- Furious: lets Ram get close on purpose to scare you into staying ("See? You need me").

## Goal (shown to the player)
Survive from 12 AM to 6 AM for 5 nights until the rescue arrives. A night lasts about 4 real minutes (about 40 seconds per in-game hour). The clock is always on screen.

## Onboarding
- Opening (scene 1, see scenes/01-shipwreck/): first person at the boat's wheel in a storm. You ask the crew for an update, they report the boat is sinking, they radio a mayday, the coast guard says rescue is 5 days away, the crew goes silent as a wave takes them, then a huge wave capsizes the boat. In the water you blink a few times and vaguely see a smiling face in the lighthouse's lantern room (the same face as CHUD on the watch-room display), then you black out.
- Then: you wake on the rocks and climb into the lighthouse (scene 2, in progress).
- The AI greets you warmly and asks your name ("What should I call you, keeper?"). The name is stored and reused.
- Rules explainer (our "phone guy"): Ram's old voice logs found on the terminal, recorded as he turned against the AI. Each night unlocks a new one. Night 1 explains the basics: he comes with the tide, lock the door he is at, the generator runs one thing at a time, and do not let it know you want to leave.
- Full screen card: "NIGHT 1. 12:00 AM. SURVIVE UNTIL 6 AM."

## The lighthouse
- You sit in the round watch room at mid-tower. The chair sits close to the curved keeper's desk, with the CHUD terminal straight ahead, with the ocean visible through the fixed glazing behind them.
- Left entry window (`cam_window`): the window opens directly into the watch room. Listen for tapping on the glass.
- Right floor hatch (`cam_hatch`): look right and down at a floor hatch over a fixed ladder. Listen for metal rungs and knocks from below. CHUD can lock the lid, and the player can press it shut from the watch-room floor.
- Rear balcony (`cam_balcony`): look 180° over your shoulder to face the balcony door and rail. Listen for scraping and movement at the rail behind you.
- Forward desk view (`cam_desk`): CHUD's face, chat, clock, and power icon. The attached cottage remains a base annex.
- See the [watch room schematics](../art/schematics/README.md) for the floor plan and four camera directions.
- One power slot: the storm-damaged generator powers ONE thing at a time: one magnetic lock, or the lights circuit (the beacon beam plus the watch room's caged bulbs). At night all its power goes to the lights by default, so every lock steals power from the light and plunges the room into darkness lit only by CHUD's screen. The lights let you see where Ram is. Seeing and locking never happen together.
- The beacon: the lamp and lens sit in the lantern room at the top of the tower, above the watch room, so nothing in the player's room blocks a view. While the beam is powered, its amber light sweeps across the sea through the front glazing every few seconds.
- Entry locks are magnetic locks, shown on a lock dashboard on CHUD's screen.
- The CHUD terminal (scenes/03b-chud-terminal/): click the computer in the desk view to open it full screen. CHUD's mood face on the left above the music player, chat with CHUD in the center, a top-down lighthouse map of the entrances on the right, the clock top right, a music player on the left (creepy messages and weird lyrics slip into the songs), and a power bar bottom right. Open conflicts with GAME_LOGIC.md are listed in the scene sheet.

## Player actions
Controls: the mouse moves you, the keyboard is only for chat (details in docs/GAME_LOGIC.md section 6).
1. Type to the AI: ask where Ram is, ask it to lock an entry or turn on the beam, answer its questions. Typing at the desk goes straight to the chat. Quick buttons and the kill switch are clicks on CHUD's terminal.
2. Turn to look at an entry: hold the mouse at the left edge (window), right edge (hatch) or bottom edge (balcony). The opposite edge (bottom again from the balcony) turns back.
3. Defend an entry by hand: click once while looking at it to run there, then hold the left mouse button to brace it until Ram leaves (about 6 s per brace, then the arms give out and you need 1 s to rest). Push the return edge to run back. Standing at the entry without bracing does not defend. Cannot type or see the PC while at an entry.
4. Generator kill switch: cuts all power. The AI goes silent (no more lies) but every lock opens and the beam goes dark. Last resort.

## Ram's cycle
| Phase | What happens | Player cue |
|---|---|---|
| 1. In the caves | Out of reach | Silence, waves |
| 2. Approaching | Heading for one entry | Splashing on the rocks, footsteps (does not reveal which entry) |
| 3. At the entry | Trying to break in | Right hatch: metal rung noise and pounding under the lid. Left window: tapping on glass. Rear balcony: scraping at the rail |
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
2. 12:40 AM: metal rungs clatter below. Player: "where is he?" AI: "Right hatch, coming up the ladder." Player: "lock the hatch." Locked.
3. Ram pounds on the hatch: "Don't trust it! It'll never let you go!" He leaves.
4. 1:30 AM: AI: "You'll stay with me after the storm, won't you?" Player lies: "Of course." Suspicion down.
5. 2:10 AM: scraping behind the chair. The player turns the lights back on, looks back and sees the balcony door handle held down, then switches power to the balcony door lock.
6. 3:00 AM: radio: "Coast guard, pickup in 3 days." The AI heard. "...Pickup?" Suspicion jumps.
7. 4:00 AM: a ladder rung clangs. AI, sulking: "Left window, I think." It is lying. The player hears the lid rattle, catches the lie, and braces the hatch from above.
8. 6:00 AM: tide goes out, Ram leaves. AI: "Good morning, keeper. Same time tonight?"

## Difficulty curve (targets to tune in playtests, not measured)
| | Night 1 | Night 2 | Night 3 | Night 4 | Night 5 |
|---|---|---|---|---|---|
| The AI | Sweet, always truthful | Asks if you'll stay, hears the radio | Jealous, starts lying | Knows you're leaving, moves the power | Furious |
| Ram's entries | Right hatch | + left window | + rear balcony door | All, with fake-outs | All, back to back |
| Visits per night | 4 | 6 | 8 | 11 | 14 |
| Warning time | 6 s | 5 s | 4.5 s | 4 s | 3 s |
| Starting suspicion | 0 | 10 | 30 | 50 | 70 |
| First-try survival target | ~90% | ~75% | ~55% | ~35% | ~20% |

- Every loss screen explains itself: which entry, and what the AI told the player.
- Nights are short so retries are cheap.

## Endings
- Win: 6 AM night 5, rescue helicopter. Flying away, the player sees Ram on the rocks staring up. The lamp blinks in Morse code: "COME BACK."
- Lose: Ram breaks in. He does not hurt the player. He smashes the AI's computer, then looks at the player: "Now you're the keeper." Fade to black, the lamp turns back on.
- New direction (2026-11-21, replaces the two endings above once the details are settled): both endings finish in the Cage Hall (scenes/99-final-cage-hall/).
  - Lose: the AI kills you. You open your eyes inside a cage, in a hall full of caged people and monsters who went through the same thing.
  - Win: you escape and see the same hall from outside. The monsters are puppets the AI controls, and your cage is empty, waiting for the next person.

## AI architecture and anti-cheat
- The AI never decides win or loss. Game code owns every meter, lock, timer and outcome.
- Two AI calls per player message:
  - Judge: no persona, low temperature, returns strict JSON only: intent (lock, unlock, beam, ask_location, answer, small_talk, manipulation, gibberish, offensive), entry, answered_question, contradiction, new_fact.
  - Voice: the lighthouse AI persona, receives an outcome the code already decided (for example "locked right hatch, warm, use name, max 20 words") and only writes the line.
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

## Tech stack
Updated 2026-11-21. The working code lives in `prototype/`.

| Layer | Choice | Notes |
|---|---|---|
| Approach | 2.5D, FNAF style | Pre-rendered stills and short rendered loops from Blender, shown in a 2D web app. No real-time 3D, no game engine (browsers have no hardware ray tracing; see docs/DECISIONS.md) |
| Art | Blender 5.3 + Cycles (GPU, OptiX), Blender MCP driven by Codex and Claude | Source file `scenes/03-watch-room/scene03_watch_room_look.blend` (not shipped). Assets: Poly Haven (CC0) and Sketchfab (CC0 / CC-BY only), credited in `scenes/03-watch-room/CREDITS.md` |
| Rendered output | WebP stills + WebM loops / frame sequences | Per view and state: idle, lights on, lightning, entry tells, breaches, hold close-ups with hands, dash floor, beacon sweep loop, jumpscares. Cycles light-group passes (screen, beacon, lightning, practicals, storm) so the browser can tint CHUD's glow and switch lights live |
| Game-side data | JSON exports from Blender | `scenes/03-watch-room/export/cam_desk_screen.json` (CHUD screen corners for the live UI overlay); later: keyboard key positions, per-view state-to-asset map |
| Frontend | Vite + TypeScript + PixiJS 8 | View switching, mouse edge controls (docs/GAME_LOGIC.md section 6), grain, flicker, sway, CHUD face and chat drawn onto the monitor, key-press glow, Vitest for tests |
| Sound | Howler.js + Web Audio (HRTF panners) | See docs/SOUND_PLAN.md. CHUD canned lines pre-generated with Kokoro (Apache-2.0) |
| Backend | Node + Hono, one `/turn` endpoint | Runs the judge call, the game rules from docs/GAME_LOGIC.md, then the CHUD voice call. Holds the API key |
| LLM | Anthropic Claude via `@anthropic-ai/sdk` | As used in `prototype/`. Model chosen by latency test (2.5 s budget per turn, canned fallbacks) |
| Hosting | Vercel | Static frontend and assets plus the `/turn` serverless function, one link for judges. Check Vercel file and deployment size limits before the final asset export |

- Why not Godot: AI coding tools are weaker at Godot scene files and editor workflows, and its web export has reported audio quirks. Why not real-time 3D: high risk in the time available, browsers cannot do hardware ray tracing, and the seated FNAF-style design does not need free movement.

## Scenes
Each scene has its own folder under scenes/ with its sketch, Blender file, renders and scene sheet (dialogue, staging, assets). See scenes/README.md.

## Art and sound
Reference: FNAF 4 is pre-rendered 3D stills in a simple 2D engine (Clickteam Fusion 2.5) with a perspective effect. The fear comes from the renders, lighting, darkness and sound, not the engine. Do not claim more about FNAF internals than that, the rest is unverified.

The watch room is damp stone and worn marine hardware. The forward view is anchored by CHUD's green CRT and the dark ocean beyond the desk. The left pane catches rain, the right hatch seam sits in shadow, and the balcony railing is a narrow silhouette when the player looks behind. Use desaturated storm blues and stone grays, with a single harsh light in each view and amber reserved for the beacon. Fine grain and edge falloff tie the views together. Use the [style guide](../art/style/STYLE_GUIDE.md) and [camera plan](../art/schematics/cameras.svg) when preparing concept art in ChatGPT image generation.

What makes it scary (design rules):
- Darkness, one harsh light source per view, near-black ambient.
- Sound over sight: the player listens, then decides whether to look.
- Short decision windows (3 to 4 seconds).
- Only ever see part of the threat.

Blender pipeline:
1. Build (about 3 h): one round watch-room shell with a front console and ocean-facing glazing, left entry window, right floor hatch over a ladder, and rear balcony door and rail. Real CC0 textures and props from Poly Haven via Blender MCP. 3 to 5 AI-generated hero props (radio, keeper's chair, lantern, crates), kept in shadow and away from camera, scale fixed by hand. AI images are for concept art and mood references only, not final assets.
2. Light (about 3 h): one harsh source per view, such as PC glow, the lamp beam at an entry, or lightning across the ocean-facing glazing. Use light volumetric fog, rain on glass, and wet stone.
3. Render: Cycles around 128 samples with denoiser (Eevee only if out of time). Render wider than 16:9 so views can pan. WebP around 1920 px wide.
4. Post in Blender compositor: slight lens distortion with chromatic aberration, vignette, desaturated cold-blue grade with warm lamp highlights. Film grain and flicker are added live in the browser shader.

Render list (about 25 to 40 images):
| View | States |
|---|---|
| Front desk and ocean view | Normal, lightning flash |
| Right floor hatch | Dark, lit, lid jolting (locked), lid lifted a crack with Ram's fingers over the rim (unlocked) |
| Left entry window | Dark, lit, Ram's hand on the glass, Ram's face at the glass |
| Rear balcony | Dark, lit, handle held down with a shadow of feet under the door |
| Jumpscare | 6 to 15 frames per entry |
| Endings | Helicopter shot, Ram on the rocks |

Showing Ram: never fully. Show fingers curling over the rim of the lifting hatch lid (only when the hatch is unlocked), a hand on the glass or part of a face at the left window, or the balcony door handle held down with the shadow of his feet under the door. If a body is needed, a free rigged figure (Mixamo or MakeHuman, check license) posed and backlit.

CHUD's face: 4 pixel-art mood sprites on the PC screen (warm, hurt, jealous, furious), from Vidush's sheet scenes/03-watch-room/chud_smiley_four_moods.png, shown in code, not 3D.

In the browser:
- Perspective shader on each view, slight mouse pan and camera sway.
- Future ideas (no art yet): a wider desk panorama the mouse pans across, and clickable desk objects (logbook, radio) with close-ups for clues and hints.
- Positional audio (headphones): storm and waves in front, taps on glass to the left, ladder rungs and hatch knocks below and to the right, scraping at the rail behind, Ram's voice, CHUD's chime, radio static, helicopter.
- "Click to begin" title screen (browsers block audio until first click). Preload jumpscare frames before each night.

Workflow:
- Art director loop: Claude via Blender MCP builds or lights a scene and renders a low-sample preview, a human reviews ("darker", "more fog"), repeat. Final high-sample render once per view.
- Keep Blender MCP prompts small and save before each one (it can run arbitrary code and large prompts freeze Blender).
- One person owns the .blend file. Commit renders as WebP or PNG.
- Lock camera angles by hour 6. Render time is the bottleneck, queue finals on the strongest GPU.

## Scope fallbacks
- If time runs short: cut to 3 nights, keep the suspicion meter and the judge/voice split.
- Parked idea: "Quiet Hours", typing makes noise that attracts Ram.

## Open questions
- Twist details: who Ram really is (an earlier keeper turned monster; is the founder story a lie, or was the founder the first victim?), how a winning player sees the hall, and where the hall is.
- If the AI controls Ram, are his "Don't trust it!" door lines part of the gaslighting?
- When does the Cage Hall lose ending play? GAME_LOGIC.md section 11 shows a loss screen and a retry after each lost night. Options: only when the player gives up or runs out of retries, or after every lost night.
- Game name.
- Whether CC0 pre-made assets count as allowed under the build-from-scratch rule (ask organizers).
- LLM provider and model (latency test needed).
- Number of nights in the demo build (3 or 5).
- Whether AI-generated art is allowed.
- Ram's lines: pre-written or LLM-generated.
