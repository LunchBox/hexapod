# Gait Generation Refactor — Design Spec

## Goal

Replace the current `GaitController` bitmask-enumeration approach with a systematic traversal organized by **k = number of legs lifted simultaneously**, with proper cyclic-rotation de-duplication.

## Current state

`GaitController` constructor (gaits.ts:198-353) uses:
1. `2^N` bitmask loop to find all valid "phases" (lifted-leg subsets passing `phaseValid`)
2. Recursive exact-cover search (`findCovers`) to partition all legs
3. Global sort-based dedup (sorts groups within each cover, sorts covers by first element)

Problem: the dedup sorts groups globally, losing ordering — `[[0,1],[2,3],[4,5]]` and `[[2,3],[0,1],[4,5]]` collapse to the same key even though they are different execution orders.

## New approach

### Algorithm (Approach A: generate-all + canonical dedup)

For each k from 1 to N-2 (at least 2 legs on ground):

1. **Determine cycle parameters:**
   - `liftsPerLeg = lcm(N, k) / N` — how many times each leg lifts per cycle
   - `numSteps = lcm(N, k) / k` — how many steps in one cycle

2. **Backtracking generation:**
   - Track per-leg usage count (each leg may appear up to `liftsPerLeg` times)
   - At each step, pick `k` legs from those with remaining capacity (using k-combinations)
   - Filter by `isValidPhase`: among legs NOT lifted, both left and right sides must be represented (or center leg present)
   - At final step, verify all leg counts == `liftsPerLeg`

3. **Cyclic de-duplication:**
   - `toCanonical(gait)`: rotate so the group containing leg 0 is first
   - `canonicalKey(gait)`: sort within each group, join groups with `|`
   - Use `Map<string, Gait>` to dedup

### Naming

| k | prefix | count (N=6) |
|---|--------|-------------|
| 1 | wave   | 120 |
| 2 | ripple | 30  |
| 3 | tripod | 10  |
| 4 | quad   | 30  |

First gait of each type uses the bare prefix (e.g. `"tripod"`), subsequent ones append `-{index}` (e.g. `"tripod-2"`, `"tripod-3"`). This preserves backward compatibility — existing configs referencing `"tripod"` or `"wave"` continue to work.

### Phase validity (unchanged from current)

Function `isValidPhase(lifted, leftLegs, rightLegs, centerLeg)`:
- Compute ground legs (not lifted)
- Must have >= 2 legs on ground
- Must have at least 1 left AND 1 right leg on ground, OR center leg on ground

## Files changed

### New: `src/hexapod/gait_generator.ts`

Pure functions, no side effects:
- `generateAllGaits(n, leftLegs, rightLegs, centerLeg): Record<string, Gait[]>`
- `generateForK(n, k, leftLegs, rightLegs, centerLeg): Gait[]`
- `isValidPhase(lifted, leftLegs, rightLegs, centerLeg): boolean`
- `toCanonical(gait): Gait`
- `canonicalKey(gait): string`

Types:
- `Group = number[]` — legs lifted together in one step
- `Gait = Group[]` — ordered sequence of groups (one cycle)

### Modified: `src/hexapod/gaits.ts`

- Remove inline bitmask enumeration and `findCovers` from `GaitController` constructor
- Call `generateAllGaits()` instead
- `this.gaits` stays `Record<string, number[][]>` (backward compatible)

### Modified: `src/components/ControlPanel.tsx`

- Gait selector UI: group by k (wave/ripple/tripod/quad) with sub-number
- Dropdown or two-level selection

### Modified: `src/hexapod/defaults.ts`

- Default `gait` value may need updating to new naming scheme (e.g. `"tripod"` → `"tripod-1"` or keep first tripod as `"tripod"`)

## What does NOT change

- `GaitAction`, `GaitMove`, `GaitStandby`, `GaitPutdownTips`, `GaitInternal` — execution layer untouched
- `GaitController.act()`, `fire_action()`, `next_leg_group()`, `switch_gait()` — all unchanged
- `Hexapod`, `HexapodLeg` — unchanged
- The actual movement logic (legs_up/down/move, body_move) — unchanged
