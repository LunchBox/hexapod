// ── Types ───────────────────────────────────────────────────────

export type Group = number[];
export type Gait = Group[];

// ── Math helpers ────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return Math.abs(a);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

// ── Combinatorial generators ────────────────────────────────────

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  if (arr.length < k) return;
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// ── Phase validity ──────────────────────────────────────────────

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

// ── Cyclic canonical form ───────────────────────────────────────

function canonicalKey(gait: Gait): string {
  const n = gait.length;
  let best: string | null = null;
  for (let rot = 0; rot < n; rot++) {
    const rotated = [...gait.slice(rot), ...gait.slice(0, rot)];
    const key = rotated.map(g => [...g].sort((a, b) => a - b).join(',')).join('|');
    if (best === null || key < best) best = key;
  }
  return best!;
}

// ── Naming ──────────────────────────────────────────────────────

const K_PREFIXES: Record<number, string> = {
  1: 'wave',
  2: 'ripple',
  3: 'tripod',
  4: 'quad',
};

function gaitName(k: number, index: number): string {
  const prefix = K_PREFIXES[k] || `k${k}`;
  return index === 0 ? prefix : `${prefix}-${index + 1}`;
}

// ── Main: generate all gaits for a given k ──────────────────────

export function generateForK(
  n: number,
  k: number,
  leftLegs: Set<number>,
  rightLegs: Set<number>,
  centerLeg: number | null,
): Gait[] {
  if (k < 1 || k >= n) return [];

  const liftsPerLeg = lcm(n, k) / n;
  const numSteps = lcm(n, k) / k;
  const allLegs = Array.from({ length: n }, (_, i) => i);

  const allSequences: Gait[] = [];
  const legCounts = new Array(n).fill(0);

  function backtrack(current: Gait) {
    const stepIdx = current.length;
    if (stepIdx === numSteps) {
      if (legCounts.every(c => c === liftsPerLeg)) {
        allSequences.push(current.map(g => [...g]));
      }
      return;
    }

    // Available legs: those with remaining capacity
    const available = allLegs.filter(l => legCounts[l] < liftsPerLeg);
    if (available.length < k) return;

    // Pruning: legs that MUST be selected in remaining steps to reach target
    const stepsLeft = numSteps - stepIdx;
    const forced = available.filter(l => legCounts[l] + stepsLeft === liftsPerLeg);
    if (forced.length > k) return; // impossible: more forced legs than available slots
    // Legs that cannot possibly reach their target
    if (available.some(l => legCounts[l] + stepsLeft < liftsPerLeg)) return;

    for (const combo of combinations(available, k)) {
      // Must include all forced legs
      if (forced.some(l => !combo.includes(l))) continue;

      const liftedSet = new Set(combo);
      if (!isValidPhase(liftedSet, allLegs, leftLegs, rightLegs, centerLeg)) continue;

      for (const l of combo) legCounts[l]++;
      current.push(combo);

      backtrack(current);

      current.pop();
      for (const l of combo) legCounts[l]--;
    }
  }

  backtrack([]);

  // Deduplicate cyclic rotations
  const unique = new Map<string, Gait>();
  for (const gait of allSequences) {
    const key = canonicalKey(gait);
    if (!unique.has(key)) {
      unique.set(key, gait);
    }
  }

  return Array.from(unique.values());
}

// ── Main: generate all gaits for all k ──────────────────────────

export function generateAllGaits(
  n: number,
  leftLegs: number[],
  rightLegs: number[],
  centerLeg: number | null,
): Record<string, Gait> {
  const leftSet = new Set(leftLegs);
  const rightSet = new Set(rightLegs);
  const allGaits: Record<string, Gait> = {};

  for (let k = 1; k <= n - 2; k++) {
    const gaits = generateForK(n, k, leftSet, rightSet, centerLeg);
    gaits.forEach((gait, idx) => {
      allGaits[gaitName(k, idx)] = gait;
    });
  }

  // Safety: always produce at least one gait
  if (Object.keys(allGaits).length === 0) {
    allGaits['wave'] = Array.from({ length: n }, (_, i) => [i]);
  }

  return allGaits;
}
