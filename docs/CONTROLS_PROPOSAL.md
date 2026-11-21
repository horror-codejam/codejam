# Controls proposal (FNAF 4 style)

Status: PROPOSAL, not adopted. To be playtested. If adopted, fold it into docs/GAME_LOGIC.md (section 6) and log it in docs/DECISIONS.md. Until then, docs/GAME_LOGIC.md stays the source of truth.

## Goal
Play as simply as FNAF 4: the player understands the controls in under 30 seconds, with no tutorial screen needed beyond a few on-screen hints on night 1.

## Core rule
**The mouse moves you. The keyboard is only for talking to CHUD.**
The player types free text to CHUD, so letter keys cannot be movement keys (WASD would trigger every time the player types a "w"). Every movement and action is mouse-driven. Typing works whenever the player is in the `DESK` view: just start typing, Enter sends.

## Controls

| Want to... | Input | What the player sees | Game state |
|---|---|---|---|
| Look around the desk | Move the mouse left and right | The desk view pans gently across a wider-than-screen render (FNAF 4 bedroom style) | View `DESK` |
| Look left at the window | Push the mouse to the left screen edge and hold about 0.3 s | A fast 0.25 s head turn to the window | View `WINDOW` |
| Look right at the hatch | Push the mouse to the right screen edge and hold about 0.3 s | A fast 0.25 s head turn, down to the hatch | View `HATCH` |
| Look behind at the balcony | Push the mouse to the bottom screen edge | A short "turn around in the chair" move (about 0.4 s) | View `BALCONY` |
| Return to the desk | From `WINDOW` or `HATCH`: the opposite screen edge. From `BALCONY`: the bottom edge again | Turn back | View `DESK` |
| Run to an entry and brace it | While looking at that entry, press and HOLD the left mouse button | The dash (camera tips to the floor, shakes, about 1.5 s), then the close-up of the player's hands bracing the entry | `TRAVELING(entry)` then `HOLDING(entry)` |
| Stop bracing | Release the mouse button (or arms give out at `HOLD_MAX`) | Dash back to the desk | `RETURNING` then `DESK` |
| Lock, lights, "where is he?" | Click CHUD's quick buttons on the desk screen, or type | CHUD reacts (or refuses, or lies) | Power slot / CHUD rules unchanged |
| Kill switch | Click the breaker on the desk | Power cut, CHUD silent | Section 6.5 unchanged |

## Changes compared with docs/GAME_LOGIC.md
1. **Turning (6.1):** mouse screen edges instead of an unspecified turn control. Turn time stays 0.25 s (about 0.4 s for the balcony turn, which is the longer 180° move).
2. **Holding (6.4):** press-and-hold instead of click-to-hold plus a "back to desk" button. Releasing the button starts `RETURNING`. `TRAVEL_TIME`, `HOLD_MAX` and `HOLD_COOLDOWN` are unchanged. Holding can only start from the view of that entry (the player must look at it first), which keeps "look, then decide" as the core loop.
3. **Keyboard:** reserved for chat. No movement or action hotkeys.
4. Everything else (power slot, CHUD rules, timers, tells, fairness guarantees) is unchanged.

## Desk panning and clues
- The desk view is rendered wider than the screen (a panorama). Moving the mouse slides across it, so the player can lean to see the radio, the kill switch, the mug and the edges of the room.
- Hotspots on objects (for example a logbook or the radio): hover highlights them, click zooms into a close-up render, click again or move the mouse away to return. This is where tutorial hints and story clues can live later.
- Typing still works while panning the desk.

## Feel
- Turns are done in the browser as a fast slide between the pre-rendered views with motion blur and a whoosh, so no extra renders are needed.
- A subtle breathing sway and a few degrees of mouse parallax in every view.
- Sound carries half the feel: chair creak on turns, footsteps and breathing on the dash, the entry tells in positional audio.

## Art needed if adopted
- A wider desk panorama render (one per desk state).
- One close-up render per inspectable desk object.
- Hold close-ups and the dash floor view (already planned).

## Playtest questions
1. Does a first-time player find the left, right and behind views without being told?
2. Is the edge-hold delay (about 0.3 s) long enough to avoid accidental turns while panning the desk, and short enough to feel instant?
3. Is press-and-hold to brace clear, and does releasing to return feel natural?
4. Does keeping the keyboard for chat only ever feel limiting?
5. Can the player react to an entry cue in time on night 5 (3 s attempt window) with these controls?
