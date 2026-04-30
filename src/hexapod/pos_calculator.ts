import { getWorldPosition } from './utils.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export class PosCalculator {
  leg: any;
  ori_a: number;
  ori_b: number;
  ori_c: number;
  target_tip_pos: any;

  constructor(hexapod_leg: any, target_tip_pos: any) {
    this.leg = hexapod_leg;

    this.ori_a = this.leg.limbs[0].servo_value;
    this.ori_b = this.leg.limbs[1].servo_value;
    this.ori_c = this.leg.limbs[2].servo_value;

    this.target_tip_pos = target_tip_pos;
  }

  calc_distance(coxa_value: number, femur_value: number, tibia_value: number) {
    this.leg.set_servo_values([coxa_value, femur_value, tibia_value]);

    let c = getWorldPosition(this.leg.bot.mesh, this.leg.tip);
    let t = this.target_tip_pos;

    return Math.sqrt(Math.pow(t.x - c.x, 2) + Math.pow(t.y - c.y, 2) + Math.pow(t.z - c.z, 2));
  }

  run() {
    let a = this.leg.limbs[0].servo_value;
    let b = this.leg.limbs[1].servo_value;
    let c = this.leg.limbs[2].servo_value;

    let dist = this.calc_distance(a, b, c);

    let count = 0;
    let step = 20;
    let max_loops = 200;
    let last_gradient_a = 0;
    let last_gradient_b = 0;
    let last_gradient_c = 0;
    let speed_a = 0;
    let speed_b = 0;
    let speed_c = 0;

    let success = true;
    let dist_error = 0.01;

    while (dist > dist_error && count < max_loops) {
      let gradient_a = this.calc_distance(a + step, b, c) - this.calc_distance(a - step, b, c);
      let gradient_b = this.calc_distance(a, b + step, c) - this.calc_distance(a, b - step, c);
      let gradient_c = this.calc_distance(a, b, c + step) - this.calc_distance(a, b, c - step);

      if (Math.sign(last_gradient_a) !== Math.sign(gradient_a)) {
        a -= speed_a * last_gradient_a / (gradient_a - last_gradient_a);
        speed_a = 0;
      } else {
        speed_a += gradient_a;
      }
      last_gradient_a = gradient_a;

      if (Math.sign(last_gradient_b) !== Math.sign(gradient_b)) {
        b -= speed_b * last_gradient_b / (gradient_b - last_gradient_b);
        speed_b = 0;
      } else {
        speed_b += gradient_b;
      }
      last_gradient_b = gradient_b;

      if (Math.sign(last_gradient_c) !== Math.sign(gradient_c)) {
        c -= speed_c * last_gradient_c / (gradient_c - last_gradient_c);
        speed_c = 0;
      } else {
        speed_c += gradient_c;
      }
      last_gradient_c = gradient_c;

      a -= speed_a;
      b -= speed_b;
      c -= speed_c;

      if (a < SERVO_MIN_VALUE || b < SERVO_MIN_VALUE || c < SERVO_MIN_VALUE || a > SERVO_MAX_VALUE || b > SERVO_MAX_VALUE || c > SERVO_MAX_VALUE) {
        break;
      }

      dist = this.calc_distance(a, b, c);
      count++;
    }

    if (dist > dist_error) {
      success = false;
      this.calc_distance(this.ori_a, this.ori_b, this.ori_c);
    } else {
      this.calc_distance(Math.round(a), Math.round(b), Math.round(c));
    }

    return success;
  }
}
