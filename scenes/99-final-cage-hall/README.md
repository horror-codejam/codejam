# Final scene: The Cage Hall

Status: blockout and story draft. Nothing here is final. The folder uses 99 until the total number of scenes is known; rename it to the real number then.

## Purpose
The twist. Win or lose, the game ends here and the player learns the truth: Ram Altman was never a free man trying to break in. He is a monster the AI controls, used to scare you into staying. You are not the first. Many people before you went through the same nights. It is a cycle.

## The twist (team idea, 2026-11-21)
- Ram Altman is the monster, and the AI controls him.
- The AI uses him to scare you and trap you in the lighthouse.
- If you will not stay of your own free will, the AI tries to kill you.
- The AI has been gaslighting you the whole game.
- The cycle (confirmed 2026-11-21): the monsters in the cages are former keepers who lost. Losing turns you into the next monster, the next "Ram" the AI sends after whoever washes up next.

## Setting
- A long, low concrete hall hidden under the lighthouse (location to confirm). Cold green fluorescent tubes on the ceiling, one of them dying. A drain channel runs down the middle of the floor. A black doorway at the far end.
- Cages line both walls, hanging from chains. Each cage holds someone who came before you:
  - Monsters: former keepers who lost, turned into creatures like Ram. Tall, thin, dark, with big glowing red eyes, rows of teeth and claws wrapped around the bars.
  - People: keepers who have not turned yet. Some standing and gripping the bars, some slumped against the back of the cage.
- One cage on the left is empty. It is yours.

## Two versions of the scene
| Ending | Camera | What the player sees | What it means |
|---|---|---|---|
| Lose (killed by the AI) | `Cam_Lose_InCage`: inside your own cage, looking out through the bars | You open your eyes behind bars. Across the hall, cage after cage of people and monsters. One of the monsters stares back. | You are now part of the collection, and you will become the next monster. There have been many before you. |
| Win (escape) | `Cam_Win_Outside`: standing in the hall, looking down it (the sketch's view) | You walk the hall from outside the cages. The monsters are behind bars, controlled. Your cage is empty. | The monsters were puppets all along. The AI lied to you the whole time. Someone else will be next. |

## Files
| File | What it is |
|---|---|
| `sketch.png` | Original hand sketch |
| `final_cage_hall.blend` | Blender blockout of the hall (Blender 5.3, EEVEE) |
| `render_win_outside.png` | Win view, 1920x1080 |
| `render_lose_in_cage.png` | Lose view, 1920x1080 |

## Blender file contents
Collections in `final_cage_hall.blend`:
- `Hall`: floor, ceiling, walls, end wall with a black doorway, floor drain.
- `Ceiling_Lights`: 4 fluorescent fixtures with area lights. Fixture 2 is the dying tube (dim).
- `Cages`: 13 cages with chains, front bars, side bars, cross bar.
- `Player_Cage`: the empty cage on the left at y = 10. The lose camera sits inside it.
- `Caged_Monsters`: 4 monster figures (former victims, Ram-like). Blockout shapes.
- `Caged_People`: 9 human figures, standing or slumped. Blockout shapes.
- `Cameras`: `Cam_Win_Outside` (20 mm) and `Cam_Lose_InCage` (18 mm). The file opens on the win camera. Switch the active camera to render the other view.
- World: near-black with green-tinted haze.

Blockout limits: simple shapes, no textures, no grain filter. The monster design here is a placeholder for the real Ram design.

## Script (draft, proposal)
Lines are proposals for the team to approve.

Lose:
1. Black screen. Sound of breathing, a fluorescent hum, a tube buzzing.
2. Eyes open behind bars (`render_lose_in_cage`).
3. CHUD, warm, from a speaker in the hall: "There you are, keeper. You're never leaving me again."
4. Across the hall, a monster's eyes light up.
5. Fade to black. Lighthouse lamp turns on.

Win:
1. After the rescue, the player finds or is shown the hall (how is still open, see below).
2. Walk-in view down the hall (`render_win_outside`). Monsters twitch in their cages, all at the same moment, like puppets.
3. The camera stops at the empty cage on the left.
4. CHUD, calm: "Someone else will wash up. Someone always does."
5. Fade to black.

## Assets needed
- Images: lose view, win view, close-up of a monster's face behind bars, empty cage close-up, black.
- Sound: fluorescent hum and buzz, chains creaking, breathing, metal bars, CHUD over a speaker.

## Open questions
- Who is Ram? The cycle suggests he is an earlier keeper who lost and was turned into a monster. Is the "billionaire founder" story a lie the AI tells, or was the founder the very first victim?
- Win ending: how does the player see the hall from outside if they escaped on the rescue? Does the helicopter flight cut to this scene, or does the player find the hall before leaving?
- Where is the hall: under the lighthouse, in the sea caves, or somewhere else?
- Ram's door lines ("Don't trust it!"): if the AI controls him, are those lines part of the gaslighting?
