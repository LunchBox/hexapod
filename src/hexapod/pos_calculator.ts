import { getWorldPosition } from './utils.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export interface PosResult {
  success: boolean;
  distance: number;
  iterations: number;
  values: number[];
}

const REG_STRENGTH = 0.05;
const GROUND_PENALTY = 50;

export class PosCalculator {
  leg: any;
  joint_count: number;
  target_tip_pos: any;
  initValues: number[] | null;
  _tipFn: ((values: number[]) => { x: number; y: number; z: number }) | null;
  _groundConstraint: boolean;

  constructor(
    hexapod_leg: any,
    target_tip_pos: any,
    initValues?: number[],
    tipFn?: (values: number[]) => { x: number; y: number; z: number },
    groundConstraint?: boolean,
  ) {
    this.leg = hexapod_leg;
    this.joint_count = hexapod_leg?.joint_count || (initValues?.length ?? 3);
    this.target_tip_pos = target_tip_pos;
    this.initValues = initValues && initValues.length === this.joint_count ? initValues : null;
    this._tipFn = tipFn || null;
    this._groundConstraint = groundConstraint ?? true;
  }

  private _apply_ground_penalty(tipY: number, dist: number): number {
    if (this._groundConstraint && tipY < 0) {
      return dist + Math.abs(tipY) * GROUND_PENALTY;
    }
    return dist;
  }

  calc_distance(values: number[]) {
    if (this._tipFn) {
      const tip = this._tipFn(values);
      const t = this.target_tip_pos;
      let dist = Math.sqrt((t.x - tip.x) ** 2 + (t.y - tip.y) ** 2 + (t.z - tip.z) ** 2);
      return this._apply_ground_penalty(tip.y, dist);
    }
    this.leg.set_servo_values(values);
    const c = getWorldPosition(this.leg.bot.mesh, this.leg.tip);
    const t = this.target_tip_pos;
    let dist = Math.sqrt((t.x - c.x) ** 2 + (t.y - c.y) ** 2 + (t.z - c.z) ** 2);
    return this._apply_ground_penalty(c.y, dist);
  }

  /** Return 3D tip world position for the given servo values. */
  private _get_tip_pos(values: number[]): { x: number; y: number; z: number } {
    if (this._tipFn) return this._tipFn(values);
    this.leg.set_servo_values(values);
    return getWorldPosition(this.leg.bot.mesh, this.leg.tip);
  }

  /** Analytical inverse of a 3×3 matrix (row-major: r0c0,r0c1,r0c2, r1c0,…). */
  private _invert3x3(m: number[]): number[] {
    const a = m[0], b = m[1], c = m[2];
    const d = m[3], e = m[4], f = m[5];
    const g = m[6], h = m[7], i = m[8];
    const det = a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g);
    if (Math.abs(det) < 1e-12) return [1,0,0, 0,1,0, 0,0,1]; // singular → identity
    const invDet = 1 / det;
    return [
      (e*i - f*h)*invDet, (c*h - b*i)*invDet, (b*f - c*e)*invDet,
      (f*g - d*i)*invDet, (a*i - c*g)*invDet, (c*d - a*f)*invDet,
      (d*h - e*g)*invDet, (b*g - a*h)*invDet, (a*e - b*d)*invDet,
    ];
  }

  /** Jacobian-based null-space projection.
   *
   *  Builds the 3×N Jacobian J = ∂(tip)/∂(servo) numerically (central
   *  finite differences, no trig).  Projects the homeward direction
   *  z = α·(θ_home − θ) through the null-space projector (I − J⁺J)
   *  so the correction does NOT move the tip — redundant DOFs snap
   *  to home while the tip stays locked.
   */
  private _nullspace_cleanup(values: number[], n: number): number[] {
    if (!this.initValues || n < 4) return values; // need ≥1 redundant DOF

    const STEP = 8;          // servo perturbation for finite-difference Jacobian
    const ALPHA = 0.35;      // homeward step size per iteration
    const DAMPING = 0.005;   // Tikhonov damping for pseudoinverse stability
    const ITERS = 3;

    let cur = [...values];

    for (let iter = 0; iter < ITERS; iter++) {
      // ── Build 3×N Jacobian ──
      const J: number[][] = [[], [], []];
      for (let j = 0; j < n; j++) {
        const plus = [...cur];
        plus[j] = Math.min(SERVO_MAX_VALUE, plus[j] + STEP);
        const minus = [...cur];
        minus[j] = Math.max(SERVO_MIN_VALUE, minus[j] - STEP);

        const tipP = this._get_tip_pos(plus);
        const tipM = this._get_tip_pos(minus);
        const denom = plus[j] - minus[j];  // 2*STEP, less if clamped at bounds

        J[0][j] = (tipP.x - tipM.x) / denom;
        J[1][j] = (tipP.y - tipM.y) / denom;
        J[2][j] = (tipP.z - tipM.z) / denom;
      }
      // Restore joints to current (last _get_tip_pos perturbed them)
      this._get_tip_pos(cur);

      // ── Compute J J^T (3×3) with damping ──
      const JJt = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let j = 0; j < n; j++) sum += J[r][j] * J[c][j];
          JJt[r * 3 + c] = sum + (r === c ? DAMPING : 0);
        }
      }

      const JJtInv = this._invert3x3(JJt);

      // ── Homeward direction z = ALPHA · (home − current) ──
      const z: number[] = [];
      for (let j = 0; j < n; j++) {
        z.push(ALPHA * (this.initValues![j] - cur[j]));
      }

      // ── Jz = J · z  (3×1) ──
      const Jz = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        for (let j = 0; j < n; j++) Jz[r] += J[r][j] * z[j];
      }

      // ── u = (J J^T)^(-1) · Jz  (3×1) ──
      const u = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) u[r] += JJtInv[r * 3 + c] * Jz[c];
      }

      // ── J⁺Jz = J^T · u  (N×1) ──
      const JplusJz: number[] = new Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        for (let r = 0; r < 3; r++) JplusJz[j] += J[r][j] * u[r];
      }

      // ── Pz = z − J⁺Jz  →  apply null-space homeward step ──
      for (let j = 0; j < n; j++) {
        cur[j] += z[j] - JplusJz[j];
        cur[j] = Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, cur[j]));
      }
    }

    return cur;
  }

  run(): PosResult {
    const n = this.joint_count;
    const DIST_ERROR = 0.01;
    const MAX_LOOPS = 300;
    const STEP_DECAY = 0.85;
    const MIN_STEP = 5;

    let values: number[] = [];
    if (this.initValues) {
      values = [...this.initValues];
    } else {
      for (let i = 0; i < n; i++) {
        values.push(this.leg.limbs[i].servo_value);
      }
    }

    let dist = this.calc_distance(values);
    let bestValues = [...values];
    let bestDist = dist;
    let step = 30;
    const speeds: number[] = new Array(n).fill(0);
    const lastGradients: number[] = new Array(n).fill(0);
    let count = 0;

    // ── Main loop: gradient descent with moderate regularization ──
    while (dist > DIST_ERROR && count < MAX_LOOPS) {
      const gradients: number[] = [];
      for (let i = 0; i < n; i++) {
        const plus = [...values];
        plus[i] = Math.min(SERVO_MAX_VALUE, plus[i] + step);
        const minus = [...values];
        minus[i] = Math.max(SERVO_MIN_VALUE, minus[i] - step);
        gradients.push(this.calc_distance(plus) - this.calc_distance(minus));
      }

      for (let i = 0; i < n; i++) {
        if (Math.sign(lastGradients[i]) !== Math.sign(gradients[i])) {
          speeds[i] = 0;
          step = Math.max(MIN_STEP, step * STEP_DECAY);
        } else {
          speeds[i] += gradients[i];
        }
        lastGradients[i] = gradients[i];
        values[i] -= speeds[i];
        if (this.initValues) {
          values[i] -= REG_STRENGTH * (values[i] - this.initValues[i]);
        }
        values[i] = Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, values[i]));
      }

      dist = this.calc_distance(values);

      if (dist < bestDist) {
        bestDist = dist;
        bestValues = [...values];
      }

      count++;
    }

    // ── Fine-tuning: constant small step, higher regularization ──
    // After the tip converges, run extra iterations with fixed small
    // step so every solve reaches the same gradient–regularization
    // equilibrium.  The small step prevents overshoot while the
    // stronger reg pulls the solution consistently toward home.
    const FINE_REG = 0.15;
    const FINE_STEP = 3;
    const FINE_LOOPS = 20;
    if (this.initValues && bestDist < 5.0) {
      for (let c = 0; c < FINE_LOOPS && count < MAX_LOOPS; c++) {
        const gradients: number[] = [];
        for (let i = 0; i < n; i++) {
          const plus = [...values];
          plus[i] = Math.min(SERVO_MAX_VALUE, plus[i] + FINE_STEP);
          const minus = [...values];
          minus[i] = Math.max(SERVO_MIN_VALUE, minus[i] - FINE_STEP);
          gradients.push(this.calc_distance(plus) - this.calc_distance(minus));
        }

        for (let i = 0; i < n; i++) {
          // Small constant learning rate — no speeds accumulation
          values[i] -= gradients[i] * 0.15;
          if (this.initValues) {
            values[i] -= FINE_REG * (values[i] - this.initValues[i]);
          }
          values[i] = Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, values[i]));
        }

        dist = this.calc_distance(values);

        if (dist < bestDist * 1.2 || dist < 2.0) {
          if (dist < bestDist) bestDist = dist;
          bestValues = [...values];
        }

        count++;
      }
    }

    // ── Jacobian null-space cleanup (for legs with ≥4 DOF) ──
    if (this.initValues && bestDist < 5.0 && n >= 4) {
      const cleaned = this._nullspace_cleanup(bestValues, n);
      const cleanedDist = this.calc_distance(cleaned);

      if (cleanedDist < bestDist * 1.5 && cleanedDist < 3.0) {
        bestValues = cleaned;
        bestDist = cleanedDist;
      }
    }

    const rounded = bestValues.map(v => Math.round(v));
    const finalDist = this.calc_distance(rounded);

    return {
      success: finalDist < 1.0,
      distance: finalDist,
      iterations: count,
      values: rounded,
    };
  }
}
