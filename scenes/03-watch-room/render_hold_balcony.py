"""Render the two balcony close-up tells from the dedicated beam copy.

Run Blender with -b scene03_watch_room_beam.blend -P render_hold_balcony.py -- OUTPUT_DIRECTORY.
"""

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from render_beam import load_finals, render


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    blend = Path(bpy.data.filepath)
    if blend.name != "scene03_watch_room_beam.blend":
        raise ValueError("Open the dedicated beam copy")
    args.output.mkdir(parents=True, exist_ok=True)

    finals = load_finals(blend.parent)
    scene = bpy.data.scenes["Scene"]
    finals.setup_cycles(scene)
    states = finals.SceneStates(scene)

    light_data = bpy.data.lights.new("Balcony hold | spill across the gap", "AREA")
    light_data.energy = 1.3
    light_data.use_temperature = True
    light_data.temperature = 6800
    light_data.size = 0.18
    light_data.spread = math.radians(52)
    light = bpy.data.objects.new(light_data.name, light_data)
    scene.collection.objects.link(light)
    light.location = (0.42, -4.60, 1.59)
    light.rotation_euler = (Vector((0.37, -4.98, 1.43)) - light.location).to_track_quat("-Z", "Y").to_euler()

    for stance in ("stand", "brace"):
        name = f"hold_balcony_{stance}_tell"
        job = next(job for job in finals.JOBS if job.name == f"{name}_on")
        states.apply(job)
        states.prepare_frame(job, scene, job.first)
        bpy.context.view_layer.update()

        # Open the swinging leaf just far enough to reveal a face beyond the jamb.
        door = scene.objects["Door_Leaf"]
        door.animation_data.action = None
        door.rotation_euler.z = math.radians(-34)
        actor_root = next(owner for owner, _, _ in states.bindings[job.ram_action] if owner.type == "EMPTY")
        rotation = actor_root.rotation_quaternion.copy()
        actor_root.animation_data.action = None
        actor_root.rotation_quaternion = rotation
        actor_root.location = (0.37, -5.19, -0.71)

        scene.render.resolution_x, scene.render.resolution_y = job.resolution
        scene.render.resolution_percentage = 40 if args.preview else 100
        scene.cycles.samples = 24 if args.preview else job.samples
        output = args.output.resolve() / f"{name}_close"
        output.mkdir(exist_ok=True)
        render(scene, output / f"{name}_close.png", "PNG")


if __name__ == "__main__":
    main()
