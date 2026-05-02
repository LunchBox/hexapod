// ── Preset gait configurations by leg count ──────────────────────
//
// Curated representative gaits. Each gait is an ordered sequence of
// leg-index groups; legs in the same group lift simultaneously.
//
// Naming:
//   wave-*    — k=1 (one leg at a time)
//   ripple-*  — k=2 (pairs)
//   tripod-*  — k=3 (triangles / alternating tripods)
//   quad-*    — k=4

export type Group = number[];
export type Gait = Group[];

const PRESETS: Record<number, Record<string, Gait>> = {
  3: {
    wave: [[0], [1], [2]],
  },

  4: {
    wave: [[0], [1], [2], [3]],
    ripple: [[0, 1], [2, 3]],
    'ripple-lr': [[0, 2], [1, 3]],
  },

  5: {
    wave: [[0], [1], [2], [3], [4]],
  },

  6: {
    // Wave — one leg at a time
    wave: [[0], [1], [2], [3], [4], [5]],
    'wave-lr': [[0], [2], [4], [1], [3], [5]],
    'wave-outer-inner': [[0], [5], [1], [4], [2], [3]],

    // Ripple — pairs
    ripple: [[0, 1], [2, 3], [4, 5]],
    'ripple-lr': [[0, 2], [1, 4], [3, 5]],
    'ripple-diag': [[0, 5], [1, 4], [2, 3]],

    // Tripod — alternating triangles (classic hexapod)
    tripod: [[0, 3, 4], [1, 2, 5]],
    'tripod-front-back': [[0, 1, 2], [3, 4, 5]],
  },

  7: {
    wave: [[0], [1], [2], [3], [4], [5], [6]],
  },

  8: {
    wave: [[0], [1], [2], [3], [4], [5], [6], [7]],
    ripple: [[0, 1], [2, 3], [4, 5], [6, 7]],
    quad: [[0, 1, 2, 3], [4, 5, 6, 7]],
  },

  9: {
    wave: [[0], [1], [2], [3], [4], [5], [6], [7], [8]],
    tripod: [[0, 3, 6], [1, 4, 7], [2, 5, 8]],
  },
};

export function getPresetGaits(n: number): Record<string, Gait> {
  const presets = PRESETS[n];
  if (presets) return { ...presets };

  // Fallback for arbitrary n: basic wave gait
  return {
    wave: Array.from({ length: n }, (_, i) => [i]),
  };
}
