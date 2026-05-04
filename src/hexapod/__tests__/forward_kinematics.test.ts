import { describe, it, expect } from 'vitest';
import {
  forwardKinematics,
  servosToAngles,
  type LegFKConfig,
} from '../forward_kinematics';

/** Default 3-DOF leg with 30-length segments, no init angles, mirror=1 */
function leg3(mirror = 1, lengths = [30, 30, 30], initAngles = [0, 0, 0]) {
  return {
    mirror,
    joints: [
      { length: lengths[0], init_angle: initAngles[0], revert: false },
      { length: lengths[1], init_angle: initAngles[1], revert: false },
      { length: lengths[2], init_angle: initAngles[2], revert: false },
    ],
  };
}

describe('servosToAngles', () => {
  it('returns zero angles at midpoint (1500)', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
      ],
    };
    const angles = servosToAngles(cfg, [1500, 1500, 1500]);
    expect(angles[0]).toBeCloseTo(0, 10);
    expect(angles[1]).toBeCloseTo(0, 10);
    expect(angles[2]).toBeCloseTo(0, 10);
  });

  it('2500 servo gives +π/2 (90°) for mirror=1', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [{ length: 30, init_angle: 0, revert: false }],
    };
    expect(servosToAngles(cfg, [2500])[0]).toBeCloseTo(Math.PI / 2, 5);
  });

  it('500 servo gives -π/2 (-90°) for mirror=1', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [{ length: 30, init_angle: 0, revert: false }],
    };
    expect(servosToAngles(cfg, [500])[0]).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('mirror=-1 inverts init_angle but not servo delta', () => {
    const cfg1: LegFKConfig = {
      mirror: 1,
      joints: [{ length: 30, init_angle: 30, revert: false }],
    };
    const cfgM1: LegFKConfig = {
      mirror: -1,
      joints: [{ length: 30, init_angle: 30, revert: false }],
    };
    // At 1500 (zero delta), angle = mirror * init_radius
    // mirror=1: +30°  →  +π/6
    // mirror=-1: -30° → -π/6
    const a1 = servosToAngles(cfg1, [1500])[0];
    const aM1 = servosToAngles(cfgM1, [1500])[0];
    expect(a1).toBeCloseTo(Math.PI / 6, 5);
    expect(aM1).toBeCloseTo(-Math.PI / 6, 5);
  });

  it('revert flips the servo delta direction', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: true },
        { length: 30, init_angle: 0, revert: false },
      ],
    };
    const angles = servosToAngles(cfg, [2500, 2500]);
    // Joint 0: revert=true → delta flipped → -π/2
    expect(angles[0]).toBeCloseTo(-Math.PI / 2, 5);
    // Joint 1: revert=false → +π/2
    expect(angles[1]).toBeCloseTo(Math.PI / 2, 5);
  });

  it('includes init_angle offset', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [{ length: 30, init_angle: 30, revert: false }],
    };
    // At 1500, angle = init_angle = 30° = π/6
    const angle = servosToAngles(cfg, [1500])[0];
    expect(angle).toBeCloseTo(Math.PI / 6, 5);
  });
});

describe('forwardKinematics', () => {
  it('3-DOF leg at 1500 points straight along +X (mirror=1)', () => {
    const cfg = leg3(1);
    const tip = forwardKinematics(cfg, [1500, 1500, 1500]);
    // All angles zero → leg extends along +X
    expect(tip.x).toBeCloseTo(90, 5); // 30+30+30
    expect(tip.y).toBeCloseTo(0, 5);
    expect(tip.z).toBeCloseTo(0, 5);
  });

  it('3-DOF leg at 1500 points straight along -X (mirror=-1)', () => {
    const cfg = leg3(-1);
    const tip = forwardKinematics(cfg, [1500, 1500, 1500]);
    expect(tip.x).toBeCloseTo(-90, 5);
    expect(tip.y).toBeCloseTo(0, 5);
    expect(tip.z).toBeCloseTo(0, 5);
  });

  it('max yaw (2500) rotates leg to -Z direction (mirror=1)', () => {
    const cfg = leg3(1);
    const tip = forwardKinematics(cfg, [2500, 1500, 1500]);
    // Yaw +90°: +X → -Z
    expect(tip.x).toBeCloseTo(0, 5);
    expect(tip.y).toBeCloseTo(0, 5);
    expect(tip.z).toBeCloseTo(-90, 5);
  });

  it('min yaw (500) rotates leg to +Z direction (mirror=1)', () => {
    const cfg = leg3(1);
    const tip = forwardKinematics(cfg, [500, 1500, 1500]);
    // Yaw -90°: +X → +Z
    expect(tip.x).toBeCloseTo(0, 5);
    expect(tip.y).toBeCloseTo(0, 5);
    expect(tip.z).toBeCloseTo(90, 5);
  });

  it('femur up (2500) makes leg point upward', () => {
    const cfg = leg3(1);
    const tip = forwardKinematics(cfg, [1500, 2500, 1500]);
    // Coxa: along +X (30, 0, 0)
    // Femur: pitch +90° → points up (0, 30, 0)
    // Tibia: cumulative pitch still 90° → points up (0, 30, 0)
    expect(tip.x).toBeCloseTo(30, 5);
    expect(tip.y).toBeCloseTo(60, 5);
    expect(tip.z).toBeCloseTo(0, 5);
  });

  it('femur down (500) makes leg point downward', () => {
    const cfg = leg3(1);
    const tip = forwardKinematics(cfg, [1500, 500, 1500]);
    // Femur: pitch -90° → points down
    expect(tip.x).toBeCloseTo(30, 5);
    expect(tip.y).toBeCloseTo(-60, 5);
    expect(tip.z).toBeCloseTo(0, 5);
  });

  it('femur+tibia cumulative pitch', () => {
    const cfg = leg3(1);
    // Both femur and tibia at 45° (2000 servo = π/4)
    const tip = forwardKinematics(cfg, [1500, 2000, 2000]);
    // Coxa: (30, 0, 0)
    // Femur pitch = π/4: cos=0.707, sin=0.707
    // Femur: (30*0.707, 30*0.707, 0) ≈ (21.2, 21.2, 0)
    // Tibia cum pitch = π/2: cos=0, sin=1
    // Tibia: (30*0, 30*1, 0) = (0, 30, 0)
    // Total: (30+21.2+0, 0+21.2+30, 0) = (51.2, 51.2, 0)
    const pi4 = Math.PI / 4;
    expect(tip.x).toBeCloseTo(30 + 30 * Math.cos(pi4), 4);
    expect(tip.y).toBeCloseTo(30 * Math.sin(pi4) + 30, 4);
    expect(tip.z).toBeCloseTo(0, 5);
  });

  it('combined yaw + pitch', () => {
    const cfg = leg3(1);
    // Yaw 90° (to -Z) + femur up 90°
    const tip = forwardKinematics(cfg, [2500, 2500, 1500]);
    // Coxa yaw 90°: (0, 0, -30)
    // Femur pitch 90° + yaw 90°: cosYaw=0, sinYaw=1
    // Femur: (30*-0*1, 30*1*1, -30*-0*1) = (0, 30, 0) — wait:
    // dx = L*m*cosYaw*cosPitch = 30*1*0*0 = 0
    // dy = L*m*sinPitch = 30*1*1 = 30
    // dz = -L*m*sinYaw*cosPitch = -30*1*1*0 = 0
    // Femur: (0, 30, 0)
    // Tibia cum 90°: same as femur: (0, 30, 0)
    // Total: (0, 60, -30)
    expect(tip.x).toBeCloseTo(0, 5);
    expect(tip.y).toBeCloseTo(60, 5);
    expect(tip.z).toBeCloseTo(-30, 5);
  });

  it('2-DOF leg', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: false },
        { length: 40, init_angle: 0, revert: false },
      ],
    };
    const tip = forwardKinematics(cfg, [1500, 1500]);
    expect(tip.x).toBeCloseTo(70, 5);
    expect(tip.y).toBeCloseTo(0, 5);
    expect(tip.z).toBeCloseTo(0, 5);
  });

  it('6-DOF leg cumulative pitch chain', () => {
    const cfg: LegFKConfig = {
      mirror: 1,
      joints: [
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 30, init_angle: 0, revert: false },
        { length: 20, init_angle: 0, revert: false },
        { length: 20, init_angle: 0, revert: false },
        { length: 10, init_angle: 0, revert: false },
      ],
    };
    // All at 1500 → all angles zero → leg along +X
    const tip = forwardKinematics(cfg, [1500, 1500, 1500, 1500, 1500, 1500]);
    expect(tip.x).toBeCloseTo(140, 5); // 30+30+30+20+20+10
    expect(tip.y).toBeCloseTo(0, 5);
  });

  it('empty joint list returns origin', () => {
    const cfg: LegFKConfig = { mirror: 1, joints: [] };
    const tip = forwardKinematics(cfg, []);
    expect(tip.x).toBe(0);
    expect(tip.y).toBe(0);
    expect(tip.z).toBe(0);
  });
});
