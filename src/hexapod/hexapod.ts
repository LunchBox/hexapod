import io from 'socket.io-client';
import appState from './appState.js';
import {
  HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS,
  DEFAULT_FRAMES_INTERVAL, SERVO_VALUE_TIME_UNIT,
  SERVO_MIN_VALUE, SERVO_MAX_VALUE,
} from './defaults.js';
import { getWorldPosition, apply_xyz, get_obj_from_local_storage, set_obj_to_local_storage, degree_to_redius, remove_class, add_class, clearSelection } from './utils.js';
import { GaitController } from './gaits.js';
import { PosCalculator } from './pos_calculator.js';

// ── Leg layout computation ─────────────────────────────────────

interface LegLayout {
  x: number;       // signed world X position
  z: number;       // signed world Z position
  angle: number;   // radial angle from body center (radians)
  yaw: number;     // coxa.rotation.y in radians (points leg outward)
  init_angle: number; // coxa init_angle in degrees (for backward compat)
}

function computeLegLayout(
  legCount: number,
  bodyShape: string,
  bodyRadius: number,
  bodyLength: number,
): LegLayout[] {
  const layouts: LegLayout[] = [];

  if (bodyShape === 'rectangle' && legCount % 2 === 0) {
    const pairs = legCount / 2;
    for (let i = 0; i < pairs; i++) {
      const z = pairs === 1 ? 0 : -bodyLength / 2 + (i * bodyLength) / (pairs - 1);
      // Right leg (+X)
      layouts.push({
        x: bodyRadius, z,
        angle: -Math.PI / 2,
        yaw: -Math.PI / 2,    // points right
        init_angle: 30,       // default forward tilt
      });
      // Left leg (-X)
      layouts.push({
        x: -bodyRadius, z,
        angle: Math.PI / 2,
        yaw: Math.PI / 2,     // points left
        init_angle: -30,      // mirrored tilt
      });
    }
  } else {
    // Polygon — legs at vertices, radiating outward
    for (let i = 0; i < legCount; i++) {
      const angle = (2 * Math.PI * i) / legCount - Math.PI / 2;
      layouts.push({
        x: bodyRadius * Math.cos(angle),
        z: bodyRadius * Math.sin(angle),
        angle,
        yaw: angle,           // coxa points radially outward
        init_angle: angle * 180 / Math.PI,
      });
    }
  }

  return layouts;
}

// ── Hexapod ────────────────────────────────────────────────────

export class Hexapod {
  scene: any;
  options: any;
  draw_types: string[];
  draw_type: string;
  tip_circle_scale: number;
  socket: any;
  sync_cmd: boolean;
  rotate_step: number;
  fb_step: number;
  lr_step: number;
  mesh: any;
  body_mesh: any;
  legs: any[];
  gait_controller: any;
  on_servo_values: number[];
  guide_pos: any;
  guideline: any;
  left_gl: any;
  right_gl: any;
  center_offset: number;
  hold_time: number;
  time_interval_stack: number[];
  onServoUpdate: (() => void) | null;
  leg_layout: LegLayout[];

  constructor(scene: any, options: any) {
    if (!scene) {
      scene = appState.scene;
    }
    this.scene = scene;

    this.apply_attributes(options);

    this.draw_types = ["mesh", "bone", "points"];
    this.draw_type = "mesh";

    this.tip_circle_scale = 1;

    this.socket = io('http://localhost:8888', { reconnection: false });
    this.socket.on('message', (data: any) => {
      console.log(data.message);
    });
    this.socket.on('disconnect', () => {
      console.log("-- lost socket connect.");
    });
    this.sync_cmd = false;
  }

  apply_attributes(options: any) {
    this.options = options;

    this.rotate_step = this.options.rotate_step;
    this.fb_step = this.options.fb_step;
    this.lr_step = this.options.lr_step;

    if (this.mesh) {
      this.scene.remove(this.mesh);
    }

    this.on_servo_values = null;
    this.draw();

    this.gait_controller = new GaitController(this);

    this.on_servo_values = this.get_servo_values();
  }

  draw() {
    this.mesh = new THREE.Object3D();
    this.scene.add(this.mesh);

    const legCount = this.options.leg_count || 6;
    const bodyShape = this.options.body_shape || 'rectangle';
    const bodyLength = this.options.body_length || 100;
    const bodyWidth = this.options.body_width || 50;
    const bodyRadius = this.options.body_radius || 50;
    // Rectangle uses body_width/2 for leg spacing; polygon uses body_radius
    const legRadius = bodyShape === 'polygon' ? bodyRadius : bodyWidth / 2;

    // Compute leg positions dynamically
    this.leg_layout = computeLegLayout(legCount, bodyShape, legRadius, bodyLength);

    this.body_mesh = this.draw_body();
    this.mesh.add(this.body_mesh);

    this.legs = [];
    for (let idx = 0; idx < legCount; idx++) {
      let opt = { ...this.options.leg_options[idx] };
      const layout = this.leg_layout[idx];

      // Direct signed positions — no mirror indirection
      opt.x = layout.x;
      opt.z = layout.z;
      opt.mirror = 1; // always 1, no more L/R mirroring
      opt.coxa = {
        ...opt.coxa,
        init_angle: layout.init_angle,
      };
      // Store yaw for draw_coxa
      (opt as any)._yaw = layout.yaw;

      let leg = new HexapodLeg(this, opt);
      leg.radial_angle = layout.angle;
      this.body_mesh.add(leg.mesh);
      this.legs.push(leg);
    }

    this.laydown();
    this.putdown_tips();

    this.draw_gait_guide();
    this.draw_gait_guidelines();
  }

  draw_body() {
    let geometry: any, mesh: any, material: any;
    let color = this.options.color ? this.options.color : 0x333333;
    let bodyHeight = this.options.body_height || 20;
    let bodyShape = this.options.body_shape || 'rectangle';
    let legCount = this.options.leg_count || 6;
    let bodyRadius = this.options.body_radius || 50;

    // Collect leg positions for wireframe views (all signed directly)
    let legPositions = this.leg_layout.map((l: LegLayout) =>
      new THREE.Vector3(l.x, 0, l.z)
    );

    switch (this.draw_type) {
      case "bone":
        material = new THREE.LineBasicMaterial({ color: color });
        geometry = new THREE.Geometry();
        legPositions.forEach(v => geometry.vertices.push(v.clone()));
        geometry.vertices.push(legPositions[0].clone());
        mesh = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: color });
        geometry = new THREE.Geometry();
        legPositions.forEach(v => geometry.vertices.push(v.clone()));
        mesh = new THREE.Points(geometry, material);
        break;
      default:
        if (bodyShape === 'polygon' && legCount >= 3) {
          // N-gon prism via CylinderGeometry (flat on ground)
          geometry = new (THREE as any).CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, legCount);
          mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: color }));
        } else {
          // Rectangle body with thickness
          geometry = new THREE.BoxGeometry(this.options.body_width, bodyHeight, this.options.body_length);
          mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: color }));
        }
        let axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.position.y = bodyHeight / 2;
    return mesh;
  }

  draw_gait_guide() {
    let material = new THREE.PointsMaterial({ color: 0x000000, size: 20 });
    let geometry = new THREE.Geometry();

    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      geometry.vertices.push(this.legs[i].get_tip_pos());
    }
    geometry.vertices.push(new THREE.Vector3(0, 0, 0));

    this.guide_pos = new THREE.Points(geometry, material);
    this.mesh.add(this.guide_pos);
  }

  reset_guide_pos() {
    let gp = this.guide_pos;
    gp.position.set(0, 0, 0);
    gp.rotation.set(0, 0, 0);
    gp.scale.set(1, 1, 1);
  }

  get_guide_pos(leg_idx: number) {
    this.guide_pos.scale.set(this.tip_circle_scale, this.tip_circle_scale, this.tip_circle_scale);
    this.mesh.updateMatrixWorld();

    let vector = this.guide_pos.geometry.vertices[leg_idx].clone();
    vector.applyMatrix4(this.guide_pos.matrixWorld);
    return vector;
  }

  draw_gait_guidelines() {
    this.mesh.updateMatrixWorld();

    let material = new THREE.LineBasicMaterial({ color: 0xcc3300 });
    this.guideline = new THREE.Object3D();
    for (let idx = 0; idx < this.legs.length; idx++) {
      let geometry = new THREE.Geometry();
      let mesh_pos = this.mesh.position.clone();
      let tip_pos = this.legs[idx].get_tip_pos();
      geometry.vertices.push(mesh_pos, tip_pos);
      let line = new THREE.Line(geometry, material);
      this.guideline.add(line);
    }
    this.mesh.add(this.guideline);

    this.left_gl = this.guideline.clone();
    this.left_gl.rotation.y = this.rotate_step;
    this.mesh.add(this.left_gl);

    this.right_gl = this.guideline.clone();
    this.right_gl.rotation.y = -this.rotate_step;
    this.mesh.add(this.right_gl);
  }

  adjust_gait_guidelines() {
    this.left_gl.rotation.y = this.rotate_step;
    this.right_gl.rotation.y = -this.rotate_step;
  }

  get_servo_values() {
    let values: number[] = [];
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      values.push(leg.coxa.servo_value);
      values.push(leg.femur.servo_value);
      values.push(leg.tibia.servo_value);
      if (leg.tarsus) values.push(leg.tarsus.servo_value);
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
    let joint_names = this.legs[0]?.joint_count >= 4
      ? ["coxa", "femur", "tibia", "tarsus"]
      : ["coxa", "femur", "tibia"];
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      status["legs"][i] = { "on_floor": leg.on_floor };

      for (let j = 0; j < joint_names.length; j++) {
        let limb_idx = joint_names[j];
        let limb = this.legs[i][limb_idx];
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
    let len = new_servo_values.length;
    let intervals = [DEFAULT_FRAMES_INTERVAL];
    for (let i = 0; i < len; i++) {
      let temp = Math.abs(new_servo_values[i] - old_servo_values[i]) * SERVO_VALUE_TIME_UNIT;
      intervals.push(temp);
    }
    return Math.round(Math.max.apply(null, intervals));
  }

  apply_status(status: any) {
    apply_xyz(this.mesh.position, status.mesh.position);
    apply_xyz(this.mesh.rotation, status.mesh.rotation);
    apply_xyz(this.body_mesh.position, status.body_mesh.position);
    apply_xyz(this.body_mesh.rotation, status.body_mesh.rotation);

    this.center_offset = status.center_offset;

    let limb_names = this.legs[0]?.joint_count >= 4
      ? ["coxa", "femur", "tibia", "tarsus"]
      : ["coxa", "femur", "tibia"];
    let total_limb_names = limb_names.length;
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let leg = this.legs[i];
      let leg_status = status["legs"][i];
      leg.on_floor = leg_status.on_floor;

      for (let j = 0; j < total_limb_names; j++) {
        let limb_name = limb_names[j];
        let limb = leg[limb_name];
        let limb_status = leg_status[limb_name];
        apply_xyz(limb.position, limb_status.position);
        apply_xyz(limb.rotation, limb_status.rotation);
        limb.servo_value = limb_status.servo_value;
        limb.servo_idx = limb_status.servo_idx;
      }
    }
    return status;
  }

  format_servo_values(servo_values: number[]) {
    let formatted_value: string[] = [];
    let joints_per_leg = this.legs[0]?.joint_count || 3;
    let total_values = servo_values.length;
    for (let idx = 0; idx < total_values; idx++) {
      let i = Math.floor(idx / joints_per_leg);
      let j = idx % joints_per_leg;
      formatted_value.push("#" + this.legs[i].limbs[j].servo_idx + " P" + servo_values[idx]);
    }
    return formatted_value.join(" ");
  }

  display_status(container: HTMLElement) {
    let servo_values = this.get_servo_values();

    let row = document.createElement('div');
    row.setAttribute("class", "sv_row");
    container.appendChild(row);

    (row as any).data_value = this.get_status();

    let data = document.createElement('div');
    data.setAttribute("class", "data");
    data.innerHTML = this.format_servo_values(servo_values);
    row.appendChild(data);

    row.addEventListener("dblclick", () => {
      this.apply_status((row as any).data_value);

      Array.prototype.forEach.call(document.querySelectorAll(".sv_row.active"), (elem: HTMLElement) => {
        remove_class(elem, "active");
      });
      add_class(row, "active");

      clearSelection();
    });

    container.scrollTop = container.scrollHeight;
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

  move_body(direction: string, distance: number) {
    let current_tips_pos = this.get_tip_pos();
    this.body_mesh.position[direction] += distance;

    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      this.legs[i].set_tip_pos(current_tips_pos[i]);
    }

    this.after_status_change();
  }

  float(direction: string, distance: number) {
    this.mesh.position[direction] += distance;
    this.after_status_change();
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

  putdown_tips() {
    console.log("-- putdown tips fired");
    let tip_pos: any;
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      tip_pos = this.legs[i].get_tip_pos();
      tip_pos.y = 0;
      this.legs[i].set_tip_pos(tip_pos);
    }
    this.after_status_change();
  }

  rotate_body(direction: string, radius: number) {
    let current_tips_pos = this.get_tip_pos();
    this.body_mesh.rotation[direction] += radius;
    this.body_mesh.updateMatrixWorld();

    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      this.legs[i].set_tip_pos(current_tips_pos[i]);
    }

    this.after_status_change();
  }

  after_status_change(send_cmd?: boolean) {
    this.display_values();

    let servo_values = this.get_servo_values();
    let cmd = this.build_cmd(servo_values);
    let el = document.querySelector("#servo_values");
    if (el) el.innerHTML = cmd;

    if (this.sync_cmd) {
      if (typeof send_cmd === "undefined" || send_cmd) {
        this.send_cmd(cmd);
        this.hold_time = this.get_min_interval(servo_values, this.on_servo_values);
        this.on_servo_values = servo_values;
      } else {
        this.hold_time = 0;
      }
    } else {
      this.hold_time = 0;
    }

    let el2 = document.querySelector("#on_servo_values");
    if (this.on_servo_values && el2) {
      el2.innerHTML = this.format_servo_values(this.on_servo_values);
    }

    let container = document.querySelector("#status_history");
    if (container) this.display_status(container as HTMLElement);

    this.draw_time_interval(this.hold_time);

    if (this.onServoUpdate) this.onServoUpdate();
  }

  send_status() {
    let servo_values = this.get_servo_values();
    let cmd = this.build_cmd(servo_values);

    let el = document.querySelector("#servo_values");
    if (el) el.innerHTML = cmd;

    this.send_cmd(cmd);
    this.on_servo_values = servo_values;

    let el2 = document.querySelector("#on_servo_values");
    if (this.on_servo_values && el2) {
      el2.innerHTML = this.format_servo_values(this.on_servo_values);
    }
  }

  display_values() {
    let limb: any, next_limb: any, servo_value: any, vector: any;
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      for (let jdx = 0; jdx < this.legs[i].limbs.length; jdx++) {
        limb = this.legs[i].limbs[jdx];
        servo_value = limb.servo_value;

        if (limb.range_control) {
          limb.range_control.value = servo_value;
          limb.current_control.value = servo_value;
        }

        next_limb = this.legs[i].limbs[jdx + 1];
        if (next_limb && limb.end_x_control) {
          vector = getWorldPosition(this.mesh, next_limb);
          limb.end_x_control.value = vector.x.toFixed(2);
          limb.end_y_control.value = vector.y.toFixed(2);
          limb.end_z_control.value = vector.z.toFixed(2);
        }
      }
    }
  }

  build_cmd(servo_values: number[]) {
    let cmd = this.format_servo_values(servo_values);

    if (this.on_servo_values) {
      let interval = this.get_min_interval(servo_values, this.on_servo_values);
      cmd += " T" + interval;
    } else {
      cmd += " T500";
    }

    return cmd;
  }

  send_cmd(cmd: string) {
    console.log("-- send_cmd fired.");
    if (this.socket.connected) {
      this.socket.emit('client_data', { str: cmd });
    }
  }

  draw_time_interval(time_interval: number) {
    let canvas = document.getElementById('chart') as HTMLCanvasElement | null;
    if (!canvas) return;
    let context = canvas.getContext('2d')!;
    context.fillStyle = '#333';

    let max_number = 100;
    let scale = 1 / 2;
    let gap = Math.round((canvas.width - 60) / max_number);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "12px Arial";

    context.beginPath();
    context.rect(0, 25, canvas.width, 0.5);
    context.fillText(String(25 / scale), 0, canvas.height - 25 + 4);
    context.rect(0, 50, canvas.width, 0.5);
    context.fillText(String(50 / scale), 0, canvas.height - 50 + 4);
    context.rect(0, 75, canvas.width, 0.5);
    context.fillText(String(75 / scale), 0, canvas.height - 75 + 4);
    context.fillStyle = '#ccc';
    context.fill();

    if (time_interval < 1) {
      return;
    }

    if (!this.time_interval_stack) {
      this.time_interval_stack = [];
    }

    this.time_interval_stack.push(time_interval);

    if (this.time_interval_stack.length > max_number) {
      this.time_interval_stack = this.time_interval_stack.slice(this.time_interval_stack.length - max_number, max_number);
    }

    let total = 0;
    for (let i = 0; i < this.time_interval_stack.length; i++) {
      let h = this.time_interval_stack[i] * scale;
      total += this.time_interval_stack[i];

      context.beginPath();
      context.rect(i * gap + 30, canvas.height - h, 0.5, h);
      context.fillStyle = '#333';
      context.fill();
    }

    let avg = (total / this.time_interval_stack.length).toFixed(2);
    context.fillText("average: " + avg + "ms", 2, 12);
  }
}

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
  radial_angle: number;

  constructor(bot: any, options: any) {
    this.bot = bot;
    this.options = options;
    this.mesh = new THREE.Object3D();
    this.mirror = options.mirror;

    this.on_floor = true;
    this.center_offset = 0;
    this.color = 0xbb1100;

    const dof = this.bot.options.dof || 3;
    this.joint_count = Math.min(4, Math.max(3, dof));

    // coxa
    this.coxa = this.draw_coxa();
    this.mesh.add(this.coxa);

    // femur
    this.femur = this.draw_femur();
    this.coxa.add(this.femur);

    // tibia
    this.tibia = this.draw_tibia();
    this.femur.add(this.tibia);

    // tarsus (4th joint, only if DOF >= 4)
    if (this.joint_count >= 4) {
      this.tarsus = this.draw_tarsus();
      this.tibia.add(this.tarsus);
    }

    // tip
    let geometry = new THREE.Geometry();
    geometry.vertices.push(new THREE.Vector3(0, 0, 0));
    let tip = new THREE.Points(geometry, new THREE.PointsMaterial());
    tip.type = "tip";

    if (this.joint_count >= 4) {
      tip.position.y = options.tarsus.length;
      this.tarsus.add(tip);
    } else {
      tip.position.y = options.tibia.length;
      this.tibia.add(tip);
    }
    tip.visible = false;

    this.tip = tip;

    if (this.joint_count >= 4) {
      this.limbs = [this.coxa, this.femur, this.tibia, this.tarsus, this.tip];
    } else {
      this.limbs = [this.coxa, this.femur, this.tibia, this.tip];
    }
  }

  draw_coxa() {
    let geometry: any, mesh: any, material: any;

    switch (this.bot.draw_type) {
      case "bone":
        material = new THREE.LineBasicMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.coxa.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.coxa.length, 0));
        mesh = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.coxa.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.coxa.length, 0));
        mesh = new THREE.Points(geometry, material);
        break;
      default:
        material = new THREE.MeshBasicMaterial({ color: this.color });
        geometry = new THREE.BoxGeometry(this.options.coxa.radius, this.options.coxa.length, this.options.coxa.radius);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.coxa.length / 2, 0));
        mesh = new THREE.Mesh(geometry, material);
        let axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.type = "coxa";

    mesh.position.x = this.options.x;
    mesh.position.y = this.options.y;
    mesh.position.z = this.options.z;

    // Coxa always starts along +X, then rotated by yaw
    mesh.rotation.z = -Math.PI / 2;
    const yaw = (this.options)._yaw != null
      ? (this.options)._yaw
      : degree_to_redius(this.options.coxa.init_angle);
    mesh.rotation.y = yaw;

    mesh.init_radius = yaw;
    mesh.init_angle = this.options.coxa.init_angle;

    mesh.servo_value = this.options.coxa.servo_value;
    mesh.servo_idx = this.options.coxa.servo_idx;
    mesh.revert = this.options.coxa.revert;

    return mesh;
  }

  draw_femur() {
    let geometry: any, mesh: any, material: any;

    switch (this.bot.draw_type) {
      case "bone":
        material = new THREE.LineBasicMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.femur.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.femur.length, 0));
        mesh = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.femur.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.femur.length, 0));
        mesh = new THREE.Points(geometry, material);
        break;
      default:
        material = new THREE.MeshBasicMaterial({ color: this.color });
        geometry = new THREE.BoxGeometry(this.options.femur.radius, this.options.femur.length, this.options.femur.radius);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.femur.length / 2, 0));
        mesh = new THREE.Mesh(geometry, material);
        let axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.type = "femur";

    mesh.position.y = this.options.coxa.length;
    mesh.rotation.z = degree_to_redius(this.options.femur.init_angle);
    mesh.init_radius = degree_to_redius(this.options.femur.init_angle);
    mesh.init_angle = this.options.femur.init_angle;

    mesh.servo_value = this.options.femur.servo_value;
    mesh.servo_idx = this.options.femur.servo_idx;
    mesh.revert = this.options.femur.revert;

    return mesh;
  }

  draw_tibia() {
    let geometry: any, mesh: any, material: any;

    switch (this.bot.draw_type) {
      case "bone":
        material = new THREE.LineBasicMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.tibia.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.tibia.length, 0));
        mesh = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.tibia.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.tibia.length, 0));
        mesh = new THREE.Points(geometry, material);
        break;
      default:
        material = new THREE.MeshBasicMaterial({ color: this.color });
        geometry = new THREE.BoxGeometry(this.options.tibia.radius, this.options.tibia.length, this.options.tibia.radius);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.tibia.length / 2, 0));
        mesh = new THREE.Mesh(geometry, material);
        let axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.type = "tibia";

    mesh.position.y = this.options.femur.length;
    mesh.rotation.z = degree_to_redius(this.options.tibia.init_angle);
    mesh.init_radius = degree_to_redius(this.options.tibia.init_angle);
    mesh.init_angle = this.options.tibia.init_angle;

    mesh.servo_value = this.options.tibia.servo_value;
    mesh.servo_idx = this.options.tibia.servo_idx;
    mesh.revert = this.options.tibia.revert;

    return mesh;
  }

  draw_tarsus() {
    let geometry: any, mesh: any, material: any;

    switch (this.bot.draw_type) {
      case "bone":
        material = new THREE.LineBasicMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.tarsus.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.tarsus.length, 0));
        mesh = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: this.color });
        geometry = new THREE.Geometry();
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.tarsus.length / 2, 0));
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.tarsus.length, 0));
        mesh = new THREE.Points(geometry, material);
        break;
      default:
        material = new THREE.MeshBasicMaterial({ color: this.color });
        geometry = new THREE.BoxGeometry(this.options.tarsus.radius, this.options.tarsus.length, this.options.tarsus.radius);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, this.options.tarsus.length / 2, 0));
        mesh = new THREE.Mesh(geometry, material);
        let axisHelper = new THREE.AxisHelper(15);
        mesh.add(axisHelper);
    }

    mesh.type = "tarsus";

    mesh.position.y = this.options.tibia.length;
    mesh.rotation.z = degree_to_redius(this.options.tarsus.init_angle);
    mesh.init_radius = degree_to_redius(this.options.tarsus.init_angle);
    mesh.init_angle = this.options.tarsus.init_angle;

    mesh.servo_value = this.options.tarsus.servo_value;
    mesh.servo_idx = this.options.tarsus.servo_idx;
    mesh.revert = this.options.tarsus.revert;

    return mesh;
  }

  set_init_angle(limb_idx: number, angle: number) {
    let ori_radius = this.limbs[limb_idx].init_radius;
    let new_radius = degree_to_redius(angle);
    let limb_mesh = this.limbs[limb_idx];
    limb_mesh.init_radius = new_radius;

    if (limb_idx === 0) {
      limb_mesh.rotation.y = new_radius;
    } else {
      limb_mesh.rotation.z = new_radius;
    }
  }

  get_angle(limb_idx: number) {
    let limb = this.limbs[limb_idx];
    if (limb_idx === 0) {
      return limb.rotation.y / Math.PI * 180;
    } else {
      return limb.rotation.z / Math.PI * 180;
    }
  }

  set_angle(limb_idx: number, angle: number) {
    let limb = this.limbs[limb_idx];
    let current_angle = this.get_angle(limb_idx);
    let diff_servo_value = ((SERVO_MAX_VALUE - SERVO_MIN_VALUE) / 2) * (angle - current_angle) / 90;
    let new_servo_value = limb.servo_value + diff_servo_value;
    this.set_servo_value(limb_idx, new_servo_value);
  }

  set_servo_values(values: number[]) {
    let total_values = values.length;
    for (let i = 0; i < total_values; i++) {
      this.set_servo_value(i, values[i]);
    }
  }

  set_servo_value(limb_idx: number, value: number) {
    let delta = value - (SERVO_MAX_VALUE - SERVO_MIN_VALUE) / 2 - SERVO_MIN_VALUE;
    let delta_radius = ((1.0 * delta) / (SERVO_MAX_VALUE - SERVO_MIN_VALUE)) * Math.PI;

    let limb_mesh = this.limbs[limb_idx];

    if (limb_mesh.revert) {
      delta_radius *= -1;
    }

    if (limb_idx === 0) {
      limb_mesh.rotation.y = limb_mesh.init_radius + delta_radius;
    } else {
      limb_mesh.rotation.z = limb_mesh.init_radius + delta_radius;
    }

    let _value = Math.round(value);
    this.limbs[limb_idx].servo_value = _value;
  }

  get_tip_pos() {
    return getWorldPosition(this.bot.mesh, this.tip);
  }

  set_tip_pos(new_pos: any) {
    let calculator = new PosCalculator(this, new_pos);
    return calculator.run();
  }
}

// ── Config helpers ──────────────────────────────────────────────

export function get_bot_options() {
  let options = get_obj_from_local_storage(HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS);

  const dof = options.dof || 3;
  const jointsPerLeg = Math.min(4, Math.max(3, dof));

  for (let i = 0; i < options.leg_options.length; i++) {
    let leg_option = options.leg_options[i];
    const base = options.first_servo_idx + i * jointsPerLeg;
    if (typeof leg_option.coxa.servo_idx === "undefined") {
      leg_option.coxa.servo_idx = base;
    }
    if (typeof leg_option.femur.servo_idx === "undefined") {
      leg_option.femur.servo_idx = base + 1;
    }
    if (typeof leg_option.tibia.servo_idx === "undefined") {
      leg_option.tibia.servo_idx = base + 2;
    }
    if (jointsPerLeg >= 4 && leg_option.tarsus && typeof leg_option.tarsus.servo_idx === "undefined") {
      leg_option.tarsus.servo_idx = base + 3;
    }
  }

  return options;
}

export function set_bot_options(hexapod_options: any) {
  set_obj_to_local_storage(HEXAPOD_OPTIONS_KEY, hexapod_options);
}

export function build_bot(bot_options: any) {
  let bot = new Hexapod(appState.scene, bot_options);
  return bot;
}
