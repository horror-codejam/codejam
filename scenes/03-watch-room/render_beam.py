"""Render the window lab with Blender 5.3, from the dedicated beam copy only.

Run Blender with -b scene03_watch_room_beam.blend -P render_beam.py.
The script reuses render_finals.py next to the blend and writes into beam_proto.
"""

import argparse
import importlib.util
import json
import math
from pathlib import Path
from shutil import copy2
import struct
import subprocess
import sys
import zlib

import bpy
from mathutils import Vector
import numpy as np


WIDTH, HEIGHT = 960, 480
SIZE = 64
SHAPER = 0.125
TILT, AZIMUTH = -31, 193
BEAM_WIDTH, BEAM_HEIGHT, SOFTNESS = 18, 50, 0.8
DARK_GAIN, POWER = 0.6, 105.0
LAMP_Z = 3.80
LAMP = "Window lab | ceiling lamp"


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera", choices=["cam_window"], default="cam_window")
    parser.add_argument("--state", choices=["empty", "tell", "both"], default="both")
    parser.add_argument("--pass", dest="render_pass", choices=["all", "dark", "beam", "angles", "reference", "pack"], default="all")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--lab-assets", type=Path, help="Copy the packed inputs to prototype/public/beam-lab")
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--pack-only", action="store_true")
    parser.add_argument("--reference-only", action="store_true")
    parser.add_argument("--azimuth", type=float, default=AZIMUTH)
    parser.add_argument("--power", type=float, default=POWER)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def load_finals(directory):
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("watchroom_finals", directory / "render_finals.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    module.log = lambda message: print(message, flush=True)
    return module


def set_enum(owner, name, value):
    try:
        setattr(owner, name, value)
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"Cannot set {name} to {value}") from error


def render(scene, path, file_format="OPEN_EXR"):
    settings = scene.render.image_settings
    set_enum(settings, "file_format", file_format)
    set_enum(settings, "color_mode", "RGBA")
    set_enum(settings, "color_depth", "32" if file_format == "OPEN_EXR" else "8")
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True, scene=scene.name)


def place_lamp(scene, power):
    lamp = bpy.data.objects.get(LAMP)
    if lamp is None:
        lamp = bpy.data.objects.new(LAMP, bpy.data.lights.new(LAMP, "POINT"))
        scene.collection.objects.link(lamp)
    lamp.location = scene.objects["cam_desk"].matrix_world.translation
    lamp.location.z = LAMP_Z
    set_enum(lamp.data, "type", "POINT")
    lamp.data.use_temperature = True
    lamp.data.temperature = 6500
    lamp.data.energy = power
    lamp.data.shadow_soft_size = 0
    return lamp


def material_trees():
    trees = set(bpy.data.node_groups)
    trees.update(material.node_tree for material in bpy.data.materials if material.node_tree)
    return [tree for tree in trees if tree.bl_idname == "ShaderNodeTree"]


def isolate_lamp(scene, lamp):
    hidden = [(obj, obj.hide_render) for obj in scene.objects if obj.type == "LIGHT" and obj != lamp]
    for obj, _ in hidden:
        obj.hide_render = True
    world = scene.world
    scene.world = bpy.data.worlds.new("Window lab | no environment light")
    scene.world.color = (0, 0, 0)
    scene.world.use_nodes = True
    background = next(node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (0, 0, 0, 1)
    background.inputs["Strength"].default_value = 0
    sockets = []
    for tree in material_trees():
        for node in tree.nodes:
            name = {"EMISSION": "Strength", "BSDF_PRINCIPLED": "Emission Strength"}.get(node.type)
            if name is None:
                continue
            socket = node.inputs[name]
            sources = [link.from_socket for link in socket.links]
            sockets.append((tree, socket, socket.default_value, sources))
            for link in list(socket.links):
                tree.links.remove(link)
            socket.default_value = 0
    lamp.hide_render = False

    def restore():
        for tree, socket, value, sources in sockets:
            socket.default_value = value
            for source in sources:
                tree.links.new(source, socket)
        for obj, value in hidden:
            obj.hide_render = value
        isolated_world = scene.world
        scene.world = world
        bpy.data.worlds.remove(isolated_world)
        lamp.hide_render = True

    return restore


def connect(tree, source, socket):
    if isinstance(source, (float, int, tuple)):
        socket.default_value = source
    else:
        tree.links.new(source, socket)


def math_node(tree, operation, first, second=None):
    node = tree.nodes.new("ShaderNodeMath")
    set_enum(node, "operation", operation)
    connect(tree, first, node.inputs[0])
    if second is not None:
        connect(tree, second, node.inputs[1])
    return node.outputs[0]


def direction_angles(tree, direction):
    unit = tree.nodes.new("ShaderNodeVectorMath")
    set_enum(unit, "operation", "NORMALIZE")
    connect(tree, direction, unit.inputs[0])
    xyz = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(unit.outputs[0], xyz.inputs[0])
    azimuth = math_node(tree, "ARCTAN2", xyz.outputs["Y"], xyz.outputs["X"])
    elevation = math_node(tree, "ARCSINE", xyz.outputs["Z"])
    return azimuth, elevation


def render_angles(scene, point, path):
    # Keep real displacement and object visibility. The casement is a thin window:
    # sample through the panes and let the color plate carry rain and reflections.
    angle = angle_shader(point)
    trees = [(material, material.node_tree) for material in bpy.data.materials if material.node_tree]
    # The open parts of the pane still scatter light. Catch them behind the tell
    # and evaluate their angles at the plane of the wet glass along the camera ray.
    mesh = bpy.data.meshes.new("Window lab | pane proxy")
    mesh.from_pydata([(-7, -3, -0.5), (-7, 3, -0.5), (-7, 3, 4), (-7, -3, 4)], [], [(0, 1, 2, 3)])
    proxy = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(proxy)
    proxy_material = bpy.data.materials.new(mesh.name)
    proxy_material.use_nodes = True
    mesh.materials.append(proxy_material)
    tree = proxy_material.node_tree
    tree.nodes.clear()
    node = tree.nodes.new("ShaderNodeGroup")
    camera = scene.camera.matrix_world.translation
    fraction = (-5.01 - camera.x) / (-7 - camera.x)
    proxy_shader = angle_shader(camera + (Vector(point) - camera) / fraction)
    node.node_tree = proxy_shader
    tree.links.new(node.outputs[0], tree.nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
    edits = []
    for material, tree in trees:
        outputs = [node for node in tree.nodes if node.type == "OUTPUT_MATERIAL"]
        if not outputs:
            continue
        volume_only = all(not output.inputs["Surface"].is_linked and output.inputs["Volume"].is_linked for output in outputs)
        clear = (volume_only or material.name.startswith(("M_Casement_Inner_Clear_Glass", "M_Casement_Outer_Rained_Glass"))
                 or "rain motion streak" in material.name.lower() or "damp condensation" in material.name.lower())
        node = tree.nodes.new("ShaderNodeBsdfTransparent" if clear else "ShaderNodeGroup")
        if not clear:
            node.node_tree = angle
        previous = []
        for output in outputs:
            has_geometry_shader = any(output.inputs[name].is_linked for name in ("Surface", "Volume"))
            for socket in (output.inputs["Surface"], output.inputs["Volume"]):
                for link in list(socket.links):
                    previous.append((link.from_socket, socket))
                    tree.links.remove(link)
            if has_geometry_shader:
                tree.links.new(node.outputs[0], output.inputs["Surface"])
        edits.append((tree, node, previous))
    cycles = scene.cycles
    cycles.samples = 1
    cycles.use_denoising = False
    cycles.use_adaptive_sampling = False
    set_enum(cycles, "pixel_filter_type", "BOX")
    cycles.filter_width = 0.01
    try:
        render(scene, path)
    finally:
        for tree, node, previous in edits:
            tree.nodes.remove(node)
            for source, target in previous:
                tree.links.new(source, target)
        bpy.data.objects.remove(proxy, do_unlink=True)
        bpy.data.meshes.remove(mesh)
        bpy.data.materials.remove(proxy_material)
        bpy.data.node_groups.remove(proxy_shader)
        bpy.data.node_groups.remove(angle)


def angle_shader(point):
    tree = bpy.data.node_groups.new("Window lab | surface direction shader", "ShaderNodeTree")
    tree.interface.new_socket(name="Encoded direction", in_out="OUTPUT", socket_type="NodeSocketShader")
    geom = tree.nodes.new("ShaderNodeNewGeometry")
    delta = tree.nodes.new("ShaderNodeVectorMath")
    set_enum(delta, "operation", "SUBTRACT")
    tree.links.new(geom.outputs["Position"], delta.inputs[0])
    delta.inputs[1].default_value = point
    azimuth, elevation = direction_angles(tree, delta.outputs[0])
    rgb = tree.nodes.new("ShaderNodeCombineXYZ")
    for axis, angle, factor in (("X", azimuth, 1 / math.tau), ("Y", elevation, 1 / math.pi)):
        tree.links.new(math_node(tree, "ADD", math_node(tree, "MULTIPLY", angle, factor), 0.5), rgb.inputs[axis])
    emission = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(rgb.outputs[0], emission.inputs[0])
    tree.links.new(emission.outputs[0], tree.nodes.new("NodeGroupOutput").inputs[0])
    return tree


def point_to_spot(lamp, azimuth):
    point = lamp.data
    data = bpy.data.lights.new("Window lab | reference spot", "SPOT")
    lamp.data = data
    data.energy = point.energy
    data.use_temperature = point.use_temperature
    data.temperature = point.temperature
    data.shadow_soft_size = point.shadow_soft_size
    data.spot_size = math.radians(120)
    data.spot_blend = 0.001
    az, el = map(math.radians, (azimuth, TILT))
    direction = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    lamp.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    data.normalize = False
    data.use_nodes = True
    tree = data.node_tree
    emission = next(node for node in tree.nodes if node.type == "EMISSION")
    geom = tree.nodes.new("ShaderNodeNewGeometry")
    # Cycles supplies the ray from the lamp toward the receiving surface.
    azimuth_out, elevation_out = direction_angles(tree, geom.outputs["Incoming"])
    diff = math_node(tree, "SUBTRACT", azimuth_out, az)
    wrapped = math_node(tree, "ARCCOSINE", math_node(tree, "COSINE", diff))
    vertical = math_node(tree, "SUBTRACT", elevation_out, el)
    horizontal = math_node(tree, "MULTIPLY", wrapped, 2 / math.radians(BEAM_WIDTH))
    vertical = math_node(tree, "MULTIPLY", vertical, 2 / math.radians(BEAM_HEIGHT))
    radius = math_node(tree, "SQRT", math_node(tree, "ADD", math_node(tree, "MULTIPLY", horizontal, horizontal),
                                               math_node(tree, "MULTIPLY", vertical, vertical)))
    edge = tree.nodes.new("ShaderNodeMapRange")
    set_enum(edge, "interpolation_type", "SMOOTHSTEP")
    tree.links.new(radius, edge.inputs["Value"])
    edge.inputs["From Min"].default_value = 1 - SOFTNESS
    edge.inputs["To Min"].default_value = 1
    edge.inputs["To Max"].default_value = 0
    tree.links.new(edge.outputs[0], emission.inputs["Strength"])


def render_passes(scene, directory, out, args):
    finals = load_finals(directory)
    lamp = place_lamp(scene, args.power)
    lamp.data.normalize = False
    lamp.hide_render = True
    if args.render_pass == "all":
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    finals.setup_cycles(scene)
    states = finals.SceneStates(scene)
    scene.render.use_compositing = False
    scene.render.resolution_x, scene.render.resolution_y = WIDTH * 2, HEIGHT * 2
    scene.render.resolution_percentage = 50
    set_enum(scene.view_settings, "view_transform", "Raw")
    set_enum(scene.view_settings, "look", "None")
    scene.view_settings.exposure = 0
    scene.render.dither_intensity = 0
    cycles = scene.cycles
    sampling = (cycles.use_adaptive_sampling, cycles.use_denoising, cycles.pixel_filter_type, cycles.filter_width)
    jobs = {job.name: job for job in finals.JOBS}
    for state, name in (("empty", "view_window_off"), ("tell", "tell_window_off")):
        if args.state not in ("both", state) or args.render_pass == "reference" and state != "tell":
            continue
        job = jobs[name]
        if job.camera != args.camera:
            raise RuntimeError(f"Unexpected finals camera: {job.camera}")
        states.apply(job)
        states.prepare_frame(job, scene, job.first)
        cycles.samples = args.samples
        cycles.use_adaptive_sampling, cycles.use_denoising, filter_type, cycles.filter_width = sampling
        set_enum(cycles, "pixel_filter_type", filter_type)
        if args.render_pass in {"all", "dark"}:
            render(scene, out / f"{state}_dark.exr")
        restore = isolate_lamp(scene, lamp)
        try:
            if args.render_pass in {"all", "beam"}:
                render(scene, out / f"{state}_beam.exr")
            if args.render_pass in {"all", "angles"}:
                render_angles(scene, lamp.location[:], out / f"{state}_angles.exr")
                pack_angles(out, state)
            if state == "tell" and args.render_pass in {"all", "reference"}:
                cycles.samples = args.samples
                cycles.use_adaptive_sampling, cycles.use_denoising, filter_type, cycles.filter_width = sampling
                set_enum(cycles, "pixel_filter_type", filter_type)
                point_to_spot(lamp, args.azimuth)
                render(scene, out / "reference_spot.exr")
        finally:
            restore()


def read_exr(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    width, height = image.size
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)


def png_rgb(path, rgb):
    """Write exact RGB bytes, with no alpha or profile conversion."""
    height, width, _ = rgb.shape

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    # Sub filter keeps the high azimuth byte and elevation compact.
    filtered = rgb.copy()
    filtered[:, 1:] = rgb[:, 1:] - rgb[:, :-1]
    scanlines = b"".join(b"\x01" + row.tobytes() for row in filtered)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b""))


def encode_color(path, linear):
    light = np.maximum(linear[..., :3], 0)
    shaped = light / (light + SHAPER)
    srgb = np.where(shaped <= 0.0031308, shaped * 12.92, 1.055 * shaped ** (1 / 2.4) - 0.055)
    png = path.with_suffix(".png")
    png_rgb(png, np.rint(srgb[::-1] * 255).astype(np.uint8))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(png),
                    "-c:v", "libwebp", "-lossless", "1", "-compression_level", "6", str(path)], check=True)
    png.unlink()


def grade_inputs(scene):
    graph = scene.compositing_node_group
    group = next(node for node in graph.nodes if node.type == "GROUP" and node.node_tree.name == "GRADE_Watchroom")
    return group, group.node_tree.nodes["Lens Distortion"]


def post_scene(source, rgba, name, out, mode, display):
    """Feed a float image through the original compositor on an empty render scene."""
    height, width, _ = rgba.shape
    image = bpy.data.images.new(name, width, height, float_buffer=True)
    image.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    image.update()
    # Image nodes need a data source outside Blender's generated-image cache.
    scratch = out / f".{name}_input.exr"
    set_enum(source.render.image_settings, "file_format", "OPEN_EXR")
    set_enum(source.render.image_settings, "color_depth", "32")
    image.save_render(str(scratch), scene=source)
    bpy.data.images.remove(image)
    image = bpy.data.images.load(str(scratch), check_existing=False)
    scene = bpy.data.scenes.new(name)
    camera = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    scene.collection.objects.link(camera)
    scene.camera = camera
    set_enum(scene.render, "engine", "CYCLES")
    scene.cycles.samples = 1
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.dither_intensity = 0
    scene.render.use_compositing = True
    scene.compositing_node_group = source.compositing_node_group.copy()
    tree = scene.compositing_node_group
    group, _ = grade_inputs(scene)
    img = tree.nodes.new("CompositorNodeImage")
    img.image = image
    tree.links.new(img.outputs["Image"], group.inputs["Beauty"])
    if mode == "lut":
        group.inputs["Bloom Mix"].default_value = 0
        group.inputs["Vignette Strength"].default_value = 0
        group.node_tree = group.node_tree.copy()
        lens = group.node_tree.nodes["Lens Distortion"]
        lens.inputs["Distortion"].default_value = lens.inputs["Dispersion"].default_value = 0
    elif mode == "vignette":
        group.inputs["Bloom Mix"].default_value = 0
        group.inputs["Grade Strength"].default_value = 0
    transform, look, exposure, gamma = display
    set_enum(scene.view_settings, "view_transform", transform)
    set_enum(scene.view_settings, "look", look)
    scene.view_settings.exposure, scene.view_settings.gamma = exposure, gamma
    render(scene, out / f"{name}.png", "PNG")
    bpy.data.images.remove(image)
    scratch.unlink()


def pack(scene, out, display, azimuth):
    # Keep both original ambient plates so the lab can apply the fade per surface.
    for state in ("empty", "tell"):
        for kind in ("dark", "beam"):
            encode_color(out / f"{state}_{kind}.webp", read_exr(out / f"{state}_{kind}.exr"))
        pack_angles(out, state)
    # Blue selects a tile, red and green select a position inside the tile.
    y, x = np.mgrid[:SIZE * 8, :SIZE * 8]
    y = y[::-1]
    index = np.stack((x % SIZE, y % SIZE, x // SIZE + 8 * (y // SIZE)), axis=-1)
    shaped = index / (SIZE - 1) * 0.992
    linear = SHAPER * shaped / (1 - shaped)
    lut = np.concatenate((linear, np.ones((*linear.shape[:2], 1))), axis=-1)
    post_scene(scene, lut, "grade", out, "lut", display)
    post_scene(scene, np.ones((HEIGHT, WIDTH, 4)), "vignette", out, "vignette", ("Raw", "None", 0, 1))
    tell_dark = read_exr(out / "tell_dark.exr")
    spot = read_exr(out / "reference_spot.exr")
    tell_dark[..., :3] = tell_dark[..., :3] * DARK_GAIN + spot[..., :3]
    tell_dark[..., 3] = 1
    post_scene(scene, tell_dark, "groundtruth", out, "full", display)
    camera = scene.objects["cam_window"]
    corners = camera.data.view_frame(scene=scene)
    top = sorted(corners, key=lambda corner: corner.y)[-2:]
    left = sorted(corners, key=lambda corner: corner.x)[:2]
    rotation = camera.matrix_world.to_quaternion()
    top_left = rotation @ min(top, key=lambda corner: corner.x)
    top_right = rotation @ max(top, key=lambda corner: corner.x)
    bottom_left = rotation @ min(left, key=lambda corner: corner.y)
    settings = {"tilt": TILT, "width": BEAM_WIDTH, "height": BEAM_HEIGHT, "softness": SOFTNESS,
                "darkness": DARK_GAIN, "referenceAzimuth": azimuth,
                "rayOrigin": list(top_left), "rayAcross": list(top_right - top_left),
                "rayDown": list(bottom_left - top_left), "lampHeight": LAMP_Z - camera.matrix_world.translation.z}
    (out / "settings.json").write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")


def pack_angles(out, state):
    angles = read_exr(out / f"{state}_angles.exr")[::-1]
    az = np.rint(np.clip(angles[..., 0], 0, 1) * 65535).astype(np.uint16)
    el = np.rint(np.clip(angles[..., 1], 0, 1) * 255).astype(np.uint8)
    png_rgb(out / f"{state}_angles.png", np.stack((az >> 8, az & 255, el), axis=-1).astype(np.uint8))


def main():
    args = arguments()
    blend = Path(bpy.data.filepath)
    if blend.name != "scene03_watch_room_beam.blend":
        raise RuntimeError("Open the dedicated window beam copy")
    directory = blend.parent
    out = (args.output or directory / "beam_proto").resolve()
    finals_dir = (directory / "final").resolve()
    if out == finals_dir or finals_dir in out.parents:
        raise RuntimeError("Choose an output directory outside the final renders")
    out.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes["Scene"]
    bpy.context.window.scene = scene
    view = scene.view_settings
    display = (view.view_transform, view.look, view.exposure, view.gamma)
    if args.pack_only:
        args.render_pass = "pack"
    if args.reference_only:
        args.render_pass = "reference"
    if args.render_pass != "pack":
        render_passes(scene, directory, out, args)
    if args.render_pass in {"all", "reference", "pack"} and args.state == "both":
        pack(scene, out, display, args.azimuth)
        if args.lab_assets:
            args.lab_assets.mkdir(parents=True, exist_ok=True)
            for name in (
                "empty_dark.webp", "empty_beam.webp", "empty_angles.png",
                "tell_dark.webp", "tell_beam.webp", "tell_angles.png",
                "grade.png", "vignette.png", "settings.json",
            ):
                copy2(out / name, args.lab_assets / name)


if __name__ == "__main__":
    main()
