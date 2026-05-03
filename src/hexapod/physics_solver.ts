import { PosCalculator, PosResult } from './pos_calculator.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export interface PhysicsSolverResult {
  success: boolean;
  /** Target servo values: [legIdx][jointIdx] -> servo value */
  servoTargets: number[][];
  /** Per-leg IK results for diagnostics */
  legResults: PosResult[];
  /** Indices of legs whose servos stalled (distance > threshold) */
  stalledLegs: number[];
}

export class PhysicsSolver {

  /**
   * Run single-leg IK for every leg to reach the given world-space targets.
   *
   * @param stallThreshold  If > 0, a leg whose final distance exceeds this
   *   value is considered "stalled" — its current servo values are kept
   *   instead of applying the best-effort solution.  Default 0 (no stall).
   * @param groundConstraint  If true, penalizes tip.y < 0 (rigid ground).
   */
  static solveAll(
    bot: any,
    targets: any[],
    stallThreshold = 0,
    groundConstraint = true,
  ): PhysicsSolverResult {
    const totalLegs = bot.legs.length;
    const servoTargets: number[][] = [];
    const legResults: PosResult[] = [];
    const stalledLegs: number[] = [];
    let allOk = true;

    for (let i = 0; i < totalLegs; i++) {
      const leg = bot.legs[i];
      const calc = new PosCalculator(leg, targets[i], leg._home_servos, undefined, groundConstraint);
      const result = calc.run();

      if (stallThreshold > 0 && result.distance > stallThreshold) {
        // Stall: keep current servo values, don't apply best-effort
        const currentServos: number[] = [];
        for (let j = 0; j < leg.joint_count; j++) {
          currentServos.push(leg.limbs[j].servo_value);
        }
        servoTargets.push(currentServos);
        stalledLegs.push(i);
        allOk = false;
      } else {
        servoTargets.push(result.values);
        if (!result.success) allOk = false;
        for (const v of result.values) {
          if (v < SERVO_MIN_VALUE || v > SERVO_MAX_VALUE) allOk = false;
        }
      }
      legResults.push(result);
    }

    return { success: allOk, servoTargets, legResults, stalledLegs };
  }
}
