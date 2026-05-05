import io from 'socket.io-client';
import appState from './appState.js';
import {
  HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS, LIMB_NAMES, LIMB_DEFAULTS,
  DEFAULT_FRAMES_INTERVAL, SERVO_VALUE_TIME_UNIT,
} from './defaults.js';
import { getWorldPosition, apply_xyz, get_obj_from_local_storage, set_obj_to_local_storage, remove_class, add_class, clearSelection } from './utils.js';
import { GaitController } from './gaits.js';
import { PhysicsSolver } from './physics_solver.js';
import { history } from './history.js';
import { HexapodLeg } from './hexapod_leg.js';
import { computeLegLayout, getSegNamesForLeg, computeJointPositions, getActualJointPositions, applyJointMove, type LegLayout } from './leg_layout.js';

// Re-export for component backwards compatibility
export { HexapodLeg, getSegNamesForLeg, computeJointPositions, getActualJointPositions, applyJointMove };
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
  _guideCircles: any[];
  _guideLabels: any[];
  guide_pivot: any;
  guide_pos: any;
  _guide_local_positions: any[];
  guideline: any;
  left_gl: any;
  right_gl: any;
  center_offset: number;
  hold_time: number;
  servo_speed: number;
  _servo_anim_disabled: boolean = true;
  _mesh_keyframes: { pos: any; rotY: number }[] | null = null;
  _segment_durations: number[] = [];
  _current_segment: number = 0;
  _segment_start_time: number = 0;
  _body_mesh_keyframes: { pos: any; rot: any }[] | null = null;
  _body_mesh_segment_durations: number[] = [];
  _current_body_mesh_segment: number = 0;
  _body_mesh_segment_start_time: number = 0;
  _body_targets: any[] | null = null; // world-space targets for per-frame IK
  _body_stall_threshold: number = 0;
  _body_ground_constraint: boolean = true;
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
    if (this._guideCircles) {
      for (const sq of this._guideCircles) {
        this.scene.remove(sq);
      }
      this._guideCircles = [];
    }
    if (this._guideLabels) {
      for (const sp of this._guideLabels) {
        this.scene.remove(sp);
      }
      this._guideLabels = [];
    }
    this.guide_pivot = null;
    this.guide_pos = null;
    this._guide_local_positions = [];

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

  draw_body() {
    let geometry: any, bodyVisual: any, material: any;
    let container = new THREE.Object3D();
    let color = this.options.color ? this.options.color : 0x333333;
    let bodyHeight = this.options.body_height || 20;
    let bodyShape = this.options.body_shape || 'rectangle';
    let legCount = this.options.leg_count || 6;

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
          // Build N-gon prism with corners at vertex positions (full polygon).
          // Body shape is independent of leg placement mode — legs may attach
          // at corners (vertex mode) or edge midpoints (edge mode).
          geometry = new THREE.Geometry();
          const halfH = bodyHeight / 2;

          // Center vertices for top/bottom caps
          const btmCenter = geometry.vertices.length;
          geometry.vertices.push(new THREE.Vector3(0, -halfH, 0));
          const topCenter = geometry.vertices.length;
          geometry.vertices.push(new THREE.Vector3(0, halfH, 0));

          // Body polygon corners — rotated in edge mode so edge midpoints align with legs.
          // Legs stay at fixed vertex angles; body rotates to match placement.
          const bw = this.options.body_width || 50;
          const bl = this.options.body_length || 100;
          const bodyRx = bw / 2;
          const bodyRz = bl / 2;
          const bodyPlacement = this.options.polygon_leg_placement || 'vertex';
          const bodyOffset = bodyPlacement === 'edge' ? -Math.PI / legCount : 0;
          const evenOffset = legCount % 2 === 0 ? Math.PI / legCount : 0;
          const firstLegAngle = ((this.options.polygon_odd_orientation || 'back') === 'back'
            ? Math.PI / 2 : -Math.PI / 2) + evenOffset;

          const btmRing: number[] = [], topRing: number[] = [];
          for (let i = 0; i < legCount; i++) {
            const angle = (2 * Math.PI * i) / legCount + bodyOffset + firstLegAngle;
            const lx = bodyRx * Math.cos(angle);
            const lz = bodyRz * Math.sin(angle);
            btmRing.push(geometry.vertices.length);
            geometry.vertices.push(new THREE.Vector3(lx, -halfH, lz));
            topRing.push(geometry.vertices.length);
            geometry.vertices.push(new THREE.Vector3(lx, halfH, lz));
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

    // Body offset moves only the visual, not leg attachment points
    const bodyGroup = new THREE.Object3D();
    bodyGroup.add(bodyVisual);
    bodyGroup.position.y = this.options.body_offset || 0;
    container.add(bodyGroup);

    container.position.y = bodyHeight / 2;
    return container;
  }

  draw_gait_guide() {
    // Visual circles at tip positions (world-space markers)
    this._guideCircles = [];
    this._guideLabels = [];
    let total_legs = this.legs.length;
    for (let i = 0; i < total_legs; i++) {
      let tip = this.legs[i].get_tip_pos();
      let geom = new (THREE as any).CircleGeometry(7, 16);
      let mat = new (THREE as any).MeshBasicMaterial({ color: 0x111111, side: (THREE as any).DoubleSide });
      let sq = new THREE.Mesh(geom, mat);
      sq.position.set(tip.x, 0, tip.z);
      sq.rotation.x = -Math.PI / 2;
      this.scene.add(sq);
      this._guideCircles.push(sq);

      // Number label flat on the ground, offset outward from tip
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = 'bold 192px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(String(i), 128, 128);
      const tex = new (THREE as any).Texture(canvas);
      tex.needsUpdate = true;
      const labelMat = new (THREE as any).MeshBasicMaterial({ map: tex, side: (THREE as any).DoubleSide, depthTest: false, depthWrite: false, transparent: true });
      const labelGeom = new (THREE as any).PlaneGeometry(60, 60);
      const label = new THREE.Mesh(labelGeom, labelMat);
      const cx = this.mesh.position.x;
      const cz = this.mesh.position.z;
      const dx = tip.x - cx; const dz = tip.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const offset = 48;
      label.position.set(tip.x + (dx / dist) * offset, 0.1, tip.z + (dz / dist) * offset);
      label.rotation.x = -Math.PI / 2;
      this.scene.add(label);
      this._guideLabels.push(label);
    }

    // Create pivot at body ground center — rotation center for guide_pos
    this.guide_pivot = new THREE.Object3D();
    this.guide_pivot.position.set(
      this.body_mesh.position.x, 0, this.body_mesh.position.z,
    );
    this.mesh.add(this.guide_pivot);

    // guide_pos as child of pivot — its rotation/translation are relative to pivot origin
    this.guide_pos = new THREE.Object3D();
    this.guide_pivot.add(this.guide_pos);

    // _guide_local_positions in pivot-local space (so body center = pivot origin = (0,0,0))
    this._guide_local_positions = [];
    this.mesh.updateMatrixWorld();
    this.guide_pivot.updateMatrixWorld();
    for (let i = 0; i < total_legs; i++) {
      const worldPos = this.legs[i].get_tip_pos();
      this._guide_local_positions.push(this.guide_pivot.worldToLocal(worldPos.clone()));
    }
    this._guide_local_positions.push(new THREE.Vector3(0, 0, 0)); // body center at index N (pivot origin)
  }

  sync_guide_circles() {
    if (this._guideCircles) {
      for (let i = 0; i < this.legs.length; i++) {
        const sq = this._guideCircles[i];
        if (sq) {
          const tip = this.legs[i].get_tip_pos();
          sq.position.set(tip.x, 0, tip.z);
        }
      }
    }
    if (this._guideLabels) {
      const cx = this.mesh.position.x;
      const cz = this.mesh.position.z;
      const offset = 48;
      for (let i = 0; i < this.legs.length; i++) {
        const sp = this._guideLabels[i];
        if (sp) {
          const tip = this.legs[i].get_tip_pos();
          const dx = tip.x - cx; const dz = tip.z - cz;
          const dist = Math.sqrt(dx * dx + dz * dz) || 1;
          sp.position.set(tip.x + (dx / dist) * offset, 0.1, tip.z + (dz / dist) * offset);
        }
      }
    }
  }

  reset_guide_pos() {
    if (!this.guide_pos) return;
    // Sync pivot to current body ground center (body_mesh may have moved via transform_body)
    if (this.guide_pivot) {
      this.guide_pivot.position.set(
        this.body_mesh.position.x, 0, this.body_mesh.position.z,
      );
    }
    this.guide_pos.position.set(0, 0, 0);
    this.guide_pos.rotation.set(0, 0, 0);
    this.guide_pos.scale.set(1, 1, 1);
  }

  get_guide_pos(leg_idx: number) {
    if (!this.guide_pos) return new THREE.Vector3();
    this.guide_pos.scale.set(this.tip_circle_scale, this.tip_circle_scale, this.tip_circle_scale);
    this.mesh.updateMatrixWorld();
    const localPos = this._guide_local_positions[leg_idx];
    if (!localPos) return new THREE.Vector3();
    return localPos.clone().applyMatrix4(this.guide_pos.matrixWorld);
  }

  draw_gait_guidelines() {
    this.mesh.updateMatrixWorld();

    const centerX = this.body_mesh.position.x;
    const centerZ = this.body_mesh.position.z;

    let material = new THREE.LineBasicMaterial({ color: 0xcc3300 });
    this.guideline = new THREE.Object3D();
    this.guideline.position.set(centerX, 0, centerZ);
    for (let idx = 0; idx < this.legs.length; idx++) {
      let geometry = new THREE.Geometry();
      const worldTip = this.legs[idx].get_tip_pos();
      const localTip = this.mesh.worldToLocal(worldTip.clone());
      geometry.vertices.push(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(localTip.x - centerX, 0, localTip.z - centerZ),
      );
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
    const homePositions = this._guide_local_positions;
    if (!homePositions || homePositions.length === 0) return;

    this.mesh.updateMatrixWorld();
    const centerX = this.body_mesh.position.x;
    const centerZ = this.body_mesh.position.z;

    // Update guideline position to ground center
    this.guideline.position.set(centerX, 0, centerZ);

    // Update guideline lines from stable home positions (now in pivot-local space), projected to ground
    for (let idx = 0; idx < this.legs.length; idx++) {
      const homeLocal = homePositions[idx];
      if (!homeLocal) continue;
      const line = this.guideline.children[idx] as any;
      if (line) {
        line.geometry.vertices[0].set(0, 0, 0);
        line.geometry.vertices[1].set(homeLocal.x, 0, homeLocal.z);
        line.geometry.verticesNeedUpdate = true;
      }
    }

    // Update rotation clones with same positions
    const updateClone = (clone: any) => {
      clone.position.set(centerX, 0, centerZ);
      for (let idx = 0; idx < this.legs.length; idx++) {
        const line = clone.children[idx] as any;
        if (!line) continue;
        const homeLocal = homePositions[idx];
        if (!homeLocal) continue;
        line.geometry.vertices[0].set(0, 0, 0);
        line.geometry.vertices[1].set(homeLocal.x, 0, homeLocal.z);
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
    let len = new_servo_values.length;
    let max_delta = 0;
    for (let i = 0; i < len; i++) {
      max_delta = Math.max(max_delta, Math.abs(new_servo_values[i] - old_servo_values[i]));
    }
    const speed = this.servo_speed || 2000;
    const ms = (max_delta / speed) * 1000;
    return Math.max(DEFAULT_FRAMES_INTERVAL, Math.round(ms));
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
    let formatted_value: string[] = [];
    let offset = 0;
    for (let legIdx = 0; legIdx < this.legs.length; legIdx++) {
      const leg = this.legs[legIdx];
      const n = leg.joint_count;
      for (let j = 0; j < n; j++) {
        formatted_value.push("#" + leg.limbs[j].servo_idx + " P" + servo_values[offset + j]);
      }
      offset += n;
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
   *  Builds body_mesh + servo keyframes so the body displacement is
   *  animated at servo_speed, matching real servo physics.  Uses the
   *  same micro-step / PhysicsSolver / keyframe pattern as
   *  GaitController.move_body(). */
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

    const speed = this.servo_speed || 2000;
    const microSteps = Math.max(1, this.options.micro_steps || 1);
    const totalLegs = this.legs.length;

    // Build body_mesh keyframes (for smooth body animation)
    const bodyKfs: { pos: any; rot: any }[] = [];
    for (let k = 0; k <= microSteps; k++) {
      const t = k / microSteps;
      bodyKfs.push({
        pos: new THREE.Vector3(
          startPos.x + dx * t, startPos.y + dy * t, startPos.z + dz * t),
        rot: { x: startRot.x + rx * t, y: startRot.y + ry * t, z: startRot.z + rz * t },
      });
    }

    // Compute per-segment durations from body movement magnitude.
    // Use the largest joint count as a proxy for typical servo delta.
    const maxJoints = Math.max(...this.legs.map(l => l.joint_count));
    const bodyDelta = Math.sqrt(dx * dx + dy * dy + dz * dz)
      + Math.sqrt(rx * rx + ry * ry + rz * rz) * 100;
    const perSegmentDur = Math.max(10, (bodyDelta / maxJoints / microSteps) / speed * 1000 * 200);
    const segmentDurs: number[] = [];
    for (let k = 0; k < microSteps; k++) {
      segmentDurs.push(perSegmentDur);
    }

    // Build world-space targets for each leg.
    // Locked legs: keep tip at current world position.
    // Floating legs: tip follows body (body-local → world at new poses).
    this.mesh.updateMatrixWorld();
    const stallThreshold = this.options.servo_stall_threshold ?? 0;
    const groundConstraint = this.options.ground_constraint ?? true;
    const bodyLocalTips = current_tips.map((t: any) =>
      this.body_mesh.worldToLocal(t.clone()));
    const targets: any[] = [];
    for (let i = 0; i < totalLegs; i++) {
      if (this.legs[i].on_floor) {
        targets.push(current_tips[i]);               // stay locked in world
      } else {
        targets.push(this.body_mesh.localToWorld(    // follow body
          bodyLocalTips[i].clone()));
      }
    }

    // Store targets and body_mesh keyframes for per-frame IK.
    // Leg servo keyframes are NOT pre-computed — IK is solved at
    // each rAF frame at the exact body_mesh interpolated position,
    // guaranteeing zero interpolation error for tip locking.
    this._body_stall_threshold = stallThreshold;
    this._body_ground_constraint = groundConstraint;
    this._body_targets = targets;

    // Revert body_mesh to start, fire animation
    this.body_mesh.position.copy(startPos);
    this.body_mesh.rotation.copy(startRot);
    this.body_mesh.updateMatrixWorld();

    const now = performance.now();
    this._body_mesh_keyframes = bodyKfs;
    this._body_mesh_segment_durations = segmentDurs;
    this._current_body_mesh_segment = 0;
    this._body_mesh_segment_start_time = now;

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

  /** Populate keyframe animation state from pre-computed keyframes.
   *  Called by move_body() after building mesh + servo keyframes. */
  apply_physics_keyframes(
    meshKfs: { pos: any; rotY: number }[],
    segmentDurs: number[],
    servoKfs: number[][][],  // [legIdx][k][jointIdx]
  ) {
    const now = performance.now();

    this._mesh_keyframes = meshKfs;
    this._segment_durations = segmentDurs;
    this._current_segment = 0;
    this._segment_start_time = now;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      leg._output.setKeyframes(servoKfs[i], now); // sync with mesh segment timer

      // Revert joints to keyframe[0] visual state for smooth animation start
      const kf0 = servoKfs[i][0];
      for (let j = 0; j < leg.joint_count; j++) {
        leg._set_joint_rotation(j, kf0[j]);
        leg.limbs[j]._rendered_servo_value = kf0[j];
      }
    }
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
    // When switching away from servo_constraint, also stop mesh
    // animation so the body doesn't keep drifting after the legs
    // have stopped.
    if (mode === 'none') {
      this._mesh_keyframes = null;
      this._body_mesh_keyframes = null;
      this._body_targets = null;
    }
  }

  /** Whether any keyframe animation is in progress (mesh, body_mesh, or legs). */
  is_animating(): boolean {
    if (this._mesh_keyframes !== null) return true;
    if (this._body_mesh_keyframes !== null) return true;
    for (const leg of this.legs) {
      if (leg.is_animating()) return true;
    }
    return false;
  }

  /** Drive servo + mesh animation through keyframes. Called from rAF loop. */
  update_servo_animations(now: number) {
    const speed = this.servo_speed || 2000;
    let anyAnimating = false;

    // Mesh keyframe animation (shared timing for body movement)
    if (this._mesh_keyframes && this._current_segment < this._segment_durations.length) {
      anyAnimating = true;
      const dur = this._segment_durations[this._current_segment];
      const elapsed = now - this._segment_start_time;
      const t = dur > 0.001 ? Math.min(1, elapsed / dur) : 1;

      const kf0 = this._mesh_keyframes[this._current_segment];
      const kf1 = this._mesh_keyframes[this._current_segment + 1];
      this.mesh.position.x = kf0.pos.x + (kf1.pos.x - kf0.pos.x) * t;
      this.mesh.position.z = kf0.pos.z + (kf1.pos.z - kf0.pos.z) * t;
      this.mesh.rotation.y = kf0.rotY + (kf1.rotY - kf0.rotY) * t;

      if (t >= 1) {
        this._current_segment++;
        this._segment_start_time = now;
        if (this._current_segment >= this._segment_durations.length) {
          this._mesh_keyframes = null;
        }
      }
    }

    // Body mesh keyframe animation (for move_body / rotate_body joystick modes).
    // IK is solved on-the-fly at the exact interpolated body_mesh position
    // so that locked-leg tips stay perfectly planted — no interpolation error.
    if (this._body_mesh_keyframes && this._current_body_mesh_segment < this._body_mesh_segment_durations.length) {
      anyAnimating = true;
      const dur = this._body_mesh_segment_durations[this._current_body_mesh_segment];
      const elapsed = now - this._body_mesh_segment_start_time;
      const t = dur > 0.001 ? Math.min(1, elapsed / dur) : 1;

      const bKf0 = this._body_mesh_keyframes[this._current_body_mesh_segment];
      const bKf1 = this._body_mesh_keyframes[this._current_body_mesh_segment + 1];
      this.body_mesh.position.x = bKf0.pos.x + (bKf1.pos.x - bKf0.pos.x) * t;
      this.body_mesh.position.y = bKf0.pos.y + (bKf1.pos.y - bKf0.pos.y) * t;
      this.body_mesh.position.z = bKf0.pos.z + (bKf1.pos.z - bKf0.pos.z) * t;
      this.body_mesh.rotation.x = bKf0.rot.x + (bKf1.rot.x - bKf0.rot.x) * t;
      this.body_mesh.rotation.y = bKf0.rot.y + (bKf1.rot.y - bKf0.rot.y) * t;
      this.body_mesh.rotation.z = bKf0.rot.z + (bKf1.rot.z - bKf0.rot.z) * t;
      this.body_mesh.updateMatrixWorld();
      this.mesh.updateMatrixWorld();

      // Solve IK for all legs at this exact body pose — zero interpolation error
      if (this._body_targets) {
        const prevDisabled = this._servo_anim_disabled;
        this._servo_anim_disabled = true;
        const result = PhysicsSolver.solveAll(this, this._body_targets, this._body_stall_threshold, this._body_ground_constraint);
        for (let i = 0; i < this.legs.length; i++) {
          this.legs[i].set_servo_values(result.servoTargets[i]);
        }
        this._servo_anim_disabled = prevDisabled;
      }

      if (t >= 1) {
        this._current_body_mesh_segment++;
        this._body_mesh_segment_start_time = now;
        if (this._current_body_mesh_segment >= this._body_mesh_segment_durations.length) {
          this._body_mesh_keyframes = null;
          this._body_targets = null;
        }
      }
    }

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

  after_status_change(send_cmd?: boolean) {
    this.display_values();

    let servo_values = this.get_servo_values();
    let cmd = this.build_cmd(servo_values);
    let el = document.querySelector("#servo_values");
    if (el) el.innerHTML = cmd;

    if (this.options.physics_mode === 'servo_constraint') {
      // Servo constraint: timing driven by servo rotation speed
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
      // None mode: original timing logic (SERVO_VALUE_TIME_UNIT for sync, 0 otherwise)
      if (this.sync_cmd) {
        if (typeof send_cmd === "undefined" || send_cmd) {
          this.send_cmd(cmd);
          if (this.on_servo_values) {
            let maxDelta = 0;
            for (let i = 0; i < servo_values.length; i++) {
              maxDelta = Math.max(maxDelta, Math.abs(servo_values[i] - this.on_servo_values[i]));
            }
            this.hold_time = Math.max(DEFAULT_FRAMES_INTERVAL, Math.round(maxDelta * SERVO_VALUE_TIME_UNIT));
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
      this.time_interval_stack = this.time_interval_stack.slice(-max_number);
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
// ── Config helpers ──────────────────────────────────────────────

export function get_bot_options() {
  let options = get_obj_from_local_storage(HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS);

  const legCount = options.leg_count || 6;
  const globalDof = options.dof || 3;

  // Pad leg_options if fewer entries than leg count (e.g. 7-9 legs)
  while (options.leg_options.length < legCount) {
    let template = options.leg_options[options.leg_options.length - 1] || options.leg_options[0];
    options.leg_options.push(JSON.parse(JSON.stringify(template)));
  }

  // Ensure each leg_option has all segment data for its own DOF
  const defaultLeg = DEFAULT_HEXAPOD_OPTIONS.leg_options[0];
  let servoBase = options.first_servo_idx;
  for (let i = 0; i < legCount; i++) {
    let leg_option = options.leg_options[i];
    const legDof = leg_option.dof ?? globalDof;
    const jointsPerLeg = Math.min(6, Math.max(2, legDof));
    const segNames = LIMB_NAMES.slice(0, jointsPerLeg);

    // Initialize per-leg DOF if not set
    if (leg_option.dof == null) leg_option.dof = globalDof;

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
    // Assign servo indices — cumulative offset for variable joints per leg
    for (let j = 0; j < segNames.length; j++) {
      if (typeof leg_option[segNames[j]].servo_idx === "undefined") {
        leg_option[segNames[j]].servo_idx = servoBase + j;
      }
    }
    servoBase += jointsPerLeg;
  }

  return options;
}

export function set_bot_options(hexapod_options: any) {
  set_obj_to_local_storage(HEXAPOD_OPTIONS_KEY, hexapod_options);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bot-options-saved', { detail: Date.now() }));
  }
}

export function build_bot(bot_options: any) {
  let bot = new Hexapod(appState.scene, bot_options);
  return bot;
}
