# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

JS Hexapod — a Three.js-based 3D hexapod robot simulator with optional physical bot control via Socket.IO. Originally vanilla JS (backed up in `legacy/`), now migrated to **React + Vite**. The old pre-r69 Three.js is preserved via script tags so the 3D core logic works unchanged.

## Commands

```bash
npm run dev      # Start dev server (defaults to localhost:3000)
npm run build    # Production build to dist/
npx vite build   # Same as npm run build
```

No test suite exists yet.

## Project structure

```
legacy/                          # Original vanilla JS backup (untouched)
public/libs/                     # Old Three.js libs loaded as globals via <script>
  three.min.js                   #   THREE global (pre-r69)
  OrbitControls.js               #   THREE.OrbitControls
  Stats.js, Detector.js          #   Stats, Detector globals
  THREEx.*.js                    #   THREEx global
src/
  main.tsx                       # React entry point
  App.tsx                        # Shell: tabs, layout, HexapodProvider
  App.css                        # Layout styles
  index.css                      # Minimal reset
  context/
    HexapodContext.tsx           # React context: botRef, sceneRef, servo displays
  components/
    SceneCanvas.tsx              # Mounts Three.js scene, builds Hexapod on mount
    ControlPanel.tsx             # Draw type, move mode, gaits, action buttons, joystick, keyboard
    ServoPanel.tsx               # 18 servo sliders + end-position inputs (per-leg)
    AttributesPanel.tsx          # Body/leg geometry config with localStorage persistence
    StatusPanel.tsx              # Status history list with play/apply
    CommandDisplay.tsx           # Current + last servo command strings
    TimeChart.tsx                # Command time interval canvas chart
  hexapod/
    appState.ts                  # Mutable singleton replacing old window globals
    defaults.ts                  # Constants + DEFAULT_HEXAPOD_OPTIONS (6 legs, servo ranges)
    utils.ts                     # DOM/vector/math/localStorage helpers
    scene.ts                     # initScene(container) — Three.js setup, returns {scene, camera, ...}
    joystick2.ts                 # JoyStick class (canvas-based, accepts element or selector)
    pos_calculator.ts            # Inverse kinematics: gradient-descent solver for tip→servo values
    hexapod.ts                   # Hexapod + HexapodLeg classes, get/set_bot_options, build_bot
    gaits.ts                     # GaitController + GaitActions (auto-generated gaits from leg count)
stylesheets/
  application.css                # Original UI styles (buttons, tabs, sliders, etc.)
```

## Architecture

**Core classes (same logic as legacy, now ES modules):**
- `Hexapod` — The bot. Creates 3D body mesh, 6 `HexapodLeg` instances, holds a `GaitController`. Manages servo value computation, status snapshot/restore, and Socket.IO commands to `localhost:8888`. `apply_attributes()` re-draws the entire bot from config.
- `HexapodLeg` — Three limb segments (coxa → femur → tibia → tip). Each limb is a Three.js mesh with `servo_value`, `servo_idx`, `revert` flag. `set_tip_pos()` invokes `PosCalculator`.
- `GaitController` — Owns gait definitions (leg group patterns), action types (power/efficient/body_first/fast), target modes (translate/target). `fire_action()` runs on a 30ms interval via setInterval in ControlPanel.
- `PosCalculator` — Inverse kinematics via gradient descent on the three servo values for a single leg, minimizing distance to target tip world position.
- `JoyStick` — Canvas-based 2D joystick. Accepts either a CSS selector string or a DOM element.

**React integration pattern:**
- `appState.js` is a mutable singleton holding `{ scene, camera, renderer, controls, stats, keyboard, clock, current_bot, container }`. It bridges the old global-based core logic with React.
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

This codebase uses a pre-r69 Three.js API (old `three.min.js` in public/libs/). Notable patterns:
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
