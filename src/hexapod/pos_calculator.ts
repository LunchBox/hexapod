import { getWorldPosition } from './utils.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export interface PosResult {
  success: boolean;
  distance: number;
  iterations: number;
  values: number[];
}

const REG_STRENGTH = 0.05; // pull toward init per iteration
const GROUND_PENALTY = 50;   // per-unit penalty when tip penetrates ground

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
    // Original Three.js scene-graph path
    this.leg.set_servo_values(values);
    const c = getWorldPosition(this.leg.bot.mesh, this.leg.tip);
    const t = this.target_tip_pos;
    let dist = Math.sqrt((t.x - c.x) ** 2 + (t.y - c.y) ** 2 + (t.z - c.z) ** 2);
    return this._apply_ground_penalty(c.y, dist);
  }

  run(): PosResult {
    const n = this.joint_count;
    const DIST_ERROR = 0.01;
    const MAX_LOOPS = 300;
    const STEP_DECAY = 0.85;
    const MIN_STEP = 5;
    const MAIN_REG   = 0.05;  // main loop: strong enough to resist drift, weak enough to converge
    const CLEANUP_REG = 0.20;  // cleanup: aggressive snap to home
    const REDUNDANT_GRAD_THRESHOLD = 2.5;  // |gradient| below this in cleanup → redundant

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

    // ── Main loop: gradient descent with constant moderate regularization ──
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
          values[i] -= MAIN_REG * (values[i] - this.initValues[i]);
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

    // ── Cleanup: gradient-based null-space projection ──
    // After the tip reaches the target, snap redundant DOFs to home.
    // Use the gradient magnitude to decide: joints with |gradient| below
    // threshold barely affect the tip → safe to pull hard toward home.
    // Primary DOFs get only weak reg + gradient correction to micro-adjust.
    if (this.initValues && bestDist < 5.0) {
      values = [...bestValues];
      dist = bestDist;
      const cStep = Math.max(3, step);
      const cSpeeds: number[] = new Array(n).fill(0);
      const cLastGrad: number[] = new Array(n).fill(0);

      for (let c = 0; c < 20 && count < MAX_LOOPS; c++) {
        const gradients: number[] = [];
        for (let i = 0; i < n; i++) {
          const plus = [...values];
          plus[i] = Math.min(SERVO_MAX_VALUE, plus[i] + cStep);
          const minus = [...values];
          minus[i] = Math.max(SERVO_MIN_VALUE, minus[i] - cStep);
          gradients.push(this.calc_distance(plus) - this.calc_distance(minus));
        }

        for (let i = 0; i < n; i++) {
          if (Math.sign(cLastGrad[i]) !== Math.sign(gradients[i])) {
            cSpeeds[i] = 0;
          } else {
            cSpeeds[i] += gradients[i];
          }
          cLastGrad[i] = gradients[i];
          values[i] -= cSpeeds[i];
          if (this.initValues) {
            const reg = Math.abs(gradients[i]) < REDUNDANT_GRAD_THRESHOLD
              ? CLEANUP_REG        // redundant — snap to home
              : CLEANUP_REG * 0.12; // primary — gentle pull, let gradient correct
            values[i] -= reg * (values[i] - this.initValues[i]);
          }
          values[i] = Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, values[i]));
        }

        dist = this.calc_distance(values);

        if (dist < bestDist * 1.3 && dist < 3.0) {
          bestDist = dist;
          bestValues = [...values];
        }

        count++;
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
