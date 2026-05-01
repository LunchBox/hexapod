import io from 'socket.io-client';
import appState from './appState.js';
import {
  HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS, LIMB_NAMES, LIMB_DEFAULTS,
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
  polyPlacement: string = 'vertex',
  orientation: string = 'back',
): LegLayout[] {
  const layouts: LegLayout[] = [];

  if (bodyShape === 'rectangle' && legCount % 2 === 0) {
    const pairs = legCount / 2;
    const frontInit = 30, rearInit = -30;
    for (let i = 0; i < pairs; i++) {
      const z = pairs === 1 ? 0 : -bodyLength / 2 + (i * bodyLength) / (pairs - 1);
      const initDeg = pairs === 1 ? 0 : frontInit + ((rearInit - frontInit) * i) / (pairs - 1);
      const initRad = initDeg * Math.PI / 180;
      // Same init_angle for both sides; mirror in draw_coxa handles L/R flip
      // Right: mirror=1 → rotation.y = +initRad → coxa from +X tilted by +initDeg°
      // Left:  mirror=-1 → rotation.y = -initRad → coxa from -X tilted by -initDeg°
      layouts.push({ x: bodyRadius, z, angle: 0, yaw: initRad, init_angle: initDeg });
      layouts.push({ x: -bodyRadius, z, angle: Math.PI, yaw: -initRad, init_angle: initDeg });
    }
  } else {
    // Polygon — legs radiate outward from body center
    // Vertex mode: legs at polygon corners at radius R
    // Edge mode: legs at edge midpoints at radius R * cos(PI/N)
    const edgeOffset = polyPlacement === 'edge' ? Math.PI / legCount : 0;
    const edgeRadius = polyPlacement === 'edge' ? bodyRadius * Math.cos(Math.PI / legCount) : bodyRadius;
    // orientOffset: 'back' = single leg at rear (π), 'front' = single leg at front (0)
    const orientOffset = orientation === 'back' ? Math.PI : 0;
    for (let i = 0; i < legCount; i++) {
      const angle = (2 * Math.PI * i) / legCount - Math.PI / 2 + edgeOffset + orientOffset;
      // mirror=1: rz=-PI/2→+X, ry=init_rad, world dir = -init_rad → need init_rad = -angle
      // mirror=-1: rz=+PI/2→-X, ry=-init_rad, world dir = PI+init_rad → need init_rad = angle-PI
      const onRight = Math.cos(angle) >= 0;
      const initDeg = onRight
        ? -angle * 180 / Math.PI
        : (angle - Math.PI) * 180 / Math.PI;
      layouts.push({
        x: edgeRadius * Math.cos(angle),
        z: edgeRadius * Math.sin(angle),
        angle,
        yaw: angle,
        init_angle: initDeg,
      });
    }
  }

  return layouts;
}

// ── Hexapod ────────────────────────────────────────────────────

export class Hexapod {
  scene: any;
  options: any;
  _limbNames: string[];
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

    // Restore display/UI state from options (or defaults)
    this.draw_types = ["mesh", "bone", "points"];
    this.draw_type = options.draw_type || "mesh";
    this.tip_circle_scale = options.tip_circle_scale ?? 1;
    this.sync_cmd = options.sync_cmd ?? false;

    this.apply_attributes(options);

    this.socket = io('http://localhost:8888', { reconnection: false });
    this.socket.on('message', (data: any) => {
      console.log(data.message);
    });
    this.socket.on('disconnect', () => {
      console.log("-- lost socket connect.");
    });
  }

  apply_attributes(options: any) {
    this.options = options;

    this.rotate_step = this.options.rotate_step;
    this.fb_step = this.options.fb_step;
    this.lr_step = this.options.lr_step;

    // Set limb names based on DOF
    const dof = this.options.dof || 3;
    const maxJoints = Math.min(6, Math.max(2, dof));
    this._limbNames = LIMB_NAMES.slice(0, maxJoints);

    if (this.mesh) {
      this.scene.remove(this.mesh);
    }

    this.on_servo_values = null;
    this.draw();

    this.gait_controller = new GaitController(this);

    this.on_servo_values = this.get_servo_values();

    // Persist so AttributesPanel and page reload see latest state
    set_bot_options(this.options);
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

    let polyPlacement = this.options.polygon_leg_placement || 'vertex';
    let orientation = this.options.polygon_odd_orientation || 'back';

    // Compute leg positions dynamically
    this.leg_layout = computeLegLayout(legCount, bodyShape, legRadius, bodyLength, polyPlacement, orientation);

    this.body_mesh = this.draw_body();
    this.mesh.add(this.body_mesh);

    // Head indicator — small sphere at front-top of body
    {
      const headGeom = new (THREE as any).SphereGeometry(5, 8, 8);
      const headMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.set(0, 100, -120);
      this.mesh.add(head);
    }

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

      // Pad missing segment data when DOF increased
      for (const name of this._limbNames) {
        if (!opt[name]) {
          const def = LIMB_DEFAULTS[name] || { length: 20, radius: 5, init_angle: 0 };
          opt[name] = { length: def.length, radius: def.radius, init_angle: def.init_angle, servo_value: 1500, revert: false };
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

    // Restore saved body home pose
    if (this.options._body_home) {
      const h = this.options._body_home;
      this.body_mesh.position.set(h.px, h.py, h.pz);
      this.body_mesh.rotation.set(h.rx, h.ry, h.rz);
      this.body_mesh.updateMatrixWorld();
      if (h.tips) {
        for (let i = 0; i < Math.min(this.legs.length, h.tips.length); i++) {
          const t = h.tips[i];
          this.legs[i].set_tip_pos(new THREE.Vector3(t.x, t.y, t.z));
        }
      } else {
        let tips = this.get_tip_pos();
        for (let i = 0; i < this.legs.length; i++) this.legs[i].set_tip_pos(tips[i]);
      }
    }

    this.draw_gait_guide();
  }

  draw_body() {
    let geometry: any, bodyVisual: any, material: any;
    let container = new THREE.Object3D();
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
        bodyVisual = new THREE.Line(geometry, material);
        break;
      case "points":
        material = new THREE.PointsMaterial({ color: color });
        geometry = new THREE.Geometry();
        legPositions.forEach(v => geometry.vertices.push(v.clone()));
        bodyVisual = new THREE.Points(geometry, material);
        break;
      default:
        if (bodyShape === 'polygon' && legCount >= 3) {
          // Build N-gon prism manually — vertex positions match leg layout exactly
          geometry = new THREE.Geometry();
          const halfH = bodyHeight / 2;

          // Center vertices for top/bottom caps
          const btmCenter = geometry.vertices.length;
          geometry.vertices.push(new THREE.Vector3(0, -halfH, 0));
          const topCenter = geometry.vertices.length;
          geometry.vertices.push(new THREE.Vector3(0, halfH, 0));

          // Outer ring vertices at same angles as legs
          const orientOffset = this.options.polygon_odd_orientation === 'front' ? 0 : Math.PI;
          const btmRing: number[] = [], topRing: number[] = [];
          for (let i = 0; i < legCount; i++) {
            const a = (2 * Math.PI * i) / legCount - Math.PI / 2 + orientOffset;
            const x = bodyRadius * Math.cos(a);
            const z = bodyRadius * Math.sin(a);
            btmRing.push(geometry.vertices.length);
            geometry.vertices.push(new THREE.Vector3(x, -halfH, z));
            topRing.push(geometry.vertices.length);
            geometry.vertices.push(new THREE.Vector3(x, halfH, z));
          }

          // Bottom & top caps
          for (let i = 0; i < legCount; i++) {
            const next = (i + 1) % legCount;
            geometry.faces.push(new (THREE as any).Face3(btmCenter, btmRing[next], btmRing[i]));
            geometry.faces.push(new (THREE as any).Face3(topCenter, topRing[i], topRing[next]));
          }

          // Side faces (2 triangles per quad)
          for (let i = 0; i < legCount; i++) {
            const next = (i + 1) % legCount;
            geometry.faces.push(new (THREE as any).Face3(btmRing[i], btmRing[next], topRing[next]));
            geometry.faces.push(new (THREE as any).Face3(btmRing[i], topRing[next], topRing[i]));
          }

          geometry.computeFaceNormals();
          bodyVisual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: color }));
        } else {
          // Rectangle body with thickness
          geometry = new THREE.BoxGeometry(this.options.body_width, bodyHeight, this.options.body_length);
          bodyVisual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: color }));
        }
        let axisHelper = new THREE.AxisHelper(30);
        bodyVisual.add(axisHelper);
    }

    container.add(bodyVisual);
    container.position.y = bodyHeight / 2;
    return container;
  }

  draw_gait_guide() {
    this.guide_pos = new THREE.Object3D();
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let tip = this.legs[i].get_tip_pos();
      let geom = new (THREE as any).CircleGeometry(7, 16);
      let mat = new (THREE as any).MeshBasicMaterial({ color: 0x111111, side: (THREE as any).DoubleSide });
      let sq = new THREE.Mesh(geom, mat);
      sq.position.copy(tip);
      sq.rotation.x = -Math.PI / 2; // flat on ground
      this.guide_pos.add(sq);
    }
    this.mesh.add(this.guide_pos);
  }

  sync_guide_circles() {
    if (!this.guide_pos) return;
    for (let i = 0; i < this.legs.length; i++) {
      const sq = this.guide_pos.children[i] as any;
      if (sq) sq.position.copy(this.legs[i].get_tip_pos());
    }
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

    let child = this.guide_pos.children[leg_idx] as any;
    if (child) {
      let vector = new THREE.Vector3();
      vector.setFromMatrixPosition(child.matrixWorld);
      return vector;
    }
    return new THREE.Vector3();
  }

  draw_gait_guidelines() {
    this.mesh.updateMatrixWorld();

    let material = new THREE.LineBasicMaterial({ color: 0xcc3300 });
    this.guideline = new THREE.Object3D();
    for (let idx = 0; idx < this.legs.length; idx++) {
      let geometry = new THREE.Geometry();
      let body_pos = this.body_mesh.position.clone();
      let tip_pos = this.legs[idx].get_tip_pos();
      geometry.vertices.push(body_pos, tip_pos);
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
    if (!this.guideline) return;
    this.mesh.updateMatrixWorld();
    const bodyPos = this.body_mesh.position.clone();
    // Update tip-position lines and guide dots
    for (let idx = 0; idx < this.legs.length; idx++) {
      const tip = this.legs[idx].get_tip_pos();
      // guideline lines
      const line = this.guideline.children[idx] as any;
      if (line) {
        line.geometry.vertices[0].copy(bodyPos);
        line.geometry.vertices[1].copy(tip);
        line.geometry.verticesNeedUpdate = true;
      }
    }
    // Update rotation clones
    const updateClone = (clone: any) => {
      for (let idx = 0; idx < this.legs.length; idx++) {
        const line = clone.children[idx] as any;
        if (!line) continue;
        line.geometry.vertices[0].copy(bodyPos);
        line.geometry.vertices[1].copy(this.legs[idx].get_tip_pos());
        line.geometry.verticesNeedUpdate = true;
      }
    };
    if (this.left_gl) { this.left_gl.rotation.y = this.rotate_step; updateClone(this.left_gl); }
    if (this.right_gl) { this.right_gl.rotation.y = -this.rotate_step; updateClone(this.right_gl); }
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
    let joint_names = this._limbNames;
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

    let limb_names = this._limbNames;
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

  debug_joint_positions() {
    this.mesh.updateMatrixWorld();
    const names = [...this._limbNames, 'tip'];
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

    // Subdivide into at most 3 steps for smooth IK
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
      if (maxDrift > 2) {
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
        return false;
      }
    }
    this.sync_guide_circles();
    this.after_status_change();
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
    let opts: any = {};
    opts['r' + direction] = radius;
    this.transform_body(opts);
  }

  adjust_tip_spread(new_scale: number) {
    let old_scale = this.tip_circle_scale;
    if (old_scale === new_scale || old_scale <= 0) return;
    let ratio = new_scale / old_scale;
    this.tip_circle_scale = new_scale;

    let current_tips = this.get_tip_pos();
    let cx = this.body_mesh.position.x;
    let cz = this.body_mesh.position.z;

    for (let i = 0; i < this.legs.length; i++) {
      let tip = current_tips[i];
      tip.x = cx + (tip.x - cx) * ratio;
      tip.z = cz + (tip.z - cz) * ratio;
      this.legs[i].set_tip_pos(tip);
    }

    this.sync_guide_circles();
    this.after_status_change();
  }

  save_body_home() {
    const tips = this.get_tip_pos();
    const home = {
      px: this.body_mesh.position.x, py: this.body_mesh.position.y, pz: this.body_mesh.position.z,
      rx: this.body_mesh.rotation.x, ry: this.body_mesh.rotation.y, rz: this.body_mesh.rotation.z,
      tips: tips.map((t: any) => ({ x: t.x, y: t.y, z: t.z })),
    };
    this.options._body_home = home;
    set_bot_options(this.options);
  }

  reset_body_to_home() {
    const home = this.options._body_home;
    if (!home) return;
    // Set body pose directly (no tip lock needed — tips are set explicitly below)
    this.body_mesh.position.set(home.px, home.py, home.pz);
    this.body_mesh.rotation.set(home.rx, home.ry, home.rz);
    this.body_mesh.updateMatrixWorld();
    if (home.tips) {
      for (let i = 0; i < Math.min(this.legs.length, home.tips.length); i++) {
        const t = home.tips[i];
        this.legs[i].set_tip_pos(new THREE.Vector3(t.x, t.y, t.z));
      }
    }
    this.after_status_change();
    if (this.adjust_gait_guidelines) this.adjust_gait_guidelines();
  }

  reset_body_to_init() {
    delete this.options._body_home;
    // Redraw without persisting (bare draw + new gait controller)
    if (this.mesh) this.scene.remove(this.mesh);
    this.draw();
    this.gait_controller = new (this.gait_controller.constructor as any)(this);
    this.on_servo_values = this.get_servo_values();
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
    this.joint_count = Math.min(6, Math.max(2, dof));
    const names = this.bot._limbNames; // set by Hexapod based on DOF

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
      mesh.rotation.y = this.mirror * degree_to_redius(opt.init_angle);
    } else {
      mesh.position.y = this.options[prevName!].length;
      mesh.rotation.z = this.mirror * degree_to_redius(opt.init_angle);
    }

    mesh.init_radius = degree_to_redius(opt.init_angle);
    mesh.init_angle = opt.init_angle;
    mesh.servo_value = opt.servo_value;
    mesh.servo_idx = opt.servo_idx;
    mesh.revert = opt.revert;

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
      limb_mesh.rotation.y = this.mirror * limb_mesh.init_radius + delta_radius;
    } else {
      limb_mesh.rotation.z = this.mirror * limb_mesh.init_radius + delta_radius;
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

  const legCount = options.leg_count || 6;
  const dof = options.dof || 3;
  const jointsPerLeg = Math.min(6, Math.max(2, dof));
  const segNames = LIMB_NAMES.slice(0, jointsPerLeg);

  // Pad leg_options if fewer entries than leg count (e.g. 7-9 legs)
  while (options.leg_options.length < legCount) {
    let template = options.leg_options[options.leg_options.length - 1] || options.leg_options[0];
    options.leg_options.push(JSON.parse(JSON.stringify(template)));
  }

  // Ensure each leg_option has all segment data
  const defaultLeg = DEFAULT_HEXAPOD_OPTIONS.leg_options[0];
  for (let i = 0; i < legCount; i++) {
    let leg_option = options.leg_options[i];
    for (const name of segNames) {
      if (!leg_option[name]) {
        leg_option[name] = JSON.parse(JSON.stringify(defaultLeg[name] || {
          length: LIMB_DEFAULTS[name]?.length || 20,
          radius: LIMB_DEFAULTS[name]?.radius || 5,
          init_angle: LIMB_DEFAULTS[name]?.init_angle || 0,
          servo_value: 1500, revert: false,
        }));
      }
    }
    // Assign servo indices
    const base = options.first_servo_idx + i * jointsPerLeg;
    for (let j = 0; j < segNames.length; j++) {
      if (typeof leg_option[segNames[j]].servo_idx === "undefined") {
        leg_option[segNames[j]].servo_idx = base + j;
      }
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
