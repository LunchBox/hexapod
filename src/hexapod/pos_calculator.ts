import { getWorldPosition } from './utils.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export class PosCalculator {
  leg: any;
  original_values: number[];
  joint_count: number;
  target_tip_pos: any;

  constructor(hexapod_leg: any, target_tip_pos: any) {
    this.leg = hexapod_leg;
    this.joint_count = hexapod_leg.joint_count || 3;

    this.original_values = [];
    for (let i = 0; i < this.joint_count; i++) {
      this.original_values.push(this.leg.limbs[i].servo_value);
    }

    this.target_tip_pos = target_tip_pos;
  }

  calc_distance(values: number[]) {
    this.leg.set_servo_values(values);

    let c = getWorldPosition(this.leg.bot.mesh, this.leg.tip);
    let t = this.target_tip_pos;

    return Math.sqrt(Math.pow(t.x - c.x, 2) + Math.pow(t.y - c.y, 2) + Math.pow(t.z - c.z, 2));
  }

  run() {
    const n = this.joint_count;
    let values: number[] = [];
    for (let i = 0; i < n; i++) {
      values.push(this.leg.limbs[i].servo_value);
    }

    let dist = this.calc_distance(values);

    let count = 0;
    const step = 20;
    const max_loops = 200;
    const dist_error = 0.01;

    let last_gradients: number[] = new Array(n).fill(0);
    let speeds: number[] = new Array(n).fill(0);

    let success = true;

    while (dist > dist_error && count < max_loops) {
      // Compute gradients for each joint
      let gradients: number[] = [];
      for (let i = 0; i < n; i++) {
        let plus = [...values];
        plus[i] += step;
        let minus = [...values];
        minus[i] -= step;
        gradients.push(this.calc_distance(plus) - this.calc_distance(minus));
      }

      // Update each joint value with momentum + backtrack
      for (let i = 0; i < n; i++) {
        if (Math.sign(last_gradients[i]) !== Math.sign(gradients[i])) {
          values[i] -= speeds[i] * last_gradients[i] / (gradients[i] - last_gradients[i]);
          speeds[i] = 0;
        } else {
          speeds[i] += gradients[i];
        }
        last_gradients[i] = gradients[i];

        values[i] -= speeds[i];
      }

      // Check bounds
      let out_of_bounds = false;
      for (let i = 0; i < n; i++) {
        if (values[i] < SERVO_MIN_VALUE || values[i] > SERVO_MAX_VALUE) {
          out_of_bounds = true;
          break;
        }
      }
      if (out_of_bounds) break;

      dist = this.calc_distance(values);
      count++;
    }

    if (dist > dist_error) {
      success = false;
      this.calc_distance(this.original_values);
    } else {
      let rounded = values.map(v => Math.round(v));
      this.calc_distance(rounded);
    }

    return success;
  }
}
