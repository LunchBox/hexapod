# Hexapod Architecture (current)

> Snapshot of how the running bot actually works, taken 2026-05-29 by
> re-reading the code (not just `CLAUDE.md`). See "CLAUDE.md drift" at the
> bottom for places the existing docs are out of date.

## 0. One rAF loop drives everything

Set up in `src/components/SceneCanvas.tsx:37-68`. Each frame, in order:

```
appState.onAnimate(now):
  1. bot.update_servo_animations(now)             # advance keyframes / interp
  2. if bot.body_target && !animator.isAnimating():
       bot.step_body_tracking(now)                # live joystick / slider chase
       if not moved && _body_tracking_release_pending: end_body_tracking()
  3. if gc.expected_action && !bot.is_animating():
       gc.act(gc.expected_action)                 # walking step scheduler
       # `none` mode also enforces a 30ms floor here
  4. if now - lastUITick > 100: updateServoDisplay()  # UI throttle ~10Hz
```

The legacy `setInterval(30ms)` + `fire_action` + `GaitInternal` /
`internal_move` machinery is gone. "Is the previous animation done?" is
the natural condition for "may I start the next step?" — physical servos
work the same way.

## 1. Three motion sources (mutually exclusive, share one render pipeline)

### A. Walking gait — `GaitController.act()` (`src/hexapod/gaits.ts`)

Triggered by WASD keyboard or the Move joystick. Flow:

```
follow(joystick) / keydown
  → set gc.expected_action / fb_direction / lr_direction
  → next rAF tick sees !is_animating(), calls gc.act("follow_joystick")
  → action.run() runs the current step (legs_up / legs_move / legs_down /
    body_move) for the active leg group
  → sub-action constructs keyframes via set_tip_pos / move_body
  → bot.apply_physics_keyframes(meshKfs, durations, servoKfsByLeg)
    = bot.animator.applyMeshKeyframes(...)    (Path A)
  → after_status_change()  →  status entry + cmd string + WebSocket send
```

`move_body()` (gaits.ts:426) is the heart of walking under
`servo_constraint`: it snapshots `current_tips_pos` (world-space locked
tips), then for each of N micro-steps it pushes mesh to the intermediate
keyframe pose and runs `PhysicsSolver.solveAll` — **resetting every
leg's servos to kf0 before each solve** (gaits.ts:501-503). Without that
reset, redundant DOFs land in different local minima per keyframe and
locked tips slide. Floating legs get a 20% homeward bias on the resulting
servo keyframes to preserve natural leg shape during swing.

### B. Live input chase — `body_target` (`body_motions.ts:stepBodyTracking`)

Triggered by Body / Rot joysticks and the 6 body sliders in
`SceneControls.tsx`. Flow:

```
mousedown → bot.begin_body_tracking():
  capture locked_world_tips    (on_floor tips, world)
  capture local_tips           (floating tips, body-local)
  capture init_servos          (IK anchor per frame — prevents 4+ DOF drift)

mousemove → bot.body_target = { px, py, pz, rx, ry, rz }   # plain assign

rAF each frame → step_body_tracking(now):
  1. dt = now - last_time
  2. snap body_mesh to target
  3. compute per-leg world tip targets
     (locked → original world pos; floating → body_mesh.localToWorld(local_tip))
  4. legs.set_servo_values(init_servos)                # reset IK anchor
  5. PhysicsSolver.solveAll → result.servoTargets
  6. maxDelta = max |servoTargets - lastApplied|
  7. allowed = servo_speed × dt / 1000
     if servo_constraint && maxDelta > allowed:
       ratio = allowed / maxDelta
       linearly interp body_mesh AND servos by ratio
     else: snap to target
  8. sync_guide_circles
  9. after_status_change   (entry suppressed by _suppress_status_entries)

mouseup → body_target = home_snapshot
        _body_tracking_release_pending = true
  rAF chase returns to home, arrived → end_body_tracking() emits ONE entry
```

This path does **not** go through the animator. Per-frame IK + ratio
interp is what enforces the servo PWM speed limit on body chase.

### C. Discrete body ops — `transform_body` family (`body_motions.ts`)

Triggered by R / F (raise / lower), Squat, Auto-level, etc.
`transformBody` is the workhorse:

```
snapshot prev pose + savedServos
body_mesh.position += dx,dy,dz; body_mesh.rotation += rx,ry,rz
for each leg: solve_from_home(current_tip)    # one IK pass anchored at home
if any null: rollback body + servos; return false
else: apply newServos; sync_guide_circles; after_status_change
```

Single-pass solve (~4× faster than the old 3-substep variant). Under
`servo_constraint` the variant `transformBodyServo` runs Path B
(`bot.animator.applyBodyKeyframes`) for an animated transition.

## 2. Animation pipeline — `bot.animator` + per-leg `_output`

`BotAnimator` (`bot_animator.ts`) owns two body-level keyframe tracks:

|                       | **Path A — mesh**                                | **Path B — body_mesh**                   |
| --------------------- | ------------------------------------------------ | ---------------------------------------- |
| Used for              | Walking gait body translation/rotation           | Discrete body transform (servo_constraint) |
| Fields interpolated   | `mesh.position.x/z` + `rotation.y`               | `body_mesh.position` + `rotation` (6 DOF) |
| Loaded by             | `applyMeshKeyframes` from `gc.move_body`         | `applyBodyKeyframes` from `transformBodyServo` |
| Leg servo keyframes   | Loaded inline (same call)                        | Pre-loaded by the caller                 |
| Completion callback   | none                                             | `onBodyAnimComplete`                     |

Per-leg `_output` (`servo_output.ts`):

- `DirectOutput` — used in `none` mode. `setKeyframes` is no-op; `update`
  is no-op. Values snap via `set_servo_values`.
- `AnimatedOutput` — used in `servo_constraint`. Stores a keyframe array
  and walks through segments at the leg's own delta-based duration
  (`max(|kf[k+1] - kf[k]|) / speed × 1000`). Each frame, `update()`
  interpolates `renderedValues[i]` and calls `applyJoint(i, val)`.

Crucially: **each leg advances independently**. The mesh path uses one
global duration (slowest leg), but a leg with smaller delta arrives
earlier and sits still until the segment ends. Mid-segment **tip drift
is physically real** (real servos with different deltas would arrive at
different times). It is not a bug.

### `_servo_anim_disabled` — what it actually gates

Cross-cutting flag on `Hexapod`. Read in:

- `hexapod_leg.ts:323` — `set_tip_pos` skips creating a 2-keyframe
  animation when this is true (PosCalculator already applied values
  directly during IK).
- `body_motions.ts` (multiple sites) — discrete transforms push true
  before solving, restore on exit. Prevents the per-IK-iteration servo
  writes from being interpreted as animation requests.
- `gaits.ts:288` — `act()` sets this to `physics_mode !== 'servo_constraint'`.

It does **not** gate `animator.update()` — the animator always runs. It
only gates the creation of *new* per-leg animations from `set_tip_pos`.

## 3. Inverse kinematics — two layers

- **`PosCalculator`** (`pos_calculator.ts`) — pure gradient descent over
  servo values, minimizing distance from leg tip to a world target.
  **Zero trigonometric functions**. Reads home servos for regularization
  (REG_STRENGTH = 0.05) — pulls redundant DOFs toward home so 4+ DOF legs
  keep a natural shape. Calls `leg.set_servo_values()` repeatedly during
  iteration, then reads the Three.js scene-graph for FK — so
  `set_servo_values` must apply joint rotation immediately.

- **`PhysicsSolver.solveAll(bot, targets[])`** (`physics_solver.ts`) —
  runs PosCalculator per leg. The caller is responsible for computing
  each leg's **world-space** target:
  - Locked legs (on_floor): target = original world tip position
  - Free legs: target = body_mesh.localToWorld(body-local home tip)
  Returns `{ success, servoTargets[legIdx][jointIdx], legResults, stalledLegs }`.

The only legitimate way to move a leg is `leg.set_tip_pos(worldPos)` →
PosCalculator → servo values. Direct servo writes or trigonometric
angle math are forbidden during gait (see `CLAUDE.md` Design Rules).

## 4. Reference frames

```
scene
├── mesh                          # walking pose accumulator (xz pos + y rot)
│   ├── body_mesh                 # 6-DOF body offset from mesh center
│   │   ├── 6 leg limb chains
│   │   └── head indicator
│   ├── guide_pivot (Object3D)    # at body ground center, y=0
│   │   └── guide_pos             # unified reference frame for gait targets
│   └── guideline / left_gl / right_gl   # mesh-children, auto-follow transform
└── circles[] / labels[]          # WORLD-SPACE, need sync_guide_circles()
```

Two classes of guide visuals:

- **Mesh-children** (`guideline`, `left_gl`, `right_gl`) follow
  automatically when `mesh.position/rotation` change — but need
  `mesh.updateMatrixWorld()` for correct rendering after a snap.
- **World-space** (`circles`, `labels`) do NOT auto-follow. During
  animation, `update_servo_animations` calls `sync_guide_circles()` each
  frame when `anyAnimating` is true. For discrete snaps (recorder
  playback, undo/redo, click-to-apply) the caller must sync explicitly —
  `apply_status` does this internally as of commit `76910e2`.

## 5. State capture & persistence — three independent stores

- **`get_status()` / `apply_status(s)`** — full visual snapshot: mesh
  pose, body_mesh pose, center_offset, per-limb position/rotation/
  servo_value/servo_idx, on_floor flag. `apply_status` is a snap-restore.
- **`history`** — undo/redo stack of `options` JSON strings (config, not
  pose). Max 50 entries. Used by Toolbar undo/redo and bot rebuild flows.
- **`recorder`** (`src/hexapod/recorder.ts`) — external store backed by
  `useSyncExternalStore`. Stores status snapshots + capture timestamps +
  the `physics_mode` / `servo_speed` in effect at capture. **Record + playback
  are supported only in `none` physics mode** — servo_constraint capture +
  playback was removed: a recording samples only sparse gait endpoints and
  cannot be replayed without tip drift. `push` drops frames captured outside
  `none`; `play` refuses while the bot is in servo_constraint; the Status tab
  disables Record / Play (keyed on `botVersion`, bumped by the physics-mode
  toggle) and shows a hint. Playback is **snap-based**: each frame is applied
  exactly with `apply_status` (a recorded pose is a valid IK solution, so
  locked tips sit where they belong → zero drift), and the recorder only
  controls the dwell time between snaps. It deliberately does **not**
  interpolate between frames:
  a recording samples only the endpoints of each gait sub-step / a ~11Hz
  body-tracking tick, and linearly blending mesh + body_mesh + servo values
  between sparse endpoints does not preserve tip lock (the FK map is
  non-linear), making the whole bot slide. Segment pacing is selectable via
  `play_speed_mode`: `'recorded'` reproduces the original timing using the
  per-segment timestamp gap (falling back to `servo_speed × delta` at the
  loop seam / when timestamps are unusable); `'current'` recomputes every
  segment from the bot's live `servo_speed`. Playback first quiesces all
  other motion sources (body_target, gait, animator, per-leg `_output`) so
  nothing fights the snaps. Body-tracking sessions (`step_body_tracking`)
  release a throttled status entry (~11Hz) so joystick / slider body motion
  is captured while recording, instead of being fully suppressed.

## 6. CLAUDE.md drift (caught by code re-read)

- **"Path B `update_servo_animations` runs `PhysicsSolver.solveAll`
  per frame"** — stale. Current `bot_animator.ts` Path B only interpolates
  body_mesh; leg servos animate from pre-loaded keyframes in their
  `_output`. The per-frame IK approach lives in `step_body_tracking`,
  not the animator.
- **"30ms interval" + `fire_action` + `internal_move`** — all gone after
  the rAF rewrite. The current CLAUDE.md "Input → motion architecture"
  section is correct; older paragraphs still reference the legacy model.
- **`adjust_gait_guidelines()` MUST NOT be called during animation** —
  still correct as a rule, but `apply_status` (used by recorder
  playback) doesn't run during animator activity, so calling
  `sync_guide_circles` there is safe.

## 7. Tip-drift acceptance vs tip-lock guarantees

| Scenario | Tip drift behavior | Why |
|---|---|---|
| Walking gait (Path A) | Mid-segment drift expected, drift resolved at keyframe boundaries | Each leg has its own delta-based timing |
| `step_body_tracking` (live chase) | No mid-frame drift — single IK per frame at exact body pose | Per-frame IK with init_servos anchor |
| `transformBodyServo` (Path B) | Mid-segment drift expected | Pre-computed servo keyframes, body interpolation |
| `transformBody` (discrete) | None — single solve | `solve_from_home` anchored at home_servos |

The "right answer" for tip locking depends on which entry path is being
used. Don't mix expectations across paths.
