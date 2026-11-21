# Lighthouse visual style

The office and hallway reference previews suggest two ways to direct attention. A small pool of light makes a cluttered room readable, and a narrow beam lets the player search a threshold without exposing the space beyond it. A doorway, curtain gap, or window edge can conceal enough of a figure that a small movement changes how the frame reads. The [reference catalog](../refs/SOURCES.md) records the previews and captions available for this pass. The numbers below are art targets for the lighthouse.

## Lighting

- Give each view one dominant source. Use the CRT at the desk, overcast night light in the dark entry views, the lighthouse beam for powered reveals, and a cold lightning strike for the desk flash.
- Aim for roughly 65 to 80% near black in an idle gameplay still and 50 to 65% during a beam reveal. Keep one landmark legible even in the darkest state. Lightning can briefly reveal more of the room.
- Use fast falloff and hard-edged shadows. The beam grazes one useful surface at a time. Let the CRT light reach the keyboard and a small patch of stone before it falls away.
- The beacon is the powered light in entry views. Its sweep catches the left window and the rear balcony rail, and a glancing reflection can pick out a tread through the glazed ground door below the right stairs. Reflections stay dimmer than the primary light.
- Keep sources consistent with the one-power-slot rule. A powered beam reveal does not also signal an engaged entry lock. On bright desk variants, hold the CRT as a faint surface cue behind the lightning.

## Palette

| Use | Color |
| --- | --- |
| Near-black void | `#080C10` |
| Deep storm blue | `#172530` |
| Open-water slate | `#314552` |
| Wet stone gray | `#4C555A` |
| Salt spray and lightning highlights | `#A5B1B5` |
| Warm CHUD phosphor green | `#8FAA77` |
| Hurt CHUD blue-gray | `#788F99` |
| Amber lamp and jealous CHUD accent | `#B78951` |
| Furious CHUD muted rust red | `#A35450` |

Keep CHUD's mood readable in its mouth and eye shapes as well as color. Warm opens into a small smile. Hurt drops the mouth and tips the eyes down. Jealous narrows the eyes with an uneven stare. Furious flattens the mouth and hardens both eyes.

## Camera and motion

- Use a 28 mm full-frame lens feel, around 65° horizontal field of view, with slight edge stretch. Keep the center straight enough for the CRT text to read.
- Set all four gameplay views at the same seat pivot, 1.2 m above the watch-room floor. Look forward at CHUD and the ocean, left at the entry window, right and down into the stairwell, or 180° behind the chair at the balcony door. The [camera plan](../schematics/cameras.svg) fixes the directions and pitch targets.
- Render about 2:1 and compose the essential landmarks within the central 16:9 crop. Allow about ±4° of restrained mouse pan and barely perceptible sway. Keep the sightline, fixtures, and crop fixed across states in any one view.
- Make left and right checks feel like seated head turns. Give the balcony check a distinct look back over the shoulder. Settle on a visible cue such as a stair tread, a window mullion, or the rear door jamb.

## Texture and post

- Put salt crust, water streaks, pitted stone, and worn metal where a grazing light makes them readable. Keep fog local to a beam in rain or a damp opening.
- Add fine, low-strength luminance grain, a soft peripheral vignette, and subpixel color fringing at the outer edges. Match those effects across views and leave live grain and brief flicker to the browser.
- Confine scan lines, signal noise, and faint compression artifacts to the CRT or a deliberate video surface. Keep CHUD text, clock, and power icon sharp. Check dark WebP exports for visible blocks or banding.

## Scare composition

- Establish a stable empty frame first. Keep roughly one third of the composition unclaimed by props so a small change can register.
- Put the first sign of Ram at a depth break or near the edge of the lit patch. Use the right stair treads for two human catchlights, the left window mullion for a hand or half a face, and the rear balcony rail for a broken silhouette.
- Crop or obscure his head and torso with architecture, rain, darkness, or the edge of the frame. The closest reveal can briefly crowd the opening while still exposing only a fragment.
- Favor human details at real scale. Ram's eyes reflect light, his fingers leave clear tracks in condensation, and the rail and balcony doorframe break up his silhouette.

## Sound to sight

| Heard | Look toward | First thing to find |
| --- | --- | --- |
| Storm, waves, or splashing on the rocks | Hold the current view until an entry cue resolves | An empty threshold. The approach sound gives no confirmed entry. |
| Footsteps on metal below and to the right, then pounding | `cam_stairs` | Rail and first tread, then movement or eye reflections deeper down the spiral. |
| Taps on the left | `cam_window` | Window mullion and rain tracks, then fingertips or part of a face. |
| Scraping behind the chair | `cam_balcony` | Rear door jamb and railing, then a sliver of Ram's shoulder or hood. |
| CHUD chime or radio static | `cam_desk` | Mood, latest line, clock, and power icon. A reported location still needs an entry cue. |

## Reusable style block

```text
Pre-rendered 3D survival horror set in a storm-battered lighthouse. Frame the scene like a still from a wide lens at human eye height. Use one hard light with rapid falloff and leave most of the frame near black. Keep storm blues and wet stone grays muted, with sickly green reserved for the terminal and dirty amber for the lighthouse beam. Let light catch salt crust, damp masonry, worn metal and rain streaks in small patches. Add fine grain, a soft edge vignette and faint color fringing at the corners. Hold dark space around each threshold. When someone is there, show a glimpse through an obstruction, a reflection or a shadow.
```
