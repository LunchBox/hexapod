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

export const PRESETS: Preset[] = [
  {
    name: 'default',
    label: 'Default',
    description: 'Standard 6-leg 3-DOF rectangle hexapod',
    options: { ...L },
  },
  {
    name: 'tri3',
    label: 'Triangle 3DOF',
    description: '正三角形，3 legs, 3-DOF',
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: 3,
      dof: 3,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      fb_step: 15,
      lr_step: 10,
      up_step: 8,
      leg_options: legOptsForPolygon(3, 3),
    },
  },
  {
    name: 'quad4-3',
    label: 'Square 3DOF',
    description: '正四方形，4 legs, 3-DOF',
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: 4,
      dof: 3,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      fb_step: 18,
      lr_step: 12,
      up_step: 8,
      leg_options: legOptsForPolygon(4, 3),
    },
  },
  {
    name: 'penta5-3',
    label: 'Pentagon 3DOF',
    description: '正五邊形，5 legs, 3-DOF',
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: 5,
      dof: 3,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      fb_step: 18,
      lr_step: 12,
      up_step: 9,
      leg_options: legOptsForPolygon(5, 3),
    },
  },
  {
    name: 'hexa6-3',
    label: 'Hexagon 3DOF',
    description: '正六邊形，6 legs, 3-DOF',
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: 6,
      dof: 3,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      fb_step: 20,
      lr_step: 14,
      up_step: 10,
      leg_options: legOptsForPolygon(6, 3),
    },
  },
  {
    name: 'hexa6-4',
    label: 'Hexagon 4DOF',
    description: '正六邊形，6 legs, 4-DOF',
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: 6,
      dof: 4,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      tarsus_length: 28,
      fb_step: 24,
      lr_step: 16,
      up_step: 12,
      servo_speed: 1800,
      leg_options: legOptsForPolygon(6, 4),
    },
  },
  {
    name: 'octa8-4',
    label: 'Octagon 4DOF',
    description: '正八邊形，8 legs, 4-DOF',
    options: {
      ...L,
      body_shape: 'polygon',
      leg_count: 8,
      dof: 4,
      body_width: 80,
      body_length: 80,
      polygon_leg_placement: 'vertex',
      tarsus_length: 28,
      fb_step: 22,
      lr_step: 14,
      up_step: 12,
      servo_speed: 1800,
      leg_options: legOptsForPolygon(8, 4),
    },
  },
];
