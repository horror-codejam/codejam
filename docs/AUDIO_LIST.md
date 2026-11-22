# Audio list (owner: Vidush)

Everything the game needs, for the silent loop (branch `experimental-gameplay-loop`, GAME_LOGIC 7.4). Sources and licensing rules: docs/SOUND_PLAN.md (CC0 or CC-BY only, no NC, credit every CC-BY file).

## Rule
Ram makes no sound during play. No approach, knock, tap, scrape or retreat sounds. He is only heard in the voice logs and the jumpscare. The old per-entry cues in SOUND_PLAN are cut.

## Format
- `.ogg` (or `.mp3`), 44.1 kHz, mono for one-shots, stereo for loops and beds.
- Loops must loop seamlessly.
- Trim silence at the start of one-shots.
- Put files in `prototype/assets/audio/` with the names below.
- Add each source, author and license to `scenes/03-watch-room/CREDITS.md`.

## Beds and loops
| File | What | Length |
|---|---|---|
| `bed_storm.ogg` | Storm, heavy rain on glass, waves on rocks, wind | 60 s+ loop |
| `bed_room.ogg` | Low room hum, generator drone | 30 s+ loop |
| `music_title.ogg` | Title screen drone, slow and uneasy | 60 s+ loop |

## Decoy noises (the dread layer)
Played at random times from random directions. They never mean anything. Make them varied and believable.
| File | What |
|---|---|
| `decoy_01.ogg` to `decoy_15.ogg` | 10 to 15 one-shots: wood creaks, a single knock, metal settling, pipe tick, glass rattle from a gust, a distant thud, something small falling, a chain clink |

## Player
| File | What |
|---|---|
| `dash_steps.ogg` | Hurried footsteps on a metal and wood floor, about 1.5 s |
| `dash_breath.ogg` | Panicked breathing, about 1.5 s |
| `brace_strain.ogg` | Straining breath plus a creak under pressure, loopable, about 2 s |
| `turn_whoosh.ogg` | Soft clothing and chair movement for a head turn, short |
| `type_keys_01.ogg` to `type_keys_04.ogg` | Keyboard key clicks |

## Power and machines
| File | What |
|---|---|
| `relay_clunk.ogg` | Heavy relay switch when power changes (lights or lock) |
| `lights_on.ogg` | Caged bulbs buzzing on |
| `lights_off.ogg` | Bulbs cutting out |
| `lock_engage.ogg` | Magnetic lock thunk and hum |
| `generator_off.ogg` | Generator winding down (kill switch) |
| `generator_on.ogg` | Generator starting (reboot) |

## Breach and jumpscare
| File | What |
|---|---|
| `breach_window.ogg` | Window sashes bursting in, glass and rain |
| `breach_hatch.ogg` | Metal hatch lid slamming open |
| `breach_balcony.ogg` | Door bursting open, storm rushing in |
| `jumpscare_01.ogg` (2 or 3 variants) | Scream or sting, about 1 s, loud and harsh, matches the 24-frame clip |

## Night flow and screens
| File | What |
|---|---|
| `night_start.ogg` | Low sting for the night card |
| `win_6am.ogg` | 6:00 AM sting, relief, storm fading |
| `loss_static.ogg` | Short static burst after the jumpscare cut to black |
| `ui_click.ogg` | Menu click, subtle |

## Radio
| File | What |
|---|---|
| `radio_static.ogg` | Radio static, loopable |
| `radio_coastguard.ogg` | Voice: "Coast guard, pickup in 3 days." (night 2, 3:00 AM) |
| `radio_helicopter.ogg` | Voice: "Helicopter at first light." (night 5, 5:00 AM) |

## Voices
| File | What |
|---|---|
| `chud_*.ogg` | CHUD's canned lines per outcome and mood (WARM, HURT, JEALOUS, FURIOUS). Line list in `prototype/src/chud/lines.ts`. Includes the WARM arrival warnings ("The hatch, keeper. Now." per entry) and "He's gone." |
| `log_1.ogg` to `log_5.ogg` | Ram's voice logs, one per night (text in `lines.ts` and GAME_LOGIC section 10) |

## Priority if time runs short
1. `bed_storm`, decoys, `relay_clunk`, `jumpscare_01`, the breach sounds, `dash_steps`.
2. CHUD canned lines, `win_6am`, radio lines.
3. Everything else.
