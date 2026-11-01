/**
 * How far the phone has been leaned, from its accelerometer, for the 2.5D photo.
 * Gravity pulls along the phone's axes, so leaning shifts it between them.
 * The "rest" position is whatever the phone has been held at for a moment, so
 * the picture settles back to the middle when the phone is held still.
 */
export interface TiltState {
  /** Slowly following average of the gravity reading: the rest position. */
  baseX: number | null;
  baseY: number | null;
  /** Smoothed lean, each from -1 (full lean one way) to 1. */
  x: number;
  y: number;
}

export const TILT_START: TiltState = { baseX: null, baseY: null, x: 0, y: 0 };

const G = 9.81;
const REST_FOLLOW = 0.03; // how fast the rest position follows (per sample)
const SMOOTH = 0.3; // how fast the picture follows the phone (per sample)
const GAIN = 2.5; // a quarter of a g of lean is a full lean

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Accelerometer reading (metres per second squared, phone axes) -> next state. */
export function stepTilt(s: TiltState, ax: number, az: number): TiltState {
  const gx = clamp(ax / G);
  const gz = clamp(az / G);
  const baseX = s.baseX === null ? gx : s.baseX + (gx - s.baseX) * REST_FOLLOW;
  const baseY = s.baseY === null ? gz : s.baseY + (gz - s.baseY) * REST_FOLLOW;
  const targetX = clamp((gx - baseX) * GAIN);
  const targetY = clamp((gz - baseY) * GAIN);
  return { baseX, baseY, x: s.x + (targetX - s.x) * SMOOTH, y: s.y + (targetY - s.y) * SMOOTH };
}

/** Degrees, offsets and shadow movement for a lean, kept small so it stays tasteful. */
export function poseFor(x: number, y: number, size: number) {
  return {
    rotateYDeg: x * 14,
    rotateXDeg: -y * 14,
    shiftX: x * size * 0.04,
    shiftY: y * size * 0.04,
    // The shadow falls away from the light, so it slides against the lean.
    shadowX: size * 0.03 - x * size * 0.06,
    shadowY: size * 0.05 + y * size * 0.04,
  };
}
