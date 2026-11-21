# Controls proposal (FNAF 4 style)

Prototype status: implemented for playtest on branch `proto/v3-controls-edge` (cut from `proto/v3-2.5d`, for A/B comparison). Done there: edge turning with a dwell, slide-and-blur turns with a whoosh and chair creak, click to run to an entry (only from that entry's view), hold left click there to brace (6 s per brace, 1 s rest between braces), the return edge to run back, one cursor ring for the running timer (edge dwell, arms left) instead of bars, keyboard for chat only (typing at the desk goes straight to the chat), night 1 hints. Second iteration after the first playtest: press-and-hold to run and brace in one gesture did not feel smooth, so going and bracing are now separate. Not done: the wider desk panorama, desk object hotspots and close-ups (no art yet), breathing sway beyond the existing idle sway, positional audio changes. Tunables and details: prototype/IMPLEMENTATION_NOTES.md, section "Edge controls (branch proto/v3-controls-edge)".

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
| Run to an entry | While looking at that entry, click the left mouse button once | The dash (camera tips to the floor, shakes, about 1.5 s), then the close-up of that entry, hands not yet bracing | `TRAVELING(entry)` then `STANDING(entry)` |
| Brace the entry | At the entry, press and HOLD the left mouse button | The camera leans in, the hands brace it; a ring on the cursor drains as the arms tire | `HOLDING(entry)` |
| Stop bracing | Release the button, or the arms give out after `HOLD_MAX` (6 s) | Lean back, still at the entry. The next brace can start after `BRACE_REST` (1 s) | `STANDING(entry)` |
| Run back to the desk | At the entry (bracing or not), push the mouse to the same edge that turns back to the desk from that view (opposite side for window and hatch, bottom for the balcony) | The dash back | `RETURNING` then `DESK` |
| Lock, lights, "where is he?" | Click CHUD's quick buttons on the desk screen, or type | CHUD reacts (or refuses, or lies) | Power slot / CHUD rules unchanged |
| Kill switch | Click the breaker on the desk | Power cut, CHUD silent | Section 6.5 unchanged |

## Changes compared with docs/GAME_LOGIC.md
1. **Turning (6.1):** mouse screen edges instead of an unspecified turn control. Turn time stays 0.25 s (about 0.4 s for the balcony turn, which is the longer 180° move).
2. **Holding (6.4):** going and bracing are separate.
   - One click on an entry's view starts the dash (`TRAVELING`, `TRAVEL_TIME` unchanged). On arrival the player is at the entry but not bracing: a new position `STANDING(entry)`. A trip can only start from the view of that entry (the player must look at it first), which keeps "look, then decide" as the core loop.
   - Press and hold the left button at the entry to brace (`HOLDING(entry)`). Only `HOLDING` defends (7.5 unchanged): standing idle at the right entry when the attempt ends is a breach.
   - Releasing ends the brace and the player stays at the entry. Each brace lasts at most `HOLD_MAX` (6 s), then the arms give out and the player stays at the entry. A new brace can start after `BRACE_REST` (new, 1 s) and needs a fresh press.
   - A press during the dash (or the first click still held) braces on arrival if the button is still down.
   - The player leaves only by the return edge: `RETURNING` for `TRAVEL_TIME`, then `DESK`. No automatic return.
   - `HOLD_COOLDOWN` (4 s, unchanged) now gates the next trip from the desk. It starts when the player leaves the entry, so 2.5 s of it remain on arrival at the desk.
   - While traveling, at the entry, bracing or returning: no typing, quick buttons or turning (edges other than the return edge do nothing). Subtitles, audio and the silence timer continue, as in 6.4.
   - Loss cause: standing or bracing at a different entry when the attempt ends is `WRONG_HOLD` (the loss screen names the entry the player was at).
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
3. Is click to go, hold to brace, edge to return clear? Is 6 s per brace with a 1 s rest the right rhythm, and does staying at an entry for a long time need a cost beyond the silence timer?
4. Does keeping the keyboard for chat only ever feel limiting?
5. Can the player react to an entry cue in time on night 5 (3 s attempt window) with these controls?
