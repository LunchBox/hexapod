import { LIMB_NAMES } from './defaults.js';

// ── Leg layout computation ─────────────────────────────────────

export interface LegLayout {
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

export function computeLegLayout(
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
