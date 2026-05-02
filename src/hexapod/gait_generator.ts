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

// ── Quick-relift filter ─────────────────────────────────────────

// Filter gaits where a leg is put down for only 1 step before being
// lifted again within the same cycle. Only applies when a leg appears
// more than once per cycle (liftsPerLeg >= 2), e.g. k=4 with n=6.
function hasQuickRelift(gait: Gait, n: number): boolean {
  const m = gait.length;
  for (let leg = 0; leg < n; leg++) {
    const pattern = gait.map(g => g.includes(leg) ? 1 : 0);
    const liftCount = pattern.reduce((s, v) => s + v, 0);
    if (liftCount <= 1) continue; // lifted once per cycle, always fine
    // Check for isolated ground (1,0,1 pattern cyclically)
    for (let i = 0; i < m; i++) {
      const prev = pattern[(i - 1 + m) % m];
      const curr = pattern[i];
      const next = pattern[(i + 1) % m];
      if (prev === 1 && curr === 0 && next === 1) {
        return true;
      }
    }
  }
  return false;
}

// ── Wave-only generator (k=1, canonical direct) ──────────────────

// For k=1, generate directly in canonical form (leg 0 first) so no
// cyclic dedup is needed. Used for n > 6 where full backtracking
// would explode. Permutes legs 1..n-1 and validates each phase.
function generateWaveGaits(
  n: number,
  leftLegs: Set<number>,
  rightLegs: Set<number>,
  centerLeg: number | null,
): Gait[] {
  const allLegs = Array.from({ length: n }, (_, i) => i);
  const remaining = allLegs.slice(1); // legs 1..n-1
  const results: Gait[] = [];

  function* permute<T>(arr: T[]): Generator<T[]> {
    if (arr.length <= 1) { yield arr; return; }
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of permute(rest)) {
        yield [arr[i], ...p];
      }
    }
  }

  for (const perm of permute(remaining)) {
    const gait: Gait = [[0], ...perm.map(l => [l])];
    let valid = true;
    for (const g of gait) {
      if (!isValidPhase(new Set(g), allLegs, leftLegs, rightLegs, centerLeg)) {
        valid = false;
        break;
      }
    }
    if (valid) results.push(gait);
  }

  return results;
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

  // For n > 6, only generate k=1 (wave) to avoid backtracking explosion
  // from k=2,3. Wave gaits use canonical direct generation — fast.
  if (n > 6) {
    const gaits = generateWaveGaits(n, leftSet, rightSet, centerLeg);
    gaits.forEach((gait, idx) => {
      allGaits[gaitName(1, idx)] = gait;
    });
    if (Object.keys(allGaits).length === 0) {
      allGaits['wave'] = Array.from({ length: n }, (_, i) => [i]);
    }
    return allGaits;
  }

  for (let k = 1; k <= Math.min(3, n - 2); k++) {
    const gaits = generateForK(n, k, leftSet, rightSet, centerLeg)
      .filter(g => !hasQuickRelift(g, n));
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
