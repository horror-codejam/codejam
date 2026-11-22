# Kill code ending: integration notes

Branch: `proto/ending-logic` (cut from `release-integration` on 2026-11-22). To be merged back into `release-integration` once the exit scene is in. Rules live in docs/GAME_LOGIC.md section 6.7 and section 11.

## What is done
- Random 4 character kill code per run (2 letters + 2 digits), stored in the save (`killCode`, `papersCheckpoint`). Config: `ENDING` in `src/config.ts`.
- Ram drops a slip at an entry when the player blocks him there (lock or brace), nights 2 to 5, at most one new slip per night. The player goes to that entry and clicks the slip to collect and read it. Collected slips stay on the desk.
- Night 5: typing the code anywhere in a chat message to CHUD kills it (checked in code before the judge, never sent to the LLM). Ram is freed, the night ends as `GAME_WON` with `state.ending === "KILL_CODE"`.
- 6:00 AM on night 5 without the code: phase `TRAPPED`, trapped ending, then Title. Continue retries night 5.
- After the kill: two text beats on black (CHUD dies, the hatch opens by itself), then the exit scene hook, then credits.

## Plugging in the exit scene
The exit scene (down through the dungeon, Ram freed and harmless, coast guard rescue) goes in one function:

```ts
// src/ui/screens/killEnding.ts
export function renderExitScene(screen: HTMLElement, done: () => void, signal: AbortSignal): void {
  done(); // placeholder: straight to the credits
}
```

- `screen` is the full-screen overlay element (`ui.screen`). Render into it (replace its children).
- Call `done()` when the scene ends. That rolls the existing credits and then offers Title.
- Use `signal` for cleanup: the screen is torn down when it aborts (for example leaving a dev preview). The `after(ms, signal, fn)` helper in `src/ui/screens/timing.ts` respects it.
- If the scene is video, `src/ui/videoPlate.ts` has the existing video plate handling.
- To drop or change the two beats before it, edit `KILL_BEATS` in the same file.

## Testing it
- Dev panel (add `&dev` to the URL), Screens group: "Kill code end" plays the beats, the exit scene and the credits without playing the game.
- Full path: `?night=5&papers=4&dev&nointro`, read the code from the dev panel (or `engine.state.run.killCode` in the console), type it into CHUD's chat.
- Trapped ending: dev panel "Trapped end", or "Win night now" on night 5.
- Slips on earlier nights: `?night=2&dev`, block a visit, go to that entry.

## Open items
- Night 5 still has the 5:00 AM radio beat "Helicopter at first light". It now promises a rescue that never comes; decide whether to keep it as a lie or change it.
- docs/GAME_DESIGN.md art table still lists "Endings | Helicopter shot".
- Floor slip positions (`FLOOR_PAPER` in `src/uiConfig.ts`) were placed by eye; nudge after playtests if they clash with the brace arms.
