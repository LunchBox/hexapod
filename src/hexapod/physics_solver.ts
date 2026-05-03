import { PosCalculator, PosResult } from './pos_calculator.js';
import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from './defaults.js';

export interface PhysicsSolverResult {
  success: boolean;
  /** Target servo values: [legIdx][jointIdx] -> servo value */
  servoTargets: number[][];
  /** Per-leg IK results for diagnostics */
  legResults: PosResult[];
}

export class PhysicsSolver {

  /**
   * Run single-leg IK for every leg to reach the given world-space targets.
   * The caller must have already moved the body (mesh or body_mesh) to the
   * target pose.  Returns servo targets that satisfy all constraints, or
   * marks success=false if any leg failed.
   */
  static solveAll(bot: any, targets: any[]): PhysicsSolverResult {
    const totalLegs = bot.legs.length;
    const servoTargets: number[][] = [];
    const legResults: PosResult[] = [];
    let allOk = true;

    for (let i = 0; i < totalLegs; i++) {
      const leg = bot.legs[i];
      const calc = new PosCalculator(leg, targets[i], leg._home_servos);
      const result = calc.run();
      servoTargets.push(result.values);
      legResults.push(result);

      if (!result.success) allOk = false;
      for (const v of result.values) {
        if (v < SERVO_MIN_VALUE || v > SERVO_MAX_VALUE) allOk = false;
      }
    }

    return { success: allOk, servoTargets, legResults };
  }
}
