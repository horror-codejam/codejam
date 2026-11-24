"""Pack the production Blender cache and render a contact sheet from the packed data."""

import argparse
import json
import os
from pathlib import Path
import subprocess

os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ENTRIES = ("window", "hatch", "balcony")
SLOTS = ("desk", *(f"{entry}_{state}" for entry in ENTRIES for state in ("empty", "tell", "approach", "inside")),
         *(f"hold_{entry}_{stance}_{cue}" for entry in ENTRIES for stance in ("stand", "brace")
           for cue in ("empty", "tell")))
GAME_SIZE = (1600, 800)
AMBIENT_HIGHLIGHTS = {"knee": 0.003, "headroom": 0.018}
HERE = Path(__file__).resolve().parent
DETAILS = (
    ("Hatch seam", ("hatch_empty", "hatch_approach", "hatch_tell"), (0.35, 0.42, 0.66, 0.68)),
    ("Balcony threshold", ("balcony_empty", "balcony_approach", "balcony_tell"), (0.42, 0.77, 0.57, 0.85)),
    ("Balcony lever", ("hold_balcony_stand_empty", "hold_balcony_stand_tell"), (0.18, 0.72, 0.4, 1)),
)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_exr(path, size):
    data = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if data is None or data.shape != (size[1], size[0], 4) or not np.isfinite(data).all():
        raise ValueError(f"Invalid {size[0]}x{size[1]} EXR: {path}")
    return data[..., (2, 1, 0)]


def image_complete(path, size, mode):
    try:
        with Image.open(path) as image:
            if image.size != size or image.mode != mode:
                return False
            image.load()
        return True
    except (OSError, ValueError):
        return False


def write_image(path, pixels, **options):
    staged = path.with_suffix(f".{os.getpid()}.partial{path.suffix}")
    Image.fromarray(pixels).save(staged, **options)
    staged.replace(path)


def current(source, target, size, mode):
    return (target.is_file() and target.stat().st_mtime_ns >= source.stat().st_mtime_ns
            and image_complete(target, size, mode))


def is_lossless_webp(path):
    # Pillow writes a single VP8L chunk for an opaque RGB image without metadata.
    with path.open("rb") as file:
        return file.read(16)[12:] == b"VP8L"


def encode_color(light, shaper):
    light = np.maximum(light, 0)
    shaped = light / (shaper + light)
    srgb = np.where(shaped <= 0.0031308, 12.92 * shaped, 1.055 * shaped ** (1 / 2.4) - 0.055)
    return np.rint(srgb * 255).astype(np.uint8)


def decode_color(path, shaper):
    with Image.open(path) as image:
        srgb = np.asarray(image, dtype=np.float32) / 255
    shaped = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    return shaper * shaped / np.maximum(1 - shaped, 0.001)


def pack_slot(cache, output, slot, shaper, preview):
    name = slot["slot"]
    render_size = slot["width"], slot["height"]
    size = render_size if preview else GAME_SIZE
    slot["renderWidth"], slot["renderHeight"] = render_size
    slot["width"], slot["height"] = size
    files = {kind: f"{name}_{kind}.{ext}" for kind, ext in
             (("dark", "webp"), ("beam", "webp"), ("angles", "png"), ("hazeDepth", "png"))}
    colors = ["dark", "beam"]
    if "bounce" in slot:
        files["bounce"] = f"{name}_bounce.webp"
        colors.append("bounce")
    for kind in colors:
        source = cache / f"{name}_{kind}.exr"
        target = output / files[kind]
        if not source.is_file():
            raise FileNotFoundError(source)
        lossless = kind == "dark" and not preview and name == slot["darkBase"] and not name.startswith("hold_")
        if not current(source, target, size, "RGB") or (lossless and not is_lossless_webp(target)):
            light = read_exr(source, render_size)
            if render_size != size:
                light = cv2.resize(light, size, interpolation=cv2.INTER_AREA)
            color = encode_color(light, shaper)
            write_image(target, color, lossless=lossless, quality=94, method=6)
    source = cache / f"{name}_angles.exr"
    if not source.is_file():
        raise FileNotFoundError(source)
    targets = {kind: output / files[kind] for kind in ("angles", "hazeDepth")}
    if not (current(source, targets["angles"], size, "RGB") and
            current(source, targets["hazeDepth"], size, "L")):
        data = np.clip(read_exr(source, render_size), 0, 1)
        if render_size != size:
            data = cv2.resize(data, size, interpolation=cv2.INTER_NEAREST_EXACT)
        azimuth = np.rint(data[..., 0] * 65535).astype(np.uint16)
        elevation = np.rint(data[..., 1] * 255).astype(np.uint8)
        packed = np.stack((azimuth >> 8, azimuth & 255, elevation), axis=-1).astype(np.uint8)
        write_image(targets["angles"], packed, compress_level=9)
        depth = np.rint(data[..., 2] * 255).astype(np.uint8)
        # The background has no receiver and leaves all three EXR channels at zero.
        depth[np.all(data == 0, axis=-1)] = 255
        write_image(targets["hazeDepth"], depth, compress_level=9)
    slot["files"] = files
    print(f"PACKED {name}", flush=True)


def ellipse(azimuth, elevation, center, lamp):
    delta = (azimuth - center + 180) % 360 - 180
    radius = np.hypot(2 * delta / lamp["width"], 2 * (elevation - lamp["tilt"]) / lamp["height"])
    edge = np.clip((1 - radius) / lamp["softness"], 0, 1)
    return edge * edge * (3 - 2 * edge)


def grid(width, height):
    row, column = np.mgrid[:height, :width].astype(np.float32)
    return np.stack(((column + 0.5) / width, (row + 0.5) / height), axis=-1)


def lens_uv(uv, distortion):
    centered = (uv * 2 - 1) / 1.0175
    return 0.5 + centered / (1 + np.sqrt(1 - distortion * np.sum(centered ** 2, axis=-1, keepdims=True)))


def sample(image, uv, method=cv2.INTER_LINEAR):
    height, width = image.shape[:2]
    x = uv[..., 0] * width - 0.5
    y = uv[..., 1] * height - 0.5
    return cv2.remap(image, x, y, method, borderMode=cv2.BORDER_REPLICATE)


def haze_at(uv, depth, slot, settings):
    haze = settings["haze"]
    ray = (np.asarray(slot["rayOrigin"], dtype=np.float32)
           + uv[..., :1] * slot["rayAcross"] + uv[..., 1:] * slot["rayDown"]).astype(np.float32)
    ray /= np.linalg.norm(ray, axis=-1, keepdims=True)
    origin = np.array(slot["position"], dtype=np.float32) - settings["lamp"]["position"]
    step = (sample(depth, uv, cv2.INTER_NEAREST) * haze["rangeMeters"] / haze["samples"]).astype(np.float32)
    integral = np.zeros(step.shape, dtype=np.float32)
    origin = origin.astype(np.float32)
    for index in range(haze["samples"]):
        delta = ray * ((index + 0.5) * step[..., None]) + origin
        planar = np.hypot(delta[..., 0], delta[..., 1])
        azimuth = np.rad2deg(np.arctan2(delta[..., 1], delta[..., 0]))
        elevation = np.rad2deg(np.arctan2(delta[..., 2], planar))
        integral += ellipse(azimuth, elevation, slot["previewAzimuth"], settings["lamp"]) / np.maximum(
            1, planar ** 2 + delta[..., 2] ** 2)
    return (integral * step)[..., None] * np.asarray(haze["linearColor"], dtype=np.float32)


def display_grade(light, gain, settings, grade):
    shaped = np.maximum(light * gain, 0)
    point = np.clip(shaped / (shaped + settings["colorShaper"]) / 0.992, 0, 1) * 63
    blue = np.floor(point[..., 2]).astype(np.int32)
    fraction = (point[..., 2] - blue)[..., None]

    def grade_slice(index):
        tile = np.stack((index % 8, index // 8), axis=-1)
        uv = ((tile * 64 + point[..., :2] + 0.5) / 512).astype(np.float32)
        return sample(grade, uv)

    color = grade_slice(blue) * (1 - fraction) + grade_slice(np.minimum(blue + 1, 63)) * fraction
    return np.rint(color).astype(np.uint8)


def linear_pair(output, slot, base, settings):
    files = slot["files"]
    shaper = settings["colorShaper"]
    empty = decode_color(output / base["files"]["dark"], shaper)
    dark = empty if slot == base else decode_color(output / files["dark"], shaper)
    beam = decode_color(output / files["beam"], shaper)
    with Image.open(output / files["angles"]) as image:
        angles = np.asarray(image, dtype=np.float32)
    azimuth = ((angles[..., 0] * 256 + angles[..., 1]) / 65535 - 0.5) * 360
    elevation = (angles[..., 2] / 255 - 0.5) * 180
    edge = ellipse(azimuth, elevation, slot["previewAzimuth"], settings["lamp"])[..., None]
    ambient = empty
    if not settings["preview"] and not slot["slot"].startswith("hold_"):
        peak = empty.max(axis=-1, keepdims=True)
        excess = np.maximum(peak - AMBIENT_HIGHLIGHTS["knee"], 0)
        reduction = excess ** 2 / (excess + AMBIENT_HIGHLIGHTS["headroom"])
        ambient = empty * (1 - reduction / np.maximum(peak, 1e-6))
    dark_base = ambient * settings["darkGain"]
    reveal = edge
    lit = dark_base + beam * edge
    if "bounce" in slot:
        bounce = slot["bounce"]
        bounce_edge = ellipse(bounce["azimuth"], settings["lamp"]["tilt"], slot["previewAzimuth"], settings["lamp"])
        reveal = np.maximum(edge, bounce_edge)
        lit += decode_color(output / files["bounce"], shaper) * (bounce_edge * bounce["gain"])
    lit += (dark - ambient) * settings["darkGain"] * reveal
    with Image.open(output / files["hazeDepth"]) as image:
        depth = np.asarray(image, dtype=np.float32) / 255
    return dark_base, lit, depth


def render_pair(output, slot, base, settings, grade, vignette, size):
    dark_base, lit, depth = linear_pair(output, slot, base, settings)
    uv = grid(*size)
    gain = sample(vignette, uv)[..., None]
    red_green = lens_uv(uv, 0.0335)
    green_blue = lens_uv(uv, 0.0305)

    def lens(image):
        rg = sample(image, red_green)
        gb = sample(image, green_blue)
        return np.stack((rg[..., 0], (rg[..., 1] + gb[..., 1]) * 0.5, gb[..., 2]), axis=-1)

    haze = haze_at(lens_uv(uv, 0.032), depth, slot, settings)
    return (display_grade(lens(dark_base), gain, settings, grade),
            display_grade(lens(lit) + haze, gain, settings, grade))


def write_exr(path, pixels, sources):
    if path.is_file() and path.stat().st_mtime_ns >= max(source.stat().st_mtime_ns for source in sources):
        return
    staged = path.with_suffix(f".{os.getpid()}.partial.exr")
    rgba = np.concatenate((np.maximum(pixels[..., ::-1], 0), np.ones_like(pixels[..., :1])), axis=-1)
    if not cv2.imwrite(str(staged), rgba):
        raise OSError(f"Could not write {staged}")
    staged.replace(path)


def grade_contacts(blender, blend, cache, output, slots, settings):
    incoming = cache / "contact_linear"
    graded = cache / "contact_graded"
    incoming.mkdir(exist_ok=True)
    sources = (cache / "settings.json", Path(__file__), HERE / "render_beam.py")
    for name, slot in slots.items():
        base = slots[slot["darkBase"]]
        dark, lit, depth = linear_pair(output, slot, base, settings)
        lit += haze_at(grid(slot["width"], slot["height"]), depth, slot, settings)
        base_image = output / base["files"]["dark"]
        if slot == base:
            write_exr(incoming / f"{name}_dark.exr", dark, (base_image, *sources))
        write_exr(incoming / f"{name}_lit.exr", lit,
                  (base_image, cache / f"{name}.json", *(output / file for file in slot["files"].values()), *sources))
    subprocess.run([
        str(blender), "-b", str(blend), "--python-exit-code", "1", "-P", str(HERE / "render_beam.py"),
        "--", "--final", "--pass", "contact", "--contact-input", str(incoming), "--output", str(graded),
    ], check=True)
    return graded


def contact_sheet(output, slots, settings, review, graded):
    if graded is None:
        with Image.open(output / "grade.png") as image:
            grade = np.asarray(image.convert("RGB"), dtype=np.float32)
        with Image.open(output / "vignette.png") as image:
            vignette = np.asarray(image, dtype=np.float32)[..., 0] / 255
    size = (480, 240)
    gap, header, label = 12, 36, 30
    block_width = size[0] * 2 + gap
    block_height = size[1] + label + gap
    bottom = ((len(slots) + 1) // 2) * block_height + header
    details = tuple((title, names, bounds) for title, names, bounds in DETAILS if all(name in slots for name in names))
    sheet = Image.new("RGB", (block_width * 2 + gap * 3, bottom + (190 if details else 0)), "#14181b")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    crops = {}
    draw.text((gap, 8), "Watch room | Dark and rotating beam", fill="#f4f6f7", font=font)
    for index, (name, slot) in enumerate(slots.items()):
        x = gap + index % 2 * (block_width + gap)
        y = header + index // 2 * block_height
        base = slots[slot["darkBase"]]
        if graded:
            with Image.open(graded / f"{base['slot']}_dark.png") as image:
                dark = np.asarray(image.convert("RGB"))
            with Image.open(graded / f"{name}_lit.png") as image:
                lit = np.asarray(image.convert("RGB"))
        else:
            dark, lit = render_pair(output, slot, base, settings, grade, vignette,
                                    (slot["width"], slot["height"]) if review else size)
        if review:
            write_image(review / f"{name}_dark.png", dark)
            write_image(review / f"{name}_lit.png", lit)
        draw.text((x, y + 4), f"{name.replace('_', ' ')} | dark", fill="#e3e8eb", font=font)
        angle = slot["previewAzimuth"]
        draw.text((x + size[0] + gap, y + 4), f"beam at {angle:.1f}°", fill="#e3e8eb", font=font)
        for column, frame in enumerate((dark, lit)):
            image = Image.fromarray(frame).resize(size, Image.Resampling.LANCZOS)
            sheet.paste(image, (x + column * (size[0] + gap), y + label))
        for _, names, bounds in details:
            if name in names:
                height, width = lit.shape[:2]
                crop = tuple(round(value * dim) for value, dim in zip(bounds, (width, height, width, height)))
                crops[name] = Image.fromarray(lit).crop(crop)
    if details:
        draw.text((gap, bottom + 2), "Cue details at the same beam angles", fill="#f4f6f7", font=font)
        x = gap
        for title, names, _ in details:
            draw.text((x, bottom + 30), title, fill="#f4f6f7", font=font)
            for name in names:
                crop = crops[name]
                crop.thumbnail((218, 104), Image.Resampling.LANCZOS)
                draw.text((x, bottom + 52), name.split("_")[-1], fill="#e3e8eb", font=font)
                sheet.paste(crop, (x, bottom + 76))
                x += 234
    write_image(output / "contact.png", np.asarray(sheet))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--review", type=Path, help="Save full-size contact frames in a separate QA directory")
    parser.add_argument("--partial", action="store_true", help="Pack only complete slots in a preview cache")
    parser.add_argument("--blender", type=Path, help="Apply the native finals compositor to the contact frames")
    parser.add_argument("--blend", type=Path, help="Dedicated beam copy for native grading")
    args = parser.parse_args()
    cache, output = args.cache.resolve(), args.output.resolve()
    if any(part.lower() == "final" for part in output.parts):
        raise ValueError("Choose an output directory outside the current finals")
    settings = read_json(cache / "settings.json")
    if args.partial and not settings["preview"]:
        raise ValueError("Partial output is for previews")
    if bool(args.blender) != bool(args.blend) or not (settings["preview"] or args.blender):
        raise ValueError("Production grading needs both --blender and --blend")
    if args.blend and args.blend.name != "scene03_watch_room_beam.blend":
        raise ValueError("Use the dedicated beam copy")
    output.mkdir(parents=True, exist_ok=True)
    if args.review:
        args.review.mkdir(parents=True, exist_ok=True)
    slots = {}
    for name in SLOTS:
        if args.partial and not all((cache / f"{name}_{kind}.exr").is_file()
                                    for kind in ("dark", "beam", "angles")):
            continue
        slot = read_json(cache / f"{name}.json")
        if args.partial and "bounce" in slot and not (cache / f"{name}_bounce.exr").is_file():
            continue
        if args.partial and slot["darkBase"] != name and slot["darkBase"] not in slots:
            continue
        pack_slot(cache, output, slot, settings["colorShaper"], settings["preview"])
        slots[name] = slot
    if not slots:
        raise ValueError("No complete slots")
    for name in ("grade.png", "vignette.png"):
        with Image.open(cache / name) as image:
            write_image(output / name, np.asarray(image.convert("RGB")), compress_level=9)
    graded = (grade_contacts(args.blender.resolve(), args.blend.resolve(), cache, output, slots, settings)
              if args.blender else None)
    contact_sheet(output, slots, settings, args.review, graded)
    manifest = {
        "version": 1,
        **settings,
        "colorEncoding": "linear radiance shaped by x/(x+colorShaper), then encoded as sRGB",
        "ambientHighlights": AMBIENT_HIGHLIGHTS,
        "angleEncoding": {"textureSampling": "nearest", "colorSpaceConversion": "none",
                          "azimuth": "(R*256+G)/65535*360-180",
                          "elevation": "B/255*180-90", "channels": "RGB are integer bytes"},
        "hazeDepthEncoding": "linear 8-bit grayscale, 0 to haze.rangeMeters along the camera ray",
        "composite": {"dark": "ambient * darkGain",
                      "ambient": "darkBase with highlight compression for production seated views",
                      "lit": "mix(ambient, dark, reveal) * darkGain + beam * beamProfile + bounce * bounceProfile * bounce.gain",
                      "reveal": "max(beamProfile, bounceProfile)",
                      "bounceProfile": "beam profile evaluated at bounce.azimuth and lamp.tilt, or zero for slots without bounce"},
        "grade": {"lut": "grade.png", "vignette": "vignette.png", "lutSize": 64, "lutShaperMax": 0.992,
                  **read_json(cache / "grade_settings.json")},
        "contactSheet": "contact.png",
        "slots": slots,
    }
    staged = output / f"manifest.{os.getpid()}.partial"
    staged.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    staged.replace(output / "manifest.json")


if __name__ == "__main__":
    main()
