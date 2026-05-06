# Leg Shape Preservation Design

**Date:** 2026-05-06  
**Status:** Approved

## Problem

During continuous gait execution, leg joint angles drift away from their initial standing shape. After 50–100+ gait cycles, legs visually deform even though tip positions remain correct each step.

## Root Cause

Each IK solve starts from the current (potentially drifted) servo values. Two existing restoration mechanisms are insufficient:

| Mechanism | Strength | Trigger | Problem |
|-----------|----------|---------|---------|
| `REG_STRENGTH = 0.05` | Soft 5% pull per iteration | Every IK | Too weak, easily overridden by gradient descent |
| `snap_legs_to_init(0.15)` | Direct 15% snap | Post-touchdown | Crude snap with no IK correction to re-seat the tip |

Since IK starts from drifted values, regularization itself drifts — the solver's homeward bias operates from the wrong starting point.

**Core insight:** If every IK solve starts from `_home_servos`, the solver naturally finds the closest solution to the home shape while still reaching the target tip position.

## Solution: Home-start IK Recalibration on Every Touchdown

On each touchdown, run a second IK pass starting from `_home_servos`. Chain it as a second keyframe segment in the same animation. The leg first moves to the floor (segment 0), then slides to the home-biased floor shape (segment 1). Total hold_time covers both segments.

## Architecture

### New method A: `HexapodLeg.solve_only(targetPos: THREE.Vector3): number[] | null`

Pure IK computation from current servo values — no animation state mutation:

1. Run `PosCalculator(this, targetPos, this._home_servos)`
2. After solve, restore `limbs[i].servo_value` to pre-solve values (PosCalculator mutates them)
3. Return `result.values` on success, `null` on failure

### New method B: `HexapodLeg.solve_from_home(targetPos: THREE.Vector3): number[] | null`

Same as `solve_only` but IK starts from `_home_servos`:

1. Save current `limbs[i].servo_value`
2. Apply `_home_servos[i]` to each joint (IK starting point)
3. Run `PosCalculator(this, targetPos, this._home_servos)` — regularization target also home
4. Restore saved servo values
5. Return `result.values` on success, `null` on failure

**Why restore after IK?** `PosCalculator.run()` mutates `limb.servo_value` during gradient descent. The joints must return to their pre-call state so `AnimatedOutput.renderedValues` remains authoritative.

### Modified: `gaits.ts` → `legs_down()`

Replace `set_tip_pos()` + `snap_legs_to_init(0.15)` with a two-segment keyframe animation per leg:

```
preRendered  = leg._output.renderedValues.slice()   // animation start (kf[0])
phase1Values = leg.solve_only(floorPos)             // kf[1]: normal touchdown
phase2Values = leg.solve_from_home(floorPos)        // kf[2]: home-biased shape

leg._output.setKeyframes([preRendered, phase1Values, phase2Values], now)

// Hold time covers both segments (computed from servo_speed delta internally by AnimatedOutput)
```

`setKeyframes([kf0, kf1, kf2])` produces two animation segments:
- Segment 0: preRendered → phase1Values (leg reaches floor)
- Segment 1: phase1Values → phase2Values (leg slides to home-biased shape)

The `snap_legs_to_init(0.15)` call is removed — superseded by the recalibration segment.

**If phase2Values is null** (IK failure), fall back to single-segment: `setKeyframes([preRendered, phase1Values], now)` — original behavior preserved.

## Servo Constraint Compliance

Both segments animate through `AnimatedOutput.setKeyframes()`, which interpolates each joint linearly at constant `servo_speed`. The gait's hold_time is extended to cover both segments. No artificial synchronization — joints with larger deltas take longer, as required by the servo constraint principle.

## Edge Cases

| Case | Behavior |
|------|----------|
| `solve_from_home` fails (IK no converge) | Fall back to single-segment animation (original behavior) |
| `_home_servos` not initialized | Skip recalibration, proceed with normal touchdown |
| 3-DOF leg (unique IK solution) | phase1 ≈ phase2, segment 1 duration ≈ 0ms, negligible overhead |
| Servo constraint mode off (`none`) | `AnimatedOutput` not active; recalibration still runs but snaps instantly |

## Impact

- **Files changed:** `src/hexapod/hexapod.ts` (new method on `HexapodLeg`), `src/hexapod/gaits.ts` (`legs_down` modification)
- **No new animation paths** — uses existing `setKeyframes()` infrastructure
- **No trig functions** — all joint computation via `PosCalculator`
- **Overhead:** one extra IK solve per landing leg per step (<1ms per leg)
