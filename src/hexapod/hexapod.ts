import io from 'socket.io-client';
import appState from './appState.js';
import {
  HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS, LIMB_NAMES, LIMB_DEFAULTS,
  DEFAULT_FRAMES_INTERVAL, SERVO_VALUE_TIME_UNIT,
  SERVO_MIN_VALUE, SERVO_MAX_VALUE,
} from './defaults.js';
import { getWorldPosition, apply_xyz, get_obj_from_local_storage, set_obj_to_local_storage, degree_to_radians, remove_class, add_class, clearSelection } from './utils.js';
import { GaitController } from './gaits.js';
import { PosCalculator, PosResult } from './pos_calculator.js';
import { DirectOutput, AnimatedOutput, type ServoOutput } from './servo_output.js';
import { PhysicsSolver } from './physics_solver.js';
import { history } from './history.js';

// ── Leg layout computation ─────────────────────────────────────

interface LegLayout {
  x: number;       // signed world X position
  z: number;       // signed world Z position
  angle: number;   // radial angle from body center (radians)
  yaw: number;     // coxa.rotation.y in radians (points leg outward)
  init_angle: number; // coxa init_angle in degrees (for backward compat)
}

function computeRectangleLayout(
  legCount: number,
  bodyRadiusX: number,
  bodyRadiusZ: number,
  firstLegDirection: string,
): LegLayout[] {
  const FRONT_INIT_DEG = 30;
  const REAR_INIT_DEG = -30;
  const layouts: LegLayout[] = [];

  if (legCount % 2 === 0) {
    const pairs = legCount / 2;
    for (let i = 0; i < pairs; i++) {
      const z = pairs === 1 ? 0 : -bodyRadiusZ + (i * bodyRadiusZ * 2) / (pairs - 1);
      const initDeg = pairs === 1 ? 0 : FRONT_INIT_DEG + ((REAR_INIT_DEG - FRONT_INIT_DEG) * i) / (pairs - 1);
      const initRad = initDeg * Math.PI / 180;
      layouts.push({ x: bodyRadiusX, z, angle: 0, yaw: initRad, init_angle: initDeg });
      layouts.push({ x: -bodyRadiusX, z, angle: Math.PI, yaw: -initRad, init_angle: initDeg });
    }
  } else {
    const pairs = (legCount - 1) / 2;
    const totalSlots = pairs + 1;
    const extraAtFront = firstLegDirection === 'front';
    for (let i = 0; i < pairs; i++) {
      const slotI = extraAtFront ? i + 1 : i;
      const z = -bodyRadiusZ + (slotI * bodyRadiusZ * 2) / (totalSlots - 1);
      const initDeg = FRONT_INIT_DEG + ((REAR_INIT_DEG - FRONT_INIT_DEG) * slotI) / (totalSlots - 1);
      const initRad = initDeg * Math.PI / 180;
      layouts.push({ x: bodyRadiusX, z, angle: 0, yaw: initRad, init_angle: initDeg });
      layouts.push({ x: -bodyRadiusX, z, angle: Math.PI, yaw: -initRad, init_angle: initDeg });
    }
    const extraZ = extraAtFront ? -bodyRadiusZ : bodyRadiusZ;
    const extraSign = extraAtFront ? 1 : -1;
    layouts.push({ x: 0, z: extraZ, angle: extraAtFront ? -Math.PI / 2 : Math.PI / 2, yaw: extraSign * Math.PI / 2, init_angle: extraSign * 90 });
  }

  return layouts;
}

function computePolygonLayout(
  legCount: number,
  rx: number,
  rz: number,
  placement: 'vertex' | 'edge',
  firstLegDirection: 'back' | 'front',
): LegLayout[] {
  const radiusScale = placement === 'edge' ? Math.cos(Math.PI / legCount) : 1;
  const effRx = rx * radiusScale;
  const effRz = rz * radiusScale;

  // Legs always at vertex angles — placement mode only affects radius.
  // Body rotates to match (see draw_body).
  // Even leg counts: offset by π/N so legs sit on sides, not directly front/back.
  const evenOffset = legCount % 2 === 0 ? Math.PI / legCount : 0;
  const firstLegAngle = (firstLegDirection === 'back' ? Math.PI / 2 : -Math.PI / 2) + evenOffset;

  const layouts: LegLayout[] = [];
  for (let i = 0; i < legCount; i++) {
    const angle = (2 * Math.PI * i) / legCount + firstLegAngle;
    const lx = effRx * Math.cos(angle);
    const lz = effRz * Math.sin(angle);
    const polarAngle = Math.atan2(lz, lx);
    const onRight = lx >= 0;
    const initDeg = onRight
      ? -polarAngle * 180 / Math.PI
      : (polarAngle - Math.PI) * 180 / Math.PI;

    layouts.push({ x: lx, z: lz, angle: polarAngle, yaw: polarAngle, init_angle: initDeg });
  }
  return layouts;
}

function computeLegLayout(
  legCount: number,
  bodyShape: string,
  bodyRadiusX: number,
  bodyRadiusZ: number,
  placement: string = 'vertex',
  firstLegDirection: string = 'back',
): LegLayout[] {
  if (bodyShape === 'rectangle') {
    return computeRectangleLayout(legCount, bodyRadiusX, bodyRadiusZ, firstLegDirection);
  }
  return computePolygonLayout(legCount, bodyRadiusX, bodyRadiusZ, placement as 'vertex' | 'edge', firstLegDirection as 'back' | 'front');
}

// ── Shared leg kinematics (used by LegEditor + tip spread) ─────

export function getSegNamesForLeg(opts: any, legIdx: number): string[] {
  const leg = opts.leg_options[legIdx];
  const dof = leg?.dof ?? opts.dof ?? 3;
  return LIMB_NAMES.slice(0, Math.min(6, Math.max(2, dof)));
}

export function computeJointPositions(opts: any, legIdx: number): { x: number; y: number }[] {
  const segNames = getSegNamesForLeg(opts, legIdx);
  const leg = opts.leg_options[legIdx];
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];

  const coxaOpt = leg[segNames[0]] || {};
  const coxaLen = coxaOpt.length || (opts as any)[segNames[0] + '_length'] || 32;
  pts.push({ x: coxaLen, y: 0 });

  let cumAngle = 0;
  for (let i = 1; i < segNames.length; i++) {
    const segOpt = leg[segNames[i]] || {};
    const len = segOpt.length || (opts as any)[segNames[i] + '_length'] || 20;
    const initAngle = segOpt.init_angle ?? 0;
    cumAngle -= initAngle;
    const rad = (cumAngle * Math.PI) / 180;
    pts.push({
      x: pts[i].x + len * Math.cos(rad),
      y: pts[i].y + len * Math.sin(rad),
    });
  }
  return pts;
}

export function getActualJointPositions(bot: any, legIdx: number): { x: number; y: number }[] | null {
  const leg = bot.legs[legIdx];
  if (!leg || !leg.limbs || leg.limbs.length === 0) return null;

  const opts = bot.options;
  const segNames = getSegNamesForLeg(opts, legIdx);
  const legOpts = opts.leg_options[legIdx];

  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];

  const coxaOpt = legOpts[segNames[0]] || {};
  const coxaLen = coxaOpt.length || (opts as any)[segNames[0] + '_length'] || 32;
  pts.push({ x: coxaLen, y: 0 });

  let cumAngleDeg = 0;
  for (let i = 1; i < segNames.length; i++) {
    const segOpt = legOpts[segNames[i]] || {};
    const len = segOpt.length || (opts as any)[segNames[i] + '_length'] || 20;
    const actualAngleDeg = leg.get_angle(i);
    cumAngleDeg -= actualAngleDeg;
    const rad = (cumAngleDeg * Math.PI) / 180;
    pts.push({
      x: pts[i].x + len * Math.cos(rad),
      y: pts[i].y + len * Math.sin(rad),
    });
  }

  return pts;
}

export function applyJointMove(
  opts: any,
  legIdx: number,
  jointIndex: number,
  targetPos: { x: number; y: number },
): { segmentName: string; length: number; init_angle?: number } | null {
  if (jointIndex < 1) return null;

  const pts = computeJointPositions(opts, legIdx);
  if (jointIndex >= pts.length) return null;

  let dx: number, dy: number, newLen: number;
  const segNames = getSegNamesForLeg(opts, legIdx);
  const segmentName = segNames[jointIndex - 1];

  if (jointIndex === 1) {
    newLen = Math.max(5, targetPos.x);
    return { segmentName, length: newLen };
  }

  const prevPt = pts[jointIndex - 1];
  dx = targetPos.x - prevPt.x;
  dy = targetPos.y - prevPt.y;
  newLen = Math.max(5, Math.sqrt(dx * dx + dy * dy));

  const absAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  let sumPrev = 0;
  for (let k = 1; k < jointIndex - 1; k++) {
    const segData = opts.leg_options[legIdx]?.[segNames[k]];
    if (segData) sumPrev += segData.init_angle || 0;
  }
  const newInitAngle = -absAngleDeg - sumPrev;

  return { segmentName, length: newLen, init_angle: newInitAngle };
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

    const microSteps = Math.max(3, this.options.micro_steps || 1);
    const totalLegs = this.legs.length;
    const speed = this.servo_speed || 2000;
    const stallThreshold = this.options.servo_stall_threshold ?? 0;
    const groundConstraint = this.options.ground_constraint ?? true;

    // Save body-local tip positions before body moves.
    // Must update mesh first — body_mesh is its child, and
    // worldToLocal needs the full chain current.
    this.mesh.updateMatrixWorld();
    const bodyLocalTips = current_tips.map((t: any) =>
      this.body_mesh.worldToLocal(t.clone()));

    // Keyframe 0: current rendered servo values
    const servoKfs: number[][][] = [];
    for (let i = 0; i < totalLegs; i++) {
      const kf0: number[] = [];
      for (let j = 0; j < this.legs[i].joint_count; j++) {
        kf0.push(this.legs[i].limbs[j]._rendered_servo_value);
      }
      servoKfs.push([kf0]);
    }

    // Build body_mesh keyframes
    const bodyKfs: { pos: any; rot: any }[] = [];
    for (let k = 0; k <= microSteps; k++) {
      const t = k / microSteps;
      bodyKfs.push({
        pos: new THREE.Vector3(
          startPos.x + dx * t, startPos.y + dy * t, startPos.z + dz * t),
        rot: { x: startRot.x + rx * t, y: startRot.y + ry * t, z: startRot.z + rz * t },
      });
    }

    // Solve IK at each intermediate keyframe
    const prevDisabled = this._servo_anim_disabled;
    this._servo_anim_disabled = true;

    for (let k = 1; k <= microSteps; k++) {
      // Reset legs to keyframe-0 servo values before each solve
      for (let i = 0; i < totalLegs; i++) {
        this.legs[i].set_servo_values(servoKfs[i][0]);
      }

      this.body_mesh.position.copy(bodyKfs[k].pos);
      this.body_mesh.rotation.x = bodyKfs[k].rot.x;
      this.body_mesh.rotation.y = bodyKfs[k].rot.y;
      this.body_mesh.rotation.z = bodyKfs[k].rot.z;
      this.body_mesh.updateMatrixWorld();
      this.mesh.updateMatrixWorld();

      const targets: any[] = [];
      for (let i = 0; i < totalLegs; i++) {
        if (this.legs[i].on_floor) {
          targets.push(current_tips[i]);
        } else {
          targets.push(this.body_mesh.localToWorld(bodyLocalTips[i].clone()));
        }
      }

      const result = PhysicsSolver.solveAll(this, targets, stallThreshold, groundConstraint);
      for (let i = 0; i < totalLegs; i++) {
        servoKfs[i].push(result.servoTargets[i]);
      }
    }

    // Per-segment durations
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

    // Revert body_mesh to start, fire animation
    this.body_mesh.position.copy(startPos);
    this.body_mesh.rotation.copy(startRot);
    this.body_mesh.updateMatrixWorld();
    this._servo_anim_disabled = prevDisabled;

    this.apply_body_keyframes(bodyKfs, segmentDurs, servoKfs);
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

  /** Populate body_mesh keyframe animation state.
   *  Same pattern as apply_physics_keyframes but for body_mesh movement
   *  (used by move_body / rotate_body joystick modes). */
  apply_body_keyframes(
    bodyKfs: { pos: any; rot: any }[],
    segmentDurs: number[],
    servoKfs: number[][][],
  ) {
    const now = performance.now();

    this._body_mesh_keyframes = bodyKfs;
    this._body_mesh_segment_durations = segmentDurs;
    this._current_body_mesh_segment = 0;
    this._body_mesh_segment_start_time = now;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      leg._output.setKeyframes(servoKfs[i], now);

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

    // Body mesh keyframe animation (for move_body / rotate_body joystick modes)
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

      if (t >= 1) {
        this._current_body_mesh_segment++;
        this._body_mesh_segment_start_time = now;
        if (this._current_body_mesh_segment >= this._body_mesh_segment_durations.length) {
          this._body_mesh_keyframes = null;
        }
      }
    }

    // Leg servo keyframe animation
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
    // Apply directly to joints — bypass animation entirely.
    // PosCalculator.calc_distance() calls this then reads the Three.js
    // scene for forward kinematics; if joints aren't set immediately the
    // FK distances are computed from stale joint angles.
    for (let i = 0; i < values.length; i++) {
      const v = Math.round(values[i]);
      this._set_joint_rotation(i, v);
      this.limbs[i].servo_value = v;
      this.limbs[i]._rendered_servo_value = v;
      this._output.renderedValues[i] = v;
    }
  }

  /** Apply a raw servo value to joint rotation without updating logical state. */
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
    // Snapshot pre-IK rendered values.  PosCalculator.run() calls
    // set_servo_values() which mutates _output.renderedValues directly,
    // so we must capture before the solve.
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
      // Restore pre-IK joint state (PosCalculator overwrote it)
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
        const rv = this._output.renderedValues; // = preRendered (start of animation)
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
    // Don't interrupt an in-progress keyframe animation.
    // Just nudge logical servo values for the next cycle.
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

  /** Advance servo animation. Returns true if still in progress. */
  update_animation(now: number, speed: number): boolean {
    return this._output.update(now, speed, (idx, val) => {
      this._set_joint_rotation(idx, val);
      this.limbs[idx]._rendered_servo_value = val;
    });
  }
}

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
