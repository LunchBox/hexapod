# Code Review Report — JS Hexapod v0.8.0

**Date:** 2026-05-02
**Reviewer:** Deepseek V4 Pro (automated review)
**Scope:** Entire codebase (82 files, `src/`, `public/`, `legacy/`, docs, configs)

---

## Executive Summary

The JS Hexapod codebase is a functional and well-organized Three.js robot simulator with a working React migration. The core IK/gait logic is sound and the component tree is cleanly separated. However, the codebase carries significant legacy baggage: a dual React+DOM rendering architecture, pervasive `any` usage (122 instances), module-level singletons that bypass React data flow, and no test coverage. Four concrete bugs were found, none critical. The project would benefit most from consolidating on React state management and adding TypeScript strict mode incrementally.

---

## 1. Bugs Found

### B1 — `clearInterval` used on `setTimeout` result (Medium)

**File:** `src/hexapod/gaits.ts:312,325`

```typescript
// line 312
this.action_identify = setTimeout(() => {
  // ...
}, this.bot.options.gait_iteration_delay);

// line 325
clearInterval(this.action_identify);  // BUG: should be clearTimeout
```

`setTimeout` returns a timeout ID; `clearInterval` expects an interval ID. While browsers currently use the same ID pool, the spec does not guarantee this and the call is semantically wrong. It will silently fail to cancel in strict environments.

**Fix:** Change `clearInterval` to `clearTimeout`.

---

### B2 — Circular module dependency (Low)

**Files:** `src/hexapod/hexapod.ts:11` ↔ `src/hexapod/history.ts:1`

```
hexapod.ts  ──imports──▶  history.ts
history.ts  ──imports──▶  hexapod.ts  (set_bot_options)
```

`hexapod.ts` imports `history` from `history.ts`, and `history.ts` imports `set_bot_options` from `hexapod.ts`. ES modules handle this via live bindings (the import resolves to the not-yet-evaluated module), so it works at runtime, but it creates a fragile initialization order dependency and complicates static analysis.

**Fix:** Move `set_bot_options` to a separate shared module (e.g., import it in `history.ts` from a re-export), or inline the call via a callback parameter.

---

### B3 — Misspelled export `degree_to_redius` (Low)

**File:** `src/hexapod/utils.ts:100`

The function is named `degree_to_redius` — "redius" is a misspelling of "radians." It is imported by this name in `hexapod.ts:8` and called in 4 places (`hexapod.ts:1241,1244,1247,1258`).

**Fix:** Rename to `degree_to_radians`, add backward-compat alias `degree_to_redius` pointing to the same function.

---

### B4 — Confusing `Array.slice()` arguments (Low)

**File:** `src/hexapod/hexapod.ts:1114`

```typescript
this.time_interval_stack = this.time_interval_stack.slice(
  this.time_interval_stack.length - max_number,
  max_number
);
```

The second argument to `slice(begin, end)` means "stop before index `end`." Here `end = max_number` when the intention is clearly to take the last `max_number` elements. In practice this works because the start index `length - max_number` plus the requested length `max_number` equals `length`, and `slice` clamps `end` to the array length. The correct and clearer form is `slice(-max_number)` which means "last N elements."

**Fix:** Replace with `this.time_interval_stack.slice(-max_number)`.

---

## 2. Architecture Concerns

### A1 — Dual React + DOM rendering

The `Hexapod` class writes directly to DOM elements (`#servo_values`, `#on_servo_values`, `#status_history`, `#chart`) via `innerHTML` manipulation and Canvas2D drawing. React components (`CommandDisplay`, `TimeChart`, `StatusPanel`) then read these DOM elements to sync back into React state. This creates a bidirectional data flow where the DOM is the source of truth for some state, React for other state.

**Impact:** Makes the UI untestable outside a browser; complicates reasoning about data flow; prevents SSR or React-based testing.

**Remediation path:** Convert `Hexapod.after_status_change()` to call a callback that updates React state directly, rather than writing to DOM. The DOM target elements can then be pure React components that render from props/context.

### A2 — Module-level mutable singletons

`appState` (`src/hexapod/appState.ts`) and `history` (`src/hexapod/history.ts`) are module-level mutable objects imported and mutated freely across the codebase. This is functionally equivalent to global variables and makes data flow untraceable.

**Impact:** Any module can mutate shared state at any time; no React re-render triggers for direct mutations; hard to write isolated tests.

### A3 — Oversized classes

| Class/Component | File | Lines |
|---|---|---|
| `Hexapod` | `src/hexapod/hexapod.ts` | ~930 (class only) |
| `ControlPanel` | `src/components/ControlPanel.tsx` | 611 |
| `AttributesPanel` | `src/components/AttributesPanel.tsx` | 549 |
| `GaitController` | `src/hexapod/gaits.ts` | ~400 (controller only) |

`Hexapod` mixes: 3D mesh construction, inverse kinematics, gait orchestration, WebSocket communication, DOM manipulation, localStorage persistence, and status history display. `ControlPanel` mixes: gait selection, draw type, move mode, keyboard handling, step commands, sync mode, DOF config, body shape, and a gait diagram renderer.

### A4 — Context value recreated every render

**File:** `src/context/HexapodContext.tsx:30-43`

The context `value` object is created inline on every render without `useMemo`, causing all 9 consuming components to re-render whenever the provider renders, even if no values changed.

---

## 3. Code Quality

### C1 — `any` usage: 122 instances

Across 10 files in `src/hexapod/`, there are 122 uses of the `any` type. Key offenders:

| File | `any` count | Example |
|---|---|---|
| `hexapod.ts` | ~40 | `this.scene: any`, `this.mesh: any`, `this.legs: any[]` |
| `gaits.ts` | ~30 | `controller: any`, all GaitAction subclasses |
| `utils.ts` | ~15 | All function parameters untyped |
| `joystick2.ts` | ~8 | Pointer event handling |

**Root cause:** The Three.js r72 library has no TypeScript definitions; the code was migrated from vanilla JS without adding intermediate types. The `types/globals.d.ts` and `types/hexapod.d.ts` files exist but only cover a subset.

### C2 — Mixed naming conventions

The codebase uses both `snake_case` and `camelCase` (roughly 60%/40% split). Examples in the same file:

- `hexapod.ts`: `set_tip_pos` (snake) vs `computeLegLayout` (camel)
- `gaits.ts`: `legs_up`, `active_legs` (snake) vs `fireAction` (camel)

No clear pattern determines which style is used where.

### C3 — Dead or questionable exports

| Export | File | Issue |
|---|---|---|
| `COXA`, `FEMUR`, `TIBIA`, `TARSUS` | `defaults.ts` | Marked deprecated, still exported |
| `RUN_FRAMES` | `defaults.ts` | Set to `false`, never toggled |
| `ANIMATE_TIMER` | `defaults.ts` | Set to `0`, unused |
| `logger` (enable/disable) | `utils.ts` | Never imported within `src/hexapod/` |
| `rotateAroundObjectAxis` | `utils.ts` | Never imported within `src/hexapod/` |
| `rotateAroundWorldAxis` | `utils.ts` | Never imported within `src/hexapod/` |
| `sleep` | `utils.ts` | CPU-blocking busy-wait; likely never called |
| `sceneRef` | `HexapodContext.tsx` | Declared in context, zero consumers |

### C4 — Missing error handling

- `PosCalculator.run()` returns `false` on non-convergence, but callers in `transform_body()` and `move_tips()` discard the return value
- `get_actual_joint_positions()` returns `null` for invalid legs; callers don't check
- `localStorage.getItem()` JSON.parse is not wrapped in try/catch
- `socket.emit()` has a `connected` guard but no try/catch for mid-call disconnects

### C5 — String-based method dispatch

**File:** `src/hexapod/gaits.ts` — `GaitAction.run()`

```typescript
(this as any)[step.func]()
```

Method names are stored as strings and dispatched via bracket notation with an `as any` cast. This completely bypasses TypeScript checking — a typo in a step name would fail silently at runtime with no compile error.

### C6 — Hardcoded WebSocket URL

**File:** `src/hexapod/hexapod.ts` — constructor

The Socket.IO client connects to `http://localhost:8888` unconditionally. No environment variable, config option, or dependency injection.

---

## 4. Accessibility

### ALL interactive controls use `<a href="#">` instead of `<button>`

Every clickable element across all components uses anchor tags with `href="#"`. This means:
- No keyboard activation via Space key (anchors only respond to Enter)
- Screen readers don't identify them as interactive controls
- No `:focus-visible` styling for keyboard navigation

### No ARIA attributes anywhere

Zero `role`, `aria-label`, `aria-expanded`, `aria-selected`, or `tabindex` attributes exist in the entire codebase.

### Canvas-only interactions

`LegEditor` (2D joint editor) and the three joystick canvases provide no keyboard or screen-reader alternative. Users who cannot use a mouse or touchscreen cannot operate these controls.

---

## 5. Documentation Gaps

### No JSDoc on any exported function or class

None of the ~50 exported functions/classes across the codebase have `@param` or `@returns` annotations.

### No TODO/FIXME/HACK markers

Zero such comments exist in the entire codebase, despite the bugs and quality issues documented above. Technical debt is invisible to future maintainers.

### No test suite

The project has zero automated tests. No unit tests, no integration tests, no end-to-end tests. `package.json` has no test script.

### `strict: false` in tsconfig

TypeScript strict mode is disabled. Enabling it would catch many of the `any`-related issues at compile time.

---

## 6. Recommendations

| Priority | Recommendation | Effort | Impact |
|---|---|---|---|
| **P0 — Fix now** | Fix the 4 concrete bugs (B1-B4) | 1 hour | Correctness |
| **P1 — Short term** | Wrap context value in `useMemo` | 5 min | Perf: prevents 9-component re-render cascade |
| **P1 — Short term** | Replace `<a href="#">` with `<button>` elements | 2 hours | Accessibility |
| **P2 — Medium term** | Convert `after_status_change()` to callback-based React state instead of DOM writes | 1 day | Architecture |
| **P2 — Medium term** | Add JSDoc to public API surface (Hexapod, HexapodLeg, GaitController, PosCalculator) | 3 hours | Maintainability |
| **P2 — Medium term** | Add TODO markers for known issues not immediately fixed | 30 min | Visibility |
| **P3 — Longer term** | Split `Hexapod` class: extract DOM rendering, WebSocket, and status history | 3 days | Maintainability |
| **P3 — Longer term** | Split `ControlPanel` into sub-components (GaitPicker, StepControls, KeyboardHandler) | 1 day | Maintainability |
| **P3 — Longer term** | Enable TypeScript strict mode incrementally (start with `noImplicitAny: false`, then tighten) | Ongoing | Type safety |
| **P3 — Longer term** | Add unit tests for PosCalculator, gait generation, and utility functions | 1 week | Regression prevention |
| **P4 — Future** | Upgrade Three.js to a modern ES module version, add `@types/three` | Major effort | Eliminates ~100 `any` casts |
