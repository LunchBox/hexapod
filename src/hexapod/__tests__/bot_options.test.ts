import { describe, it, expect } from 'vitest';
import { normalize_bot_options } from '../bot_options';

// A preset-style options object: full leg_options but NO servo_idx (presets,
// loaded JSON, and random configs all look like this). Before the fix these
// rendered "#undefined" in the command string.
function presetLikeOptions(legCount = 2, dof = 3) {
  const seg = () => ({ length: 20, radius: 5, init_angle: 0, servo_value: 1500, revert: false });
  const legs: any[] = [];
  for (let i = 0; i < legCount; i++) {
    const leg: any = { dof, mirror: i % 2 === 0 ? -1 : 1 };
    ['coxa', 'femur', 'tibia', 'tarsus', 'segment5', 'segment6'].slice(0, dof)
      .forEach(n => { leg[n] = seg(); });
    legs.push(leg);
  }
  return { leg_count: legCount, dof, first_servo_idx: 0, leg_options: legs };
}

describe('normalize_bot_options — servo index assignment', () => {
  it('assigns cumulative servo_idx across legs and joints', () => {
    const opts = normalize_bot_options(presetLikeOptions(2, 3));
    expect(opts.leg_options[0].coxa.servo_idx).toBe(0);
    expect(opts.leg_options[0].femur.servo_idx).toBe(1);
    expect(opts.leg_options[0].tibia.servo_idx).toBe(2);
    // second leg continues the cumulative offset
    expect(opts.leg_options[1].coxa.servo_idx).toBe(3);
    expect(opts.leg_options[1].tibia.servo_idx).toBe(5);
  });

  it('honors first_servo_idx as the starting offset', () => {
    const base = presetLikeOptions(1, 3);
    base.first_servo_idx = 10;
    const opts = normalize_bot_options(base);
    expect(opts.leg_options[0].coxa.servo_idx).toBe(10);
    expect(opts.leg_options[0].tibia.servo_idx).toBe(12);
  });

  it('is idempotent — does not renumber already-assigned indices', () => {
    const opts = normalize_bot_options(presetLikeOptions(2, 3));
    const before = opts.leg_options[1].coxa.servo_idx;
    normalize_bot_options(opts);
    expect(opts.leg_options[1].coxa.servo_idx).toBe(before);
  });

  it('pads leg_options up to leg_count and indexes the padded legs', () => {
    const opts = presetLikeOptions(2, 3);
    opts.leg_count = 4; // ask for more legs than provided
    normalize_bot_options(opts);
    expect(opts.leg_options.length).toBe(4);
    expect(typeof opts.leg_options[3].coxa.servo_idx).toBe('number');
  });

  it('varies joint count by per-leg dof when offsetting', () => {
    const opts = presetLikeOptions(2, 3);
    opts.leg_options[0].dof = 4; // first leg has 4 joints
    ['coxa', 'femur', 'tibia', 'tarsus'].forEach((n, j) => {
      opts.leg_options[0][n] = { length: 20, radius: 5, init_angle: 0, servo_value: 1500, revert: false, ...(opts.leg_options[0][n] || {}) };
      void j;
    });
    normalize_bot_options(opts);
    // leg 0 consumed indices 0..3 → leg 1 starts at 4
    expect(opts.leg_options[1].coxa.servo_idx).toBe(4);
  });
});
