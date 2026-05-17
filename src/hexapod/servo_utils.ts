import { DEFAULT_FRAMES_INTERVAL, SERVO_VALUE_TIME_UNIT } from './defaults';

/** Maximum absolute difference between two servo value arrays. */
export function computeMaxDelta(a: number[], b: number[]): number {
  let maxDelta = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i]));
  }
  return maxDelta;
}

/**
 * Hold time based on servo speed (servo_constraint mode).
 * Time for slowest servo to reach target at constant rotation speed.
 */
export function computeServoSpeedHoldTime(
  maxDelta: number,
  servoSpeed: number,
): number {
  const ms = (maxDelta / (servoSpeed || 2000)) * 1000;
  return Math.max(DEFAULT_FRAMES_INTERVAL, Math.round(ms));
}

/**
 * Hold time based on fixed time-per-unit (none physics mode).
 * Each servo value unit takes a fixed amount of time.
 */
export function computeFixedUnitHoldTime(maxDelta: number): number {
  return Math.max(DEFAULT_FRAMES_INTERVAL, Math.round(maxDelta * SERVO_VALUE_TIME_UNIT));
}
