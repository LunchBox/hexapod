// ── Preset gait configurations by leg count ──────────────────────
//
// Each gait is an ordered sequence of leg-index groups; legs in the
// same group lift simultaneously. Every leg appears exactly once per
// cycle (no chain patterns — filtered by hasConsecutiveLifts).
//
// When k ∤ N, floor(N/k) groups of size k plus one remainder group.
//
// Constraints enforced at runtime:
//   max k = floor(N/2)
//   balance — ground legs must include both left & right sides
//   no consecutive lifts (including cycle wrap)
//   no quick-relift (isolated ground step, liftsPerLeg >= 2 only)

export type Group = number[];
export type Gait = Group[];

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
    wave:   [[0], [1], [2], [3]],
    'wave-lr':  [[0], [2], [1], [3]],
    'wave-diag': [[0], [3], [1], [2]],

    // k=2 (max k=2) — ripple
    ripple:        [[0, 1], [2, 3]],
    'ripple-cross': [[0, 3], [1, 2]],
    'ripple-lr':    [[0, 2], [1, 3]],   // filtered if both left in one group
  },

  // ── 5 legs ──────────────────────────────────────────────────
  5: {
    // k=1 — wave
    wave:      [[0], [1], [2], [3], [4]],
    'wave-lr':  [[0], [2], [4], [1], [3]],
    'wave-skip': [[0], [3], [1], [4], [2]],
    'wave-rev':  [[0], [4], [3], [2], [1]],

    // k=2 (max k=2) — ripple (2×2 + remainder 1)
    ripple:       [[0, 1], [2, 3], [4]],
    'ripple-split': [[0, 1], [4], [2, 3]],
    'ripple-lr':    [[0, 2], [1, 4], [3]],
    'ripple-alt':   [[0, 3], [1, 2], [4]],
  },

  // ── 6 legs ──────────────────────────────────────────────────
  6: {
    // k=1 — wave (6 steps)
    wave:   [[0], [1], [2], [3], [4], [5]],
    'wave-lr':  [[0], [2], [4], [1], [3], [5]],
    'wave-outer-inner': [[0], [5], [1], [4], [2], [3]],
    'wave-skip': [[0], [3], [1], [4], [2], [5]],
    'wave-rev':  [[0], [5], [4], [3], [2], [1]],

    // k=2 — ripple (3 steps)
    ripple:   [[0, 1], [2, 3], [4, 5]],
    'ripple-lr': [[0, 2], [1, 4], [3, 5]],
    'ripple-diag': [[0, 5], [1, 4], [2, 3]],
    'ripple-cross': [[0, 3], [1, 5], [2, 4]],

    // k=3 (max k=3) — tripod (2 steps)
    tripod:   [[0, 3, 4], [1, 2, 5]],
    'tripod-front-back': [[0, 1, 2], [3, 4, 5]],
    'tripod-lr-mix': [[0, 1, 3], [2, 4, 5]],
    'tripod-alt': [[0, 2, 5], [1, 3, 4]],
  },

  // ── 7 legs ──────────────────────────────────────────────────
  7: {
    // k=1 — wave
    wave:   [[0], [1], [2], [3], [4], [5], [6]],
    'wave-lr': [[0], [2], [4], [6], [1], [3], [5]],
    'wave-skip': [[0], [3], [6], [2], [5], [1], [4]],
    'wave-rev': [[0], [6], [5], [4], [3], [2], [1]],

    // k=2 — ripple (3×2 + remainder 1)
    ripple:        [[0, 1], [2, 3], [4, 5], [6]],
    'ripple-split':  [[0, 1], [6], [2, 3], [4, 5]],
    'ripple-lr':     [[0, 2], [1, 4], [3, 6], [5]],
    'ripple-alt':    [[0, 3], [1, 5], [2, 6], [4]],
    'ripple-diag':   [[0, 5], [1, 2], [3, 6], [4]],

    // k=3 (max k=3) — tripod (2×3 + remainder 1)
    tripod:       [[0, 1, 2], [3, 4, 5], [6]],
    'tripod-split': [[0, 1, 2], [6], [3, 4, 5]],
    'tripod-alt':   [[0, 3, 6], [1, 4, 5], [2]],
    'tripod-lr-mix': [[0, 1, 4], [2, 3, 6], [5]],
  },

  // ── 8 legs ──────────────────────────────────────────────────
  8: {
    // k=1 — wave
    wave:   [[0], [1], [2], [3], [4], [5], [6], [7]],
    'wave-lr': [[0], [2], [4], [6], [1], [3], [5], [7]],
    'wave-outer-inner': [[0], [7], [1], [6], [2], [5], [3], [4]],
    'wave-skip': [[0], [4], [1], [5], [2], [6], [3], [7]],

    // k=2 — ripple (4 steps)
    ripple:   [[0, 1], [2, 3], [4, 5], [6, 7]],
    'ripple-lr': [[0, 2], [1, 3], [4, 6], [5, 7]],
    'ripple-diag': [[0, 7], [1, 6], [2, 5], [3, 4]],
    'ripple-cross': [[0, 3], [1, 5], [2, 6], [4, 7]],

    // k=3 — tripod (2×3 + remainder 2)
    tripod:       [[0, 1, 2], [3, 4, 5], [6, 7]],
    'tripod-split': [[0, 1, 2], [6, 7], [3, 4, 5]],
    'tripod-lr':    [[0, 2, 4], [1, 3, 6], [5, 7]],
    'tripod-alt':   [[0, 3, 6], [1, 4, 7], [2, 5]],

    // k=4 (max k=4) — quad (2 steps)
    quad:   [[0, 1, 2, 3], [4, 5, 6, 7]],
    'quad-diag': [[0, 1, 6, 7], [2, 3, 4, 5]],
    'quad-lr':  [[0, 2, 4, 6], [1, 3, 5, 7]],  // filtered by balance
    'quad-alt': [[0, 3, 5, 6], [1, 2, 4, 7]],
  },

  // ── 9 legs ──────────────────────────────────────────────────
  9: {
    // k=1 — wave
    wave:   [[0], [1], [2], [3], [4], [5], [6], [7], [8]],
    'wave-lr': [[0], [2], [4], [6], [8], [1], [3], [5], [7]],
    'wave-skip': [[0], [3], [6], [1], [4], [7], [2], [5], [8]],
    'wave-rev': [[0], [8], [7], [6], [5], [4], [3], [2], [1]],

    // k=2 — ripple (4×2 + remainder 1)
    ripple:        [[0, 1], [2, 3], [4, 5], [6, 7], [8]],
    'ripple-split':  [[0, 1], [8], [2, 3], [4, 5], [6, 7]],
    'ripple-lr':     [[0, 2], [1, 4], [3, 6], [5, 8], [7]],
    'ripple-alt':    [[0, 3], [1, 5], [2, 7], [4, 8], [6]],

    // k=3 — tripod (3 steps, divides evenly)
    tripod:   [[0, 3, 6], [1, 4, 7], [2, 5, 8]],
    'tripod-alt': [[0, 1, 2], [3, 4, 5], [6, 7, 8]],
    'tripod-diag': [[0, 4, 8], [1, 5, 6], [2, 3, 7]],

    // k=4 (max k=4) — quad (2×4 + remainder 1)
    quad:       [[0, 1, 2, 3], [4, 5, 6, 7], [8]],
    'quad-split': [[0, 1, 2, 3], [8], [4, 5, 6, 7]],
    'quad-lr':    [[0, 2, 4, 6], [1, 3, 5, 8], [7]],
    'quad-alt':   [[0, 3, 6, 8], [1, 4, 5, 7], [2]],
  },
};

// ── Public API ───────────────────────────────────────────────────

export function getPresetGaits(n: number): Record<string, Gait> {
  const presets = PRESETS[n];
  if (presets) return { ...presets };

  // Fallback for arbitrary n: basic wave + remainder pattern for each k
  const maxK = Math.floor(n / 2);
  const fallback: Record<string, Gait> = {
    wave: Array.from({ length: n }, (_, i) => [i]),
  };
  for (let k = 2; k <= maxK; k++) {
    const prefix = k === 2 ? 'ripple' : k === 3 ? 'tripod' : k === 4 ? 'quad' : `k${k}`;
    const full = Math.floor(n / k) * k;
    const groups: Gait = [];
    for (let i = 0; i < full; i += k) {
      groups.push(Array.from({ length: k }, (_, j) => i + j));
    }
    if (full < n) groups.push(Array.from({ length: n - full }, (_, j) => full + j));
    fallback[prefix] = groups;
  }
  return fallback;
}
