// ── Types ───────────────────────────────────────────────────────

export type Group = number[];
export type Gait = Group[];

// ── Preset-based gait provider ──────────────────────────────────

import { getPresetGaits } from './gait_configs.js';

// ── Phase validation ────────────────────────────────────────────

function isValidPhase(
  lifted: Set<number>,
  allLegs: number[],
  leftLegs: Set<number>,
  rightLegs: Set<number>,
  centerLeg: number | null,
): boolean {
  const groundLegs = allLegs.filter(l => !lifted.has(l));
  if (groundLegs.length < 2) return false;

  let rG = 0, lG = 0, cG = 0;
  for (const l of groundLegs) {
    if (rightLegs.has(l)) rG++;
    else if (leftLegs.has(l)) lG++;
    else if (l === centerLeg) cG = 1;
  }
  return (rG > 0 && lG > 0) || cG > 0;
}

// ── Main ────────────────────────────────────────────────────────

export function generateAllGaits(
  n: number,
  leftLegs?: number[],
  rightLegs?: number[],
  centerLeg?: number | null,
): Record<string, Gait> {
  const presets = getPresetGaits(n);

  // If no side info provided, return all presets unfiltered
  if (!leftLegs || !rightLegs) return presets;

  const leftSet = new Set(leftLegs);
  const rightSet = new Set(rightLegs);
  const allLegs = Array.from({ length: n }, (_, i) => i);
  const center: number | null = centerLeg ?? null;

  // Filter presets: every phase must satisfy balance constraint
  const filtered: Record<string, Gait> = {};
  for (const [name, gait] of Object.entries(presets)) {
    let valid = true;
    for (const group of gait) {
      if (!isValidPhase(new Set(group), allLegs, leftSet, rightSet, center)) {
        valid = false;
        break;
      }
    }
    if (valid) filtered[name] = gait;
  }

  // Safety: always produce at least one gait
  if (Object.keys(filtered).length === 0) {
    filtered['wave'] = Array.from({ length: n }, (_, i) => [i]);
  }

  return filtered;
}
