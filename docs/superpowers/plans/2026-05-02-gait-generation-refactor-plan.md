# Gait Generation Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2^N bitmask gait enumeration in GaitController with a systematic k-legs-lifted traversal that properly de-duplicates cyclic rotations.

**Architecture:** New pure-function module `gait_generator.ts` handles all combinatorial generation and dedup. `GaitController` constructor calls it instead of inline bitmask logic. Execution layer (GaitAction, GaitMove, etc.) is untouched.

**Tech Stack:** TypeScript, Three.js (pre-r69), React + Vite

---

### Task 1: Create `src/hexapod/gait_generator.ts` — pure generation logic

**Files:**
- Create: `src/hexapod/gait_generator.ts`

- [ ] **Step 1: Write the file with all generation functions**

```typescript
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

function toCanonical(gait: Gait): Gait {
  const idx = gait.findIndex(g => g.includes(0));
  if (idx <= 0) return gait;
  return [...gait.slice(idx), ...gait.slice(0, idx)];
}

function canonicalKey(gait: Gait): string {
  return gait.map(g => [...g].sort((a, b) => a - b).join(',')).join('|');
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
    const canonical = toCanonical(gait);
    const key = canonicalKey(canonical);
    if (!unique.has(key)) {
      unique.set(key, canonical);
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
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/hexapod/gait_generator.ts
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hexapod/gait_generator.ts
git commit -m "feat: add gait_generator with k-legs-lifted traversal and cyclic dedup

Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>"
```

---

### Task 2: Modify `GaitController` constructor to use generator

**Files:**
- Modify: `src/hexapod/gaits.ts:238-324`

- [ ] **Step 1: Add import at top of gaits.ts**

```typescript
import { generateAllGaits } from './gait_generator.js';
```

Add this after the existing import block (after line 5).

- [ ] **Step 2: Replace the gait generation block in GaitController constructor**

Replace lines 238-313 (the block starting with `// ── 2^N model...` through the end of the gaits-naming block before `this.gaits = gaits;`) with:

```typescript
    // Generate all valid gait phase-sequences grouped by legs-lifted count,
    // with cyclic-rotation deduplication (canonical: group containing leg 0 is first).
    this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);
```

This means:
- Remove lines 238-313 (the entire `phaseValid` function, `validPhases` bitmask loop, `findCovers` function and call, `seen`/`uniqueCovers` dedup, `gaits` naming loop)
- Keep line 315 (`this.gaits = gaits;`) — but change it to the new call above

The constructor after the edit should flow as:
1. Lines 198-237: leg classification (unchanged)
2. New line: `this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);`
3. Lines 315-353: gait restore from options, fallback, action setup (all unchanged)

The old line numbers shift after deletion. Verify that after the edit, the constructor reads:

```
    this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);

    // Restore gait from options, fallback to first available
    let gaitName = this.bot.options.gait || 'tripod';
    this.leg_groups = this.gaits[gaitName] || Object.values(this.gaits)[0];
    // Safety: if no gaits at all (shouldn't happen), create a basic wave
    if (!this.leg_groups) {
      this.gaits['wave'] = Array.from({ length: n }, (_, i) => [i]);
      this.leg_groups = this.gaits['wave'];
    }
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Test in dev server**

```bash
npm run dev
```

Open browser at `http://localhost:3000`. Verify:
- The hexapod renders
- Gait buttons appear (grouped by k with new naming)
- Switching gaits works (tripod, wave, ripple variants)
- No console errors from gait generation

- [ ] **Step 5: Commit**

```bash
git add src/hexapod/gaits.ts
git commit -m "refactor: replace bitmask gait enum with gait_generator in GaitController

Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>"
```

---

### Task 3: Update ControlPanel gait selector UI

**Files:**
- Modify: `src/components/ControlPanel.tsx`

The current UI renders all gait names as flat buttons. With 190 gaits, change to a `<select>` with `<optgroup>` elements grouped by k.

- [ ] **Step 1: Replace `getGaitList` with a k-grouped version**

Replace lines 27-31:

```typescript
function getGaitList(bot: any) {
  const gc = bot?.gait_controller;
  if (!gc?.gaits) return [];
  return Object.keys(gc.gaits).map(k => ({ value: k, label: k }));
}
```

with:

```typescript
const K_LABELS: Record<string, string> = {
  wave: 'Wave (k=1)',
  ripple: 'Ripple (k=2)',
  tripod: 'Tripod (k=3)',
  quad: 'Quad (k=4)',
};

interface GaitGroup {
  prefix: string;
  label: string;
  gaits: { value: string; label: string }[];
}

function getGaitGroups(bot: any): GaitGroup[] {
  const gc = bot?.gait_controller;
  if (!gc?.gaits) return [];
  const names = Object.keys(gc.gaits);
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const name of names) {
    // Extract k-prefix: "wave" or "wave-2" → "wave"
    const prefix = name.match(/^[a-z]+/)![0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push({ value: name, label: name });
  }
  // Sort each group by numeric suffix
  const result: GaitGroup[] = [];
  for (const [prefix, gaits] of groups) {
    gaits.sort((a, b) => {
      const na = parseInt(a.label.match(/\d+$/)?.[0] || '1');
      const nb = parseInt(b.label.match(/\d+$/)?.[0] || '1');
      return na - nb;
    });
    result.push({
      prefix,
      label: K_LABELS[prefix] || prefix,
      gaits,
    });
  }
  // Sort groups by k (wave=1, ripple=2, etc.)
  const kOrder = ['wave', 'ripple', 'tripod', 'quad'];
  result.sort((a, b) => kOrder.indexOf(a.prefix) - kOrder.indexOf(b.prefix));
  return result;
}
```

- [ ] **Step 2: Replace the Gaits fieldset (lines 393-405) with a select+optgroup**

Replace:

```jsx
      <fieldset className="btns">
        <legend>Gaits</legend>
        {getGaitList(botRef.current).map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${gait === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('gait_switch', item.value); }}
          >
            {item.label}
          </a>
        ))}
      </fieldset>
```

with:

```jsx
      <fieldset className="btns">
        <legend>Gaits</legend>
        <select
          value={gait}
          onChange={(e) => { handleAction('gait_switch', e.target.value); }}
          style={{ fontSize: '13px', maxWidth: 220 }}
        >
          {getGaitGroups(botRef.current).map((group) => (
            <optgroup key={group.prefix} label={group.label}>
              {group.gaits.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </fieldset>
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ControlPanel.tsx
git commit -m "feat: group gait selector by k with optgroup dropdown

Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>"
```

---

### Task 4: Verify AttributesPanel fallback still works

**Files:**
- Read: `src/components/AttributesPanel.tsx:150-160`

- [ ] **Step 1: Check gait fallback references in AttributesPanel**

Read `src/components/AttributesPanel.tsx` around line 157. The code references `bot.gait_controller.gaits[bot.options.gait || 'tripod']` as a fallback check when changing body shape or leg count. Since we keep `'tripod'` as the name of the first tripod gait, this fallback remains correct.

No changes needed if the first gait of each k uses the bare prefix (which `gait_generator.ts` already does via the `gaitName` function).

- [ ] **Step 2: Verify the same in ControlPanel.tsx lines 174, 185**

Same pattern — fallback to `'tripod'`. No changes needed.

- [ ] **Step 3: Commit (if changes were needed)**

Skip if no changes required.

---

### Task 5: End-to-end manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify gait generation and switching**

Open browser at `http://localhost:3000`:

1. Check the Gaits dropdown has optgroups: Wave (k=1), Ripple (k=2), Tripod (k=3), Quad (k=4)
2. Select `tripod` — verify robot stands up, feet on ground
3. Select `wave-2` — verify wave gait works (legs move one at a time)
4. Select different gaits from each k-group — verify no errors in console
5. Change leg count to 4 and back — verify gaits regenerate and tripod fallback works
6. Change body shape — verify same
7. Press W/S/A/D keys — verify movement with selected gait works

- [ ] **Step 3: Check console for errors**

Open browser developer console. Expected: no errors except normal log messages (delta fire time, delta act time, etc.)

---

### Expected results (N=6)

| k | Prefix | Steps per cycle | Unique gaits | Lifts/leg/cycle |
|---|--------|----------------|-------------|-----------------|
| 1 | wave   | 6 | 120 | 1 |
| 2 | ripple | 3 | 30  | 1 |
| 3 | tripod | 2 | 10  | 1 |
| 4 | quad   | 3 | 30  | 2 |
