# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commit convention

All commits made by AI in this repo must use the correct model attribution:

```
Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>
```

The model powering this session is **Deepseek V4 Pro**, not Claude Opus. Update this line if the underlying model changes.

## Overview

JS Hexapod — a Three.js-based 3D hexapod robot simulator with optional physical bot control via Socket.IO. Originally vanilla JS (backed up in `legacy/`), now migrated to **React + Vite**. The old revision 72 Three.js is preserved via script tags so the 3D core logic works unchanged.

## Commands

```bash
npm run dev      # Start dev server (defaults to localhost:3000)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run lint     # ESLint
npx tsc --noEmit # TypeScript type-check
```

Test suite: 55 tests across 4 files (`src/hexapod/__tests__/`), run with `npx vitest run`.

## Code review status

A comprehensive code review was conducted on 2026-05-02 (`docs/code-review-2026-05-02.md`). Of the 4 bugs identified:
- **B1** (`clearInterval` on `setTimeout`) — fixed
- **B2** (circular dependency `hexapod.ts` ↔ `history.ts`) — fixed (history.ts no longer imports from hexapod.ts)
- **B3** (misspelled `degree_to_redius`) — fixed (alias added)
- **B4** (confusing `slice()` args) — fixed (uses `slice(-max_number)`)

Architecture recommendations remain open (see report for details).

## Project structure

```
legacy/                          # Original vanilla JS backup (untouched)
public/libs/                     # Old Three.js libs loaded as globals via <script>
  three.min.js                   #   THREE global (revision 72)
  OrbitControls.js               #   THREE.OrbitControls
  Stats.js, Detector.js          #   Stats, Detector globals
  THREEx.*.js                    #   THREEx global
src/
  main.tsx                       # React entry point
  App.tsx                        # Shell: tabs, layout, HexapodProvider
  App.css                        # Layout styles
  index.css                      # Minimal reset
  context/
    HexapodContext.tsx           # React context: botRef, sceneRef, servo displays, botVersion
  components/
    SceneCanvas.tsx              # Mounts Three.js scene, builds Hexapod on mount
    SceneControls.tsx            # Body/rot joysticks, XYZ/RxRyRz sliders, pose save/recall
    ControlPanel.tsx             # Draw type, move mode, gaits, action buttons, joystick, keyboard
    ServoPanel.tsx               # 18 servo sliders + end-position inputs (per-leg, imperative DOM)
    AttributesPanel.tsx          # Body/leg geometry config with localStorage persistence
    LegEditor.tsx                # 2D canvas joint editor with multi-leg editing
    LegEditor.css                # LegEditor styles
    StatusPanel.tsx              # Status history list with play/apply
    CommandDisplay.tsx           # Current + last servo command strings
    TimeChart.tsx                # Command time interval canvas chart (target for imperative drawing)
    Toolbar.tsx                  # Undo/redo/save toolbar with keyboard shortcuts (Ctrl+Z/Y/S)
    AttrSlider.tsx               # Reusable horizontal slider with step buttons and extend-max
    SliderColumn.tsx             # Reusable slider column (vertical/horizontal, spring-back, step)
  hexapod/
    appState.ts                  # Mutable singleton replacing old window globals
    defaults.ts                  # Constants (HEXAPOD_OPTIONS_KEY, servo ranges, limb defaults) + DEFAULT_HEXAPOD_OPTIONS
    utils.ts                     # DOM/vector/math/localStorage helpers
    scene.ts                     # initScene(container) — Three.js setup, returns {scene, camera, ...}
    joystick2.ts                 # JoyStick class (canvas-based, accepts element or selector)
    pos_calculator.ts            # Inverse kinematics: gradient-descent solver for tip→servo values
    pos_calculator_backup_2026-05-02.ts  # Backup of pre-refactor PosCalculator
    physics_solver.ts            # Multi-leg constraint solver (PhysicsSolver.solveAll)
    servo_output.ts              # ServoOutput interface + DirectOutput / AnimatedOutput strategy
    hexapod.ts                   # Hexapod + HexapodLeg classes, layout computation, config helpers
    gaits.ts                     # GaitController + GaitAction hierarchy (standby, move, internal, putdown)
    gait_configs.ts              # Preset gait definitions by leg count (wave, ripple, tripod, quad)
    gait_generator.ts            # Runtime gait filtering: balance validation, dedup, cyclic rotation
    history.ts                   # Undo/redo stack (singleton, JSON-serialized, max 50 entries)
    random.ts                    # Random options generator for testing/demo
  types/
    globals.d.ts                 # Type declarations for legacy Three.js r72, Stats, Detector, THREEx
    hexapod.d.ts                 # Core interfaces: HexapodOptions, HexapodLegOptions, LimbOptions, etc.
    css.d.ts                     # Module declaration for .css imports
js/                             # Duplicate legacy libs (leftover from old build setup)
stylesheets/
  application.css                # Original UI styles (imported by React app, covers legacy elements)
```

## Architecture

**Core classes (same logic as legacy, now ES modules):**
- `Hexapod` — The bot. Creates 3D body mesh, 6 `HexapodLeg` instances, holds a `GaitController`. Manages servo value computation, status snapshot/restore, and Socket.IO commands to `localhost:8888`. `apply_attributes()` re-draws the entire bot from config. Holds keyframe animation state for both `mesh` (gait path) and `body_mesh` (body control path). The `_servo_anim_disabled` flag prevents new animations during rebuilds and transform_body sub-steps; `is_animating()` gates `act()` during active animation.
- `HexapodLeg` — 2–6 DOF limb chain (coxa → femur → tibia → tarsus → segment5 → segment6 → tip). Each limb is a Three.js mesh with `servo_value`, `servo_idx`, `revert` flag. `set_tip_pos()` invokes `PosCalculator`. Uses a `ServoOutput` strategy (`DirectOutput` or `AnimatedOutput`) to control whether servo values are applied instantly or animated through keyframes.
- `GaitController` — Owns gait definitions (leg group patterns), action types (power/efficient/body_first/fast), target modes (translate/target). Uses `gait_configs.ts` presets filtered through `gait_generator.ts` for balance validation. `fire_action()` runs on a 30ms interval via setInterval in ControlPanel. `act()` is gated by `bot.is_animating()` — new commands are skipped while a previous animation plays.
- `PosCalculator` — Inverse kinematics via gradient descent on the servo values for a single leg, minimizing distance to target tip world position. Contains **zero** trigonometric functions. Uses `REG_STRENGTH` (0.012) to pull redundant DOFs toward home servos during iteration. **Calls `set_servo_values()` during IK iterations, which must apply values immediately** (bypass animation) so the Three.js scene-graph FK reads current joint angles.
- `ServoOutput` — Strategy pattern (`src/hexapod/servo_output.ts`). `DirectOutput` applies servo values instantly (`none` mode). `AnimatedOutput` animates through keyframes at `servo_speed` (`servo_constraint` mode). `Hexapod._setLegOutputs(mode)` switches all legs between strategies.
- `JoyStick` — Canvas-based 2D joystick. Accepts either a CSS selector string or a DOM element.

**React integration pattern:**
- `appState.ts` is a mutable singleton holding `{ scene, camera, renderer, controls, stats, keyboard, clock, current_bot, container }`. It bridges the old global-based core logic with React.
- `SceneCanvas` calls `initScene(container)` then `build_bot()` in a useEffect, storing results in both `appState` and React context (`botRef`).
- UI components read/write `appState.current_bot` directly (the core logic still mutates DOM by ID for `#servo_values`, `#on_servo_values`, `#status_history`, `#chart`).
- Some components (ServoPanel, AttributesPanel) build their DOM imperatively in useEffect to preserve the original DOM-manipulation logic. These can be progressively converted to declarative React later.

**Data flow:**
1. Config loaded from `localStorage` key `"hexapod_options"` (fallback: `DEFAULT_HEXAPOD_OPTIONS`)
2. `initScene(container)` → Three.js scene, camera, renderer, animation loop
3. `build_bot()` → `new Hexapod(scene, options)` draws body + 6 legs
4. `laydown()` + `putdown_tips()` places feet on ground plane (y=0)
5. Each movement step calls `after_status_change()` which updates DOM, optionally sends servo command via WebSocket, and records status history
6. Servo command format: `#0 P1500 #1 P1500 ... T500` (servo index, pulse width, time interval)

## Three.js API note

This codebase uses a revision 72 Three.js API (old `three.min.js` in public/libs/). Notable patterns:
- `THREE.Geometry` (not BufferGeometry)
- `new THREE.Mesh(geometry, material, ...)` with single-material constructor
- `geometry.applyMatrix()` instead of `.applyMatrix4()`
- Vector math: `.clone()`, `.applyMatrix4()`, `.setFromMatrixPosition()`

The old libs are loaded as regular `<script>` tags (not modules) to expose `THREE`, `Stats`, `Detector`, `THREEx` globals.

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

**Old fields that NO LONGER EXIST:**
- `leg._anim_targets`, `leg._anim_starts`, `leg._anim_start_time`
- `bot._mesh_start_pos`, `bot._mesh_target_pos`, `bot._mesh_start_rotY`, `bot._mesh_target_rotY`, `bot._mesh_anim_start`, `bot._mesh_anim_duration`
- `bot._servo_anim_disabled` on Hexapod (replaced by `_servo_anim_disabled` flag + `_setLegOutputs()`)

**Path A — Gait walking (`mesh` keyframes):**

Fields:
- `Hexapod._mesh_keyframes: {pos, rotY}[]` — N+1 mesh poses
- `Hexapod._segment_durations: number[]` — N segment durations (ms)
- `Hexapod._current_segment: number`, `_segment_start_time: number`

Flow:
- `GaitController.move_body()` → builds mesh + servo keyframes → `apply_physics_keyframes()`
- Servo keyframes stored per leg via `AnimatedOutput.setKeyframes(kfs, now)` (shared timer)
- `update_servo_animations()` (rAF): interpolates `mesh.position/rotation.y` + calls `leg.update_animation()`
- Each leg advances independently (own delta-based duration) — **tip drift is expected and physically real**

**Path B — Body control (`body_mesh` keyframes):**

Fields:
- `Hexapod._body_mesh_keyframes: {pos, rot}[]` — N+1 body_mesh poses
- `Hexapod._body_mesh_segment_durations: number[]`, `_current_body_mesh_segment: number`, `_body_mesh_segment_start_time: number`
- `Hexapod._body_targets: THREE.Vector3[]` — world-space tip targets for per-frame IK

Flow:
- `GaitInternal.move()` → `transform_body_servo()` → builds body_mesh keyframes + world targets → stores on bot
- Leg servo keyframes are NOT pre-computed for this path
- `update_servo_animations()` (rAF): interpolates `body_mesh.position/rotation` → runs `PhysicsSolver.solveAll()` at each frame with exact body_mesh pose → applies via `set_servo_values()` directly
- **Tip locking is exact** (per-frame IK eliminates interpolation error). Body slides at `servo_speed` pace.
- `_servo_anim_disabled` toggled during solves to prevent per-leg animations.

**Path B key difference:** Leg servos snap per frame rather than animating through pre-computed keyframes. This trades servo animation smoothness for perfect tip locking — critical for body control where tips must stay planted while the body shifts.

**Computation** in `GaitController.move_body()` servo constraint path:
1. Build N+1 mesh keyframes
2. Keyframe 0 = current rendered servo values
3. For each keyframe k ≥ 1: reset all legs to kf0, move mesh to kf[k], `PhysicsSolver.solveAll()` → servo keyframe k
4. Floating legs: apply homeward bias (0.20) to all keyframes k ≥ 1 to preserve natural leg shape
5. `_segment_durations[k] = max(|servoKf[k+1] - servoKf[k]|) / servo_speed * 1000`

**Resetting to kf0 before each solve is CRITICAL.** PosCalculator starts from `limb.servo_value`. Without reset, each keyframe's solve drifts into different local minima → locked tips slide.

### Input gating

`GaitController.act()` checks `bot.is_animating()` at entry and returns early if true. Real servos execute one command at a time — during active animation, new inputs are skipped (keyboard) or accumulated via `GaitInternal.position/rotation` (joystick).

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
