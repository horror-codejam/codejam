"""Render Ram Altman stills into the watch room.

Usage (from the repo root):
  /Applications/Blender.app/Contents/MacOS/Blender -b scenes/03-watch-room/scene03_watch_room.blend \
      --python scenes/04-ram/render_ram_shots.py -- [shot ...] [--samples N] [--cpu]

Shots: inside_window inside_hatch inside_balcony jumpscare_1 jumpscare_2 jumpscare_3 jumpscare_4
No shot names renders all seven. Outputs go to scenes/04-ram/.

The script only changes things in memory. It never saves the room or the character .blend.
"""

import math
import os
import random
import sys
import time

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
CHAR_BLEND = os.path.join(REPO, "art", "characters", "ram_altman", "ram_altman_tall_suit.blend")
OUT_DIR = HERE
CHAR_ROOT = "Ram Altman | Sketchfab base"
ARMATURE = "Object_4"

# ---------------------------------------------------------------- args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAMPLES = 128
USE_GPU = True
shots_req = []
i = 0
while i < len(argv):
    a = argv[i]
    if a == "--samples":
        SAMPLES = int(argv[i + 1]); i += 2; continue
    if a == "--cpu":
        USE_GPU = False; i += 1; continue
    shots_req.append(a); i += 1

scene = bpy.context.scene


# ---------------------------------------------------------------- render setup
def setup_render():
    scene.render.engine = "CYCLES"
    c = scene.cycles
    c.samples = SAMPLES
    c.use_adaptive_sampling = True
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.max_bounces = 6
    c.caustics_reflective = False
    c.caustics_refractive = False
    if USE_GPU:
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "METAL"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            c.device = "GPU"
        except Exception as e:  # fall back to CPU
            print("GPU setup failed, using CPU:", e)
            c.device = "CPU"
    # Match the existing renders: AgX, no look, sRGB display.
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    s = scene.render.image_settings
    s.file_format = "PNG"
    s.color_mode = "RGB"
    s.color_depth = "8"


# ---------------------------------------------------------------- room mood (in memory only)
def darken_room():
    """Blockout materials are light gray. Push them to wet stone and near black so a single hard light reads."""
    tints = {
        "M_Shell": (0.028, 0.031, 0.034),
        "M_Entries": (0.022, 0.025, 0.028),
        "M_Furniture": (0.03, 0.03, 0.029),
        "M_Exterior": (0.01, 0.015, 0.02),
        "M_Glass_Placeholder": (0.02, 0.03, 0.04),
    }
    for name, col in tints.items():
        m = bpy.data.materials.get(name)
        if not m or not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                n.inputs["Base Color"].default_value = (*col, 1.0)
                n.inputs["Roughness"].default_value = 0.45  # damp
    w = scene.world
    if w and w.node_tree:
        for n in w.node_tree.nodes:
            if n.type == "BACKGROUND":
                n.inputs["Strength"].default_value = 0.6
    for o in bpy.data.objects:
        if o.type == "LIGHT":
            o.hide_render = True
        if o.name.startswith("Ram_") and o.name in ("Ram_Standin", "Ram_Reveal_Window", "Ram_Reveal_Hatch", "Ram_Reveal_Balcony"):
            o.hide_render = True


# ---------------------------------------------------------------- character
def append_character():
    skip_types = {"LIGHT", "CAMERA"}
    skip_names = {"Ram | Studio ground", "Icosphere"}
    with bpy.data.libraries.load(CHAR_BLEND, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n not in skip_names]
    col = bpy.data.collections.new("Ram_Altman")
    scene.collection.children.link(col)
    for o in dst.objects:
        if o is None:
            continue
        if o.type in skip_types or o.name in skip_names:
            bpy.data.objects.remove(o)
            continue
        col.objects.link(o)
    bpy.context.view_layer.update()
    arm = bpy.data.objects[ARMATURE]
    reset_pose(arm)  # records the base pose
    return bpy.data.objects[CHAR_ROOT], arm


def _aw(arm, v):
    """World direction to armature space."""
    return (arm.matrix_world.to_3x3().inverted() @ Vector(v)).normalized()


_BASE_POSE = {}


def reset_pose(arm):
    """Restore the pose stored in the character file (the FBX import keeps a non-identity base pose)."""
    if not _BASE_POSE:
        for pb in arm.pose.bones:
            _BASE_POSE[pb.name] = pb.matrix_basis.copy()
    for pb in arm.pose.bones:
        pb.matrix_basis = _BASE_POSE[pb.name]
    bpy.context.view_layer.update()


def rot_bone(arm, name, axis_world, deg):
    """Rotate a bone about a world axis through its head (compounding with its current pose)."""
    pb = arm.pose.bones[name]
    M = pb.matrix.copy()
    h = M.translation.copy()
    R = Matrix.Rotation(math.radians(deg), 4, _aw(arm, axis_world))
    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ M
    bpy.context.view_layer.update()


def aim_bone(arm, name, dir_world):
    """Point a bone (its Y axis) along a world direction, minimal rotation."""
    pb = arm.pose.bones[name]
    M = pb.matrix.copy()
    h = M.translation.copy()
    cur = M.col[1].xyz.normalized()
    q = cur.rotation_difference(_aw(arm, dir_world))
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ M
    bpy.context.view_layer.update()


def curl_fingers(arm, side, deg):
    for f in ("Index", "Middle", "Ring", "Pinky"):
        for seg in (1, 2):
            for pb in arm.pose.bones:
                if pb.name.startswith(f"{side}Hand{f}{seg}_"):
                    M = pb.matrix.copy()
                    h = M.translation.copy()
                    ax = M.col[0].xyz.normalized()
                    R = Matrix.Rotation(math.radians(deg), 4, ax)
                    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ M
                    bpy.context.view_layer.update()


# Character local frame (before yaw): faces -Y, his left is +X, up is +Z.
FWD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))
LEFT = Vector((1, 0, 0))


def pose_standing(arm, tilt=14.0, chin=8.0):
    """Silent, still, arms long at the sides, head tilted."""
    reset_pose(arm)
    for side, s in (("Left", 1), ("Right", -1)):
        aim_bone(arm, f"{side}Arm_0{13 if side == 'Left' else 39}", (0.10 * s, -0.03, -1.0))
        aim_bone(arm, f"{side}ForeArm_0{14 if side == 'Left' else 40}", (0.05 * s, -0.06, -1.0))
        aim_bone(arm, f"{side}Hand_0{17 if side == 'Left' else 43}", (0.03 * s, -0.04, -1.0))
        curl_fingers(arm, side, 12)
    rot_bone(arm, "Spine2_04", LEFT, 4)        # slight hunch
    rot_bone(arm, "Neck_05", LEFT, 6)
    rot_bone(arm, "Head_08", FWD, tilt)       # head tilted toward his left shoulder
    rot_bone(arm, "Head_08", LEFT, chin)      # chin down, eyes up
    # rot about +X by positive angle tips +Z toward -Y (forward), i.e. lean forward


def pose_lunge(arm, lean, reach_pitch, spread, tilt=10.0, curl=30.0, arm_dir=None, fore_dir=None):
    """Lunging at the viewer: torso pitched forward, arms reaching at the camera."""
    reset_pose(arm)
    rot_bone(arm, "Spine_02", LEFT, lean * 0.4)
    rot_bone(arm, "Spine1_03", LEFT, lean * 0.3)
    rot_bone(arm, "Spine2_04", LEFT, lean * 0.3)
    # keep the face up toward the camera
    rot_bone(arm, "Neck_05", LEFT, -lean * 0.55)
    rot_bone(arm, "Head_08", LEFT, -lean * 0.25)
    rot_bone(arm, "Head_08", FWD, tilt)
    sp = math.radians(spread)
    rp = math.radians(reach_pitch)
    for side, s, a, f, h in (("Left", 1, "LeftArm_013", "LeftForeArm_014", "LeftHand_017"),
                             ("Right", -1, "RightArm_039", "RightForeArm_040", "RightHand_043")):
        d = Vector((math.sin(sp) * s, -math.cos(sp), math.sin(rp))).normalized()
        d2 = Vector((math.sin(sp * 0.6) * s, -math.cos(sp * 0.6), math.sin(rp) + 0.05)).normalized()
        if arm_dir:  # explicit elbows-out claw pose for the closest frame
            d = Vector((arm_dir[0] * s, arm_dir[1], arm_dir[2])).normalized()
            d2 = Vector((fore_dir[0] * s, fore_dir[1], fore_dir[2])).normalized()
        aim_bone(arm, a, d)
        aim_bone(arm, f, d2)
        aim_bone(arm, h, d2 + Vector((0, 0, 0.15)))
        curl_fingers(arm, side, curl)
    # legs: one stride
    rot_bone(arm, "LeftUpLeg_063", LEFT, -lean * 0.6 - 15)
    rot_bone(arm, "RightUpLeg_068", LEFT, -lean * 0.6 + 25)
    rot_bone(arm, "RightLeg_069", LEFT, 35)


def head_world(arm):
    pb = arm.pose.bones["Head_08"]
    return arm.matrix_world @ ((pb.head + pb.tail) * 0.5)


def place(root, loc, face_point):
    """Put the character root at loc, yawed so he faces face_point."""
    d = Vector(face_point) - Vector(loc)
    yaw = math.atan2(d.x, -d.y)
    root.location = loc
    # The root keeps its FBX axis fix (a -90 degree X quaternion); add the yaw on top of it.
    if "ram_base_rot" not in root:
        root["ram_base_rot"] = list(root.rotation_quaternion)
    base = Quaternion(root["ram_base_rot"])
    root.rotation_mode = "QUATERNION"
    root.rotation_quaternion = Quaternion((0, 0, 1), yaw) @ base
    bpy.context.view_layer.update()


def place_head_at(root, arm, target, face_point):
    place(root, (target[0], target[1], 0), face_point)
    off = Vector(target) - head_world(arm)
    root.location = root.location + off
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- lights
def make_spot(name, loc, target, energy, size_deg, blend=0.25, radius=0.02, color=(1.0, 0.96, 0.9)):
    ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SPOT")
    ld.energy = energy
    ld.spot_size = math.radians(size_deg)
    ld.spot_blend = blend
    ld.shadow_soft_size = radius
    ld.color = color
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(ob)
    ob.hide_render = False
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = d.to_track_quat("-Z", "Y")
    bpy.context.view_layer.update()
    return ob


def hide_lights(prefix="RAM_"):
    for o in bpy.data.objects:
        if o.type == "LIGHT" and o.name.startswith(prefix):
            o.hide_render = True


def cam_offset(cam, right, up, fwd):
    m = cam.matrix_world.to_3x3()
    return cam.matrix_world.translation + m @ Vector((right, up, -fwd))


# ---------------------------------------------------------------- entry props
def open_entries():
    lid = bpy.data.objects["Hatch_Lid"]
    lid.rotation_euler = (0, math.radians(105), 0)      # free edge lifted, lid stands on the far hinge
    door = bpy.data.objects["Door_Leaf"]
    door.rotation_euler = (0, 0, math.radians(-100))    # swung out onto the balcony
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- shots
EYE = Vector((0.0, 1.47, 1.2))  # Player_Eye_Pivot, all gameplay cameras sit here

ENTRY_SHOTS = {
    # name: camera, root location (feet), flash offset (right, up, forward from camera)
    "inside_window": dict(cam="cam_window", loc=(-3.85, 0.5, 0.0), tilt=14, chin=8, flash=(0.35, 0.45, 0.0), energy=1050, cone=38),
    "inside_hatch": dict(cam="cam_hatch", loc=(3.05, 1.40, -1.38), tilt=-16, chin=4, flash=(-0.3, 0.5, 0.0), energy=300, cone=42),
    "inside_balcony": dict(cam="cam_balcony", loc=(0.12, -3.7, 0.0), tilt=12, chin=8, flash=(0.3, 0.5, 0.0), energy=1000, cone=34),
}

# Jumpscare: camera at the desk seat pivot, turned to face back into the room (toward the balcony).
# Head targets are given as distance in front of the camera and height.
JUMP_SHOTS = {
    "jumpscare_1": dict(dist=3.4, z=1.75, lean=14, pitch=-10, spread=10, tilt=12, side=0.25, shake=(0.4, 0.6, 1.0), blur=0.3, cone=40),
    "jumpscare_2": dict(dist=2.0, z=1.55, lean=26, pitch=0, spread=12, tilt=10, side=0.12, shake=(-0.8, 0.5, -1.5), blur=0.4, cone=45),
    "jumpscare_3": dict(dist=0.95, z=1.35, lean=34, pitch=8, spread=16, tilt=6, side=0.05, shake=(1.2, -1.0, 2.5), blur=0.35, cone=60),
    "jumpscare_4": dict(dist=0.40, z=1.22, lean=40, pitch=14, spread=24, tilt=2, side=0.0, shake=(-1.5, 1.2, -3.5), blur=0.15, cone=90,
                        arm=(0.7, -0.1, 0.12), fore=(-0.8, -0.5, 0.45)),
}


def render_to(path, w, h):
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {os.path.basename(path)} {w}x{h} in {time.time() - t:.1f}s")


def do_entry(name, root, arm):
    cfg = ENTRY_SHOTS[name]
    cam = bpy.data.objects[cfg["cam"]]
    scene.camera = cam
    scene.render.use_motion_blur = False
    place(root, (0, 0, 0), (0, -1, 0))  # pose in his own frame (facing -Y), then place
    pose_standing(arm, tilt=cfg["tilt"], chin=cfg["chin"])
    place(root, cfg["loc"], cam.matrix_world.translation)
    hide_lights()
    face = head_world(arm)
    flash_loc = cam_offset(cam, *cfg["flash"])
    make_spot("RAM_Flash", flash_loc, face + Vector((0, 0, -0.35)), cfg["energy"], cfg["cone"], blend=1.0, radius=0.015)
    render_to(os.path.join(OUT_DIR, f"ram_{name}.png"), 960, 480)


def jump_camera():
    cam = bpy.data.objects.get("RAM_cam_jumpscare")
    if cam is None:
        cd = bpy.data.cameras.new("RAM_cam_jumpscare")
        cam = bpy.data.objects.new("RAM_cam_jumpscare", cd)
        scene.collection.objects.link(cam)
    cam.data.lens = 22
    cam.data.sensor_width = 36
    cam.data.sensor_fit = "HORIZONTAL"
    cam.data.clip_start = 0.02
    return cam


def do_jump(name, root, arm):
    cfg = JUMP_SHOTS[name]
    cam = jump_camera()
    random.seed(name)
    sx, sy, sr = cfg["shake"]
    cam.location = EYE
    cam.rotation_mode = "XYZ"
    cam.rotation_euler = (math.radians(90 + sx), math.radians(sr), math.radians(180 + sy))
    scene.camera = cam
    for o in bpy.data.objects:
        if o.name.startswith("Chair_"):
            o.hide_render = True
    place(root, (0, 0, 0), (0, -1, 0))  # pose in his own frame (facing -Y), then place
    pose_lunge(arm, cfg["lean"], cfg["pitch"], cfg["spread"], tilt=cfg["tilt"], arm_dir=cfg.get("arm"), fore_dir=cfg.get("fore"))
    target = Vector((EYE.x + cfg["side"], EYE.y - cfg["dist"], cfg["z"]))
    # Motion blur: keyframe the root rushing in from further back.
    root.animation_data_clear()
    place_head_at(root, arm, target, (EYE.x, EYE.y, 0))
    end = root.location.copy()
    step = Vector((0, -0.55, 0.05))
    scene.frame_set(10)
    root.location = end + step
    root.keyframe_insert("location", frame=10)
    root.location = end
    root.keyframe_insert("location", frame=11)
    for fc in root.animation_data.action.fcurves if hasattr(root.animation_data.action, "fcurves") else []:
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"
    scene.frame_set(11)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = cfg["blur"]
    scene.render.motion_blur_position = "END"
    hide_lights()
    face = head_world(arm)
    # Harsh low light from below: a flashlight held at chest height, pointing up at him.
    under = Vector((EYE.x + 0.03, EYE.y - 0.06, EYE.z - 0.5))
    d = (face - under).length
    make_spot("RAM_Under", under, face, max(6.0, 80.0 * d * d), cfg["cone"], blend=0.6, radius=0.015, color=(1.0, 0.93, 0.82))
    render_to(os.path.join(OUT_DIR, f"ram_{name}.png"), 1280, 720)
    root.animation_data_clear()
    scene.frame_set(1)


def main():
    t0 = time.time()
    setup_render()
    darken_room()
    open_entries()
    root, arm = append_character()
    shots = shots_req or list(ENTRY_SHOTS) + list(JUMP_SHOTS)
    for s in shots:
        if s in ENTRY_SHOTS:
            do_entry(s, root, arm)
        elif s in JUMP_SHOTS:
            do_jump(s, root, arm)
        else:
            print("unknown shot", s)
    print(f"ALL DONE in {time.time() - t0:.1f}s")


main()
