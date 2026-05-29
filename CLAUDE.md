# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commit convention

All commits made by AI in this repo must use the correct model attribution:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Update this line if the underlying model changes.

## Overview

JS Hexapod — a Three.js-based 3D hexapod robot simulator with optional physical bot control via Socket.IO. Originally vanilla JS (backed up in `legacy/`), now migrated to **React + Vite + TypeScript**. Three.js is consumed as an ES module from npm (`three ^0.184.0`); the only remaining `<script>` in `index.html` is `Stats.js` from `public/libs/`.

## Commands

```bash
npm run dev      # Start dev server (defaults to localhost:3000)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run lint     # ESLint
npx tsc --noEmit # TypeScript type-check
npx vitest run   # Run test suite once
```

Test suite: 91 tests across 7 files in `src/hexapod/__tests__/` (forward_kinematics, gait_guards, history, physics_ground_stall, pos_calculator, servo_constraint, servo_utils).

**For a deeper runtime / motion / IK map**, see `docs/architecture.md` — it traces the single rAF loop, the three motion entry paths (walking gait, body_target chase, discrete body ops), the animator paths A/B + per-leg `_output`, and where state-capture / persistence sit. The sections below are the working-day reference; `architecture.md` is the explanatory one.

## Code review status

A comprehensive code review was conducted on 2026-05-02 (`docs/code-review-2026-05-02.md`). Of the 4 bugs identified:
- **B1** (`clearInterval` on `setTimeout`) — fixed
- **B2** (circular dependency `hexapod.ts` ↔ `history.ts`) — fixed (history.ts no longer imports from hexapod.ts)
- **B3** (misspelled `degree_to_redius`) — fixed (alias added)
- **B4** (confusing `slice()` args) — fixed (uses `slice(-max_number)`)

Architecture recommendations remain open (see report for details).

## Project structure

```
legacy/                          # Original vanilla JS backup (untouched: index.html, js/, stylesheets/, css-archive/)
public/libs/                     # Legacy script-tag libs — only Stats.js is still loaded (see index.html)
  Stats.js                       #   Stats global — loaded via <script> in index.html
  three.min.js, OrbitControls.js #   Dead — Three.js now comes from npm; safe to remove
  Detector.js, THREEx.*.js       #   Dead — unreferenced; safe to remove
src/
  main.tsx                       # React entry point
  App.tsx                        # Shell: tabs, layout, HexapodProvider
  App.css                        # Layout styles
  index.css                      # Minimal reset
  lib/
    utils.ts                     # shadcn `cn()` helper (clsx + tailwind-merge)
  context/
    HexapodContext.tsx           # React context: botRef, sceneRef, servo displays, botVersion, status entries
  components/
    SceneCanvas.tsx              # Mounts Three.js scene, builds Hexapod on mount
    SceneControls.tsx            # 3 joysticks (Move/Body/Rot), XYZ/RxRyRz sliders. Lifted ABOVE the tabs in App.tsx — always visible, usable across every tab.
    ControlPanel.tsx             # GaitCard/StepCard/PhysicsCard/ActionsCard, WASD keyboard, send/sync. Inside Tabs with `keepMounted` so document.body keyboard listeners survive tab switches.
    GaitCard.tsx                 # Gait selection (split from ControlPanel)
    StepCard.tsx                 # Step size controls (split from ControlPanel)
    PhysicsCard.tsx              # Physics mode + servo_speed (split from ControlPanel)
    ActionsCard.tsx              # Action type + draw type (split from ControlPanel)
    GaitDiagram.tsx              # SVG diagram visualizing current gait pattern
    ServoPanel.tsx               # React JSX servo sliders + end-position inputs; value updates bypass React via stored DOM refs (perf — avoids 30fps gait re-renders)
    AttributesPanel.tsx          # Profile (presets + body shape buttons), Adjust, Motions, Body Attrs — fully declarative React + shadcn
    LegEditor.tsx                # 2D canvas joint editor with multi-leg editing
    LegAttributesPanel.tsx       # Per-leg attributes: DOF, leg count, segment length/radius/angle sliders
    StatusBar.tsx                # Status bar: gait, mode, physics, leg count × DOF
    StatusPanel.tsx              # Recording + playback UI (record/stop/play/pause/step/save/load/clear). Subscribes to `recorder` external store via useSyncExternalStore — NOT context.
    CommandDisplay.tsx           # Current + last servo command strings
    TimeChart.tsx                # Command time interval canvas chart (imperative canvas drawing)
    Toolbar.tsx                  # Undo/redo/save toolbar with keyboard shortcuts (Ctrl+Z/Y/S)
    AttrSlider.tsx               # Reusable horizontal slider with step buttons and extend-max
    SliderColumn.tsx             # Reusable slider column (vertical/horizontal, spring-back, step)
    ui/                          # shadcn/ui primitives: button, card, tabs, slider, toggle, toggle-group, badge, separator
  hexapod/
    appState.ts                  # Mutable singleton replacing old window globals
    defaults.ts                  # Constants (HEXAPOD_OPTIONS_KEY, servo ranges, limb defaults) + DEFAULT_HEXAPOD_OPTIONS
    utils.ts                     # DOM/vector/math/localStorage helpers
    scene.ts                     # initScene(container) — Three.js setup, returns {scene, camera, ...}
    joystick2.ts                 # JoyStick class (canvas-based, accepts element or selector)
    pos_calculator.ts            # Inverse kinematics: gradient-descent solver for tip→servo values
    pos_calculator_backup_2026-05-02.ts  # DEAD — pre-refactor backup, candidate for deletion (git history is the real backup)
    forward_kinematics.ts        # Pure forward kinematics (zero Three.js), used by tests
    physics_solver.ts            # Multi-leg constraint solver (PhysicsSolver.solveAll)
    servo_output.ts              # ServoOutput interface + DirectOutput / AnimatedOutput strategy
    servo_utils.ts               # Pure servo helpers: computeMaxDelta, computeServoSpeedHoldTime, computeFixedUnitHoldTime
    hexapod.ts                   # Hexapod class, layout computation, config helpers
    hexapod_leg.ts               # HexapodLeg class (imported by hexapod.ts)
    leg_layout.ts                # computeLegLayout, computeJointPositions, getSegNamesForLeg
    presets.ts                   # PRESETS array: 15 preset configs (default + 3-DOF + 4-DOF)
    gaits.ts                     # GaitController + GaitAction hierarchy (standby, move, putdown). Walking-only after Phase 3 of the input rewrite; body control moved to body_motions.ts (begin/step/endBodyTracking)
    gait_configs.ts              # Preset gait definitions by leg count (wave, ripple, tripod, quad)
    gait_generator.ts            # Runtime gait filtering: balance validation, dedup, cyclic rotation
    history.ts                   # Undo/redo stack (singleton, JSON-serialized, max 50 entries)
    random.ts                    # Random options generator for testing/demo
  types/
    globals.d.ts                 # DOM element extensions, Stats class declaration, socket.io-client module declaration
    hexapod.d.ts                 # Core interfaces: HexapodOptions, HexapodLegOptions, LimbOptions, etc.
    css.d.ts                     # Module declaration for .css imports
js/                             # DEAD — duplicate legacy libs leftover from old build setup, safe to remove
stylesheets/
  application.css                # Original UI styles (imported by React app, covers legacy elements)
```

## Architecture

**Core classes (same logic as legacy, now ES modules):**
- `Hexapod` — The bot. Creates 3D body mesh, N `HexapodLeg` instances (3–9 legs), holds a `GaitController`. Manages servo value computation, status snapshot/restore. After the hexapod.ts split, geometry construction lives in `bot_geometry.ts`, the guide system in `bot_guides.ts` (`bot.guides`), keyframe animation state in `bot_animator.ts` (`bot.animator` — holds both `mesh` Path A and `body_mesh` Path B), Socket.IO command I/O in `bot_commands.ts` (`bot.commands`), and config helpers in `bot_options.ts`. `apply_attributes()` re-draws the entire bot from config. The `_servo_anim_disabled` flag stays on `Hexapod` (cross-cutting; read by HexapodLeg and gaits.ts) and prevents new animations during rebuilds and transform_body sub-steps; `is_animating()` gates `act()` during active animation.
- `HexapodLeg` — 2–6 DOF limb chain (coxa → femur → tibia → tarsus → segment5 → segment6 → tip). Each limb is a Three.js mesh with `servo_value`, `servo_idx`, `revert` flag. `set_tip_pos()` invokes `PosCalculator`. Uses a `ServoOutput` strategy (`DirectOutput` or `AnimatedOutput`) to control whether servo values are applied instantly or animated through keyframes.
- `GaitController` — Owns gait definitions (leg group patterns), action types (power/efficient/body_first/fast), target modes (translate/target). Uses `gait_configs.ts` presets filtered through `gait_generator.ts` for balance validation. Walking step scheduling is driven by the rAF loop in `SceneCanvas`: each frame, if `gc.expected_action` is set and `bot.is_animating()` is false, the rAF callback calls `gc.act(...)` to start the next step. There is no `setInterval` / `fire_action` / `setTimeout` indirection. `none` physics mode has a manual 30ms floor in the rAF scheduler to preserve legacy pace.
- `PosCalculator` — Inverse kinematics via gradient descent on the servo values for a single leg, minimizing distance to target tip world position. Contains **zero** trigonometric functions. Uses `REG_STRENGTH` (0.05) to pull redundant DOFs toward home servos during iteration. **Calls `set_servo_values()` during IK iterations, which must apply values immediately** (bypass animation) so the Three.js scene-graph FK reads current joint angles.
- `ServoOutput` — Strategy pattern (`src/hexapod/servo_output.ts`). `DirectOutput` applies servo values instantly (`none` mode). `AnimatedOutput` animates through keyframes at `servo_speed` (`servo_constraint` mode). `Hexapod._setLegOutputs(mode)` switches all legs between strategies.
- `JoyStick` — Canvas-based 2D joystick. Accepts either a CSS selector string or a DOM element.

**React integration pattern:**
- `appState.ts` is a mutable singleton holding `{ scene, camera, renderer, controls, stats, keyboard, clock, current_bot, container }`. It bridges the old global-based core logic with React.
- `SceneCanvas` calls `initScene(container)` then `build_bot()` in a useEffect, storing results in both `appState` and React context (`botRef`).
- UI components read `appState.current_bot` (or `botRef.current` via `useHexapod()`) and write back via helpers like `set_bot_options()`. Command + chart displays use HexapodContext callbacks (`onServoUpdate`, `onTimeInterval`). **Status recording lives in a separate external store** — `src/hexapod/recorder.ts` is a `useSyncExternalStore`-backed singleton that the bot pushes into via `onStatusEntry`. Recording is opt-in (explicit Record / Stop button in the Status tab), playback uses recorded `performance.now()` gaps for inter-frame timing. Keeping it out of React context means walking gait doesn't churn the tree on every step.
- `ServoPanel` is React JSX, but its 100ms poll writes slider/end-position values directly to DOM `<input>` elements via refs stashed on `limb.range_control` / `limb.end_x_control` etc. This is an intentional perf escape hatch — re-rendering 18+ sliders at gait rate (~30fps) is too expensive. The JSX itself is memoized.
- `AttributesPanel` is fully declarative React + shadcn/ui (no imperative DOM building).
- `TimeChart` and `LegEditor` use imperative `<canvas>` drawing inside useEffect — this is expected (canvas APIs are inherently imperative).

**Data flow:**
1. Config loaded from `localStorage` key `"hexapod_options"` (fallback: `DEFAULT_HEXAPOD_OPTIONS`)
2. `initScene(container)` → Three.js scene, camera, renderer, animation loop
3. `build_bot()` → `new Hexapod(scene, options)` draws body + N legs (3–9)
4. `laydown()` + `putdown_tips()` places feet on ground plane (y=0)
5. Each movement step calls `after_status_change()` which fires `onServoUpdate` (command/chart display), `onStatusEntry` (recorder push if recording is on), `onTimeInterval` (time chart). It also optionally sends a servo command via WebSocket and updates `on_servo_values` so the next step can compute its delta against it.
6. Servo command format: `#0 P1500 #1 P1500 ... T500` (servo index, pulse width, time interval)

## Three.js API note

This codebase migrated from revision 72 (loaded via `<script>` tag) to modern Three.js (`three ^0.184.0`, ES module from npm) — see commit `e573b34`. All source files use `import * as THREE from 'three'`; there is no `THREE` global.

Modern-API patterns used in src/:
- `THREE.BufferGeometry` (legacy `THREE.Geometry` has been removed from the codebase)
- `Matrix4.applyMatrix4()` (not the legacy `.applyMatrix()`)
- Vector math: `.clone()`, `.applyMatrix4()`, `.setFromMatrixPosition()` — unchanged

Caveats:
- `OrbitControls` is imported from `three/examples/jsm/controls/OrbitControls.js`.
- A small number of files still reference `window.THREE` (e.g. `ServoPanel.tsx`) as a leftover from the script-tag era. These should be migrated to direct `import * as THREE from 'three'`. If you touch one of these files, fix it.
- `Stats.js` is still loaded the old way (`<script src="/libs/Stats.js">` in `index.html`) and is exposed as a global `Stats`. The corresponding `declare class Stats` lives in `src/types/globals.d.ts`.
- `Detector.js` and the `THREEx.*` files in `public/libs/` and `js/` are dead — they are no longer loaded by `index.html` and are not imported anywhere. Safe to delete.

## Design Rules (non-negotiable)

### NO trigonometric functions for joint computation

Trigonometric functions (`Math.sin`, `Math.cos`, `Math.atan2`, etc.) must NEVER be used to compute joint angles or tip positions during gait execution. The ONLY valid uses of trig are:

- **Body geometry initialization** (`computeLegLayout`, `draw_body` polygon vertices) — one-time setup
- **Visual rendering** (scene lighting animation, LegEditor canvas drawing)
- **High-level navigation targets** (`target_with_joystick` — deciding rotation direction from joystick angle)
- **UI helpers** (AttributesPanel edge-length ↔ radius conversion)

### Joint angles are computed EXCLUSIVELY by PosCalculator

`PosCalculator` (`src/hexapod/pos_calculator.ts`) is a gradient-descent inverse kinematics solver. It takes a target tip **world position** (x, y, z) and numerically iterates servo values to minimize distance to that target. It contains **zero** trigonometric functions — purely numerical gradient descent.

The only valid way to move a leg is:

```
leg.set_tip_pos(worldPosition) → PosCalculator.run() → servo values
```

Never bypass this by directly setting servo values or computing angles with trig.

### guide_pos is the unified reference frame for gait movement

`Hexapod.guide_pos` (a `THREE.Object3D` child of `this.mesh`) is the single source of truth for computing target positions during gait cycles. Both `move_tips()` and `move_body()` must use this pattern:

1. `reset_guide_pos()` — reset to identity relative to mesh
2. Apply translation/rotation offsets to `guide_pos`
3. `get_guide_pos(idx)` — read transformed world positions
4. Pass world positions to `leg.set_tip_pos()` → PosCalculator

The `left_gl` / `right_gl` reference lines (rotated by `±rotate_step`) visually indicate the rotation direction guide_pos uses. These are NOT decorative — they must align with the actual tip movement during rotation.

### Gait step factors

Follow the legacy scaling convention:
- **Tips**: move by full step (`fb_step`, `lr_step`, `rotate_step`)
- **Body**: move by `step / leg_groups.length * 3`
- Do NOT use `(n-1)/n` factors or negate rotation direction for tips; tips and body rotate in the same direction

### Servo constraint principle — animation MUST reflect physical reality

There are two physics modes (toggled in ControlPanel, stored as `options.physics_mode`):

**None** (`'none'`): Tips teleport instantly to targets. Servos snap to computed values. `hold_time` uses legacy `SERVO_VALUE_TIME_UNIT` formula (or 0 in manual mode). No animation. This is the original pre-animation behavior.

**Servo Constraint** (`'servo_constraint'`): Each servo has a fixed rotation speed (`servo_speed`, units/sec). The simulation models real servo physics:
- Every servo rotates at **constant speed** toward its target — same speed for all joints
- Joints with larger deltas take longer; joints with smaller deltas finish earlier — **different arrival times**
- During body movement, **tip drift is physically real** — when some servos finish before others, the tip position deviates. This is NOT a bug; real hardware behaves identically
- `hold_time = max(|delta|) / servo_speed * 1000` — gait waits for the slowest servo before the next step

**NEVER artificially synchronize servo timing to make animation "look better."** The animation is a simulation output, not a visual effect. Adding fake uniform timing (e.g., forcing all joints to finish together) violates the servo constraint principle.

### ServoOutput strategy pattern

`src/hexapod/servo_output.ts` — isolates ALL animation state and timing from HexapodLeg.

**Interface (`ServoOutput`):**
- `renderedValues: number[]` — current visual servo values
- `isAnimating(): boolean` — whether keyframe animation is in progress
- `setTargets(targets, capturedRendered?)` — apply targets, optionally anchoring visual state
- `update(now, speed, applyJoint, durationMs?)` — advance one frame; optional `durationMs` overrides per-leg delta timing (used for body_mesh sync)
- `setKeyframes(keyframes, startTime?)` — load multi-segment keyframes; optional `startTime` syncs leg/mesh timers
- `reset()` — discard animation state

**`DirectOutput`** (`none` physics mode): Values snap instantly. `isAnimating()` always false.

**`AnimatedOutput`** (`servo_constraint` mode): Linearly interpolates each joint between consecutive keyframes at constant `servo_speed`. Each leg advances independently by default. `_segmentStartTime = -1` sentinel defers timer init to the first `update()` frame.

**HexapodLeg delegation:**
- `set_servo_values(values)` — applies DIRECTLY to joints (bypasses animation). **PosCalculator calls this during IK iterations and then reads the Three.js scene for FK — joints MUST be at the test values immediately.**
- `set_tip_pos()` — captures `preRendered` BEFORE `PosCalculator.run()`, then calls `_output.setTargets()` to create a 2-keyframe animation from pre-IK to post-IK state. On stall, restores preRendered.
- `is_animating()` / `update_animation()` — delegate to `_output`.

### Keyframe animation system (two independent paths)

As of Phase 5 of the hexapod.ts split, animation state lives on `bot.animator: BotAnimator` (`src/hexapod/bot_animator.ts`) instead of directly on `Hexapod`. The class owns both paths' keyframe arrays, segment indices, timers, and completion callback. `_servo_anim_disabled` is a cross-cutting flag and remains on `Hexapod`.

**Old fields that NO LONGER EXIST:**
- `leg._anim_targets`, `leg._anim_starts`, `leg._anim_start_time` (replaced by `AnimatedOutput` strategy)
- `bot._mesh_start_pos`, `bot._mesh_target_pos`, `bot._mesh_start_rotY`, `bot._mesh_target_rotY`, `bot._mesh_anim_start`, `bot._mesh_anim_duration` (replaced by keyframe arrays on `bot.animator`)
- `Hexapod._mesh_keyframes` / `_segment_durations` / `_current_segment` / `_segment_start_time` / `_body_mesh_keyframes` / `_body_mesh_segment_durations` / `_current_body_mesh_segment` / `_body_mesh_segment_start_time` / `_onBodyAnimComplete` — all relocated to `bot.animator` under the names below

**Path A — Gait walking (`mesh` keyframes):**

Fields (on `bot.animator`):
- `meshKfs: {pos, rotY}[]` — N+1 mesh poses
- `meshDurations: number[]` — N segment durations (ms)
- `meshSegmentIdx: number`, `meshSegmentStart: number`

Flow:
- `GaitController.move_body()` → builds mesh + servo keyframes → `bot.apply_physics_keyframes(...)` (thin forwarder to `bot.animator.applyMeshKeyframes(bot, ...)`)
- Servo keyframes stored per leg via `AnimatedOutput.setKeyframes(kfs, now)` (shared timer)
- `bot.update_servo_animations(now)` (rAF): delegates to `bot.animator.update(now, bot)` which interpolates `mesh.position/rotation.y`, then walks legs and calls `leg.update_animation()`
- Each leg advances independently (own delta-based duration) — **tip drift is expected and physically real**

**Path B — Discrete body transforms (`body_mesh` keyframes):**

Fields (on `bot.animator`):
- `bodyKfs: {pos, rot}[]` — N+1 body_mesh poses
- `bodyDurations: number[]`, `bodySegmentIdx: number`, `bodySegmentStart: number`
- `onBodyAnimComplete: (() => void) | null` — one-shot callback fired when Path B finishes

Flow:
- `transformBodyServo()` (body_motions.ts) → builds body_mesh keyframes + per-leg servo keyframes → loads servo keyframes onto each leg's `_output` AND calls `bot.animator.applyBodyKeyframes(...)`.
- `update_servo_animations()` (rAF): `bot.animator.update` interpolates `body_mesh.position/rotation`. Per-leg `_output.update` interpolates the pre-computed servo keyframes independently. **No per-frame IK runs in this path** — all IK was done upfront when keyframes were built.
- Body slides at `servo_speed` pace; legs reach their target rotations on the same global timing.

**Path B is used for discrete body operations** (squat, auto-level, saved-pose restore) in `servo_constraint` mode. **Live-input body control** (joystick / sliders) uses a different path — `step_body_tracking` (below) — which DOES run per-frame IK and is not part of the animator.

**Computation** in `GaitController.move_body()` servo constraint path:
1. Build N+1 mesh keyframes
2. Keyframe 0 = current rendered servo values
3. For each keyframe k ≥ 1: reset all legs to kf0, move mesh to kf[k], `PhysicsSolver.solveAll()` → servo keyframe k
4. Floating legs: apply homeward bias (0.20) to all keyframes k ≥ 1 to preserve natural leg shape
5. `meshDurations[k] = max(|servoKf[k+1] - servoKf[k]|) / servo_speed * 1000`

**Resetting to kf0 before each solve is CRITICAL.** PosCalculator starts from `limb.servo_value`. Without reset, each keyframe's solve drifts into different local minima → locked tips slide.

### Input → motion architecture (rAF-driven)

There is one rAF loop, set up in `SceneCanvas` via `appState.onAnimate`. Each frame, in order:

1. `bot.update_servo_animations(now)` — advances `bot.animator` (Path A mesh + Path B body_mesh) and per-leg `_output` interpolation.
2. **Body-target tracking**: if `bot.body_target` is set and the animator is idle, call `bot.step_body_tracking(now)`. This snaps `body_mesh` to the target, runs `PhysicsSolver.solveAll` once with locked tips in world / floaters in body-local. Then it caps the per-frame servo delta at `servo_speed × dt / 1000`: if `maxDelta > allowed`, body pose AND servos are linearly interpolated by `ratio = allowed / maxDelta` — that's how the servo PWM speed limit is actually enforced on the live-input path. Bails on `!result.success` (rolls back body + restores `lastApplied` servos). On `_body_tracking_release_pending && arrived`, calls `bot.end_body_tracking()` (emits one status snapshot).
3. **Walking step scheduler**: if `gc.expected_action` is set and `bot.is_animating()` is false, call `gc.act(...)`. In `none` mode, enforce 30ms floor via `gc.last_act_time`. Real servos execute one command at a time — `is_animating()` is the natural condition for "previous step done, start next".
4. **Throttled UI tick (~10Hz)**: call `updateServoDisplay()` for the CommandDisplay readout.

Body joysticks (Move Body / Rotate Body) and the body XYZ/RxRyRz sliders write `bot.body_target` on each mousemove/tick (cheap object assign, no IK). Status entry emission is gated on `!bot._suppress_status_entries`, which body_motions sets during tracking to avoid spamming React state at 60Hz. On release, `body_target` is set to the snapshotted home pose; the rAF chases back naturally.

The legacy `setInterval(30ms)` + `gait_controller.fire_action()` + `GaitInternal` + `internal_move` action are all removed.

**Path B vs body_target chase — both live in `servo_constraint` mode but serve different inputs:**
- Path B (`bot.animator` body_mesh keyframes): discrete pose targets (squat, auto-level, body_home restore). One animation goes from pose A to pose B at servo_speed. Servo keyframes are pre-computed.
- body_target chase (`step_body_tracking`): continuous live input (joystick, sliders). Each rAF tick re-solves IK at the current target, applies a per-frame servo-delta-limited interpolation. No pre-computed keyframes.
- They are mutually exclusive: chase only runs when `animator.isAnimating()` is false (rAF order #2 above).

### PhysicsSolver — multi-leg constraint solver

`src/hexapod/physics_solver.ts` — pure computation, no DOM, no persistent Three.js mutation.

```typescript
PhysicsSolver.solveAll(bot, targets: THREE.Vector3[]): PhysicsSolverResult
```

- `targets[i]` is the world-space target for leg i's tip
- The caller must move the body (mesh/body_mesh) to the target pose BEFORE calling
- Internally runs `PosCalculator` for each leg independently
- Returns `{ success, servoTargets, legResults }`

**Caller's responsibility**: compute explicit world targets for all legs:
- Locked legs (on_floor): target = original world tip position (tip stays fixed in world space)
- Free legs (floating): target = body-local tip transformed through new body pose (tip follows body)

### Reference line system

`guideline`, `left_gl`, `right_gl` are children of `this.mesh`. They show lines from body center to tip positions in mesh-local space.

- **Vertex source**: `_guide_local_positions` (stable home positions), NOT current animated tip positions
- **`guideline`**: body → home tips
- **`left_gl`**: same vertices, Object3D.rotation.y = +rotate_step (shows rotation target)
- **`right_gl`**: same vertices, Object3D.rotation.y = -rotate_step

**`adjust_gait_guidelines()` MUST NOT be called during animation.** It is called only at stable states:
- `apply_attributes()` — bot rebuilt
- rotate_step changes
- After `_body_home` restoration

**`sync_guide_circles()` IS called during animation** — guide circles are world-space ground markers that track current tip positions, not reference indicators.

### _body_home restoration order

`apply_attributes()` flow (order matters):
1. `draw()` — geometry, laydown, putdown_tips, auto_level_body, draw_gait_guidelines, draw_gait_guide
2. Servo reset to 1500 (init_angles baseline)
3. `laydown()`, `sync_guide_circles()`
4. `_body_home` restoration (body pose + tips, tips only on initial build)
5. `laydown()` — re-ground after restoration
6. `sync_guide_circles()`
7. **Rebuild `_guide_local_positions`** from current tip positions
8. `adjust_gait_guidelines()` — MUST be after step 7

`_body_home.save_body_home()` uses `history.save()` (not `set_bot_options()` directly) to keep `history._lastSaved` in sync.
