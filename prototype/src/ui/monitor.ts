import calibration from "../../../scenes/03-watch-room/cam_desk_screen.json";
import { DESK_SCREEN, PLATE_H, PLATE_W } from "./layout";

type Point = readonly [number, number];
const WIDTH = 1024;
const HEIGHT = 552;

export const MONITOR_CORNERS: Point[] = calibration.resolutions["1920x960"].corners_normalized
  .map(([x, y]) => [x * PLATE_W, y * PLATE_H]);

const { x, y, w, h } = DESK_SCREEN;
const fallbackCorners: Point[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export const monitorTransform = {
  final: projectToQuad(MONITOR_CORNERS),
  fallback: projectToQuad(fallbackCorners),
};

// Map the four CSS box corners to the glass. CSS matrix3d takes columns, with the
// fourth row supplying the perspective divide. The camera transform is applied outside it.
function projectToQuad([a, b, c, d]: Point[]): string {
  const dx1 = b[0] - c[0];
  const dx2 = d[0] - c[0];
  const dx3 = a[0] - b[0] + c[0] - d[0];
  const dy1 = b[1] - c[1];
  const dy2 = d[1] - c[1];
  const dy3 = a[1] - b[1] + c[1] - d[1];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return `matrix3d(${[
    (b[0] - a[0] + g * b[0]) / WIDTH, (b[1] - a[1] + g * b[1]) / WIDTH, 0, g / WIDTH,
    (d[0] - a[0] + h * d[0]) / HEIGHT, (d[1] - a[1] + h * d[1]) / HEIGHT, 0, h / HEIGHT,
    0, 0, 1, 0,
    a[0], a[1], 0, 1,
  ].join(",")})`;
}
