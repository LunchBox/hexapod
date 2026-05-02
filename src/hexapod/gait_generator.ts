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

// ── Quick-relift filter ─────────────────────────────────────────

// Reject gaits where any leg is put down for only 1 step before
// being lifted again — including across the cycle boundary (last
// step → first step). Only triggers when a leg is lifted ≥2 times
// per cycle; single-lift legs have one continuous ground period.
function hasQuickRelift(gait: Gait, n: number): boolean {
  const m = gait.length;
  for (let leg = 0; leg < n; leg++) {
    const pattern = gait.map(g => g.includes(leg) ? 1 : 0);
    const liftCount = pattern.reduce((s, v) => s + v, 0);
    if (liftCount <= 1) continue;
    for (let i = 0; i < m; i++) {
      const prev = pattern[(i - 1 + m) % m];
      const curr = pattern[i];
      const next = pattern[(i + 1) % m];
      if (prev === 1 && curr === 0 && next === 1) return true;
    }
  }
  return false;
}

// Reject gaits where a leg is lifted in consecutive steps
// (including first+last), meaning it never gets a ground period
// between lifts — the leg stays up across the step boundary.
function hasConsecutiveLifts(gait: Gait, n: number): boolean {
  const m = gait.length;
  for (let leg = 0; leg < n; leg++) {
    const pattern = gait.map(g => g.includes(leg) ? 1 : 0);
    for (let i = 0; i < m; i++) {
      if (pattern[i] === 1 && pattern[(i + 1) % m] === 1) return true;
    }
  }
  return false;
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

  // Filter presets: balance + no consecutive lifts + no quick-relift
  const filtered: Record<string, Gait> = {};
  for (const [name, gait] of Object.entries(presets)) {
    if (hasConsecutiveLifts(gait, n)) continue;
    if (hasQuickRelift(gait, n)) continue;
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
