// ── Preset gait configurations by leg count ──────────────────────
//
// Each gait is an ordered sequence of leg-index groups; legs in the
// same group lift simultaneously.
//
// Constraints:
//   max k = floor(N/2) — at least half the legs stay grounded
//   no quick-relift — a leg is never put down for only 1 step then
//     lifted again (no isolated 0s in the cyclic lift pattern)
//
// Naming: {prefix}[-variant]
//   wave-*    — k=1 (one leg at a time)
//   ripple-*  — k=2 (pairs)
//   tripod-*  — k=3
//   quad-*    — k=4
//
// Chain patterns (used when k ∤ N): adjacent steps overlap by k-1
// legs, ensuring each leg's lifts are consecutive in the cycle.

export type Group = number[];
export type Gait = Group[];

// ── Chain pattern helpers ────────────────────────────────────────

/** Build a chain gait: step i lifts k legs starting at i (mod n). */
function chain(n: number, k: number): Gait {
  const steps = lcmSteps(n, k);
  return Array.from({ length: steps }, (_, i) =>
    Array.from({ length: k }, (_, j) => (i + j) % n)
  );
}

function lcmSteps(n: number, k: number): number {
  const g = gcd(n, k);
  return n / g;
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return Math.abs(a);
}

// ── Presets ──────────────────────────────────────────────────────

const PRESETS: Record<number, Record<string, Gait>> = {
  // ── 3 legs ──────────────────────────────────────────────────
  3: {
    // k=1 (max k=1)
    wave: [[0], [1], [2]],
  },

  // ── 4 legs ──────────────────────────────────────────────────
  4: {
    // k=1 — wave
    wave: [[0], [1], [2], [3]],
    'wave-lr': [[0], [2], [1], [3]],
    'wave-diag': [[0], [3], [1], [2]],

    // k=2 (max k=2) — ripple
    ripple: [[0, 1], [2, 3]],
    'ripple-lr': [[0, 2], [1, 3]],
    'ripple-cross': [[0, 3], [1, 2]],
  },

  // ── 5 legs ──────────────────────────────────────────────────
  5: {
    // k=1 — wave
    wave: [[0], [1], [2], [3], [4]],
    'wave-lr': [[0], [2], [4], [1], [3]],
    'wave-skip': [[0], [3], [1], [4], [2]],

    // k=2 (max k=2) — ripple
    ripple: [[0, 1], [2, 3], [4]],         // remainder leg 4 as solo step
    'ripple-chain': chain(5, 2),
    'ripple-skip': [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]],
  },

  // ── 6 legs ──────────────────────────────────────────────────
  6: {
    // k=1 — wave (one leg at a time, 6 steps)
    wave: [[0], [1], [2], [3], [4], [5]],
    'wave-lr': [[0], [2], [4], [1], [3], [5]],
    'wave-outer-inner': [[0], [5], [1], [4], [2], [3]],
    'wave-skip': [[0], [3], [1], [4], [2], [5]],
    'wave-rev': [[0], [5], [4], [3], [2], [1]],

    // k=2 — ripple (pairs, 3 steps)
    ripple: [[0, 1], [2, 3], [4, 5]],
    'ripple-lr': [[0, 2], [1, 4], [3, 5]],
    'ripple-diag': [[0, 5], [1, 4], [2, 3]],
    'ripple-cross': [[0, 3], [1, 5], [2, 4]],

    // k=3 (max k=3) — tripod (2 steps)
    tripod: [[0, 3, 4], [1, 2, 5]],
    'tripod-front-back': [[0, 1, 2], [3, 4, 5]],
    'tripod-lr-mix': [[0, 1, 3], [2, 4, 5]],
  },

  // ── 7 legs ──────────────────────────────────────────────────
  7: {
    // k=1 — wave
    wave: [[0], [1], [2], [3], [4], [5], [6]],
    'wave-lr': [[0], [2], [4], [6], [1], [3], [5]],

    // k=2 — ripple
    ripple: [[0, 1], [2, 3], [4, 5], [6]],   // remainder leg 6 solo
    'ripple-chain': chain(7, 2),
    'ripple-skip': [[0, 2], [2, 4], [4, 6], [6, 1], [1, 3], [3, 5], [5, 0]],

    // k=3 (max k=3) — tripod
    tripod: [[0, 1, 2], [3, 4, 5], [6]],     // remainder leg 6 solo
    'tripod-chain': chain(7, 3),
  },

  // ── 8 legs ──────────────────────────────────────────────────
  8: {
    // k=1 — wave
    wave: [[0], [1], [2], [3], [4], [5], [6], [7]],
    'wave-lr': [[0], [2], [4], [6], [1], [3], [5], [7]],
    'wave-outer-inner': [[0], [7], [1], [6], [2], [5], [3], [4]],

    // k=2 — ripple (4 steps)
    ripple: [[0, 1], [2, 3], [4, 5], [6, 7]],
    'ripple-lr': [[0, 2], [1, 3], [4, 6], [5, 7]],
    'ripple-diag': [[0, 7], [1, 6], [2, 5], [3, 4]],

    // k=3 — tripod (8 steps, liftsPerLeg=3)
    'tripod-chain': chain(8, 3),

    // k=4 (max k=4) — quad (2 steps)
    quad: [[0, 1, 2, 3], [4, 5, 6, 7]],
    'quad-lr': [[0, 2, 4, 6], [1, 3, 5, 7]],
    'quad-diag': [[0, 1, 6, 7], [2, 3, 4, 5]],
  },

  // ── 9 legs ──────────────────────────────────────────────────
  9: {
    // k=1 — wave
    wave: [[0], [1], [2], [3], [4], [5], [6], [7], [8]],
    'wave-lr': [[0], [2], [4], [6], [8], [1], [3], [5], [7]],

    // k=2 — ripple
    ripple: [[0, 1], [2, 3], [4, 5], [6, 7], [8]],   // remainder leg 8 solo
    'ripple-chain': chain(9, 2),

    // k=3 — tripod (3 steps, divides evenly)
    tripod: [[0, 3, 6], [1, 4, 7], [2, 5, 8]],
    'tripod-alt': [[0, 1, 2], [3, 4, 5], [6, 7, 8]],

    // k=4 (max k=4) — quad
    quad: [[0, 1, 2, 3], [4, 5, 6, 7], [8]],         // remainder leg 8 solo
    'quad-chain': chain(9, 4),
  },
};

// ── Public API ───────────────────────────────────────────────────

export function getPresetGaits(n: number): Record<string, Gait> {
  const presets = PRESETS[n];
  if (presets) return { ...presets };

  // Fallback for arbitrary n: basic wave + chain for each k=2..floor(n/2)
  const fallback: Record<string, Gait> = {
    wave: Array.from({ length: n }, (_, i) => [i]),
  };
  const maxK = Math.floor(n / 2);
  for (let k = 2; k <= maxK; k++) {
    const prefix = k === 2 ? 'ripple' : k === 3 ? 'tripod' : k === 4 ? 'quad' : `k${k}`;
    fallback[`${prefix}-chain`] = chain(n, k);
  }
  return fallback;
}
