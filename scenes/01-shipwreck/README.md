# Scene 1: Shipwreck

Status: blockout and dialogue draft. Nothing here is final.

## Purpose
The game's opening. It shows why the player is stranded and alone: the boat sinks, the crew is lost, rescue is days away. It also shows the lighthouse on the horizon before the player ever reaches it, and, just before the blackout, a smiling face in its lantern room: the first hint of the AI.

## Setting
- A stormy night with lightning at sea.
- First-person view from the helm. You (the captain) stand at the front of the boat, gripping the ship's wheel with both hands. The deck runs forward to the bow.
- Far off on the upper left: a small rock island with the lighthouse, its lamp lit, the keeper's cottage and a palm tree.
- Upper right: lightning striking the sea.
- The crew is behind you, out of view. They are heard, never seen.

## Files
| File | What it is |
|---|---|
| `sketch.jpg` | Original hand sketch |
| `scene01_shipwreck.blend` | Blender blockout of the opening view (Blender 5.3, EEVEE) |
| `render_blockout.png` | 1920x1080 render of the blockout |

## Blender file contents
Collections in `scene01_shipwreck.blend`:
- `Boat`: deck, hull sides rising toward the bow, rails, ship's wheel with spokes and handles, pedestal, crate, rope coil, lantern post.
- `Player_Hands`: blockout forearms and hands gripping the wheel at about 10 and 2 o'clock. Placeholder shapes only, need a proper model or a painted overlay.
- `Sea`: storm sea (displaced grid). Also `Rogue_Wave` and `Rogue_Wave_Foam`, hidden in this shot, kept for the capsize beat.
- `Island_Lighthouse`: island rock, lighthouse tower, gallery, lamp room, roof, keeper's cottage, palm tree, lamp glow and beam lights.
- `Storm_Lightning`: main bolt, 3 branches, flash light.
- `Camera_Lights`: `FP_Camera` (18 mm, slight roll so the boat feels like it is listing), helm lantern, faint sky light.
- World: dark storm-sky gradient with light haze.

Blockout limits: simple shapes, no textures, no rain, no grain filter. The FNAF look (grain, desaturation, heavier shadows) still needs to be applied, in Blender or as a 2D pass.

## Dialogue script (draft)
Speakers: YOU (the captain, at the wheel), MATE (crew member behind you, voice only), COAST GUARD (over the radio, through static). Lines marked (proposal) were added to the team's outline and need approval.

| # | Beat | Speaker | Line |
|---|---|---|---|
| 1 | Storm, rain, wheel straining. Lightning flash. | (no dialogue) | |
| 2 | You ask for an update. | YOU | "Report! What's happening back there?" |
| 3 | The crew says the boat is sinking. | MATE | "We're taking on water, Captain! The hull's cracked, she's going down!" |
| 4 | You order the call for help (proposal). | YOU | "Get on the radio. Call the coast guard!" |
| 5 | The crew calls for help. | MATE | "Mayday, mayday, mayday! We're sinking, three souls aboard, we need help now!" |
| 6 | The coast guard responds. | COAST GUARD | "...copy your mayday. The storm has grounded every crew we have. Earliest we can reach you is five days. Repeat, five days." |
| 7 | Reaction (proposal). | YOU | "Five days? We won't last the night!" |
| 8 | The crew goes silent: a wave takes them. | MATE | "Captain, wave, starboard side! Hold on..." (cut off by the wave) |
| 9 | Silence behind you (proposal). | YOU | "Hey? HEY! Answer me!" |
| 10 | A huge wave rises ahead, lightning, the boat tips over. | (no dialogue) | Sound cuts out. |
| 11 | In the water, half-conscious, you blink a few times. Between blinks you vaguely see the lighthouse with a smiling face in its lantern room. | (no dialogue) | Muffled sound, heartbeat. |
| 12 | You black out. | (no dialogue) | Fade to black. Go to scene 2. |

## Staging notes
- Beats 1 to 9 use the opening view. Lightning flashes and wheel shake keep it alive without much animation.
- Beat 8: the crew is lost off screen. Their voice cuts off mid-line, then only the storm.
- Beat 10: show the hidden `Rogue_Wave` rising over the bow, then the camera rolls hard (the boat capsizing). 2 to 3 still frames are enough.
- The lighthouse stays visible on the horizon the whole scene. It is the only light out there.
- Beat 11 (the lighthouse face):
  - Treat the lighthouse like a person: the tower is the body, the lantern room is the head, and a face appears in the lantern room.
  - The face is smiling. It is the same face as CHUD's face on the display in the watch room. The exact art comes later with the CHUD face design, so this beat uses that design once it exists.
  - Show it in blinks: black, a blurry tilted view of the lighthouse from water level, black again. Over 3 to 4 blinks the view gets a little clearer and the face is there, smiling at you, never fully sharp.
  - Keep it ambiguous. The player should not be sure they saw it. It is the first hint that the AI is watching and has already chosen you.

## Assets needed
- Images: opening view, lightning variant (bright flash), rogue wave frame, capsize frame (tilted), blink frames of the lighthouse from water level (2 to 3, blurry to less blurry) with the smiling face in the lantern room, black.
- Sound: storm and rain, thunder, creaking hull, wheel strain, radio static, mayday call, the crew's voice cut off, huge wave impact, sudden silence, muffled underwater sound and heartbeat for the blinks.
- Depends on: the CHUD face design (the lighthouse face must match it).

## Open questions
- Crew size and names, and whether the boat has a name.
- Does the player click to advance dialogue, or does it play as a cutscene with subtitles?
- Do the crew and coast guard get recorded voices, text-to-speech, or subtitles only?
