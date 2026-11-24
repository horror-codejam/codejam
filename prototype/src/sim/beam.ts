// Pure deterministic rotating-beam math shared by the engine, UI and tests.
// Matches scenes/03-watch-room/final_beam/manifest.json and scenes/03-watch-room/pack_beam.py.

import { CONFIG, type Config } from "../config";

const TWO_PI = 2 * Math.PI;

export interface BeamParams {
  period: number;
  startAngle: number;
  direction: 1 | -1;
  width: number;
  height: number;
  tilt: number;
  softness: number;
  gain: number;
  darkGain: number;
  haze: number;
}

export function defaultBeamParams(cfg: Config = CONFIG): BeamParams {
  return {
    period: cfg.BEAM_PERIOD,
    startAngle: cfg.BEAM_START_ANGLE,
    direction: cfg.BEAM_DIRECTION,
    width: cfg.BEAM_WIDTH,
    height: cfg.BEAM_HEIGHT,
    tilt: cfg.BEAM_TILT,
    softness: cfg.BEAM_SOFTNESS,
    gain: cfg.BEAM_GAIN,
    darkGain: cfg.BEAM_DARK_GAIN,
    haze: cfg.BEAM_HAZE,
  };
}

// Wrap any angle in radians into [-PI, PI).
export function wrapAngle(radians: number): number {
  const m = ((radians + Math.PI) % TWO_PI + TWO_PI) % TWO_PI;
  return m - Math.PI;
}

// Normalize any angle in radians into [0, 2*PI).
export function normalizeAngle(radians: number): number {
  return ((radians % TWO_PI) + TWO_PI) % TWO_PI;
}

// Deterministic beam azimuth in radians at simulation time `t` seconds.
export function beamAngleAt(
  t: number,
  cfg: Pick<Config, "BEAM_START_ANGLE" | "BEAM_DIRECTION" | "BEAM_PERIOD"> = CONFIG,
): number {
  const period = cfg.BEAM_PERIOD;
  if (!(period > 0)) return cfg.BEAM_START_ANGLE;
  return cfg.BEAM_START_ANGLE + cfg.BEAM_DIRECTION * ((TWO_PI * t) / period);
}

// Elliptical smoothstep profile (0..1) matching beam.frag and pack_beam.py.
// Evaluated along the beam center elevation when elevation === tilt.
export function beamProfile(
  targetAzimuth: number,
  beamAzimuth: number,
  width: number,
  softness: number,
  targetElevation = 0,
  tilt = 0,
  height = 1,
): number {
  if (!(width > 0) || !(height > 0)) return 0;
  const delta = wrapAngle(targetAzimuth - beamAzimuth);
  const rx = (2 * delta) / width;
  const ry = (2 * (targetElevation - tilt)) / height;
  const radius = Math.hypot(rx, ry);
  const s = Math.max(1e-4, Math.min(1, softness));
  const edge = Math.max(0, Math.min(1, (1 - radius) / s));
  return edge * edge * (3 - 2 * edge);
}

// Beam intensity (0..1) at a horizontal azimuth along the lamp's tilt centerline.
export function beamIntensityAtAzimuth(
  targetAzimuth: number,
  beamAzimuth: number,
  width: number = CONFIG.BEAM_WIDTH,
  softness: number = CONFIG.BEAM_SOFTNESS,
): number {
  return beamProfile(targetAzimuth, beamAzimuth, width, softness);
}
