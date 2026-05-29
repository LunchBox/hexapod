import * as THREE from 'three';
import appState from './appState.js';
import { LIMB_NAMES, LIMB_DEFAULTS } from './defaults.js';
import { getWorldPosition, apply_xyz } from './utils.js';
import { set_bot_options } from './bot_options.js';
import { CommandSocket, formatServoValues, buildCmd } from './bot_commands.js';
import { drawBody, createHeadIndicator } from './bot_geometry.js';
import { BotGuides } from './bot_guides.js';
import { BotAnimator } from './bot_animator.js';
import {
  transformBody, transformBodyServo, moveBody, rotateBody, floatBody,
  laydown, autoLevelBody, putdownTips, saveBodyHome, squatBody,
  resetBodyToCenter, snapLegsToInit, recalibrateLegsToHome,
  beginBodyTracking, stepBodyTracking, endBodyTracking,
  type TransformBodyOpts, type TransformBodyServoOpts,
} from './body_motions.js';
import { GaitController } from './gaits.js';
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

  // ── Body-target tracking (joystick / slider live drag) ────────────
  // body_target is the desired body_mesh pose. The rAF loop calls
  // step_body_tracking each frame to chase it at servo_speed pace.
  // body_tracking_active is true for the duration of an input session;
  // status entries are suppressed during the session and a single entry
  // is emitted on session end (see body_motions.ts beginBodyTracking /
  // stepBodyTracking / endBodyTracking).
  body_target: import('./body_motions.js').BodyPose | null = null;
  body_tracking_active: boolean = false;
  _body_tracking_release_pending: boolean = false;
  _body_tracking_last_time: number = 0;
  _body_tracking_locked_world_tips: any[] | null = null;
  _body_tracking_local_tips: any[] | null = null;
  // Captured at session start; legs are reset to these values before each
  // per-frame IK solve so 4+ DOF redundant joints don't drift. Restored on
  // session end to guarantee leg shape returns to its pre-tracking state.
  _body_tracking_init_servos: number[][] | null = null;
  _suppress_status_entries: boolean = false;

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

    // Drop any in-flight live-input session — its arrays index into the OLD
    // legs[] / use OLD body_mesh, and surviving past the rebuild would
    // produce off-end reads (TypeError) or chase against deleted meshes.
    this.body_target = null;
    this.body_tracking_active = false;
    this._body_tracking_release_pending = false;
    this._body_tracking_locked_world_tips = null;
    this._body_tracking_local_tips = null;
    this._body_tracking_init_servos = null;
    if (this.animator) this.animator.stop();
    if (this.gait_controller && typeof this.gait_controller.stop === 'function') {
      this.gait_controller.stop();
    }

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
    // Defensive: refuse to apply a snapshot whose shape doesn't match the
    // current bot. Loading a 6-leg recording onto a 4-leg bot used to throw
    // on the first `leg_status.on_floor` read; mismatched joint_count used
    // to leave hybrid poses. Bail with a warning and let the caller decide.
    if (!status || !status.mesh || !status.body_mesh || !status.legs) {
      console.warn('apply_status: malformed status object'); return null;
    }
    const recordedLegCount = Object.keys(status.legs).length;
    if (recordedLegCount !== this.legs.length) {
      console.warn(`apply_status: leg count mismatch (recording=${recordedLegCount}, bot=${this.legs.length}) — skipping`);
      return null;
    }

    apply_xyz(this.mesh.position, status.mesh.position);
    apply_xyz(this.mesh.rotation, status.mesh.rotation);
    apply_xyz(this.body_mesh.position, status.body_mesh.position);
    apply_xyz(this.body_mesh.rotation, status.body_mesh.rotation);

    this.center_offset = status.center_offset;

    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      let leg_status = status["legs"][i];
      if (!leg_status) continue;
      leg.on_floor = leg_status.on_floor;

      const names = leg._limbNames || LIMB_NAMES.slice(0, leg.joint_count);
      for (let j = 0; j < names.length; j++) {
        let limb_name = names[j];
        let limb = leg[limb_name];
        let limb_status = leg_status[limb_name];
        if (!limb || !limb_status) continue;
        apply_xyz(limb.position, limb_status.position);
        limb.servo_value = limb_status.servo_value;
        limb.servo_idx = limb_status.servo_idx;
        // Derive rotation from servo_value rather than restoring the
        // captured rotation. In servo_constraint mode, get_status() clones
        // limb.rotation while it still holds the PRE-IK rendered value
        // (the animator catches it up over time), so the captured rotation
        // lags the captured servo_value by one step. Re-deriving via
        // _set_joint_rotation makes the visual match the servo target.
        leg._set_joint_rotation(j, limb_status.servo_value);
        limb._rendered_servo_value = limb_status.servo_value;
        leg._output.renderedValues[j] = limb_status.servo_value;
      }
    }

    // World-space guides (ground circles + numeric labels) are children of
    // `scene`, not `mesh`, so they don't auto-follow the mesh transform.
    // During gait/keyframe motion the rAF loop calls sync_guide_circles each
    // frame via update_servo_animations; for a discrete snap like this one,
    // we sync them here so the markers track the restored pose.
    this.mesh.updateMatrixWorld();
    this.guides.resetPos(this);
    this.sync_guide_circles();
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

  transform_body(opts: TransformBodyOpts): boolean { return transformBody(this, opts); }
  transform_body_servo(opts: TransformBodyServoOpts): boolean { return transformBodyServo(this, opts); }
  move_body(direction: string, distance: number) { moveBody(this, direction, distance); }
  float(direction: string, distance: number) { floatBody(this, direction, distance); }

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
    // Stop animator FIRST when target mode is 'none', regardless of cached
    // _legOutputMode. The cache lags whenever a caller (gc.stop, physics
    // toggle, recorder.play) changes options.physics_mode without going
    // through here — if we short-circuited on cache match, animator could
    // keep interpolating mesh / body_mesh after the user switched off
    // servo_constraint.
    if (mode === 'none') {
      this.animator.stop();
    }
    if (this._legOutputMode === mode) return;
    this._legOutputMode = mode;
    for (const leg of this.legs) {
      leg.switchOutput(mode);
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

  laydown()             { laydown(this); }
  auto_level_body()     { autoLevelBody(this); }
  putdown_tips(idxs?: number[]) { putdownTips(this, idxs); }
  rotate_body(direction: string, radius: number) { rotateBody(this, direction, radius); }
  save_body_home()      { saveBodyHome(this); }
  squat_body()          { squatBody(this); }
  reset_body_to_center(){ resetBodyToCenter(this); }
  snap_legs_to_init(strength: number, legIdxs?: number[]) { snapLegsToInit(this, strength, legIdxs); }
  recalibrate_legs_to_home() { recalibrateLegsToHome(this); }
  begin_body_tracking()      { beginBodyTracking(this); }
  step_body_tracking(now: number): boolean { return stepBodyTracking(this, now); }
  end_body_tracking()        { endBodyTracking(this); }

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
    if (this.onStatusEntry && !this._suppress_status_entries) {
      this.onStatusEntry(this.get_status(), this.format_servo_values(servo_values));
    }
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
