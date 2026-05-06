/** Named preset configurations for quick-apply in the UI. */
import { DEFAULT_HEXAPOD_OPTIONS } from './defaults';

export interface Preset {
  name: string;
  label: string;
  description: string;
  options: Partial<any>;
}

const L = DEFAULT_HEXAPOD_OPTIONS;

/** Build a leg_options array for `count` legs with alternating mirror. */
function legOptsForPolygon(count: number, dof: number): any[] {
  const base = L.leg_options[0];
  const legs: any[] = [];
  for (let i = 0; i < count; i++) {
    const mirror = i % 2 === 0 ? -1 : 1;
    const opt: any = {
      ...base,
      mirror,
      dof,
    };
    // Ensure segment entries exist for requested DOF
    const segs = ['coxa', 'femur', 'tibia', 'tarsus', 'segment5', 'segment6'];
    for (let s = 0; s < dof; s++) {
      const name = segs[s];
      opt[name] = { ...(base[name] || {}), ...(opt[name] || {}) };
    }
    legs.push(opt);
  }
  return legs;
}

/** Step parameters roughly scale with leg count. */
function stepsFor(count: number, dof: number) {
  const baseFb = 13 + count;
  const baseLr = 8 + Math.round(count * 0.7);
  const baseUp = 7 + Math.round(count * 0.5);
  if (dof === 3) return { fb_step: baseFb, lr_step: baseLr, up_step: baseUp };
  return { fb_step: baseFb + 4, lr_step: baseLr + 2, up_step: baseUp + 2, servo_speed: 1800, tarsus_length: 28 };
}

function makePolyPreset(name: string, label: string, desc: string, count: number, dof: number): Preset {
  return {
    name,
    label,
    description: desc,
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: count,
      dof,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      ...stepsFor(count, dof),
      leg_options: legOptsForPolygon(count, dof),
    },
  };
}

const SIDE_LABELS = ['Tri', 'Quad', 'Pent', 'Hex', 'Hept', 'Oct', 'Non'];
const SIDE_NAMES = ['triangle', 'square', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon'];

export const PRESETS: Preset[] = [
  {
    name: 'default',
    label: 'Default',
    description: 'Standard 6-leg 3-DOF rectangle hexapod',
    options: { ...L },
  },
  // 3-DOF row: 3–9 sides
  ...Array.from({ length: 7 }, (_, i) => {
    const n = i + 3;
    return makePolyPreset(
      `${SIDE_LABELS[i].toLowerCase()}${n}-3`,
      `${SIDE_LABELS[i]} 3DOF`,
      `${SIDE_NAMES[i]}, ${n} legs, 3-DOF`,
      n, 3,
    );
  }),
  // 4-DOF row: 3–9 sides
  ...Array.from({ length: 7 }, (_, i) => {
    const n = i + 3;
    return makePolyPreset(
      `${SIDE_LABELS[i].toLowerCase()}${n}-4`,
      `${SIDE_LABELS[i]} 4DOF`,
      `${SIDE_NAMES[i]}, ${n} legs, 4-DOF`,
      n, 4,
    );
  }),
];
