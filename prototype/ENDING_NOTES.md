# Kill code ending: integration notes

Branch: `proto/ending-logic` (cut from `release-integration` on 2026-11-22, `release-integration` merged back in the same day). To be merged into `release-integration` by PR. Rules live in docs/GAME_LOGIC.md section 6.7 and section 11.

## What is done
- Random 4 character kill code per run (2 letters + 2 digits), stored in the save (`killCode`, `papersCheckpoint`). Config: `ENDING` in `src/config.ts`.
- Ram drops a slip at an entry when the player blocks him there (lock or brace), nights 2 to 5, at most one new slip per night. The player goes to that entry and clicks the slip to collect and read it. Collected slips stay on the desk next to the night's desk artifact (clipping, calendar, diary on nights 1 to 3).
- Night 5: typing the code anywhere in a chat message to CHUD kills it (checked in code before the judge, never sent to the LLM). Ram is freed, the night ends as `GAME_WON` with `state.ending === "KILL_CODE"`.
- 6:00 AM on night 5 without the code: phase `TRAPPED`, trapped ending, then Title. Continue retries night 5.
- After the kill: two text beats on black (CHUD dies, the hatch opens by itself), then the exit scene, then credits.

## Exit scene
`renderExitScene` in `src/ui/screens/killEnding.ts` plays Vidush's two Blender stills from `art/end-cutscene/` (branch `codex/end-cutscene-reference`):
1. `01-cage-hall.webp`: the cage hall under the hatch. Two captions.
2. `02-rescue-boat.webp`: the lighthouse from the coast guard boat. Two captions.

Each still fades in with a slow push-in (CSS in `src/ui/screens.css`, `.exit-*`), captions run 5.2 s each, a click skips to the next caption, and the last one fades to the credits. Captions and timing are in `EXIT_SHOTS` and `CAPTION_MS` in the same file. Only the webp stills are in this branch; the `.blend` files and the PNG masters stay on Vidush's branch. The Poly Haven assets from `art/end-cutscene/ASSET-CREDITS.md` are in the credits roll.

## Trapped ending (planned, art in progress elsewhere)
Decided 2026-11-22: surviving all 5 nights without the code is still a fail.
1. The coast guard boat comes in, seen through the window. Relief.
2. The keeper's eyes shut (fade to black).
3. They open in the cage hall (`art/end-cutscene/01-cage-hall.webp` can be reused, or a caged point-of-view variant).
4. The run is lost and starts over from night 1.

Where it goes: replace `TRAPPED_BEATS` and `renderTrapped` in `src/ui/screens/killEnding.ts`. Logic change still to make when the art lands: TRAPPED should clear the save (or reset it to night 1) instead of letting Continue retry night 5. Today `retryNight` accepts TRAPPED and the save keeps night 5 (see the `TRAPPED` case in `onEvent` in `src/main.ts`).

## Testing it
- Dev panel (add `&dev` to the URL), Screens group: "Kill code end" plays the beats, the exit scene and the credits without playing the game.
- Full path: `?night=5&papers=4&dev&nointro`, read the code from the dev panel (or `engine.state.run.killCode` in the console), type it into CHUD's chat.
- Trapped ending: dev panel "Trapped end", or "Win night now" on night 5.
- Slips on earlier nights: `?night=2&dev`, block a visit, go to that entry.

## Open items
- Night 5 still has the 5:00 AM radio beat "Helicopter at first light". The rescue is now a coast guard boat, so the line should say boat, or be cut.
- docs/GAME_DESIGN.md art table still lists "Endings | Helicopter shot".
- Floor slip positions (`FLOOR_PAPER` in `src/uiConfig.ts`) were placed by eye; nudge after playtests if they clash with the brace arms.
- Caption text is a first draft; the team should read it once.
