# Scene 3b: CHUD Terminal

Status: layout sketch. Nothing here is final. This is a sub-view of scene 3 (the watch room), so it shares the number 3.

## Purpose
The main screen of the game. From the watch room's forward desk view (`cam_desk`), the player clicks the computer and the CHUD terminal fills the screen. This is where the player talks to CHUD, checks the entrances, watches the clock and manages power. It is also the lock dashboard on CHUD's screen mentioned in docs/GAME_DESIGN.md.

## Layout (from the sketch)
| Area | What it is | Notes |
|---|---|---|
| Top left | Title, `X.X.X.X` placeholder | Content not decided (game name, CHUD logo, or system name) |
| Center | Chat with CHUD | Message bubbles alternate between CHUD and the player. Text input bar at the bottom. |
| Top right | Clock, starting at `12:00` | Night time, 12:00 AM to 6:00 AM |
| Right | Top-down map of the lighthouse | Circle = the watch room. Center ring = the tower core. Each red dot = an entrance. The green dot at the top sits on the curved desk. |
| Left, above the music player | CHUD's face | One of the 4 mood faces (see below), always showing CHUD's current band |
| Left | Music player | Play button and progress bar. The player can choose to play music. Creepy messages or weird lyrics slip into the songs. |
| Left, under the music player | Empty box | Purpose not decided yet |
| Bottom right | `POWER` bar | Shows what the one power slot is feeding. 4 cells: window lock, hatch lock, balcony lock, beam. Green = powered now, red = not powered. All red = `NONE` (kill switch off, or CHUD cut the power). Power never drains. |

### Map reading (interpretation, to confirm)
Matched to the watch room layout in docs/GAME_DESIGN.md:
- Left red dot: the left entry window.
- Right red dot: the right floor hatch.
- Bottom red square: the rear balcony door.
- Top green dot on the arc: the desk with CHUD and the ocean glazing, where the player sits.

## CHUD's face
- Sits on the left of the panel, above the music player, in the empty space under the title.
- Art: Vidush's four-mood sprite sheet, [`../03-watch-room/chud_smiley_four_moods.png`](../03-watch-room/chud_smiley_four_moods.png). Pixel smiley faces, pale green on black, matching the green CRT look.
- One face per mood band from GAME_LOGIC.md 8.1, which says the face shows the band at all times. Left to right on the sheet (order assumed from the art, to confirm with Vidush):

| Band | Suspicion | Face on the sheet |
|---|---|---|
| WARM | 0 to 39 | Simple smile, square eyes |
| HURT | 40 to 69 | Frown, square eyes |
| JEALOUS | 70 to 99 | Wide grin with a row of teeth, eyes glancing sideways |
| FURIOUS | 100 | Huge black mouth full of teeth, ring eyes |

- The face swaps the moment the band changes, so the player reads CHUD's mood at a glance.
- The same face appears in the lighthouse's lantern room at the end of scene 1.

## Music player
- The player can choose to play music during the night.
- Creepy messages or weird lyrics slip into the songs.
- Ideas (proposals, not approved):
  - A lyric that uses the player's name, taken from CHUD's stored facts.
  - Lines like "stay, keeper, stay" folded into an ordinary chorus.
  - A song that briefly plays backwards or slows down when CHUD's mood drops.
  - Names of earlier keepers whispered between tracks, a hint of the cycle in the final scene.

## Conflicts with GAME_LOGIC.md (GAME_LOGIC.md wins on rules)
1. **Power bar (resolved).** Follows the one power slot in GAME_LOGIC.md: one lock or the beam, never both, never drains, each night starts on BEAM. Switches land after 0.5 s. When CHUD cuts power (sabotage or Furious), all cells go red with a loud relay clunk. Optional: an entry's map dot turns green while its lock is powered.
2. **Quick buttons and the kill switch are missing.** GAME_LOGIC.md 6.3 puts quick buttons on the desk screen (`[Where is he?]` `[Lock window]` `[Lock hatch]` `[Lock balcony]` `[Beam]` `[Power off]`), and 6.5 puts the kill switch on the desk. The panel needs a place for them.
3. **Music versus entry sounds.** Fairness rule 12.1 says every entry's audio cue plays throughout the attempt. Music must never cover those cues, for example by ducking the music whenever an entry cue plays.
4. **The map must not show Ram.** Ram's location comes only from CHUD (who may lie) or from the beam. The map can show entries and lock states, not Ram. One option: clicking an entry dot starts a hold, since GAME_LOGIC.md 6.4 allows starting a hold from the desk.
5. **CHUD's face (resolved).** Left of the panel, above the music player, using Vidush's four-mood sprite sheet. See "CHUD's face" above.

## Assets needed
- UI: built in code (PixiJS), not rendered in Blender. Panel frame, chat bubbles, input bar, clock, map, power bar, music player.
- CHUD face sprites: done (Vidush's sheet). Needs cutting into 4 separate images for the code.
- Audio: a few music tracks with creepy inserts. Check the build-from-scratch rule for music before using existing tracks.

## Open questions
- What goes in the top-left title?
- What is the empty box under the music player for?
- Where do the quick buttons and the kill switch go?
- Is the mood order on the sprite sheet WARM, HURT, JEALOUS, FURIOUS (left to right)?
- Do map dots change color with lock state (for example green = locked)?
