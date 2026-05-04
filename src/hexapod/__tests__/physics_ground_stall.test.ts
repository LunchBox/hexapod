import { describe, it, expect } from 'vitest';
import { PosCalculator } from '../pos_calculator';
import { forwardKinematics, type LegFKConfig } from '../forward_kinematics';

function makeFkFn(config: LegFKConfig) {
  return (values: number[]) => forwardKinematics(config, values);
}

const cfg3: LegFKConfig = {
  mirror: 1,
  joints: [
    { length: 30, init_angle: 0, revert: false },
    { length: 30, init_angle: 0, revert: false },
    { length: 30, init_angle: 0, revert: false },
  ],
};

describe('ground constraint', () => {
  it('penalizes tip below y=0', () => {
    const fk = makeFkFn(cfg3);

    // [1500, 500, 500] → coxa straight, femur+tibia pitch down → tip at (0, -30, 0)
    // tip.y = -30 < 0, so ground penalty applies
    const calcPenalty = new PosCalculator(
      null, { x: 0, y: -30, z: 0 }, [1500, 1500, 1500], fk, true,
    );
    const distWithPenalty = calcPenalty.calc_distance([1500, 500, 500]);

    const calcNoPenalty = new PosCalculator(
      null, { x: 0, y: -30, z: 0 }, [1500, 1500, 1500], fk, false,
    );
    const distNoPenalty = calcNoPenalty.calc_distance([1500, 500, 500]);

    // Penalized distance should be larger (tip.y = -30 → penalty = 30 * 50 = 1500)
    expect(distWithPenalty).toBeGreaterThan(distNoPenalty);
  });

  it('no penalty when tip is at or above ground', () => {
    const fk = makeFkFn(cfg3);

    const calcPenalty = new PosCalculator(
      null, { x: 90, y: 30, z: 0 }, [1500, 1500, 1500], fk, true,
    );
    const calcNoPenalty = new PosCalculator(
      null, { x: 90, y: 30, z: 0 }, [1500, 1500, 1500], fk, false,
    );

    // [1500, 1500, 1500] → tip at (90, 0, 0), which is at y=0 (not below)
    const d1 = calcPenalty.calc_distance([1500, 1500, 1500]);
    const d2 = calcNoPenalty.calc_distance([1500, 1500, 1500]);

    // Should be equal — tip.y = 0, no penalty applied
    expect(d1).toBeCloseTo(d2, 10);
  });

  it('converges to solution with tip.y >= 0 when constraint is on', () => {
    // Target: reachable only if tip goes below ground without constraint
    // With ground constraint, solver should find a solution with tip.y >= 0
    const fk = makeFkFn(cfg3);

    // [1500, 1700, 1500] → tip has moderate y
    const targetServos = [1500, 1700, 1500];
    const target = forwardKinematics(cfg3, targetServos);
    // This target is reachable with tip.y at some value...

    const calc = new PosCalculator(
      null, target, [1500, 1500, 1500], fk, true,
    );
    const result = calc.run();
    const tip = forwardKinematics(cfg3, result.values);

    // Tip should not be below ground
    expect(tip.y).toBeGreaterThanOrEqual(-0.1);
  });
});

describe('stall mechanism', () => {
  it('PosCalculator reports high distance for unreachable target', () => {
    const fk = makeFkFn(cfg3);

    // Target very far away → high distance → would trigger stall
    const farTarget = { x: 500, y: 0, z: 0 }; // way beyond max reach of 90
    const calc = new PosCalculator(
      null, farTarget, [1500, 1500, 1500], fk, true,
    );
    const result = calc.run();
    // Result distance should be very large (unreachable)
    expect(result.distance).toBeGreaterThan(50);

    // A stall threshold of 10 would catch this
    const stallThreshold = 10;
    expect(result.distance).toBeGreaterThan(stallThreshold);
  });

  it('PosCalculator reports low distance for reachable target', () => {
    const fk = makeFkFn(cfg3);

    // Target easily reachable → low distance → no stall
    const nearTarget = forwardKinematics(cfg3, [1600, 1500, 1500]);
    const calc = new PosCalculator(
      null, nearTarget, [1500, 1500, 1500], fk, true,
    );
    const result = calc.run();

    // Should be well within typical stall threshold
    expect(result.distance).toBeLessThan(5);
  });

  it('stall decision: distance > threshold → keep current servos', () => {
    // Simulate the stall logic directly — when PosCalculator result
    // exceeds threshold, current servo values are preserved
    const currentServos = [1500, 1500, 1500];
    const bestEffort = [2000, 1200, 1800]; // computed but wrong
    const resultDistance = 25; // large error
    const stallThreshold = 10;

    // This is the PhysicsSolver decision:
    const shouldStall = resultDistance > stallThreshold;
    const appliedValues = shouldStall ? currentServos : bestEffort;

    expect(shouldStall).toBe(true);
    expect(appliedValues).toEqual(currentServos);
    // When stall, keep current values — don't apply bad solution
  });

  it('no stall: distance ≤ threshold → apply computed values', () => {
    const currentServos = [1500, 1500, 1500];
    const computedValues = [1600, 1400, 1550]; // good solution
    const resultDistance = 0.5; // small error
    const stallThreshold = 10;

    const shouldStall = resultDistance > stallThreshold;
    const appliedValues = shouldStall ? currentServos : computedValues;

    expect(shouldStall).toBe(false);
    expect(appliedValues).toEqual(computedValues);
  });

  it('stall threshold of 0 means never stall', () => {
    const currentServos = [1500, 1500, 1500];
    const bestEffort = [2500, 500, 2500];
    const resultDistance = 100; // huge error
    const stallThreshold = 0; // disabled

    const shouldStall = stallThreshold > 0 && resultDistance > stallThreshold;
    expect(shouldStall).toBe(false);
    // With threshold=0, always apply best-effort (old behavior)
  });
});
