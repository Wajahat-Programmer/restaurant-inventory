import { poseFor, stepTilt, TILT_START } from './tilt';

type Sample = [number, number];
const still = (n: number, v: Sample): Sample[] => Array.from({ length: n }, () => v);
const run = (samples: Sample[], from = TILT_START) => samples.reduce((s, [ax, az]) => stepTilt(s, ax, az), from);

describe('stepTilt', () => {
  it('stays in the middle for a phone held still, however it is held', () => {
    const upright = run(still(100, [0, 0.3]));
    expect(Math.abs(upright.x)).toBeLessThan(0.01);
    const askew = run(still(100, [3, 4]));
    expect(Math.abs(askew.x)).toBeLessThan(0.01);
    expect(Math.abs(askew.y)).toBeLessThan(0.01);
  });

  it('leans with the phone, in the right direction, and not beyond full', () => {
    const rest = run(still(30, [0, 0]));
    let s = run(still(10, [3, 0]), rest);
    expect(s.x).toBeGreaterThan(0.3);
    s = run(still(40, [-9, 0]), s);
    expect(s.x).toBeLessThan(-0.3);
    expect(s.x).toBeGreaterThanOrEqual(-1);
    const fwd = run(still(10, [0, 4]), rest);
    expect(fwd.y).toBeGreaterThan(0.3);
    expect(fwd.y).toBeLessThanOrEqual(1);
  });

  it('settles back to the middle when the new position is held', () => {
    let s = run(still(30, [0, 0]));
    s = run(still(5, [4, 0]), s);
    expect(Math.abs(s.x)).toBeGreaterThan(0.3);
    s = run(still(300, [4, 0]), s);
    expect(Math.abs(s.x)).toBeLessThan(0.05);
  });

  it('is not thrown by a wild reading', () => {
    const s = run([
      [1000, -1000],
      [-1000, 1000],
    ]);
    expect(Math.abs(s.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.y)).toBeLessThanOrEqual(1);
  });
});

describe('poseFor', () => {
  it('is flat with a soft shadow below and to the side at rest, and scales with the picture', () => {
    const p = poseFor(0, 0, 100);
    expect(p.rotateXDeg).toBeCloseTo(0);
    expect(p.rotateYDeg).toBeCloseTo(0);
    expect(p.shadowY).toBeGreaterThan(0);
    expect(poseFor(0, 0, 200).shadowY).toBe(p.shadowY * 2);
  });

  it('turns toward the lean and slides the shadow the other way', () => {
    const p = poseFor(1, 0, 100);
    expect(p.rotateYDeg).toBeGreaterThan(0);
    expect(p.shadowX).toBeLessThan(poseFor(0, 0, 100).shadowX);
    expect(poseFor(0, 1, 100).rotateXDeg).toBeLessThan(0);
  });
});
