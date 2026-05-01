# JS Hexapod ver.0.8.0

Three.js 3D hexapod robot simulator with optional physical bot control via Socket.IO.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build to dist/
```

## Features

- **3D Preview** — OrbitControls, grid, mesh/bone/points draw modes
- **Gait Engine** — tripod, ripple, quad, wave, dual_tripod gaits with power/efficient/fast modes
- **Inverse Kinematics** — gradient-descent PosCalculator, no trig-based joint computation
- **Leg Editor** — 2D canvas drag-to-adjust segment lengths and angles, per-leg DOF support
- **Servo Control** — 18-servo sliders with real-time command display and time chart
- **Physical Bot** — Socket.IO to `localhost:8888`, servo pulse command protocol
- **Config Persistence** — localStorage save/load, export/import JSON profiles, undo/redo
- **Random Generator** — one-click random bot parameters

## Architecture

```
src/
  main.tsx                    # React entry point
  App.tsx                     # Shell: tabs, layout, HexapodProvider
  context/HexapodContext.tsx  # botRef, sceneRef, servo display, version bump
  components/
    SceneCanvas.tsx           # Three.js scene mount, builds Hexapod
    ControlPanel.tsx          # Draw type, move mode, gaits, actions, joystick
    AttributesPanel.tsx       # Body/leg geometry, DOF, legs, tip spread, Profile
    ServoPanel.tsx            # 18 servo sliders + end-position inputs
    LegEditor.tsx             # 2D canvas joint editor
    StatusPanel.tsx           # Status history with play/apply
    CommandDisplay.tsx        # Current + last servo command
    TimeChart.tsx             # Command time interval chart
    AttrSlider.tsx            # Reusable labeled range slider
  hexapod/
    hexapod.ts                # Hexapod, HexapodLeg, config helpers
    gaits.ts                  # GaitController, gait definitions
    pos_calculator.ts         # Gradient-descent IK solver
    scene.ts                  # initScene — Three.js setup
    joystick2.ts              # Canvas-based 2D joystick
    defaults.ts               # Constants, DEFAULT_HEXAPOD_OPTIONS
    utils.ts                  # DOM/vector/math/localStorage helpers
    appState.ts               # Mutable singleton state
    history.ts                # Undo/redo stack
    random.ts                 # Random options generator
```

## Design Rules

- **No trig for joints** — `PosCalculator` uses gradient descent, never sin/cos/atan2
- **guide_pos** is the unified reference frame for all gait tip/body movement
- **Gait step factors**: tips move by full step, body by `step / leg_groups.length * 3`

## Three.js

Uses pre-r69 Three.js (loaded as globals via `<script>`):
- `THREE.Geometry` (not BufferGeometry)
- Single-material mesh constructor
- `.applyMatrix()` (not `.applyMatrix4()`)

## Servo Command Format

```
#0 P1500 #1 P1500 #2 P1500 ... T500
```
Servo index, pulse width (500–2500), time interval in ms.

## License

By Daniel Cheang @ 2015
