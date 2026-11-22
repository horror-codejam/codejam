"""Render the shipwreck intro frames (scene 1) from the team's blockout.

Usage (from the repo root):
  /Applications/Blender.app/Contents/MacOS/Blender -b scenes/01-shipwreck/scene01_shipwreck.blend \
      --python scenes/01-shipwreck/intro/render_intro_frames.py -- [frame ...] [--samples N]

Frames: helm lightning wave capsize blink_1 blink_2 blink_3 (no names = all).
Outputs: scenes/01-shipwreck/intro/intro_*.png, 1280 x 720, 8-bit RGB.

The source .blend is reopened (never saved) before each frame, so every frame starts from the file as built.
Post (desaturation, rain streaks, blur, eyelid vignette, droplets) is done in numpy on the rendered pixels.
No grain: the game adds it.
"""

import math
import os
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FACE_SHEET = os.path.join(REPO, "scenes", "03-watch-room", "chud_smiley_four_moods.png")
FACE_CROP = (30, 90, 550, 630)  # WARM face: x0, y0, x1, y1 in sheet pixels (top-left origin)
W, H = 1280, 720

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAMPLES = 64
req = []
i = 0
while i < len(argv):
    if argv[i] == "--samples":
        SAMPLES = int(argv[i + 1]); i += 2; continue
    req.append(argv[i]); i += 1

SRC = bpy.data.filepath
TMP = tempfile.mkdtemp(prefix="intro_frames_")


# ------------------------------------------------------------------ scene helpers
def reopen():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    sc = bpy.context.scene
    sc.render.resolution_x = W
    sc.render.resolution_y = H
    sc.render.resolution_percentage = 100
    sc.eevee.taa_render_samples = SAMPLES
    sc.render.use_motion_blur = False
    s = sc.render.image_settings
    s.file_format = "PNG"
    s.color_mode = "RGB"
    s.color_depth = "8"
    # Keep the file's color management (AgX, Very High Contrast look).
    return sc


def ob(name):
    return bpy.data.objects[name]


def show(names, on=True):
    for n in names:
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = not on
            o.hide_viewport = not on


def coll_objects(cname):
    return [o.name for o in bpy.data.collections[cname].all_objects]


def lightning(on):
    show(coll_objects("Storm_Lightning"), on)


def look_at(cam, target, roll_deg=0.0):
    d = Vector(target) - cam.location
    q = d.to_track_quat("-Z", "Y")
    cam.rotation_mode = "XYZ"
    e = q.to_euler()
    cam.rotation_euler = e
    bpy.context.view_layer.update()
    # roll about the view axis
    cam.rotation_mode = "QUATERNION"
    from mathutils import Quaternion
    cam.rotation_quaternion = q @ Quaternion((0, 0, 1), math.radians(roll_deg))
    bpy.context.view_layer.update()


def sea_height(x, y):
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = sc.ray_cast(dg, Vector((x, y, 60)), Vector((0, 0, -1)))
    return loc.z if hit else -0.9


def set_emission(matname, strength=None, color=None):
    m = bpy.data.materials[matname]
    b = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
    if strength is not None:
        b.inputs["Emission Strength"].default_value = strength
    if color is not None:
        b.inputs["Emission Color"].default_value = (*color, 1)


def add_sun(name, rot_deg, energy, color):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    ld.color = color
    ld.angle = math.radians(1.0)
    o = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(o)
    o.rotation_euler = [math.radians(a) for a in rot_deg]
    return o


def render_tmp(tag):
    sc = bpy.context.scene
    path = os.path.join(TMP, tag + ".png")
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"  render {tag}: {time.time() - t:.1f}s")
    return path


# ------------------------------------------------------------------ numpy post
def load_px(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3].copy()  # top-down RGB
    bpy.data.images.remove(img)
    return a


def save_px(a, path):
    h, w, _ = a.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(a, 0, 1)
    img = bpy.data.images.new("out_" + os.path.basename(path), w, h, alpha=False)
    img.pixels[:] = rgba[::-1].ravel()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("WROTE", path)


def box_blur(a, r, axis):
    if r < 1:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


def gblur(a, sigma):
    """Approximate gaussian: three box passes per axis."""
    if sigma <= 0.3:
        return a
    r = max(1, int(round(sigma * 0.95)))
    for _ in range(3):
        a = box_blur(a, r, 0)
        a = box_blur(a, r, 1)
    return a


def grade(a, desat=0.45, tint=(0.94, 0.98, 1.05), gamma=1.08):
    l = (a * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(-1, keepdims=True)
    a = a * (1 - desat) + l * desat
    a = a * np.array(tint, dtype=np.float32)
    return np.clip(a, 0, 1) ** gamma


def rain(a, n=1400, seed=1, angle=12.0, strength=0.10, length=(18, 70)):
    """Thin slanted streaks, brighter where the frame behind them is lit."""
    rng = np.random.default_rng(seed)
    h, w, _ = a.shape
    buf = np.zeros((h, w), dtype=np.float32)
    ang = math.radians(angle)
    for _ in range(n):
        x0, y0 = rng.uniform(-60, w + 60), rng.uniform(-80, h)
        L = rng.uniform(*length)
        b = rng.uniform(0.3, 1.0)
        t = np.linspace(0, 1, int(L))
        xs = (x0 + math.sin(ang) * L * t).astype(int)
        ys = (y0 + math.cos(ang) * L * t).astype(int)
        ok = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        np.add.at(buf, (ys[ok], xs[ok]), b)
    buf = box_blur(buf, 1, 1)
    l = a.mean(-1)
    lit = 0.35 + 2.5 * gblur(l, 25)
    return a + (buf * lit * strength)[:, :, None] * np.array([0.85, 0.9, 1.0], dtype=np.float32)


def vignette(a, amount=0.55, power=2.2):
    h, w, _ = a.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny = (x / w - 0.5) * 2, (y / h - 0.5) * 2
    r = np.sqrt(nx ** 2 * 0.8 + ny ** 2)
    m = 1 - amount * np.clip(r / 1.25, 0, 1) ** power
    return a * m[:, :, None]


def eyelids(a, open_frac, soft=60):
    """Dark curved lids from top and bottom; open_frac is the open fraction of the frame height."""
    h, w, _ = a.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (x / w - 0.5) * 2
    half = open_frac * h / 2
    curve = half * (1 - 0.35 * nx ** 2)  # lids close in toward the corners
    d = curve - np.abs(y - h / 2)  # positive inside the opening
    m = np.clip(d / soft, 0, 1)
    m = m * m * (3 - 2 * m)
    return a * m[:, :, None]


def droplets(a, n=14, seed=3, rmin=18, rmax=70):
    """Water on the eye/lens: discs that show a blurred, slightly magnified, flipped patch with a faint rim."""
    rng = np.random.default_rng(seed)
    h, w, _ = a.shape
    out = a.copy()
    soft = gblur(a, 6)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    for _ in range(n):
        # keep droplets mostly toward the edges
        side = rng.integers(4)
        if side == 0:
            cx, cy = rng.uniform(0, w * 0.25), rng.uniform(0, h)
        elif side == 1:
            cx, cy = rng.uniform(w * 0.75, w), rng.uniform(0, h)
        elif side == 2:
            cx, cy = rng.uniform(0, w), rng.uniform(0, h * 0.2)
        else:
            cx, cy = rng.uniform(0, w), rng.uniform(h * 0.8, h)
        r = rng.uniform(rmin, rmax)
        x0, x1 = int(max(0, cx - r)), int(min(w, cx + r + 1))
        y0, y1 = int(max(0, cy - r)), int(min(h, cy + r + 1))
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = y[y0:y1, x0:x1], x[y0:y1, x0:x1]
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
        inside = d < 1
        sx = np.clip((cx - (xx - cx) * 0.6).astype(int), 0, w - 1)  # flipped, magnified
        sy = np.clip((cy - (yy - cy) * 0.6).astype(int), 0, h - 1)
        patch = soft[sy, sx] * 1.1 + 0.015
        rim = np.clip(1 - np.abs(d - 0.88) / 0.08, 0, 1)[:, :, None] * 0.05
        m = inside[:, :, None].astype(np.float32)
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m) + (patch + rim) * m
    return out


def finish(tag, out_name, post):
    a = load_px(render_tmp(tag))
    a = post(a)
    save_px(a, os.path.join(HERE, out_name))


# ------------------------------------------------------------------ frames
def storm_light(sc, sky=1.0, keep_volume=False):
    """The blockout is near invisible without the bolt. Lift the storm sky and skylight so shapes read in the dark.

    EEVEE's world volume absorbs the sky and the sun completely, so it is unlinked unless a frame
    needs the haze (the lightning frame keeps it for the glow around the bolt).
    """
    nt = sc.world.node_tree
    if not keep_volume:
        for l in list(nt.links):
            if l.to_node.type == "OUTPUT_WORLD" and l.to_socket.name == "Volume":
                nt.links.remove(l)
    # The lantern's point light sits inside its bulb mesh; let the light out.
    ob("Helm_Lantern_Bulb").visible_shadow = False
    ob("Storm_Skylight").data.energy = 0.9 * sky
    ramp = sc.world.node_tree.nodes["Color Ramp"].color_ramp.elements
    ramp[0].color = (0.11 * sky, 0.13 * sky, 0.17 * sky, 1)
    ramp[1].color = (0.018 * sky, 0.022 * sky, 0.03 * sky, 1)
    ob("Helm_Lantern").data.energy = 180
    set_emission("Lantern_Glow", strength=1.5)
    # Amber lamp that stays amber (AgX turns very strong emission white).
    set_emission("Lighthouse_Lamp", strength=7.0, color=(1.0, 0.72, 0.35))
    ob("Lighthouse_Glow").data.energy = 60000


def base_storm(sc, keep_volume=False):
    """Opening view: storm, no bolt, lighthouse lamp lit, helm lantern on."""
    lightning(False)
    show(["Rogue_Wave", "Rogue_Wave_Foam"], False)
    storm_light(sc, keep_volume=keep_volume)


def frame_helm():
    sc = reopen()
    base_storm(sc)
    finish("helm", "intro_01_helm.png",
           lambda a: vignette(grade(rain(a, seed=11)), 0.45))


def frame_lightning():
    sc = reopen()
    base_storm(sc, keep_volume=True)
    lightning(True)
    ob("Lightning_Flash").data.energy = 6000000
    set_emission("Lightning", strength=120.0)
    add_sun("Flash_Fill", (55, 0, 140), 2.5, (0.78, 0.86, 1.0))  # cold white from the bolt side
    w = sc.world.node_tree.nodes
    ramp = w["Color Ramp"].color_ramp.elements
    ramp[0].color = (0.25, 0.29, 0.36, 1)
    ramp[1].color = (0.05, 0.06, 0.08, 1)
    finish("lightning", "intro_02_lightning.png",
           lambda a: vignette(grade(rain(a, seed=12, strength=0.16), desat=0.6, tint=(0.95, 1.0, 1.08)), 0.35))


def setup_wave(loc, scale, tilt_deg, yaw_deg=0.0):
    wv = ob("Rogue_Wave")
    wv.location = loc
    wv.scale = scale
    wv.rotation_euler = (math.radians(tilt_deg), 0, math.radians(yaw_deg))
    fm = ob("Rogue_Wave_Foam")
    top = Vector(loc) + Vector((0, -scale[2] * math.sin(math.radians(tilt_deg)) * 0.9, scale[2] * 0.93))
    fm.location = top
    fm.scale = (scale[0] * 0.8, scale[1] * 0.7, 1.6)
    fm.rotation_euler = (math.radians(tilt_deg), 0, math.radians(yaw_deg))
    show(["Rogue_Wave", "Rogue_Wave_Foam"], True)
    # foam slightly brighter so the crest reads against the sky
    b = [n for n in bpy.data.materials["Foam"].node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
    b.inputs["Base Color"].default_value = (0.55, 0.6, 0.62, 1)
    b.inputs["Emission Color"].default_value = (0.6, 0.66, 0.7, 1)
    b.inputs["Emission Strength"].default_value = 0.08


def frame_wave():
    sc = reopen()
    base_storm(sc)
    setup_wave((20.0, 26.0, -4.0), (24.0, 7.0, 28.0), 14.0, -8.0)
    cam = ob("FP_Camera")
    cam.rotation_euler = (math.radians(86), math.radians(-6), math.radians(-4))  # bow pitching up the face
    add_sun("Wave_Rim", (70, 0, 200), 0.25, (0.6, 0.7, 0.85))  # faint storm skylight on the wave face
    finish("wave", "intro_03_wave.png",
           lambda a: vignette(grade(rain(a, seed=13, strength=0.12)), 0.5))


def frame_capsize():
    sc = reopen()
    base_storm(sc)
    setup_wave((6.0, 12.0, -6.0), (26.0, 7.0, 22.0), 24.0, -10.0)
    cam = ob("FP_Camera")
    add_sun("Wave_Rim", (70, 0, 200), 0.3, (0.6, 0.7, 0.85))
    # Motion blur: camera rolls through the frame.
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 1.0
    sc.eevee.motion_blur_steps = 8
    cam.rotation_mode = "XYZ"
    cam.location = (0.3, -0.9, 1.4)
    cam.rotation_euler = (math.radians(92), math.radians(-52), math.radians(-6))
    cam.keyframe_insert("rotation_euler", frame=1)
    cam.keyframe_insert("location", frame=1)
    cam.location = (0.6, -0.9, 0.9)
    cam.rotation_euler = (math.radians(98), math.radians(-78), math.radians(-10))
    cam.keyframe_insert("rotation_euler", frame=2)
    cam.keyframe_insert("location", frame=2)
    sc.frame_set(2)
    sc.render.motion_blur_position = "END"
    # The bow digs under: sea level raised around the boat so water comes over the rail.
    ob("Sea").location.z += 1.2

    def post(a):
        a = rain(a, n=2200, seed=14, angle=60, strength=0.2, length=(40, 140))
        a = grade(a, desat=0.5)
        return vignette(a, 0.6)

    finish("capsize", "intro_04_capsize.png", post)


# --- blink frames -------------------------------------------------------
def make_face_image():
    src = bpy.data.images.load(FACE_SHEET)
    w, h = src.size
    a = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top-down
    x0, y0, x1, y1 = FACE_CROP
    crop = a[y0:y1, x0:x1].copy()
    ch, cw = crop.shape[:2]
    yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
    # disc mask (the face circle including its black outline), soft edge
    d = np.sqrt((xx - cw / 2) ** 2 + (yy - ch / 2) ** 2) / (min(cw, ch) / 2)
    alpha = np.clip((1.0 - d) / 0.04, 0, 1)
    crop[:, :, 3] = alpha
    img = bpy.data.images.new("CHUD_WARM_face", cw, ch, alpha=True)
    img.pixels[:] = crop[::-1].ravel()
    img.pack()
    bpy.data.images.remove(src)
    return img


def add_face(cam_loc):
    """Emissive CHUD face on the lantern room glass, facing the viewer."""
    img = make_face_image()
    lr = ob("Lighthouse_Lamp_Room")
    c = lr.location.copy()
    to_cam = Vector((cam_loc.x - c.x, cam_loc.y - c.y, 0)).normalized()
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    p = bpy.context.active_object
    p.name = "CHUD_Lighthouse_Face"
    p.scale = (3.9, 3.9, 1)
    p.location = c + to_cam * 2.3 + Vector((0, 0, -0.1))
    yaw = math.atan2(to_cam.y, to_cam.x)
    p.rotation_euler = (math.radians(90), 0, yaw + math.radians(90))
    m = bpy.data.materials.new("CHUD_Face_Glow")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = "Closest"
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Strength"].default_value = 2.2
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    p.data.materials.append(m)
    # Lamp glass behind the face dimmed so the face is the light, not a white blob.
    set_emission("Lighthouse_Lamp", strength=1.5)
    ob("Lighthouse_Glow").data.color = (0.75, 0.95, 0.75)
    return p


BLINKS = {
    # name: roll, blur sigma (px), lid opening, droplet seed
    "blink_1": dict(roll=24.0, blur=16.0, lids=0.42, seed=21, dist=95.0),
    "blink_2": dict(roll=15.0, blur=9.0, lids=0.62, seed=22, dist=88.0),
    "blink_3": dict(roll=9.0, blur=4.5, lids=0.80, seed=23, dist=82.0),
}


def frame_blink(name):
    cfg = BLINKS[name]
    sc = reopen()
    storm_light(sc, sky=1.3)
    lightning(False)
    show(["Rogue_Wave", "Rogue_Wave_Foam"], False)
    show(coll_objects("Boat") + coll_objects("Player_Hands") + ["Helm_Lantern", "Helm_Lantern_Bulb"], False)
    lh = Vector((-128.0, 330.0, 0.0))
    ang = math.radians(-112)  # approach from the open sea, south-east of the island
    cx, cy = lh.x + math.cos(ang) * cfg["dist"], lh.y + math.sin(ang) * cfg["dist"]
    cam = ob("FP_Camera")
    cam.data.lens = 30
    z = sea_height(cx, cy) + 0.35
    cam.location = (cx, cy, z)
    add_face(cam.location)
    look_at(cam, (lh.x + 4, lh.y, 24.0), roll_deg=cfg["roll"])

    def post(a):
        a = gblur(a, cfg["blur"])
        a = grade(a, desat=0.35, tint=(0.95, 1.0, 1.02))
        a = droplets(a, seed=cfg["seed"])
        a = gblur(a, 1.2)
        a = vignette(a, 0.6)
        return eyelids(a, cfg["lids"])

    finish(name, f"intro_05_{name.replace('blink_', 'blink_')}.png", post)


FRAMES = {
    "helm": frame_helm,
    "lightning": frame_lightning,
    "wave": frame_wave,
    "capsize": frame_capsize,
    "blink_1": lambda: frame_blink("blink_1"),
    "blink_2": lambda: frame_blink("blink_2"),
    "blink_3": lambda: frame_blink("blink_3"),
}

t0 = time.time()
for f in (req or list(FRAMES)):
    print("FRAME", f)
    FRAMES[f]()
print(f"ALL DONE in {time.time() - t0:.1f}s")
