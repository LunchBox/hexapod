import * as THREE from 'three';
import { history } from './history.js';
import { PhysicsSolver } from './physics_solver.js';

/** Standalone body-motion functions extracted from the Hexapod class.
 *  Each function takes `bot` as its first parameter and mutates it directly —
 *  no encapsulation, just procedural decomposition for reader cognitive load.
 *  Hexapod retains thin wrapper methods so external callers see no diff. */

export type TransformBodyOpts = {
  dx?: number; dy?: number; dz?: number;
  rx?: number; ry?: number; rz?: number;
  lockTips?: boolean;
};

export type TransformBodyServoOpts = {
  dx?: number; dy?: number; dz?: number;
  rx?: number; ry?: number; rz?: number;
};

export type BodyPose = {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
};

/** Begin a continuous body-tracking session driven by joystick / slider input.
 *  Captures three anchors that stay constant for the whole session:
 *   1. tip world positions — locked legs stay here while body slides
 *   2. body-local tip positions — floating legs track these as body moves
 *   3. per-leg servo values — IK each frame resets to these before solving
 *
 *  The servo anchor (3) is critical for 4+ DOF redundant legs: without it,
 *  each frame's IK starts from the previous frame's joint values and the
 *  redundant DOFs drift to different local minima, deforming the leg shape.
 *  See transform_body_servo (Path B) which uses the same kf0-reset pattern. */
export function beginBodyTracking(bot: any) {
  bot.body_tracking_active = true;
  bot._body_tracking_release_pending = false;
  bot._body_tracking_last_time = performance.now();
  bot.mesh.updateMatrixWorld();
  bot._body_tracking_locked_world_tips = bot.get_tip_pos();
  bot._body_tracking_local_tips = bot._body_tracking_locked_world_tips.map(
    (t: any) => bot.body_mesh.worldToLocal(t.clone()),
  );
  bot._body_tracking_init_servos = bot.legs.map((leg: any) => {
    const arr: number[] = [];
    for (let j = 0; j < leg.joint_count; j++) {
      arr.push(leg.limbs[j].servo_value);
    }
    return arr;
  });
}

/** Advance body_mesh one frame toward bot.body_target.
 *  Each axis delta is clamped to a per-frame step proportional to servo_speed × dt
 *  (so motion respects the servo constraint). Runs PhysicsSolver.solveAll once with
 *  locked tip world targets for on_floor legs and body-local tip targets for floaters.
 *
 *  Returns true if body moved this frame; false if it has arrived (within epsilon).
 *  Status entries are suppressed during the session; one final entry is emitted by
 *  endBodyTracking. */
export function stepBodyTracking(bot: any, now: number): boolean {
  if (!bot.body_target) return false;

  const dt = Math.max(1, now - bot._body_tracking_last_time);
  bot._body_tracking_last_time = now;

  const speed = bot.servo_speed || 2000;
  // Heuristic: max body delta per frame proportional to servo_speed × dt.
  // 2000 units/sec ÷ 600 ≈ 3.3 mm at 16ms ≈ ~200 mm/sec body speed.
  // Rotation: tighter — ~0.001 rad at 16ms ≈ ~4 deg/sec.
  const MAX_POS_STEP = speed * dt / 600;
  const MAX_ROT_STEP = speed * dt / 30000;

  const bm = bot.body_mesh;
  const t = bot.body_target;
  const clamp = (delta: number, max: number) =>
    Math.abs(delta) < 0.001 ? 0 : Math.sign(delta) * Math.min(Math.abs(delta), max);

  const dx  = clamp(t.px - bm.position.x, MAX_POS_STEP);
  const dy  = clamp(t.py - bm.position.y, MAX_POS_STEP);
  const dz  = clamp(t.pz - bm.position.z, MAX_POS_STEP);
  const drx = clamp(t.rx - bm.rotation.x, MAX_ROT_STEP);
  const dry = clamp(t.ry - bm.rotation.y, MAX_ROT_STEP);
  const drz = clamp(t.rz - bm.rotation.z, MAX_ROT_STEP);

  if (dx === 0 && dy === 0 && dz === 0 && drx === 0 && dry === 0 && drz === 0) {
    return false; // arrived
  }

  bm.position.x += dx;
  bm.position.y += dy;
  bm.position.z += dz;
  bm.rotation.x += drx;
  bm.rotation.y += dry;
  bm.rotation.z += drz;
  bm.updateMatrixWorld();
  bot.mesh.updateMatrixWorld();

  // Build per-leg world targets: locked legs stay in world, floaters follow body
  const targets: any[] = [];
  const totalLegs = bot.legs.length;
  for (let i = 0; i < totalLegs; i++) {
    if (bot.legs[i].on_floor) {
      targets.push(bot._body_tracking_locked_world_tips[i]);
    } else {
      targets.push(bot.body_mesh.localToWorld(bot._body_tracking_local_tips[i].clone()));
    }
  }

  // Reset legs to the captured init servos BEFORE solving. This anchors each
  // frame's IK to the same starting joint configuration so 4+ DOF redundant
  // legs converge consistently. Same pattern as transform_body_servo's
  // kf0-reset before each microstep.
  const prevDisabled = bot._servo_anim_disabled;
  bot._servo_anim_disabled = true;
  for (let i = 0; i < totalLegs; i++) {
    bot.legs[i].set_servo_values(bot._body_tracking_init_servos[i]);
  }

  const stallThreshold = bot.options.servo_stall_threshold ?? 0;
  const groundConstraint = bot.options.ground_constraint ?? true;
  const result = PhysicsSolver.solveAll(bot, targets, stallThreshold, groundConstraint);
  for (let i = 0; i < totalLegs; i++) {
    bot.legs[i].set_servo_values(result.servoTargets[i]);
  }
  bot._servo_anim_disabled = prevDisabled;
  bot.sync_guide_circles();

  // after_status_change runs but the onStatusEntry callback is suppressed
  // for the duration of the session — see Hexapod.after_status_change gating.
  bot._suppress_status_entries = true;
  bot.after_status_change();
  bot._suppress_status_entries = false;

  return true;
}

/** End a body-tracking session. Clears body_target + tracking state and emits one
 *  status entry capturing the final pose for undo/history. Also forces a final
 *  servo reset to the captured init values — guarantees the leg shape returns
 *  to its pre-tracking state on release (4+ DOF redundant legs may otherwise
 *  end the session at a near-init but not identical joint configuration). */
export function endBodyTracking(bot: any) {
  if (bot._body_tracking_init_servos) {
    for (let i = 0; i < bot.legs.length; i++) {
      bot.legs[i].set_servo_values(bot._body_tracking_init_servos[i]);
    }
  }
  bot.body_tracking_active = false;
  bot._body_tracking_release_pending = false;
  bot.body_target = null;
  bot._body_tracking_locked_world_tips = null;
  bot._body_tracking_local_tips = null;
  bot._body_tracking_init_servos = null;
  bot.after_status_change();
}

/** Centralized body transform with optional tip lock.
 *  When lockTips is true (default unless options._tip_lock is false),
 *  subdivides into up to 3 IK sub-steps and rolls back if drift > 8mm. */
export function transformBody(bot: any, opts: TransformBodyOpts): boolean {
  const lock = opts.lockTips ?? (bot.options._tip_lock !== false);
  if (!lock) {
    if (opts.dx != null) bot.body_mesh.position.x += opts.dx;
    if (opts.dy != null) bot.body_mesh.position.y += opts.dy;
    if (opts.dz != null) bot.body_mesh.position.z += opts.dz;
    if (opts.rx != null) bot.body_mesh.rotation.x += opts.rx;
    if (opts.ry != null) bot.body_mesh.rotation.y += opts.ry;
    if (opts.rz != null) bot.body_mesh.rotation.z += opts.rz;
    bot.body_mesh.updateMatrixWorld();
    bot.after_status_change();
    return true;
  }

  const current_tips = bot.get_tip_pos();

  // Subdivide into at most 3 steps for smooth IK.
  // body_mesh moves immediately here so per-leg keyframe animations
  // in set_tip_pos() would start from a stale pre-move rendered state
  // while body_mesh is already at the target — tip lock desync.
  // Gait-based body movement uses the multi-keyframe path in
  // GaitController.move_body() instead.
  const prevDisabled = bot._servo_anim_disabled;
  bot._servo_anim_disabled = true;

  const steps = 3;
  const total_legs = bot.legs.length;
  for (let s = 0; s < steps; s++) {
    const prevRZ = bot.body_mesh.rotation.z;
    const prevRX = bot.body_mesh.rotation.x;
    const prevRY = bot.body_mesh.rotation.y;
    const prevPX = bot.body_mesh.position.x;
    const prevPY = bot.body_mesh.position.y;
    const prevPZ = bot.body_mesh.position.z;

    if (opts.dx != null) bot.body_mesh.position.x += opts.dx / steps;
    if (opts.dy != null) bot.body_mesh.position.y += opts.dy / steps;
    if (opts.dz != null) bot.body_mesh.position.z += opts.dz / steps;
    if (opts.rx != null) bot.body_mesh.rotation.x += opts.rx / steps;
    if (opts.ry != null) bot.body_mesh.rotation.y += opts.ry / steps;
    if (opts.rz != null) bot.body_mesh.rotation.z += opts.rz / steps;
    bot.body_mesh.updateMatrixWorld();

    for (let i = 0; i < total_legs; i++) {
      bot.legs[i].set_tip_pos(current_tips[i]);
    }

    // Check drift
    const newTips = bot.get_tip_pos();
    let maxDrift = 0;
    for (let i = 0; i < total_legs; i++) {
      const d = current_tips[i].distanceTo(newTips[i]);
      if (d > maxDrift) maxDrift = d;
    }
    if (maxDrift > 8) {
      bot.body_mesh.rotation.z = prevRZ;
      bot.body_mesh.rotation.x = prevRX;
      bot.body_mesh.rotation.y = prevRY;
      bot.body_mesh.position.x = prevPX;
      bot.body_mesh.position.y = prevPY;
      bot.body_mesh.position.z = prevPZ;
      bot.body_mesh.updateMatrixWorld();
      for (let i = 0; i < total_legs; i++) {
        bot.legs[i].set_tip_pos(current_tips[i]);
      }
      bot.after_status_change();
      bot._servo_anim_disabled = prevDisabled;
      return false;
    }
  }
  bot.sync_guide_circles();
  bot.after_status_change();
  bot._servo_anim_disabled = prevDisabled;
  return true;
}

/** Servo-constraint version of transform_body.
 *  Pre-computes leg servo keyframes at each intermediate body pose
 *  (same pattern as GaitController.move_body) so the rAF loop only
 *  interpolates — zero per-frame IK overhead. */
export function transformBodyServo(bot: any, opts: TransformBodyServoOpts): boolean {
  const dx = opts.dx || 0, dy = opts.dy || 0, dz = opts.dz || 0;
  const rx = opts.rx || 0, ry = opts.ry || 0, rz = opts.rz || 0;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 && Math.abs(dz) < 0.001 &&
      Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001 && Math.abs(rz) < 0.001) {
    return false;
  }

  const startPos = bot.body_mesh.position.clone();
  const startRot = bot.body_mesh.rotation.clone();
  const current_tips = bot.get_tip_pos();
  const totalLegs = bot.legs.length;
  const speed = bot.servo_speed || 2000;
  const microSteps = Math.max(1, bot.options.micro_steps || 1);
  const stallThreshold = bot.options.servo_stall_threshold ?? 0;
  const groundConstraint = bot.options.ground_constraint ?? true;

  // Save keyframe 0: current rendered servo values
  const servoKfs: number[][][] = [];
  for (let i = 0; i < totalLegs; i++) {
    const kf0: number[] = [];
    for (let j = 0; j < bot.legs[i].joint_count; j++) {
      kf0.push(bot.legs[i].limbs[j]._rendered_servo_value);
    }
    servoKfs.push([kf0]);
  }

  // Build body_mesh keyframes (N+1 poses)
  const bodyKfs: { pos: any; rot: any }[] = [];
  for (let k = 0; k <= microSteps; k++) {
    const t = k / microSteps;
    bodyKfs.push({
      pos: new THREE.Vector3(
        startPos.x + dx * t, startPos.y + dy * t, startPos.z + dz * t),
      rot: { x: startRot.x + rx * t, y: startRot.y + ry * t, z: startRot.z + rz * t },
    });
  }

  // Body-local tip positions (before body moves)
  bot.mesh.updateMatrixWorld();
  const bodyLocalTips = current_tips.map((t: any) =>
    bot.body_mesh.worldToLocal(t.clone()));

  // Solve IK at each intermediate keyframe (k ≥ 1)
  const prevDisabled = bot._servo_anim_disabled;
  bot._servo_anim_disabled = true;
  for (let k = 1; k <= microSteps; k++) {
    // Reset all legs to keyframe-0 before each solve (stability)
    for (let i = 0; i < totalLegs; i++) {
      bot.legs[i].set_servo_values(servoKfs[i][0]);
    }

    bot.body_mesh.position.copy(bodyKfs[k].pos);
    bot.body_mesh.rotation.set(bodyKfs[k].rot.x, bodyKfs[k].rot.y, bodyKfs[k].rot.z);
    bot.body_mesh.updateMatrixWorld();
    bot.mesh.updateMatrixWorld();

    const targets: any[] = [];
    for (let i = 0; i < totalLegs; i++) {
      if (bot.legs[i].on_floor) {
        targets.push(current_tips[i]);               // locked in world
      } else {
        targets.push(bot.body_mesh.localToWorld(     // follow body
          bodyLocalTips[i].clone()));
      }
    }

    const result = PhysicsSolver.solveAll(bot, targets, stallThreshold, groundConstraint);
    for (let i = 0; i < totalLegs; i++) {
      servoKfs[i].push(result.servoTargets[i]);
    }
  }
  bot._servo_anim_disabled = prevDisabled;

  // Homeward bias for floating legs
  const HOME_BIAS = 0.20;
  for (let i = 0; i < totalLegs; i++) {
    if (bot.legs[i].on_floor) continue;
    const home = bot.legs[i]._home_servos;
    if (!home) continue;
    const kfs = servoKfs[i];
    for (let k = 1; k < kfs.length; k++) {
      for (let j = 0; j < kfs[k].length; j++) {
        kfs[k][j] += HOME_BIAS * ((home[j] || 1500) - kfs[k][j]);
      }
    }
  }

  // Compute per-segment durations from actual max servo delta
  const segmentDurs: number[] = [];
  for (let k = 0; k < microSteps; k++) {
    let maxDelta = 0;
    for (let i = 0; i < totalLegs; i++) {
      const a = servoKfs[i][k];
      const b = servoKfs[i][k + 1];
      for (let j = 0; j < a.length; j++) {
        maxDelta = Math.max(maxDelta, Math.abs(b[j] - a[j]));
      }
    }
    segmentDurs.push((maxDelta / speed) * 1000);
  }

  // Revert body_mesh to start
  bot.body_mesh.position.copy(startPos);
  bot.body_mesh.rotation.copy(startRot);
  bot.body_mesh.updateMatrixWorld();

  // Pre-load leg keyframes and revert joints to kf0 visual state
  const now = performance.now();
  for (let i = 0; i < totalLegs; i++) {
    const leg = bot.legs[i];
    leg._output.setKeyframes(servoKfs[i], now);
    const kf0 = servoKfs[i][0];
    for (let j = 0; j < leg.joint_count; j++) {
      leg._set_joint_rotation(j, kf0[j]);
      leg.limbs[j]._rendered_servo_value = kf0[j];
    }
  }

  bot.animator.applyBodyKeyframes(bodyKfs, segmentDurs, now);

  return true;
}

export function moveBody(bot: any, direction: string, distance: number) {
  // Raising body needs a fallback: tip-locked transform rolls back when legs
  // can't extend further (drift > 8mm in transformBody), which leaves R
  // silently no-op once the bot is near max standing height. Detect the
  // rollback by comparing body_mesh.position.y, then re-issue with
  // lockTips=false and re-ground the tips so the request always has a
  // visible effect until tips physically can't reach.
  if (direction === 'y' && distance > 0) {
    const prevY = bot.body_mesh.position.y;
    transformBody(bot, { dy: distance });
    if (Math.abs(bot.body_mesh.position.y - prevY) < 0.001) {
      transformBody(bot, { dy: distance, lockTips: false });
      putdownTips(bot);
    }
  } else {
    const opts: any = {};
    opts['d' + direction] = distance;
    transformBody(bot, opts);
  }
  // Restore each leg's natural home-biased shape. transformBody's IK seeds
  // from the current servo values, so for 4+ DOF redundant legs the
  // solution drifts from the natural standing shape across repeated calls
  // (each R press accumulates deformation). Solving from _home_servos snaps
  // the leg back to the canonical shape at the current tip position — same
  // pattern the sliders used before they moved to the body_target path.
  recalibrateLegsToHome(bot);
}

export function rotateBody(bot: any, direction: string, radius: number) {
  const opts: any = {};
  opts['r' + direction] = radius;
  transformBody(bot, opts);
}

export function floatBody(bot: any, direction: string, distance: number) {
  bot.mesh.position[direction] += distance;
  bot.after_status_change();
}

/** Drop body_mesh so the lowest tip touches y=0. */
export function laydown(bot: any) {
  console.log("-- laydown fired");
  const ys: number[] = [];
  for (let i = 0; i < bot.legs.length; i++) {
    ys.push(bot.legs[i].get_tip_pos().y);
  }
  const min_y = Math.min.apply(null, ys);
  bot.body_mesh.position.y -= min_y;
  bot.after_status_change();
}

/** Adjust body height so all tips can reach the ground. */
export function autoLevelBody(bot: any) {
  let tips = bot.get_tip_pos();
  let minY = Infinity;
  for (const t of tips) { if (t.y < minY) minY = t.y; }
  if (minY > 0.5) {
    // Body too high — lower it
    bot.body_mesh.position.y -= minY;
    bot.body_mesh.updateMatrixWorld();
    tips = bot.get_tip_pos();
    for (const t of tips) t.y = 0;
    for (let i = 0; i < bot.legs.length; i++) bot.legs[i].set_tip_pos(tips[i]);
  } else if (minY < -0.5) {
    // Body too low — raise it, then re-putdown
    bot.body_mesh.position.y -= minY;
    putdownTips(bot);
  }
}

/** Force the specified legs' tip y to 0 via IK. */
export function putdownTips(bot: any, idxs?: number[]) {
  const legIdxs = idxs || Array.from({ length: bot.legs.length }, (_, i) => i);
  for (const i of legIdxs) {
    if (!bot.legs[i]) continue;
    const tip_pos = bot.legs[i].get_tip_pos();
    tip_pos.y = 0;
    bot.legs[i].set_tip_pos(tip_pos);
  }
  bot.sync_guide_circles();
  bot.after_status_change();
}

/** Persist body pose + body-local tip positions so Adjust changes survive refresh. */
export function saveBodyHome(bot: any) {
  const tips = bot.get_tip_pos();
  bot.options._body_home = {
    px: bot.body_mesh.position.x, py: bot.body_mesh.position.y, pz: bot.body_mesh.position.z,
    rx: bot.body_mesh.rotation.x, ry: bot.body_mesh.rotation.y, rz: bot.body_mesh.rotation.z,
    tips: tips.map((t: any) => bot.body_mesh.worldToLocal(t.clone())),
  };
  history.save(bot.options);
  // Re-capture home servos from the saved standing pose so subsequent
  // IK regularization targets the correct leg shape.
  for (let i = 0; i < bot.legs.length; i++) {
    bot.legs[i].capture_servo_home();
  }
}

/** Lower body until tips reach ground, bending joints as needed. */
export function squatBody(bot: any) {
  history.push(bot.options);
  const tips = bot.get_tip_pos();
  // Find the highest tip
  let maxY = -Infinity;
  for (const t of tips) { if (t.y > maxY) maxY = t.y; }
  // Lower body so highest tip touches ground, then put all tips down
  if (maxY > 0) {
    bot.body_mesh.position.y -= maxY;
    bot.body_mesh.updateMatrixWorld();
  }
  // Extra squat: lower further in small steps, re-IK each time
  const steps = 5;
  const stepSize = 2;
  for (let s = 0; s < steps; s++) {
    bot.body_mesh.position.y -= stepSize;
    bot.body_mesh.updateMatrixWorld();
    putdownTips(bot);
  }
  bot.after_status_change();
  saveBodyHome(bot);
}

/** Reset body to origin (x=0, z=0) and level rotation, then re-ground. */
export function resetBodyToCenter(bot: any) {
  history.push(bot.options);
  bot.body_mesh.position.set(0, bot.body_mesh.position.y, 0);
  bot.body_mesh.rotation.set(0, 0, 0);
  bot.mesh.position.set(0, bot.mesh.position.y, 0);
  bot.mesh.rotation.set(0, 0, 0);
  bot.body_mesh.updateMatrixWorld();
  bot.mesh.updateMatrixWorld();
  laydown(bot);
  bot.sync_guide_circles();
  bot.adjust_gait_guidelines();
  bot.after_status_change();
  saveBodyHome(bot);
}

/** Gradually pull leg servo values back toward their home positions.
 *  strength: 0..1 fraction to move toward home per call (e.g. 0.3 = 30%). */
export function snapLegsToInit(bot: any, strength: number, legIdxs?: number[]) {
  const idxs = legIdxs || Array.from({ length: bot.legs.length }, (_, i) => i);
  for (const i of idxs) {
    bot.legs[i]?.snap_to_home(strength);
  }
}

/** Run solve_from_home on every leg to restore home-biased joint shape
 *  at the current tip positions.  Uses the same home-start IK pattern as
 *  the gait touchdown recalibration (leg-shape-preservation design). */
export function recalibrateLegsToHome(bot: any) {
  const prevAnim = bot._servo_anim_disabled;
  bot._servo_anim_disabled = true;
  for (let i = 0; i < bot.legs.length; i++) {
    const leg = bot.legs[i];
    const tipPos = leg.get_tip_pos();
    const homeValues = leg.solve_from_home(tipPos);
    if (homeValues) {
      leg.set_servo_values(homeValues);
    }
  }
  bot._servo_anim_disabled = prevAnim;
  bot.after_status_change();
}
