import { describe, it, expect } from 'vitest';
import { PosCalculator } from '../pos_calculator';
import { forwardKinematics, type LegFKConfig } from '../forward_kinematics';

const NO_GROUND = false; // old tests don't use ground constraint

/** Create a FK function that wraps forwardKinematics with a fixed leg config */
function makeFkFn(config: LegFKConfig) {
  return (values: number[]) => forwardKinematics(config, values);
}

/** Default 3-DOF config, all lengths=30, no init angles, mirror=1 */
const cfg3: LegFKConfig = {
  mirror: 1,
  joints: [
    { length: 30, init_angle: 0, revert: false },
    { length: 30, init_angle: 0, revert: false },
    { length: 30, init_angle: 0, revert: false },
  ],
};

describe('PosCalculator with pure FK', () => {
  it('converges from midpoint to all-1500 target', () => {
    // Target: leg straight along +X → tip at (90, 0, 0)
    const target = { x: 90, y: 0, z: 0 };
    const fk = makeFkFn(cfg3);
    const calc = new PosCalculator(
      null,           // no Three.js leg
      target,
      [1500, 1500, 1500],  // init values
      fk, NO_GROUND,
    );

    const result = calc.run();
    expect(result.success).toBe(true);
    // Should stay close to 1500 since that's already the answer
    expect(result.values[0]).toBeCloseTo(1500, -1);
    expect(result.values[1]).toBeCloseTo(1500, -1);
    expect(result.values[2]).toBeCloseTo(1500, -1);
  });

  it('converges from midpoint to target that requires yaw', () => {
    // Target: (0, 0, -90) in leg-local → requires full right yaw (2500)
    // FK with all-1500 → tip at (90, 0, 0)
    // FK with [2500, 1500, 1500] → tip at (0, 0, -90)
    const target = { x: 0, y: 0, z: -90 };
    const fk = makeFkFn(cfg3);
    const calc = new PosCalculator(
      null,
      target,
      [1500, 1500, 1500],
      fk, NO_GROUND,
    );

    const result = calc.run();
    expect(result.success).toBe(true);
    expect(result.distance).toBeLessThan(1);
    expect(result.values[0]).toBeGreaterThan(2000); // yaw turned right
    // Pitch joints should stay near 1500 (target is pure yaw)
    expect(result.values[1]).toBeCloseTo(1500, -1);
    expect(result.values[2]).toBeCloseTo(1500, -1);
  });

  it('converges from midpoint to target that requires pitch down', () => {
    // Target tip position reachable with the leg (doesn't require specific servo combo)
    const known = forwardKinematics(cfg3, [1500, 1700, 1500]);
    const target = { x: known.x, y: known.y, z: known.z };
    const fk = makeFkFn(cfg3);
    const calc = new PosCalculator(null, target, [1500, 1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    expect(result.success).toBe(true);
    expect(result.distance).toBeLessThan(1);
    // Tip reached the target
    const actualTip = forwardKinematics(cfg3, result.values);
    expect(Math.abs(actualTip.x - target.x)).toBeLessThan(1);
    expect(Math.abs(actualTip.y - target.y)).toBeLessThan(1);
    expect(Math.abs(actualTip.z - target.z)).toBeLessThan(1);
  });

  it('converges from midpoint to known servo combination', () => {
    // Small perturbation: [1600, 1400, 1550] (close to midpoint, easy to find)
    const knownServos = [1600, 1400, 1550];
    const target = forwardKinematics(cfg3, knownServos);
    const fk = makeFkFn(cfg3);
    const calc = new PosCalculator(null, target, [1500, 1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    expect(result.success).toBe(true);
    expect(result.distance).toBeLessThan(1);
    // Should be close to known values
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(result.values[i] - knownServos[i])).toBeLessThan(200);
    }
  });

  it('converges from different start to same target', () => {
    // Easy target close to both starting points
    const target = forwardKinematics(cfg3, [1600, 1400, 1550]);
    const fk = makeFkFn(cfg3);

    const r1 = new PosCalculator(null, target, [1500, 1500, 1500], fk, NO_GROUND).run();
    const r2 = new PosCalculator(null, target, [1700, 1300, 1600], fk, NO_GROUND).run();

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const tip1 = forwardKinematics(cfg3, r1.values);
    const tip2 = forwardKinematics(cfg3, r2.values);
    expect(Math.abs(tip1.x - target.x)).toBeLessThan(1);
    expect(Math.abs(tip1.y - target.y)).toBeLessThan(1);
    expect(Math.abs(tip1.z - target.z)).toBeLessThan(1);
    expect(Math.abs(tip2.x - target.x)).toBeLessThan(1);
    expect(Math.abs(tip2.y - target.y)).toBeLessThan(1);
    expect(Math.abs(tip2.z - target.z)).toBeLessThan(1);
  });

  it('handles 2-DOF leg', () => {
    const cfg2: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: false },
        { length: 40, init_angle: 0, revert: false },
      ],
    };
    // Target at a reachable spot
    const target = forwardKinematics(cfg2, [1600, 1400]);
    const fk = makeFkFn(cfg2);
    const calc = new PosCalculator(null, target, [1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    expect(result.success).toBe(true);
    expect(result.distance).toBeLessThan(1);
    expect(result.values.length).toBe(2);
  });

  it('handles 5-DOF leg', () => {
    const cfg5: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 20, init_angle: 0, revert: false },
        { length: 20, init_angle: 0, revert: false },
      ],
    };
    const target = { x: 80, y: -50, z: 20 };
    const fk = makeFkFn(cfg5);
    const calc = new PosCalculator(null, target, [1500, 1500, 1500, 1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    expect(result.success).toBe(true);
    expect(result.distance).toBeLessThan(1);
    expect(result.values.length).toBe(5);
    // All values within servo range
    for (const v of result.values) {
      expect(v).toBeGreaterThanOrEqual(500);
      expect(v).toBeLessThanOrEqual(2500);
    }
  });

  it('fails gracefully for unreachable target (too far)', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 10, init_angle: 0, revert: false },
        { length: 10, init_angle: 0, revert: false },
      ],
    };
    // Max reach is ~20 units, target at 100 is impossible
    const target = { x: 100, y: 0, z: 0 };
    const fk = makeFkFn(cfg);
    const calc = new PosCalculator(null, target, [1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    // Should either fail or have large distance
    expect(result.success).toBe(false);
  });

  it('rounds servo values to integers', () => {
    const target = { x: 60, y: -30, z: 0 };
    const fk = makeFkFn(cfg3);
    const calc = new PosCalculator(null, target, [1500, 1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    for (const v of result.values) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('uses init values as starting point', () => {
    const target = { x: 90, y: 0, z: 0 };
    const fk = makeFkFn(cfg3);
    // Start from non-1500 values
    const calc = new PosCalculator(null, target, [1600, 1400, 1550], fk, NO_GROUND);

    const result = calc.run();
    expect(result.success).toBe(true);
    // Should converge back toward 1500 (target is at 1500)
    expect(result.values[0]).toBeCloseTo(1500, -1);
  });
});

describe('PosCalculator regularization', () => {
  it('pulls redundant DOFs toward init values', () => {
    // 4-DOF leg: the extra DOF should be pulled toward home by regularization
    const cfg4: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 20, init_angle: 0, revert: false }, // redundant
      ],
    };
    // Target reachable with all joints at home except one
    const target = forwardKinematics(cfg4, [1600, 1500, 1500, 1500]);
    const fk = makeFkFn(cfg4);

    // Init values at 1500; joint 0 needs to move from 1500 to ~1600
    const calc = new PosCalculator(null, target, [1500, 1500, 1500, 1500], fk, NO_GROUND);

    const result = calc.run();
    expect(result.success).toBe(true);
    // Joints 1,2,3 should stay close to 1500 (home) due to regularization
    expect(Math.abs(result.values[1] - 1500)).toBeLessThan(300);
    expect(Math.abs(result.values[2] - 1500)).toBeLessThan(300);
    expect(Math.abs(result.values[3] - 1500)).toBeLessThan(300);
  });
});
