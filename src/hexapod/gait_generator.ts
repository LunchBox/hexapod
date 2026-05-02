// ── Types ───────────────────────────────────────────────────────

export type Group = number[];
export type Gait = Group[];

// ── Preset-based gait provider ──────────────────────────────────

import { getPresetGaits } from './gait_configs.js';

export function generateAllGaits(
  n: number,
  _leftLegs?: number[],
  _rightLegs?: number[],
  _centerLeg?: number | null,
): Record<string, Gait> {
  return getPresetGaits(n);
}
