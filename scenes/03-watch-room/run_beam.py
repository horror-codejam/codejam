"""Run headless GPU batches against the dedicated watch-room beam copy."""

import argparse
from datetime import datetime
from pathlib import Path
import subprocess
import sys
from time import perf_counter


HERE = Path(__file__).resolve().parent
CAMERAS = ("cam_desk", "cam_window", "cam_hold_window", "cam_hatch", "cam_hold_hatch",
           "cam_balcony", "cam_hold_balcony")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", required=True, type=Path)
    parser.add_argument("--blend", required=True, type=Path)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--camera", action="append", choices=CAMERAS)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--render-only", action="store_true")
    parser.add_argument("--review", type=Path)
    args = parser.parse_args()
    if args.blend.name != "scene03_watch_room_beam.blend":
        raise ValueError("Use the dedicated beam copy")
    if args.camera and not args.render_only:
        raise ValueError("Use --render-only for a subset, then resume the full queue")
    cache = args.cache.resolve()
    cache.mkdir(parents=True, exist_ok=True)
    command = [str(args.blender.resolve()), "-b", str(args.blend.resolve()), "--python-exit-code", "1", "-P",
               str(HERE / "render_beam.py"), "--", "--final", "--output", str(cache)]
    if args.preview:
        command.append("--preview")
    with (cache / "render.log").open("a", encoding="utf-8", buffering=1) as log:
        started = perf_counter()
        print(f"QUEUE START {datetime.now().isoformat(timespec='seconds')}", file=log)
        try:
            for camera in args.camera or CAMERAS:
                print(f"BATCH {camera}", file=log)
                subprocess.run([*command, "--camera", camera], stdout=log, stderr=subprocess.STDOUT, check=True)
            if not args.render_only:
                pack = [sys.executable, str(HERE / "pack_beam.py"), str(cache), str(args.output.resolve()),
                        "--blender", str(args.blender.resolve()), "--blend", str(args.blend.resolve())]
                if args.review:
                    pack.extend(("--review", str(args.review.resolve())))
                subprocess.run(pack, stdout=log, stderr=subprocess.STDOUT, check=True)
        except (subprocess.CalledProcessError, OSError) as error:
            print(f"QUEUE FAILED after {perf_counter() - started:.2f}s: {error}", file=log)
            raise
        print(f"QUEUE COMPLETE {perf_counter() - started:.2f}s", file=log)


if __name__ == "__main__":
    main()
