# 04 Ram stills

Ram Altman rendered into the watch room: three "already inside" flash stills (one per entry) and a 4-frame jumpscare lunge. Character: `art/characters/ram_altman/ram_altman_tall_suit.blend`, appended as built (face, jaw and materials untouched). Room: `scenes/03-watch-room/scene03_watch_room.blend`. Neither source file is saved or modified; all changes happen in memory.

## Re-render (one command, from the repo root)

```text
/Applications/Blender.app/Contents/MacOS/Blender -b scenes/03-watch-room/scene03_watch_room.blend --python scenes/04-ram/render_ram_shots.py
```

Optional arguments after `--`: shot names (`inside_window inside_hatch inside_balcony jumpscare_1 jumpscare_2 jumpscare_3 jumpscare_4`), `--samples N` (default 128), `--cpu`. Example: `... --python scenes/04-ram/render_ram_shots.py -- jumpscare_4 --samples 32`.

All seven take about 2.5 minutes on Apple Silicon (Metal GPU), 14 to 33 s per image. The first run on a machine adds a few minutes of one-time Metal kernel compilation.

## Outputs

| File | Size | Camera | Pose | Light |
| --- | --- | --- | --- | --- |
| `ram_inside_window.png` | 960 x 480 | `cam_window` (same as `render_blockout_cam_window.png`) | Standing just inside, in front of the left window (root at -3.85, 0.5, 0), arms long at the sides, head tilted to his left, chin down, staring at camera | Hard spot flash from just above and right of the camera, rest of the room falls to black |
| `ram_inside_hatch.png` | 960 x 480 | `cam_hatch` (same as `render_blockout_cam_hatch.png`) | Risen out of the open floor hatch to the hips (root at 3.05, 1.40, -1.38), head tilted the other way. Hatch lid swung up on its far hinge behind him | Same flash, from above left of the camera |
| `ram_inside_balcony.png` | 960 x 480 | `cam_balcony` (same as `render_blockout_cam_balcony.png`) | Standing just inside the open balcony door (root at 0.12, -3.7, 0), taller than the door frame, head tilted, arms at sides. Door leaf swung out onto the balcony | Same flash, from above right of the camera |
| `ram_jumpscare_1.png` | 1280 x 720 | `RAM_cam_jumpscare`: desk seat pivot (0, 1.47, 1.2), turned 180 degrees to face back into the room, 22 mm lens | About 3.4 m away, leaning in, arms coming up toward the viewer | Spot from chest height below the camera pointing up at his face (handheld flashlight feel), big cast shadow on the back wall |
| `ram_jumpscare_2.png` | 1280 x 720 | same, with small shake | 2 m away, leaning harder, arms reaching | same |
| `ram_jumpscare_3.png` | 1280 x 720 | same, with small shake | About 1 m away, arms reaching past the frame edges | same |
| `ram_jumpscare_4.png` | 1280 x 720 | same, with small shake | Face fills the frame, mouth wide open (the model's dropped jaw), clawed hands either side of the face | same, energy scaled to distance |

Each jumpscare frame has a different small camera roll and yaw (shake) and object motion blur from keyframing his root rushing in over half a frame.

## Room changes made in memory only

- Room blockout materials darkened to wet stone near black, so a single hard light reads. Preview light and red stand-in blocks hidden.
- Hatch lid opened, balcony door opened, chair hidden for the jumpscare camera.
- Cycles, adaptive sampling, OpenImageDenoise, AgX view transform with no look (matches the room file), PNG 8-bit RGB.

## Known limits

- The room is still the gray blockout, so walls are plain. Re-run the script once the dressed room exists; positions are in `ENTRY_SHOTS` and `JUMP_SHOTS` at the top of the script.
- The flash is a spot light, so its soft circular edge is visible on the walls.
- Legs fall into darkness in the jumpscare frames because the light is aimed at the face.
