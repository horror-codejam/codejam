# Scene 1 intro frames

Stills for the shipwreck intro, rendered from `../scene01_shipwreck.blend` (Blender 5.3, EEVEE) with `render_intro_frames.py`. All frames are 1280 x 720 PNG, 8-bit RGB, with no grain (the game adds grain). The source .blend is never saved: the script reopens it before each frame and changes things in memory only.

## Re-render (one command, from the repo root)

```text
/Applications/Blender.app/Contents/MacOS/Blender -b scenes/01-shipwreck/scene01_shipwreck.blend --python scenes/01-shipwreck/intro/render_intro_frames.py
```

Optional arguments after `--`: frame names (`helm lightning wave capsize blink_1 blink_2 blink_3`) and `--samples N` (default 64). All seven render in about 40 s on Apple Silicon.

## Frames

| File | Beats (scene README) | What it shows |
| --- | --- | --- |
| `intro_01_helm.png` | 1 to 9 | Opening view from `FP_Camera`: hands on the wheel, bow ahead, storm sea, rain streaks, lighthouse with its amber lamp lit upper left. No bolt. |
| `intro_02_lightning.png` | 1 to 9 (lightning flash) | Same view during a flash: bolt upper right striking the sea, cold white light across the deck and water, haze glowing around the bolt. |
| `intro_03_wave.png` | 10 | The `Rogue_Wave` rising as a black wall over the bow on the right, foam at the crest, lighthouse lamp still shining on the left, camera pitched up the face. |
| `intro_04_capsize.png` | 10 | The capsize: camera rolled about 60 to 76 degrees with motion blur, white water sheets and driving spray across the lens, the helm lantern smeared through the frame. |
| `intro_05_blink_1.png` | 11 | From water level, heavily blurred and tilted: dark island slope, the tower, a glow at the top. Eyelids nearly closed, water droplets on the edges. |
| `intro_05_blink_2.png` | 11 | Same spot, the eye focusing: tower and lantern room larger, less blur, lids more open. |
| `intro_05_blink_3.png` | 11 | Clearest but still soft: the lantern room shows CHUD's WARM smiling face glowing like the lighthouse's head. Never fully sharp. |

Beat 12 (black out) needs no image.

## How it is built

- Storm light: the file's world volume is unlinked (in EEVEE it absorbs the sky and the sun completely, which left the opening view black without a bolt). The storm sky gradient, skylight and helm lantern are raised so shapes read in the dark. The lightning frame keeps the volume for the glow around the bolt.
- Lighthouse face: the WARM face is cropped from `../../03-watch-room/chud_smiley_four_moods.png` (x 30 to 550, y 90 to 630), masked to its disc, and mapped onto an emissive plane on the camera side of the lantern room. The lamp glass behind it is dimmed so the face is the light.
- Rogue wave: the team's `Rogue_Wave` mesh, moved in front of the bow, scaled up, smoothed, with a dark glossy water material and a foam crest.
- Post (numpy, in the script): desaturation and cold tint, rain streaks (frames 1 to 4), spray sheets (frame 4), blur, droplets and curved eyelid vignette (blink frames), soft edge vignette.

## Known limits

- Everything is still blockout geometry (simple boat, hands, tower). The renders will improve once the scene gets real models.
- The capsize frame is deliberately chaotic but hard to read as a boat rolling over; a dressed boat and real water would help.
- In the opening view the lighthouse beam lights a patch of sea and the far left edge of the frame.
