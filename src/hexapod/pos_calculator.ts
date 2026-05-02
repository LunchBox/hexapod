import { getWorldPosition } from './utils.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export interface PosResult {
  success: boolean;
  distance: number;
  iterations: number;
  values: number[];
}

export class PosCalculator {
  leg: any;
  joint_count: number;
  target_tip_pos: any;

  constructor(hexapod_leg: any, target_tip_pos: any) {
    this.leg = hexapod_leg;
    this.joint_count = hexapod_leg.joint_count || 3;
    this.target_tip_pos = target_tip_pos;
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
    const LEARNING_RATE = 0.5;
    const MOMENTUM_BETA = 0.8;
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
    const momentums: number[] = new Array(n).fill(0);
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

      // Update with momentum + clamp
      for (let i = 0; i < n; i++) {
        if (Math.sign(lastGradients[i]) !== Math.sign(gradients[i])) {
          step = Math.max(MIN_STEP, step * STEP_DECAY);
        }
        lastGradients[i] = gradients[i];
        momentums[i] = MOMENTUM_BETA * momentums[i] + (1 - MOMENTUM_BETA) * gradients[i];
        values[i] -= LEARNING_RATE * momentums[i];
        // Clamp instead of break — never leave a leg stuck mid-optimization
        values[i] = Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, Math.round(values[i])));
      }

      dist = this.calc_distance(values);

      if (dist < bestDist) {
        bestDist = dist;
        bestValues = [...values];
      }

      count++;
    }

    // Always use best solution found, even if not fully converged
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
