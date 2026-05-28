import * as THREE from 'three';
import appState from './appState.js';
import { LIMB_NAMES, LIMB_DEFAULTS } from './defaults.js';
import { getWorldPosition, apply_xyz } from './utils.js';
import { set_bot_options } from './bot_options.js';
import { CommandSocket, formatServoValues, buildCmd } from './bot_commands.js';
import { drawBody, createHeadIndicator } from './bot_geometry.js';
import { BotGuides } from './bot_guides.js';
import { BotAnimator } from './bot_animator.js';
import { GaitController } from './gaits.js';
import { PhysicsSolver } from './physics_solver.js';
import { history } from './history.js';
import { HexapodLeg } from './hexapod_leg.js';
import { computeLegLayout, getSegNamesForLeg, computeJointPositions, getActualJointPositions, applyJointMove, type LegLayout } from './leg_layout.js';
import { computeMaxDelta, computeServoSpeedHoldTime, computeFixedUnitHoldTime } from './servo_utils.js';

// Re-export for component backwards compatibility
export { HexapodLeg, getSegNamesForLeg, computeJointPositions, getActualJointPositions, applyJointMove };
export { get_bot_options, set_bot_options } from './bot_options.js';
// ── Hexapod ────────────────────────────────────────────────────

export class Hexapod {
  scene: any;
  options: HexapodOptions;
  draw_types: DrawType[];
  draw_type: DrawType;
  tip_circle_scale: number;
  commands: CommandSocket;
  /** @deprecated use `this.commands` directly. Kept for backwards compatibility. */
  get socket(): any { return this.commands.socket; }
  sync_cmd: boolean;
  rotate_step: number;
  fb_step: number;
  lr_step: number;
  mesh: any;
  body_mesh: any;
  legs: HexapodLeg[];
  gait_controller: GaitController;
  on_servo_values: number[];
  guides: BotGuides;
  center_offset: number;
  // Forwarding getters/setters for gaits.ts and other callers that still reference the
  // legacy names. The state lives on `this.guides`.
  get guide_pos() { return this.guides.pos; }
  get guide_pivot() { return this.guides.pivot; }
  get _guide_local_positions() { return this.guides.localPositions; }
  set _guide_local_positions(v: any[]) { this.guides.localPositions = v; }
  get guideline() { return this.guides.guideline; }
  get left_gl() { return this.guides.left_gl; }
  get right_gl() { return this.guides.right_gl; }
  get _guideCircles() { return this.guides.circles; }
  get _guideLabels() { return this.guides.labels; }
  hold_time: number;
  servo_speed: number;
  _servo_anim_disabled: boolean = true;
  animator: BotAnimator;
  onServoUpdate: (() => void) | null;
  onStatusEntry: ((status: any, formatted: string) => void) | null;
  onTimeInterval: ((interval: number) => void) | null;
  leg_layout: LegLayout[];

  constructor(scene: any, options: HexapodOptions) {
    if (!scene) {
      scene = appState.scene;
    }
    this.scene = scene;

    // Restore display/UI state from options (or defaults)
    this.draw_types = ["mesh", "bone", "points"];
    this.draw_type = options.draw_type || "mesh";
    this.tip_circle_scale = options.tip_circle_scale ?? 1;
    this.sync_cmd = options.sync_cmd ?? false;
    this.guides = new BotGuides();
    this.animator = new BotAnimator();

    this.apply_attributes(options);

    this.commands = new CommandSocket();
  }

  apply_attributes(options: any) {
    this.options = options;

    // Invalidate saved body home if leg geometry changed
    if (options._body_home) {
      const prev = options._prev_leg_count;
      const cur = options.leg_count || 6;
      if (prev !== cur) { delete options._body_home; set_bot_options(options); }
      options._prev_leg_count = cur;
    }

    this.rotate_step = this.options.rotate_step;
    this.fb_step = this.options.fb_step;
    this.lr_step = this.options.lr_step;
    this.servo_speed = this.options.servo_speed ?? 2000;
    this._servo_anim_disabled = true; // no animation during full rebuild

    const isInitialBuild = !this.mesh;

    if (this.mesh) {
      this.scene.remove(this.mesh);
    }
    // Clean up guide circles (world-space children of scene)
    this.guides.dispose(this.scene);

    this.on_servo_values = null;
    this.draw();

    // Reset servos to midpoint so joint angles match init_angles.
    // putdown_tips() during draw() runs IK which offsets servo values —
    // reverting to 1500 makes legs show their pure design geometry.
    // Only iterate joint_count (exclude tip at end of limbs array).
    for (let i = 0; i < this.legs.length; i++) {
      for (let j = 0; j < this.legs[i].joint_count; j++) {
        this.legs[i].set_servo_value(j, 1500);
      }
      this.legs[i].capture_servo_home();
    }
    this.laydown();
    this.sync_guide_circles();

    // Restore saved body pose on top of init_angles baseline.
    // Body position/rotation always applies; tip positions only on initial build
    // (subsequent apply_attributes() calls come from geometry edits where old tips are stale).
    if (this.options._body_home) {
      const h = this.options._body_home;
      this.body_mesh.position.set(h.px, h.py, h.pz);
      this.body_mesh.rotation.set(h.rx, h.ry, h.rz);
      this.body_mesh.updateMatrixWorld();
      if (isInitialBuild && h.tips && h.tips.length === this.legs.length) {
        for (let i = 0; i < this.legs.length; i++) {
          const t = h.tips[i];
          this.legs[i].set_tip_pos(this.body_mesh.localToWorld(new THREE.Vector3(t.x, t.y, t.z)));
        }
      }
      this.laydown();
      this.sync_guide_circles();
      // Rebuild guide local positions from restored state so gait targets + guidelines are correct
      this.mesh.updateMatrixWorld();
      this.guide_pivot.position.set(
        this.body_mesh.position.x, 0, this.body_mesh.position.z,
      );
      this.guide_pivot.updateMatrixWorld();
      this._guide_local_positions = [];
      for (let i = 0; i < this.legs.length; i++) {
        const worldPos = this.legs[i].get_tip_pos();
        this._guide_local_positions.push(this.guide_pivot.worldToLocal(worldPos.clone()));
      }
      this._guide_local_positions.push(new THREE.Vector3(0, 0, 0));
      this.adjust_gait_guidelines();
    }

    this.gait_controller = new GaitController(this);

    // Re-capture home servos from the actual standing configuration.
    // During construction home was captured at all-1500 (design pose),
    // but laydown() / body_home restoration have placed the legs in their
    // real standing pose.  Home servos must reflect this so that IK
    // regularization preserves the natural leg shape during movement.
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].capture_servo_home();
    }

    this.on_servo_values = this.get_servo_values();

    // Persist so AttributesPanel and page reload see latest state
    if (history.autoSave) {
      set_bot_options(this.options);
    }
  }

  draw() {
    this.mesh = new THREE.Object3D();
    this.scene.add(this.mesh);

    const legCount = this.options.leg_count || 6;
    const bodyShape = this.options.body_shape || 'rectangle';
    const bodyLength = this.options.body_length || 100;
    const bodyWidth = this.options.body_width || 50;
    // Rect: legs at ±width/2 along X, spaced along Z by length
    // Polygon: width/length stretch the ellipse radii
    const rx = bodyWidth / 2;
    const rz = bodyLength / 2;

    const placement = this.options.polygon_leg_placement || 'vertex';
    const firstLegDirection = this.options.polygon_odd_orientation || 'back';

    this.leg_layout = computeLegLayout(legCount, bodyShape, rx, rz, placement, firstLegDirection);

    this.body_mesh = drawBody(this.options, this.leg_layout, this.draw_type);
    this.mesh.add(this.body_mesh);
    this.mesh.add(createHeadIndicator());

    this.legs = [];
    for (let idx = 0; idx < legCount; idx++) {
      // Fallback to first leg option if pool is shorter than leg count
      let baseOpt = this.options.leg_options[idx] || this.options.leg_options[0];
      let opt = { ...baseOpt };
      const layout = this.leg_layout[idx];

      // Direct signed positions for coxa (no mirror on position)
      opt.x = layout.x;
      opt.z = layout.z;
      // Mirror for transform hierarchy consistency (rotation.z + rotation.y + femur/tibia)
      opt.mirror = layout.x >= 0 ? 1 : -1;
      opt.coxa = {
        ...opt.coxa,
        init_angle: layout.init_angle,
      };
      (opt as any)._yaw = layout.yaw;

      // Pad missing segment data based on this leg's DOF
      const legDof = opt.dof ?? this.options.dof ?? 3;
      const legJointCount = Math.min(6, Math.max(2, legDof));
      const segNames = LIMB_NAMES.slice(0, legJointCount);
      for (const name of segNames) {
        if (!opt[name]) {
          const def = LIMB_DEFAULTS[name] || { length: 20, radius: 5, init_angle: 0 };
          opt[name] = { length: def.length, radius: def.radius, init_angle: def.init_angle, servo_value: 1500, revert: false };
          // Write back to original so LegEditor sees the new segment
          if (!this.options.leg_options[idx][name]) {
            this.options.leg_options[idx][name] = { ...opt[name] };
          }
        }
      }

      let leg = new HexapodLeg(this, opt);
      leg.radial_angle = layout.angle;
      this.body_mesh.add(leg.mesh);
      this.legs.push(leg);
    }

    this.laydown();
    this.putdown_tips();
    this.auto_level_body();

    this.draw_gait_guidelines();
    this.draw_gait_guide();

    // Capture initial servo values as home reference for regularization + snap-back
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].capture_servo_home();
    }
  }

  draw_gait_guide()       { this.guides.drawGuide(this); }
  sync_guide_circles()    { this.guides.syncCircles(this); }
  reset_guide_pos()       { this.guides.resetPos(this); }
  get_guide_pos(idx: number) { return this.guides.getPos(this, idx); }
  draw_gait_guidelines()  { this.guides.drawGuidelines(this); }
  adjust_gait_guidelines(){ this.guides.adjustGuidelines(this); }

  get_servo_values() {
    let values: number[] = [];
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      // limbs includes tip as last element — exclude it
      for (let j = 0; j < leg.limbs.length - 1; j++) {
        values.push(leg.limbs[j].servo_value);
      }
    }
    return values;
  }

  get_status() {
    let status: any = {
      "mesh": {
        "position": this.mesh.position.clone(),
        "rotation": this.mesh.rotation.clone(),
      },
      "body_mesh": {
        "position": this.body_mesh.position.clone(),
        "rotation": this.body_mesh.rotation.clone(),
      },
      "center_offset": this.center_offset,
      "servo_values": this.get_servo_values(),
    };

    status["legs"] = {};
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      status["legs"][i] = { "on_floor": leg.on_floor };

      const names = leg._limbNames || LIMB_NAMES.slice(0, leg.joint_count);
      for (let j = 0; j < names.length; j++) {
        let limb_idx = names[j];
        let limb = leg[limb_idx];
        status["legs"][i][limb_idx] = {
          "position": limb.position.clone(),
          "rotation": limb.rotation.clone(),
          "servo_value": limb.servo_value,
          "servo_idx": limb.servo_idx,
        };
      }
    }

    return status;
  }

  get_min_interval(new_servo_values: number[], old_servo_values: number[]) {
    const maxDelta = computeMaxDelta(new_servo_values, old_servo_values);
    return computeServoSpeedHoldTime(maxDelta, this.servo_speed);
  }

  apply_status(status: any) {
    apply_xyz(this.mesh.position, status.mesh.position);
    apply_xyz(this.mesh.rotation, status.mesh.rotation);
    apply_xyz(this.body_mesh.position, status.body_mesh.position);
    apply_xyz(this.body_mesh.rotation, status.body_mesh.rotation);

    this.center_offset = status.center_offset;

    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      let leg_status = status["legs"][i];
      leg.on_floor = leg_status.on_floor;

      const names = leg._limbNames || LIMB_NAMES.slice(0, leg.joint_count);
      for (let j = 0; j < names.length; j++) {
        let limb_name = names[j];
        let limb = leg[limb_name];
        let limb_status = leg_status[limb_name];
        if (!limb || !limb_status) continue;
        apply_xyz(limb.position, limb_status.position);
        apply_xyz(limb.rotation, limb_status.rotation);
        limb.servo_value = limb_status.servo_value;
        limb.servo_idx = limb_status.servo_idx;
      }
    }
    return status;
  }

  format_servo_values(servo_values: number[]) {
    return formatServoValues(this.legs, servo_values);
  }

  debug_joint_positions() {
    this.mesh.updateMatrixWorld();
    const names = [...(this.legs[0]?._limbNames || LIMB_NAMES.slice(0, 3)), 'tip'];
    console.group('=== Joint World Positions ===');
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const opt = leg.options;
      console.group(`Leg ${i} (x=${opt.x.toFixed(1)}, z=${opt.z.toFixed(1)}, mirror=${opt.mirror}, yaw=${((opt as any)._yaw * 180 / Math.PI).toFixed(1)}°)`);
      for (const name of names) {
        const limb = leg[name];
        if (!limb) continue;
        const wp = getWorldPosition(this.mesh, limb);
        console.log(`${name}: (${wp.x.toFixed(1)}, ${wp.y.toFixed(1)}, ${wp.z.toFixed(1)})`);
      }
      console.groupEnd();
    }
    console.groupEnd();
  }

  get_tip_pos() {
    let tips_pos: any[] = [];
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      tips_pos.push(this.legs[i].get_tip_pos());
    }
    return tips_pos;
  }

  // ── Motions ────────────────────────────────────────────────

  // Centralized body transform with optional tip lock
  transform_body(opts: {
    dx?: number; dy?: number; dz?: number;
    rx?: number; ry?: number; rz?: number;
    lockTips?: boolean;
  }): boolean {
    const lock = opts.lockTips ?? (this.options._tip_lock !== false);
    if (!lock) {
      if (opts.dx != null) this.body_mesh.position.x += opts.dx;
      if (opts.dy != null) this.body_mesh.position.y += opts.dy;
      if (opts.dz != null) this.body_mesh.position.z += opts.dz;
      if (opts.rx != null) this.body_mesh.rotation.x += opts.rx;
      if (opts.ry != null) this.body_mesh.rotation.y += opts.ry;
      if (opts.rz != null) this.body_mesh.rotation.z += opts.rz;
      this.body_mesh.updateMatrixWorld();
      this.after_status_change();
      return true;
    }

    let current_tips = this.get_tip_pos();
    let prevPos = this.body_mesh.position.clone();
    let prevRot = this.body_mesh.rotation.clone();

    // Subdivide into at most 3 steps for smooth IK.
    // body_mesh moves immediately here so per-leg keyframe animations
    // in set_tip_pos() would start from a stale pre-move rendered state
    // while body_mesh is already at the target — tip lock desync.
    // Gait-based body movement uses the multi-keyframe path in
    // GaitController.move_body() instead.
    const prevDisabled = this._servo_anim_disabled;
    this._servo_anim_disabled = true;

    let steps = 3;

    let total_legs = this.legs.length;
    for (let s = 0; s < steps; s++) {
      let prevRZ = this.body_mesh.rotation.z;
      let prevRX = this.body_mesh.rotation.x;
      let prevRY = this.body_mesh.rotation.y;
      let prevPX = this.body_mesh.position.x;
      let prevPY = this.body_mesh.position.y;
      let prevPZ = this.body_mesh.position.z;

      if (opts.dx != null) this.body_mesh.position.x += opts.dx / steps;
      if (opts.dy != null) this.body_mesh.position.y += opts.dy / steps;
      if (opts.dz != null) this.body_mesh.position.z += opts.dz / steps;
      if (opts.rx != null) this.body_mesh.rotation.x += opts.rx / steps;
      if (opts.ry != null) this.body_mesh.rotation.y += opts.ry / steps;
      if (opts.rz != null) this.body_mesh.rotation.z += opts.rz / steps;
      this.body_mesh.updateMatrixWorld();

      for (let i = 0; i < total_legs; i++) {
        this.legs[i].set_tip_pos(current_tips[i]);
      }

      // Check drift
      let newTips = this.get_tip_pos();
      let maxDrift = 0;
      for (let i = 0; i < total_legs; i++) {
        let d = current_tips[i].distanceTo(newTips[i]);
        if (d > maxDrift) maxDrift = d;
      }
      if (maxDrift > 8) {
        this.body_mesh.rotation.z = prevRZ;
        this.body_mesh.rotation.x = prevRX;
        this.body_mesh.rotation.y = prevRY;
        this.body_mesh.position.x = prevPX;
        this.body_mesh.position.y = prevPY;
        this.body_mesh.position.z = prevPZ;
        this.body_mesh.updateMatrixWorld();
        for (let i = 0; i < total_legs; i++) {
          this.legs[i].set_tip_pos(current_tips[i]);
        }
        this.after_status_change();
        this._servo_anim_disabled = prevDisabled;
        return false;
      }
    }
    this.sync_guide_circles();
    this.after_status_change();
    this._servo_anim_disabled = prevDisabled;
    return true;
  }

  /** Servo-constraint version of transform_body.
   *  Pre-computes leg servo keyframes at each intermediate body pose
   *  (same pattern as GaitController.move_body) so the rAF loop only
   *  interpolates — zero per-frame IK overhead. */
  transform_body_servo(opts: {
    dx?: number; dy?: number; dz?: number;
    rx?: number; ry?: number; rz?: number;
  }): boolean {
    const dx = opts.dx || 0, dy = opts.dy || 0, dz = opts.dz || 0;
    const rx = opts.rx || 0, ry = opts.ry || 0, rz = opts.rz || 0;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 && Math.abs(dz) < 0.001 &&
        Math.abs(rx) < 0.001 && Math.abs(ry) < 0.001 && Math.abs(rz) < 0.001) {
      return false;
    }

    const startPos = this.body_mesh.position.clone();
    const startRot = this.body_mesh.rotation.clone();
    const current_tips = this.get_tip_pos();
    const totalLegs = this.legs.length;
    const speed = this.servo_speed || 2000;
    const microSteps = Math.max(1, this.options.micro_steps || 1);
    const stallThreshold = this.options.servo_stall_threshold ?? 0;
    const groundConstraint = this.options.ground_constraint ?? true;

    // Save keyframe 0: current rendered servo values
    const servoKfs: number[][][] = [];
    for (let i = 0; i < totalLegs; i++) {
      const kf0: number[] = [];
      for (let j = 0; j < this.legs[i].joint_count; j++) {
        kf0.push(this.legs[i].limbs[j]._rendered_servo_value);
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
    this.mesh.updateMatrixWorld();
    const bodyLocalTips = current_tips.map((t: any) =>
      this.body_mesh.worldToLocal(t.clone()));

    // Solve IK at each intermediate keyframe (k ≥ 1)
    const prevDisabled = this._servo_anim_disabled;
    this._servo_anim_disabled = true;
    for (let k = 1; k <= microSteps; k++) {
      // Reset all legs to keyframe-0 before each solve (stability)
      for (let i = 0; i < totalLegs; i++) {
        this.legs[i].set_servo_values(servoKfs[i][0]);
      }

      this.body_mesh.position.copy(bodyKfs[k].pos);
      this.body_mesh.rotation.set(bodyKfs[k].rot.x, bodyKfs[k].rot.y, bodyKfs[k].rot.z);
      this.body_mesh.updateMatrixWorld();
      this.mesh.updateMatrixWorld();

      const targets: any[] = [];
      for (let i = 0; i < totalLegs; i++) {
        if (this.legs[i].on_floor) {
          targets.push(current_tips[i]);               // locked in world
        } else {
          targets.push(this.body_mesh.localToWorld(    // follow body
            bodyLocalTips[i].clone()));
        }
      }

      const result = PhysicsSolver.solveAll(this, targets, stallThreshold, groundConstraint);
      for (let i = 0; i < totalLegs; i++) {
        servoKfs[i].push(result.servoTargets[i]);
      }
    }
    this._servo_anim_disabled = prevDisabled;

    // Homeward bias for floating legs
    const HOME_BIAS = 0.20;
    for (let i = 0; i < totalLegs; i++) {
      if (this.legs[i].on_floor) continue;
      const home = this.legs[i]._home_servos;
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
    this.body_mesh.position.copy(startPos);
    this.body_mesh.rotation.copy(startRot);
    this.body_mesh.updateMatrixWorld();

    // Pre-load leg keyframes and revert joints to kf0 visual state
    const now = performance.now();
    for (let i = 0; i < totalLegs; i++) {
      const leg = this.legs[i];
      leg._output.setKeyframes(servoKfs[i], now);
      const kf0 = servoKfs[i][0];
      for (let j = 0; j < leg.joint_count; j++) {
        leg._set_joint_rotation(j, kf0[j]);
        leg.limbs[j]._rendered_servo_value = kf0[j];
      }
    }

    this.animator.applyBodyKeyframes(bodyKfs, segmentDurs, now);

    return true;
  }

  move_body(direction: string, distance: number) {
    let opts: any = {};
    opts['d' + direction] = distance;
    this.transform_body(opts);

    // For Y-up: ensure at least 2 tips can still reach ground
    if (direction === 'y' && distance > 0) {
      let grounded = 0;
      let tips = this.get_tip_pos();
      for (let i = 0; i < this.legs.length; i++) {
        if (tips[i].y <= 0) grounded++;
      }
      if (grounded < 2) {
        this.transform_body({ dy: -distance, lockTips: false });
      }
    }
  }

  float(direction: string, distance: number) {
    this.mesh.position[direction] += distance;
    this.after_status_change();
  }

  /** Path A entry point. Called by GaitController.move_body() after building
   *  mesh + servo keyframes. */
  apply_physics_keyframes(
    meshKfs: { pos: any; rotY: number }[],
    segmentDurs: number[],
    servoKfs: number[][][],
  ) {
    this.animator.applyMeshKeyframes(this, meshKfs, segmentDurs, servoKfs);
  }

  private _legOutputMode: string = 'none';

  /** Switch all legs between DirectOutput and AnimatedOutput. */
  _setLegOutputs(mode: 'none' | 'servo_constraint') {
    // Only switch when mode actually changes, to avoid destroying
    // in-progress keyframe animations.
    if (this._legOutputMode === mode) return;
    this._legOutputMode = mode;
    for (const leg of this.legs) {
      leg.switchOutput(mode);
    }
    // When switching away from servo_constraint, also stop mesh + body_mesh
    // animations so the body doesn't keep drifting after the legs have stopped.
    if (mode === 'none') {
      this.animator.stop();
    }
  }

  /** Whether any keyframe animation is in progress (mesh, body_mesh, or legs). */
  is_animating(): boolean {
    if (this.animator.isAnimating()) return true;
    for (const leg of this.legs) {
      if (leg.is_animating()) return true;
    }
    return false;
  }

  /** Drive servo + mesh animation through keyframes. Called from rAF loop. */
  update_servo_animations(now: number) {
    const speed = this.servo_speed || 2000;
    let anyAnimating = this.animator.update(now, this);

    // Leg servo keyframe animation (for gait / standalone set_tip_pos paths)
    for (let i = 0; i < this.legs.length; i++) {
      if (this.legs[i].is_animating()) {
        anyAnimating = true;
        this.legs[i].update_animation(now, speed);
      }
    }

    if (anyAnimating) {
      this.mesh.updateMatrixWorld();
      this.sync_guide_circles();
    }
  }

  laydown() {
    console.log("-- laydown fired");

    let tip_pos: any;
    let total_legs = this.legs.length;
    let ys: number[] = [];
    for (let i = 0; i < total_legs; i++) {
      tip_pos = this.legs[i].get_tip_pos();
      ys.push(tip_pos.y);
    }

    let min_y = Math.min.apply(null, ys);
    this.body_mesh.position.y -= min_y;

    this.after_status_change();
  }

  auto_level_body() {
    // Adjust body height so all tips can reach the ground
    let tips = this.get_tip_pos();
    let minY = Infinity;
    for (const t of tips) { if (t.y < minY) minY = t.y; }
    if (minY > 0.5) {
      // Body too high — lower it
      this.body_mesh.position.y -= minY;
      this.body_mesh.updateMatrixWorld();
      tips = this.get_tip_pos();
      for (const t of tips) t.y = 0;
      for (let i = 0; i < this.legs.length; i++) this.legs[i].set_tip_pos(tips[i]);
    } else if (minY < -0.5) {
      // Body too low — raise it, then re-putdown
      this.body_mesh.position.y -= minY;
      this.putdown_tips();
    }
  }

  putdown_tips(idxs?: number[]) {
    const legIdxs = idxs || Array.from({ length: this.legs.length }, (_, i) => i);
    for (const i of legIdxs) {
      if (!this.legs[i]) continue;
      const tip_pos = this.legs[i].get_tip_pos();
      tip_pos.y = 0;
      this.legs[i].set_tip_pos(tip_pos);
    }
    this.sync_guide_circles();
    this.after_status_change();
  }

  rotate_body(direction: string, radius: number) {
    let opts: any = {};
    opts['r' + direction] = radius;
    this.transform_body(opts);
  }

  /** Persist body pose + body-local tip positions so Adjust changes survive refresh */
  save_body_home() {
    const tips = this.get_tip_pos();
    this.options._body_home = {
      px: this.body_mesh.position.x, py: this.body_mesh.position.y, pz: this.body_mesh.position.z,
      rx: this.body_mesh.rotation.x, ry: this.body_mesh.rotation.y, rz: this.body_mesh.rotation.z,
      tips: tips.map((t: any) => this.body_mesh.worldToLocal(t.clone())),
    };
    history.save(this.options);
    // Re-capture home servos from the saved standing pose so subsequent
    // IK regularization targets the correct leg shape.
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].capture_servo_home();
    }
  }

  /** Lower body until tips reach ground, bending joints as needed */
  squat_body() {
    history.push(this.options);
    const tips = this.get_tip_pos();
    // Find the highest tip
    let maxY = -Infinity;
    for (const t of tips) { if (t.y > maxY) maxY = t.y; }
    // Lower body so highest tip touches ground, then put all tips down
    if (maxY > 0) {
      this.body_mesh.position.y -= maxY;
      this.body_mesh.updateMatrixWorld();
    }
    // Extra squat: lower further in small steps, re-IK each time
    const steps = 5;
    const stepSize = 2;
    for (let s = 0; s < steps; s++) {
      this.body_mesh.position.y -= stepSize;
      this.body_mesh.updateMatrixWorld();
      this.putdown_tips();
    }
    this.after_status_change();
    this.save_body_home();
  }

  /** Reset body to origin (x=0, z=0) and level rotation, then re-ground */
  reset_body_to_center() {
    history.push(this.options);
    this.body_mesh.position.set(0, this.body_mesh.position.y, 0);
    this.body_mesh.rotation.set(0, 0, 0);
    this.mesh.position.set(0, this.mesh.position.y, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.body_mesh.updateMatrixWorld();
    this.mesh.updateMatrixWorld();
    this.laydown();
    this.sync_guide_circles();
    this.adjust_gait_guidelines();
    this.after_status_change();
    this.save_body_home();
  }

  /** Gradually pull leg servo values back toward their home positions.
   *  strength: 0..1 fraction to move toward home per call (e.g. 0.3 = 30%). */
  snap_legs_to_init(strength: number, legIdxs?: number[]) {
    const idxs = legIdxs || Array.from({ length: this.legs.length }, (_, i) => i);
    for (const i of idxs) {
      this.legs[i]?.snap_to_home(strength);
    }
  }

  /** Run solve_from_home on every leg to restore home-biased joint shape
   *  at the current tip positions.  Uses the same home-start IK pattern as
   *  the gait touchdown recalibration (leg-shape-preservation design). */
  recalibrate_legs_to_home() {
    const prevAnim = this._servo_anim_disabled;
    this._servo_anim_disabled = true;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const tipPos = leg.get_tip_pos();
      const homeValues = leg.solve_from_home(tipPos);
      if (homeValues) {
        leg.set_servo_values(homeValues);
      }
    }
    this._servo_anim_disabled = prevAnim;
    this.after_status_change();
  }

  after_status_change(send_cmd?: boolean) {
    // updateMatrixWorld must be current for subsequent PosCalculator reads
    this.mesh.updateMatrixWorld();

    let servo_values = this.get_servo_values();
    let cmd = this.build_cmd(servo_values);

    if (this.options.physics_mode === 'servo_constraint') {
      if (this.on_servo_values) {
        this.hold_time = this.get_min_interval(servo_values, this.on_servo_values);
      } else {
        this.hold_time = 0;
      }
      this.on_servo_values = servo_values;

      if (this.sync_cmd) {
        if (typeof send_cmd === "undefined" || send_cmd) {
          this.send_cmd(cmd);
        } else {
          this.hold_time = 0;
        }
      }
    } else {
      if (this.sync_cmd) {
        if (typeof send_cmd === "undefined" || send_cmd) {
          this.send_cmd(cmd);
          if (this.on_servo_values) {
            const maxDelta = computeMaxDelta(servo_values, this.on_servo_values);
            this.hold_time = computeFixedUnitHoldTime(maxDelta);
          } else {
            this.hold_time = 0;
          }
          this.on_servo_values = servo_values;
        } else {
          this.hold_time = 0;
        }
      } else {
        this.hold_time = 0;
      }
    }

    if (this.onServoUpdate) this.onServoUpdate();
    if (this.onStatusEntry) this.onStatusEntry(this.get_status(), this.format_servo_values(servo_values));
    if (this.onTimeInterval) this.onTimeInterval(this.hold_time);
  }

  send_status() {
    const servo_values = this.get_servo_values();
    const cmd = this.build_cmd(servo_values);
    this.send_cmd(cmd);
    this.on_servo_values = servo_values;
  }

  build_cmd(servo_values: number[]) {
    return buildCmd(this.legs, servo_values, this.on_servo_values, this.servo_speed);
  }

  send_cmd(cmd: string) {
    this.commands.send(cmd);
  }

}

export function build_bot(bot_options: any) {
  let bot = new Hexapod(appState.scene, bot_options);
  return bot;
}
