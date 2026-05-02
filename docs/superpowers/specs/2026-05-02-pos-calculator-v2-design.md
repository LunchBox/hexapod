# PosCalculator v2 — Gradient Descent IK Refactor

**Date:** 2026-05-02
**Status:** approved

## Goal

Fix leg-stuck issues during bot movement by refactoring the gradient-descent IK solver (`pos_calculator.ts`) and improving caller error handling. Zero trigonometric functions — purely numerical gradient descent.

## Algorithm Changes

### 1. Clamp instead of break on bounds

**v1:** if ANY joint exceeds `[SERVO_MIN, SERVO_MAX]`, break out of the while loop immediately. All joints left at partial-iteration values.

**v2:** Clamp each joint to bounds after each update. Continue iterating.

### 2. Track best-so-far, return best on exit

**v1:** On failure (dist > dist_error or bounds hit), restore original_values. On success, use last values (rounded).

**v2:** Track `bestValues` and `bestDist` throughout all iterations. Always return the best solution found, even if max iterations reached.

### 3. Standard momentum (no unstable backtrack)

**v1:** Accumulates gradient into `speeds[i]`, uses division-by-gradient-difference backtrack on sign flip.

**v2:** Standard momentum: `momentum[i] = beta * momentum[i] + (1 - beta) * gradients[i]`, then `values[i] -= lr * momentum[i]`. No backtrack formula.

### 4. Adaptive step size

**v1:** Fixed `step = 20` for finite differences.

**v2:** Start at 30, multiply by 0.85 when gradient sign flips (oscillation detected), min 5.

### 5. Rich return type

**v1:** Returns `boolean`.

**v2:** Returns `{ success: boolean; distance: number; iterations: number; values: number[] }`.

### 6. Caller error handling

**v1:** All callers ignore return value.

**v2:**
- `transform_body`: uses returned values even on partial convergence; relax drift threshold 2→8
- `move_tips` / `move_body`: log warning on failure, continue with best-effort values
- `putdown_tips` / `laydown`: check return, retry with relaxed target if failed

## Constants

```
MAX_LOOPS: 200 → 300
INITIAL_STEP: 30
MIN_STEP: 5
LEARNING_RATE: 0.5
MOMENTUM_BETA: 0.8
STEP_DECAY: 0.85
DIST_ERROR: 0.01 (unchanged)
DRIFT_THRESHOLD: 2 → 8 (in transform_body)
```

## Files Changed

- `src/hexapod/pos_calculator.ts` — full rewrite of `run()` method
- `src/hexapod/hexapod.ts` — `set_tip_pos` return type, `transform_body` drift threshold, caller checks

## Non-Negotiable

- **NO trigonometric functions** (`Math.sin`, `Math.cos`, `Math.atan2`, etc.) in joint angle or tip position computation
- Gradient descent via finite differences only
- All optimizations are purely numerical
