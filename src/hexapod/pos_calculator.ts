import { getWorldPosition } from './utils.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export interface PosResult {
  success: boolean;
  distance: number;
  iterations: number;
  values: number[];
}

const REG_STRENGTH = 0.002; // tiny pull toward init per iteration

export class PosCalculator {
  leg: any;
  joint_count: number;
  target_tip_pos: any;
  initValues: number[] | null;

  constructor(hexapod_leg: any, target_tip_pos: any, initValues?: number[]) {
    this.leg = hexapod_leg;
    this.joint_count = hexapod_leg.joint_count || 3;
    this.target_tip_pos = target_tip_pos;
    this.initValues = initValues && initValues.length === this.joint_count ? initValues : null;
  }

  calc_distance(values: number[]) {
    this.leg.set_servo_values(values);
    const c = getWorldPosition(this.leg.bot.mesh, this.leg.tip);
    const t = this.target_tip_pos;
    return Math.sqrt((t.x - c.x) ** 2 + (t.y - c.y) ** 2 + (t.z - c.z) ** 2);
  }

  run(): PosResult {
    const n = this.joint_count;
    const DIST_ERROR = 0.01;
    const MAX_LOOPS = 300;
    const STEP_DECAY = 0.85;
    const MIN_STEP = 5;

    let values: number[] = [];
    for (let i = 0; i < n; i++) {
      values.push(this.leg.limbs[i].servo_value);
    }

    let dist = this.calc_distance(values);
    let bestValues = [...values];
    let bestDist = dist;
    let step = 30;
    const speeds: number[] = new Array(n).fill(0);
    const lastGradients: number[] = new Array(n).fill(0);
    let count = 0;

    while (dist > DIST_ERROR && count < MAX_LOOPS) {
      // Central finite differences — no trig, purely numerical
      const gradients: number[] = [];
      for (let i = 0; i < n; i++) {
        const plus = [...values];
        plus[i] = Math.min(SERVO_MAX_VALUE, plus[i] + step);
        const minus = [...values];
        minus[i] = Math.max(SERVO_MIN_VALUE, minus[i] - step);
        gradients.push(this.calc_distance(plus) - this.calc_distance(minus));
      }

      // Update each joint — gradient descent + regularization pull toward init
      for (let i = 0; i < n; i++) {
        if (Math.sign(lastGradients[i]) !== Math.sign(gradients[i])) {
          speeds[i] = 0;
          step = Math.max(MIN_STEP, step * STEP_DECAY);
        } else {
          speeds[i] += gradients[i];
        }
        lastGradients[i] = gradients[i];
        values[i] -= speeds[i];
        // Regularization: tiny pull toward initial servo value
        // Redundant DOFs (weak position gradient) drift back to init;
        // primary DOFs are dominated by the much stronger position signal
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

    // Apply best solution with final rounding
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
