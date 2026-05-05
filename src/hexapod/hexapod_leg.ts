import { SERVO_MIN_VALUE, SERVO_MAX_VALUE, LIMB_NAMES } from './defaults.js';
import { getWorldPosition, degree_to_radians } from './utils.js';
import { PosCalculator, PosResult } from './pos_calculator.js';
import { DirectOutput, AnimatedOutput, type ServoOutput } from './servo_output.js';

// ── HexapodLeg ──────────────────────────────────────────────────

export class HexapodLeg {
  bot: any;
  options: any;
  mesh: any;
  mirror: number;
  on_floor: boolean;
  center_offset: number;
  color: number;
  coxa: any;
  femur: any;
  tibia: any;
  tarsus: any;
  tip: any;
  limbs: any[];
  joint_count: number;
  _limbNames: string[];
  radial_angle: number;
  _home_servos?: number[];
  _output!: ServoOutput;

  constructor(bot: any, options: any) {
    this.bot = bot;
    this.options = options;
    this.mesh = new THREE.Object3D();
    this.mirror = options.mirror;

    this.on_floor = true;
    this.center_offset = 0;
    this.color = 0xbb1100;

    const dof = this.options.dof ?? this.bot.options.dof ?? 3;
    this.joint_count = Math.min(6, Math.max(2, dof));
    this._limbNames = LIMB_NAMES.slice(0, this.joint_count);
    const names = this._limbNames;

    // Build segments dynamically
    let prevMesh: any = null;
    let prevName: string | null = null;
    const segments: any[] = [];
    this.limbs = [];

    for (let idx = 0; idx < this.joint_count; idx++) {
      const name = names[idx];
      const isFirst = idx === 0;
      const mesh = this.draw_segment(name, isFirst ? null : prevName);
      (this as any)[name] = mesh;
      segments.push(mesh);
      this.limbs.push(mesh);

      if (isFirst) {
        this.mesh.add(mesh);
      } else {
        prevMesh.add(mesh);
      }
      prevMesh = mesh;
      prevName = name;
    }

    // tip
    let geometry = new THREE.Geometry();
    geometry.vertices.push(new THREE.Vector3(0, 0, 0));
    let tip = new THREE.Points(geometry, new THREE.PointsMaterial());
    tip.type = "tip";
    tip.position.y = options[names[this.joint_count - 1]].length;
    tip.visible = false;
    prevMesh.add(tip);
    this.tip = tip;
    this.limbs.push(tip);

    // All legs start in DirectOutput; Hexapod switches to AnimatedOutput
    // when physics_mode changes to servo_constraint.
    const initRendered = this.limbs
      .filter((_: any, i: number) => i < this.joint_count)
      .map((l: any) => l._rendered_servo_value);
    this._output = new DirectOutput(this.joint_count, initRendered);
  }

  /** Switch output strategy (called by Hexapod when physics_mode changes). */
  switchOutput(mode: 'none' | 'servo_constraint') {
    const rendered = this._output.renderedValues;
    this._output = mode === 'servo_constraint'
      ? new AnimatedOutput(this.joint_count, rendered)
      : new DirectOutput(this.joint_count, rendered);
  }

  draw_segment(name: string, prevName: string | null) {
    const opt = this.options[name] || { length: 25, radius: 5, init_angle: 0, servo_value: 1500, revert: false };
    let geometry: any, mesh: any, material: any;
    const isFirst = prevName === null;

    switch (this.bot.draw_type) {
      case "bone":
        material = new THREE.LineBasicMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, opt.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, opt.length, 0));
        mesh = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, opt.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, opt.length, 0));
        mesh = new THREE.Points(geometry, material);
        break;
      default:
        material = new THREE.MeshBasicMaterial({ color: this.color });
        geometry = new THREE.BoxGeometry(opt.radius, opt.length, opt.radius);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, opt.length / 2, 0));
        mesh = new THREE.Mesh(geometry, material);
        let axisHelper = new THREE.AxisHelper(isFirst ? 30 : 15);
        mesh.add(axisHelper);
    }

    mesh.type = name;

    if (isFirst) {
      mesh.position.x = this.options.x;
      mesh.position.y = this.options.y;
      mesh.position.z = this.options.z;
      mesh.rotation.z = this.mirror * (-Math.PI / 2);
      mesh.rotation.y = this.mirror * degree_to_radians(opt.init_angle);
    } else {
      mesh.position.y = this.options[prevName!].length;
      mesh.rotation.z = this.mirror * degree_to_radians(opt.init_angle);
    }

    mesh.init_radius = degree_to_radians(opt.init_angle);
    mesh.init_angle = opt.init_angle;
    mesh.servo_value = opt.servo_value;
    mesh._rendered_servo_value = opt.servo_value;
    mesh.servo_idx = opt.servo_idx;
    mesh.revert = opt.revert;

    return mesh;
  }

  set_init_angle(limb_idx: number, angle: number) {
    let ori_radius = this.limbs[limb_idx].init_radius;
    let new_radius = degree_to_radians(angle);
    let limb_mesh = this.limbs[limb_idx];
    limb_mesh.init_radius = new_radius;

    if (limb_idx === 0) {
      limb_mesh.rotation.y = new_radius;
    } else {
      limb_mesh.rotation.z = this.mirror * new_radius;
    }
  }

  get_angle(limb_idx: number) {
    let limb = this.limbs[limb_idx];
    if (limb_idx === 0) {
      return limb.rotation.y / Math.PI * 180;
    } else {
      return this.mirror * limb.rotation.z / Math.PI * 180;
    }
  }

  set_angle(limb_idx: number, angle: number) {
    let limb = this.limbs[limb_idx];
    let current_angle = this.get_angle(limb_idx);
    let diff_servo_value = this.mirror * ((SERVO_MAX_VALUE - SERVO_MIN_VALUE) / 2) * (angle - current_angle) / 90;
    let new_servo_value = limb.servo_value + diff_servo_value;
    this.set_servo_value(limb_idx, new_servo_value);
  }

  set_servo_values(values: number[]) {
    for (let i = 0; i < values.length; i++) {
      const v = Math.round(values[i]);
      this._set_joint_rotation(i, v);
      this.limbs[i].servo_value = v;
      this.limbs[i]._rendered_servo_value = v;
      this._output.renderedValues[i] = v;
    }
  }

  _set_joint_rotation(limb_idx: number, value: number) {
    let delta = value - (SERVO_MAX_VALUE - SERVO_MIN_VALUE) / 2 - SERVO_MIN_VALUE;
    let delta_radius = ((1.0 * delta) / (SERVO_MAX_VALUE - SERVO_MIN_VALUE)) * Math.PI;

    let limb_mesh = this.limbs[limb_idx];

    if (limb_mesh.revert) {
      delta_radius *= -1;
    }

    if (limb_idx === 0) {
      limb_mesh.rotation.y = this.mirror * limb_mesh.init_radius + delta_radius;
    } else {
      limb_mesh.rotation.z = this.mirror * limb_mesh.init_radius + delta_radius;
    }
  }

  set_servo_value(limb_idx: number, value: number) {
    const v = Math.round(value);
    this._set_joint_rotation(limb_idx, v);
    this.limbs[limb_idx].servo_value = v;
    this.limbs[limb_idx]._rendered_servo_value = v;
    this._output.renderedValues[limb_idx] = v;
  }

  get_tip_pos() {
    return getWorldPosition(this.bot.mesh, this.tip);
  }

  set_tip_pos(new_pos: any, stallThreshold = 0): PosResult {
    const preRendered = this._output.renderedValues.slice();

    const groundConstraint = this.bot.options.ground_constraint ?? true;
    let calculator = new PosCalculator(this, new_pos, this._home_servos, undefined, groundConstraint);
    const result = calculator.run();

    if (stallThreshold > 0 && result.distance > stallThreshold) {
      const currentServos: number[] = [];
      for (let i = 0; i < this.joint_count; i++) {
        currentServos.push(this.limbs[i].servo_value);
      }
      this._output.reset();
      for (let j = 0; j < this.joint_count; j++) {
        this._set_joint_rotation(j, preRendered[j]);
        this.limbs[j]._rendered_servo_value = preRendered[j];
        this._output.renderedValues[j] = preRendered[j];
      }
      return { success: false, distance: result.distance, iterations: result.iterations, values: currentServos };
    }

    if (result.success) {
      if (this.bot._servo_anim_disabled) {
        // PosCalculator already applied values directly via set_servo_values.
        // Don't create an animation — just leave joints at the result.
      } else {
        this._output.setTargets(result.values, preRendered);
        const rv = this._output.renderedValues;
        for (let j = 0; j < this.joint_count; j++) {
          this._set_joint_rotation(j, rv[j]);
          this.limbs[j].servo_value = Math.round(result.values[j]);
          this.limbs[j]._rendered_servo_value = rv[j];
        }
      }
    }

    return result;
  }

  capture_servo_home() {
    this._home_servos = [];
    for (let i = 0; i < this.limbs.length; i++) {
      this._home_servos.push(this.limbs[i].servo_value);
    }
  }

  snap_to_home(strength: number) {
    if (!this._home_servos) return;
    if (this._output.isAnimating()) {
      for (let i = 0; i < this.limbs.length; i++) {
        const target = this._home_servos[i];
        const cur = this.limbs[i].servo_value;
        const v = Math.round(cur + (target - cur) * strength);
        this.limbs[i].servo_value = Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, v));
      }
      return;
    }
    const values: number[] = [];
    for (let i = 0; i < this.limbs.length; i++) {
      const target = this._home_servos[i];
      const cur = this.limbs[i].servo_value;
      const v = Math.round(cur + (target - cur) * strength);
      values.push(Math.max(SERVO_MIN_VALUE, Math.min(SERVO_MAX_VALUE, v)));
    }
    this.set_servo_values(values);
    this.bot.after_status_change();
  }

  is_animating(): boolean {
    return this._output.isAnimating();
  }

  update_animation(now: number, speed: number, durationMs?: number): boolean {
    return this._output.update(now, speed, (idx, val) => {
      this._set_joint_rotation(idx, val);
      this.limbs[idx]._rendered_servo_value = val;
    }, durationMs);
  }
}
