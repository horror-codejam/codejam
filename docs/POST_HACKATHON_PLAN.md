# Post-hackathon plan and change log

## START HERE (end of session 2026-11-24, ~1:05 AM)
State: everything below is committed and pushed on `beam-light` up to 424064b (beam in game, screen refresh, FNAF jumpscare, playtest fixes, ChudGPT pacing + variety + night 1 personality pass). Nothing merged to main, nothing deployed. All background jobs and servers stopped. The TTS speed pass was stopped before it changed anything (brief: scratchpad neon_ttsspeed.md; restart it later). Branch `voice-kokoro` is PARKED: Yacine decided to keep the exact live voice (Piper ryan-medium) and only make it faster; do not merge it.

Yacine's playtest verdict on 424064b (priority order for tomorrow):
1. ChudGPT text is "catastrophically worse, unreadably bad". The night 1 personality pass over-corrected: long compound sentences, insider jargon ("Tab 4", "Mug 4", "2039 rota", "unscheduled callers", "admiralty custom"), and complex questions ("Unscheduled callers roam after dark, ceeni, so for Tab 4, what's the first meal you want after a long voyage?"). Needed: short, plain, instantly readable lines and simple questions a tired player answers in 2 words; humor light and clear, never at the cost of clarity. Recurring bits at most a rare seasoning, no made-up jargon. Decide tomorrow: revert the night 1 pass (cf61422, 0196cec, 424064b, 40c521f) to the earlier voice or rewrite it for readability with Yacine approving samples first.
2. The new dark renders look horrendous in game: the dark between beam passes shows noisy, posterized white edge speckles and outlines all over the image (screenshot: window view, night 1, 1:02 AM). The beam itself is good. The lab prototype did not look like this, so it is likely a bug in the game integration (dark plate decode, the darkness gain, the bounce or haze textures, or angle-map sampling at edges) rather than the renders. Fix so the dark is smooth, clean and very dark.
3. Hold views (standing at or bracing an entry): the player must always see the monster up close there, with or without the beam.
4. Then: restart the TTS speed pass (same live voice, bundled model, keep-warm, clips for all scripted lines, regenerate the 521 joe-medium clips in ryan-medium, split long replies).
5. Later: thin recurring bits; ChudGPT UI and jumpscare are done but need Yacine's playtest; pick the jumpscare sound variant (dev panel, A/B/C); update URL; merge to main and redeploy (needs approval).

Living tracker for R.A.M. improvements after CodeJam 16 (started 2026-11-23). Yacine is now working solo. Keep this file current after every change.

- Dark room follow-up. The first pass removed the additive grain and rain. The large-window test found bright outlines already in the ambient render and smaller WebP ringing around them. The seated renderer now rolls off ambient highlights outside the sweep, uses four lossless ambient plates and dithers the near-black output. The reported all-edge speckles did not reproduce. See `prototype/screenshots/darkfix2_*.png`.
- Hold view fix complete. The window, hatch, and balcony tells stay visible while standing or bracing, including during lamp cuts. The balcony close-ups show a face in the doorway. See `prototype/screenshots/holdfix_*.png`.

## Branches and folders
- `main`: the hackathon submission (live at codejam-rouge.vercel.app). Nothing below is merged into main yet.
- `clarity-pass`: branched off main (4eae21e). Clarity pass commits.
- `beam-light`: branched off `clarity-pass`. Beam prototype + repel rule. Current integration branch. Worktree: `codejam-clarity`.
- `chud-pass`: branched off `beam-light` (2b3c840). ChudGPT pacing and voice pass. Worktree: `codejam-chud`. To be merged into `beam-light`.
- Art: `codejam/scenes/03-watch-room/` holds the .blend files (untracked, large). Beam work uses the copy `scene03_watch_room_beam.blend` only. Never save over `scene03_watch_room.blend`, `scene03_watch_room_look.blend` or `scene03_watch_room_look_render.blend`. Beam scripts (`render_beam.py`, `run_beam.py`, `pack_beam.py`) live in `codejam-clarity/scenes/03-watch-room/`. Prototype outputs: `codejam/scenes/03-watch-room/beam_proto/`. Full outputs: `.../final_beam/`.

## How we work
- Implementer: Gemini 4 Neon via the Antigravity CLI (`agy`, installed at C:\Users\yacin\.local\bin\agy.exe, signed in with Yacine's AI Pro account) since 2026-11-23, after Codex ran low. Headless: `agy -p "<brief>" --model gemini-4-neon-high --dangerously-skip-permissions --output-format json`. Runner script: scratchpad run_neon.sh. Codex CLI (gpt-6.2-sol, high) did the earlier implementation; switch back when its limit resets. Claude plans and reviews.
- Note: the Claude app redirects writes under AppData into a private copy, so tools a person runs must live outside AppData (that is why agy is in .local\bin). Sonnet subagents for research and some passes. Script everything procedural.
- Plan first, get Yacine's go-ahead, smallest correct step. No em dashes. Never name the monster in game text. Never mention licenses or credits.

## Yacine's original post-hackathon todo (from the notebook)
1. Improve the tutorial, make playing and onboarding super simple. -> Done in clarity pass (practice night rebuilt).
2. Improve the start cutscene, maybe AI-generated images. -> TODO (design, later).
3. Lights don't disable doors. -> Done, then superseded by the beam (Shift light removed entirely).
4. Update and refresh the ChudGPT UI:
   - No battery bottom right. -> TODO (design pass).
   - Improve door buttons and remove the middle circle on the map. -> TODO (design pass).
   - ChudGPT guides more, asks more questions, funnier, creepier, less generic. -> In progress (chud-pass).
   - Improve latency (it is the TTS that is delayed, the LLM is fine). -> In progress (chud-pass).
   - Fix overwhelming text blocks. -> Partly done (no bottom hints); rest in chud-pass pacing and design pass.
5. Make the game less difficult. -> Changed: Yacine decided to keep it hard; better onboarding instead. Repel rule added.
6. Jumpscare scarier, higher-pitched sound, shorter jumpscare frames. -> TODO.
7. Tutorial runs through ChudGPT, not random text blocks, and is fun. -> Done (clarity pass).
8. Tip between nights for things the tutorial skipped. -> Done (night card tips).
9. On death, explain simply why. -> Done (death reason line).
10. No one-off text at the bottom of the screen during nights. -> Done.
11. Update the URL. -> Later (small).

## Done (pushed)
### Clarity pass (branch clarity-pass, then beam-light)
- Light independent of locks; dark desk views show nothing (later replaced by the beam).
- Night hint captions removed (timed night 1 hints, brace caption, "He left" hint).
- Night 1: ChudGPT gives one truthful warning per visit naming the entry; silence lines rewritten (no "talk to me").
- Story setup: after the name, ChudGPT explains in 4 voiced lines (wreck, rescue, the thing at night through window/hatch/balcony, survive until 6 AM).
- Practice night rebuilt: ChudGPT-led, one action per step, key chips at the bottom, one nudge after 12 s, staged harmless visits (window: look and lock; hatch: run and hold), ask "where is it", answer a question, warning that lonely ChudGPT gets unreliable. Removed pause, unlock all, power tradeoff lessons.
- Night card tips: N1 lock or hold until he gives up and ask ChudGPT; N2 suspicion makes it lie and refuse; N3 noises are not him (to be replaced, see chud-pass); N4 asking too often makes it stop answering for a while; N5 flattery makes it suspicious.
- Death screen: one plain line after the jumpscare saying why (open entry, ChudGPT lied, refused, cut power, already inside).
### Repel rule (beam-light, 150f524, 2b3c840)
- Holding or a landed lock for REPEL_TIME of continuous defense while he is at the entry makes him give up at once: 3.0, 3.5, 4.0, 4.5, 5.0 s for nights 1 to 5.
- HOLD_MAX 6 s and the 1 s BRACE_REST after letting go are kept (Yacine wants the rest kept). Any gap resets the timer. The end-of-visit check still applies to undefended entries. Next visit comes sooner after a repel.
- Feedback: harder last shove, low thud, tell disappears. Practice hatch and the N1 tip teach it.
### Beam prototype (beam-light, 55be126), approved
- Shift light to be replaced by ONE slow rotating white lamp on the ceiling above the desk pivot: (0, 1.47, 3.80) m, 31 degrees down, 6500 K, 18 x 50 degree soft oval cone, right to left, 16 s per rotation, room about 40 percent darker between passes, a little haze (approved).
- Technique: per view state a dark plate, a beam pass (lamp as point light only) and an angle map; a shader combines them live (matches a real render within 0.31/255).
- Lab page: prototype/beam-lab.html (dev only).

## In progress
- Beam part 1 (Codex): full-resolution renders of every view state (desk; window/hatch/balcony x empty/tell/approach/inside; 12 hold views) into final_beam/ with a manifest and contact sheet.
- ChudGPT pass (Sonnet subagent, chud-pass):
  - Every unprompted line is a question (answer it), info (act on it) or a reaction to what you said. Calm quiet gets a question, not chatter. Waiting cue (expectant face, blinking cursor); question timeout 10 s -> 15 s.
  - Pacing: no talking over itself or the typing player; busy-until from text length; at least 12 s between unprompted lines; questions never back to back and never within 15 s of your last exchange; low-priority lines dropped after 3 s; long lines only when calm; quiet limit 30 s on night 1 rising to 50 s.
  - Voice: new line cuts the old one and drops the queue; stale audio skipped; prefetch next line; warm-up call on the title; pre-generated clips for scripted lines if Piper runs locally.
  - New voice: 20 GLaDOS-style lines approved by Yacine (one flowing polite sentence that turns at the end, insult in a side clause, calm absurd specifics, no staccato, no "Oh great", no exclamation marks, no puns). Persona prompt rewritten with wants and fears and few-shot examples; script tests 30 live replies.
  - Teaching: practice line "Answer me when I ask you something. I remember everything you say."; N3 tip becomes "ChudGPT remembers your answers and will test you."; check night 5 makes typing the kill code obvious.

## Next
1. Review and merge chud-pass into beam-light.
2. Beam part 2 (Codex): beam angle in the engine; Shift and the LIGHT cell removed; he is visible only in the beam; inside scare when the beam passes over him; ChudGPT light-cut sabotage stops the lamp; shader on every view, turn and hold; dash and turn clips darkened to match; quiet lamp hum that swells as the beam passes your view; practice step "wait for the light"; tips and texts that mention Shift updated; dev panel sliders; tests and GAME_LOGIC.md.
3. Yacine playtest, then tune beam speed and difficulty by feel.
## Later (design last)
- ChudGPT UI refresh: remove battery, better door buttons, remove the middle circle, text blocks.
- Jumpscare: scarier, higher-pitched, shorter.
- Start cutscene improvements (maybe AI-generated images).
- Update the URL.
- Merge to main and redeploy (needs Yacine's approval).
