/** Named preset configurations for quick-apply in the UI. */
import { DEFAULT_HEXAPOD_OPTIONS } from './defaults';

export interface Preset {
  name: string;
  label: string;
  description: string;
  options: Partial<any>;
}

const L = DEFAULT_HEXAPOD_OPTIONS;

export const PRESETS: Preset[] = [
  {
    name: 'default',
    label: 'Default',
    description: 'Standard 6-leg 3-DOF hexapod',
    options: { ...L },
  },
  {
    name: 'spider',
    label: 'Spider',
    description: 'Wide body, long thin legs, 4-DOF',
    options: {
      ...L,
      body_width: 70,
      body_length: 80,
      body_height: 16,
      dof: 4,
      leg_count: 6,
      coxa_length: 40,
      femur_length: 55,
      tibia_length: 75,
      tarsus_length: 40,
      rotate_step: Math.PI / 12,
      fb_step: 35,
      lr_step: 25,
      up_step: 15,
      leg_options: [
        { ...L.leg_options[0], x: 35, z: -40, coxa: { ...L.leg_options[0].coxa, length: 40, init_angle: 35 }, femur: { ...L.leg_options[0].femur, length: 55, init_angle: 35 }, tibia: { ...L.leg_options[0].tibia, length: 75, init_angle: -110 }, tarsus: { ...L.leg_options[0].tarsus, length: 40, init_angle: -65 }, dof: 4 },
        { ...L.leg_options[1], x: 35, z: -40, coxa: { ...L.leg_options[1].coxa, length: 40, init_angle: 35 }, femur: { ...L.leg_options[1].femur, length: 55, init_angle: 35 }, tibia: { ...L.leg_options[1].tibia, length: 75, init_angle: -110 }, tarsus: { ...L.leg_options[1].tarsus, length: 40, init_angle: -65 }, dof: 4 },
        { ...L.leg_options[2], x: 35, z: 0, coxa: { ...L.leg_options[2].coxa, length: 40, init_angle: 5 }, femur: { ...L.leg_options[2].femur, length: 55, init_angle: 35 }, tibia: { ...L.leg_options[2].tibia, length: 75, init_angle: -110 }, tarsus: { ...L.leg_options[2].tarsus, length: 40, init_angle: -65 }, dof: 4 },
        { ...L.leg_options[3], x: 35, z: 0, coxa: { ...L.leg_options[3].coxa, length: 40, init_angle: 5 }, femur: { ...L.leg_options[3].femur, length: 55, init_angle: 35 }, tibia: { ...L.leg_options[3].tibia, length: 75, init_angle: -110 }, tarsus: { ...L.leg_options[3].tarsus, length: 40, init_angle: -65 }, dof: 4 },
        { ...L.leg_options[4], x: 35, z: 40, coxa: { ...L.leg_options[4].coxa, length: 40, init_angle: -35 }, femur: { ...L.leg_options[4].femur, length: 55, init_angle: 35 }, tibia: { ...L.leg_options[4].tibia, length: 75, init_angle: -110 }, tarsus: { ...L.leg_options[4].tarsus, length: 40, init_angle: -65 }, dof: 4 },
        { ...L.leg_options[5], x: 35, z: 40, coxa: { ...L.leg_options[5].coxa, length: 40, init_angle: -35 }, femur: { ...L.leg_options[5].femur, length: 55, init_angle: 35 }, tibia: { ...L.leg_options[5].tibia, length: 75, init_angle: -110 }, tarsus: { ...L.leg_options[5].tarsus, length: 40, init_angle: -65 }, dof: 4 },
      ],
    },
  },
  {
    name: 'compact',
    label: 'Compact',
    description: 'Small body, short legs, 3-DOF',
    options: {
      ...L,
      body_width: 35,
      body_length: 60,
      body_height: 14,
      dof: 3,
      leg_count: 6,
      coxa_length: 24,
      femur_length: 30,
      tibia_length: 42,
      fb_step: 14,
      lr_step: 10,
      up_step: 6,
      leg_options: [
        { ...L.leg_options[0], x: 17, z: -30, coxa: { ...L.leg_options[0].coxa, length: 24, init_angle: 25 }, femur: { ...L.leg_options[0].femur, length: 30 }, tibia: { ...L.leg_options[0].tibia, length: 42, init_angle: -100 }, dof: 3 },
        { ...L.leg_options[1], x: 17, z: -30, coxa: { ...L.leg_options[1].coxa, length: 24, init_angle: 25 }, femur: { ...L.leg_options[1].femur, length: 30 }, tibia: { ...L.leg_options[1].tibia, length: 42, init_angle: -100 }, dof: 3 },
        { ...L.leg_options[2], x: 17, z: 0, coxa: { ...L.leg_options[2].coxa, length: 24 }, femur: { ...L.leg_options[2].femur, length: 30 }, tibia: { ...L.leg_options[2].tibia, length: 42, init_angle: -100 }, dof: 3 },
        { ...L.leg_options[3], x: 17, z: 0, coxa: { ...L.leg_options[3].coxa, length: 24 }, femur: { ...L.leg_options[3].femur, length: 30 }, tibia: { ...L.leg_options[3].tibia, length: 42, init_angle: -100 }, dof: 3 },
        { ...L.leg_options[4], x: 17, z: 30, coxa: { ...L.leg_options[4].coxa, length: 24, init_angle: -25 }, femur: { ...L.leg_options[4].femur, length: 30 }, tibia: { ...L.leg_options[4].tibia, length: 42, init_angle: -100 }, dof: 3 },
        { ...L.leg_options[5], x: 17, z: 30, coxa: { ...L.leg_options[5].coxa, length: 24, init_angle: -25 }, femur: { ...L.leg_options[5].femur, length: 30 }, tibia: { ...L.leg_options[5].tibia, length: 42, init_angle: -100 }, dof: 3 },
      ],
    },
  },
  {
    name: 'xl',
    label: 'XL',
    description: 'Large hexapod, 6-DOF, long legs',
    options: {
      ...L,
      body_width: 80,
      body_length: 140,
      body_height: 28,
      dof: 6,
      leg_count: 6,
      coxa_length: 40,
      femur_length: 55,
      tibia_length: 75,
      tarsus_length: 40,
      rotate_step: Math.PI / 18,
      fb_step: 30,
      lr_step: 22,
      up_step: 14,
      servo_speed: 1500,
      leg_options: [
        { ...L.leg_options[0], x: 40, z: -70, coxa: { ...L.leg_options[0].coxa, length: 40, init_angle: 30 }, femur: { ...L.leg_options[0].femur, length: 55, init_angle: 25 }, tibia: { ...L.leg_options[0].tibia, length: 75, init_angle: -105 }, tarsus: { ...L.leg_options[0].tarsus, length: 40, init_angle: -60 }, dof: 6, segment5: { length: 25, radius: 4, init_angle: -30, servo_value: 1500, revert: false }, segment6: { length: 20, radius: 3, init_angle: 0, servo_value: 1500, revert: false } },
        { ...L.leg_options[1], x: 40, z: -70, coxa: { ...L.leg_options[1].coxa, length: 40, init_angle: 30 }, femur: { ...L.leg_options[1].femur, length: 55, init_angle: 25 }, tibia: { ...L.leg_options[1].tibia, length: 75, init_angle: -105 }, tarsus: { ...L.leg_options[1].tarsus, length: 40, init_angle: -60 }, dof: 6, segment5: { length: 25, radius: 4, init_angle: -30, servo_value: 1500, revert: false }, segment6: { length: 20, radius: 3, init_angle: 0, servo_value: 1500, revert: false } },
        { ...L.leg_options[2], x: 40, z: 0, coxa: { ...L.leg_options[2].coxa, length: 40 }, femur: { ...L.leg_options[2].femur, length: 55, init_angle: 25 }, tibia: { ...L.leg_options[2].tibia, length: 75, init_angle: -105 }, tarsus: { ...L.leg_options[2].tarsus, length: 40, init_angle: -60 }, dof: 6, segment5: { length: 25, radius: 4, init_angle: -30, servo_value: 1500, revert: false }, segment6: { length: 20, radius: 3, init_angle: 0, servo_value: 1500, revert: false } },
        { ...L.leg_options[3], x: 40, z: 0, coxa: { ...L.leg_options[3].coxa, length: 40 }, femur: { ...L.leg_options[3].femur, length: 55, init_angle: 25 }, tibia: { ...L.leg_options[3].tibia, length: 75, init_angle: -105 }, tarsus: { ...L.leg_options[3].tarsus, length: 40, init_angle: -60 }, dof: 6, segment5: { length: 25, radius: 4, init_angle: -30, servo_value: 1500, revert: false }, segment6: { length: 20, radius: 3, init_angle: 0, servo_value: 1500, revert: false } },
        { ...L.leg_options[4], x: 40, z: 70, coxa: { ...L.leg_options[4].coxa, length: 40, init_angle: -30 }, femur: { ...L.leg_options[4].femur, length: 55, init_angle: 25 }, tibia: { ...L.leg_options[4].tibia, length: 75, init_angle: -105 }, tarsus: { ...L.leg_options[4].tarsus, length: 40, init_angle: -60 }, dof: 6, segment5: { length: 25, radius: 4, init_angle: -30, servo_value: 1500, revert: false }, segment6: { length: 20, radius: 3, init_angle: 0, servo_value: 1500, revert: false } },
        { ...L.leg_options[5], x: 40, z: 70, coxa: { ...L.leg_options[5].coxa, length: 40, init_angle: -30 }, femur: { ...L.leg_options[5].femur, length: 55, init_angle: 25 }, tibia: { ...L.leg_options[5].tibia, length: 75, init_angle: -105 }, tarsus: { ...L.leg_options[5].tarsus, length: 40, init_angle: -60 }, dof: 6, segment5: { length: 25, radius: 4, init_angle: -30, servo_value: 1500, revert: false }, segment6: { length: 20, radius: 3, init_angle: 0, servo_value: 1500, revert: false } },
      ],
    },
  },
];
