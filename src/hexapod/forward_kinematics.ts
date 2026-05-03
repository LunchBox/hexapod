/**
 * Pure forward kinematics for a hexapod leg.
 *
 * Computes tip position from servo values using ONLY math — zero Three.js dependency.
 * The derivation follows the exact same Euler-angle chain used by HexapodLeg's
 * Three.js r72 scene graph (order XYZ):
 *
 *   Joint 0 (coxa):  RotY(θ₀) * RotZ(-π/2 * mirror)  → yaw
 *   Joint k≥1:       RotZ(βₖ)                         → pitch (cumulative)
 *
 * This is a reference implementation for testing PosCalculator;
 * the gait runtime still uses the Three.js scene graph via leg.set_tip_pos().
 */

export interface JointConfig {
  /** Segment length in world units (e.g. 25–40) */
  length: number;
  /** Initial angle in degrees (design geometry) */
  init_angle: number;
  /** Servo direction reversed */
  revert: boolean;
}

export interface LegFKConfig {
  /** 1 for right-side legs, -1 for left-side legs */
  mirror: number;
  /** Joint configs ordered coxa → femur → tibia → … (2–6 DOF) */
  joints: JointConfig[];
}

/**
 * Convert one or more servo values to joint angles (radians).
 *
 * Servo range: 500–2500  →  ±90° (±π/2) around init_angle.
 * Midpoint 1500 = zero offset from init_angle.
 */
export function servosToAngles(config: LegFKConfig, servoValues: number[]): number[] {
  const m = config.mirror;
  const angles: number[] = [];
  for (let i = 0; i < servoValues.length; i++) {
    const delta = servoValues[i] - 1500;
    let deltaRadius = (delta / 2000) * Math.PI;
    if (config.joints[i].revert) {
      deltaRadius *= -1;
    }
    const initRadius = config.joints[i].init_angle * Math.PI / 180;
    angles.push(m * initRadius + deltaRadius);
  }
  return angles;
}

/**
 * Compute leg-local tip position from servo values.
 *
 * Returns the tip position relative to the leg attachment point
 * (leg.mesh origin = body perimeter attach point).
 * Does NOT include the body-to-world transform.
 */
export function forwardKinematics(
  config: LegFKConfig,
  servoValues: number[],
): { x: number; y: number; z: number } {
  const m = config.mirror;
  const angles = servosToAngles(config, servoValues);
  const n = angles.length;
  if (n === 0) return { x: 0, y: 0, z: 0 };

  const theta0 = angles[0]; // yaw angle
  const cosYaw = Math.cos(theta0);
  const sinYaw = Math.sin(theta0);

  // Coxa (joint 0): direction = (m·cos(θ₀), 0, -m·sin(θ₀))
  const L0 = config.joints[0].length;
  let tipX = L0 * m * cosYaw;
  let tipY = 0;
  let tipZ = -L0 * m * sinYaw;

  // Joints 1..N-1 (pitch): direction = m·(cos(θ₀)·cos(Σβ), sin(Σβ), -sin(θ₀)·cos(Σβ))
  let cumulativePitch = 0;
  for (let k = 1; k < n; k++) {
    cumulativePitch += angles[k];
    const cosPitch = Math.cos(cumulativePitch);
    const sinPitch = Math.sin(cumulativePitch);
    const L = config.joints[k].length;
    tipX += L * m * cosYaw * cosPitch;
    tipY += L * m * sinPitch;
    tipZ += -L * m * sinYaw * cosPitch;
  }

  return { x: tipX, y: tipY, z: tipZ };
}
