// Keys
export const FRAMES_KEY = "frames";
export const SERVO_OPTIONS_KEY = "servo_options";
export const HEXAPOD_OPTIONS_KEY = "hexapod_options";

// Animation / timing
export const RUN_FRAMES = false;
export const ANIMATE_TIMER = 0;
export const DEFAULT_FRAMES_INTERVAL = 10;
export const SEND_CMD_INTERVAL = 100;

// Servo
export const ANGLE_RANGE = 180;
export const SERVO_MIN_VALUE = 500;
export const SERVO_MAX_VALUE = 2500;
export const SERVO_CURRENT_VALUE = 1500;
export const MAX_ANGLE_UNIT = 60 / 120;
export const SERVO_VALUE_TIME_UNIT = 120 / 60 * ANGLE_RANGE / (SERVO_MAX_VALUE - SERVO_MIN_VALUE);
export const DEFAULT_MOVE_STEP = 30;

// Body
export const DEFAULT_BODY_WIDTH = 50;
export const DEFAULT_BODY_LENGTH = 100;
export const DEFAULT_BODY_HEIGHT = 20;

// Leg segments
export const DEFAULT_COXA_LENGTH = 32;
export const DEFAULT_COXA_RADIUS = 10;
export const DEFAULT_FEMUR_LENGTH = 45;
export const DEFAULT_FEMUR_RADIUS = 12;
export const DEFAULT_TIBIA_LENGTH = 62;
export const DEFAULT_TIBIA_RADIUS = 10;
export const DEFAULT_TARSUS_LENGTH = 30;
export const DEFAULT_TARSUS_RADIUS = 6;

// Init angles
export const DEFAULT_COXA_INIT_ANGLE = 30;
export const DEFAULT_FEMUR_INIT_ANGLE = 30;
export const DEFAULT_TIBIA_INIT_ANGLE = -105;
export const DEFAULT_TARSUS_INIT_ANGLE = -60;

// Limb indices
export const COXA = 0;
export const FEMUR = 1;
export const TIBIA = 2;
export const TARSUS = 3;

// DOF
export const DEFAULT_DOF = 3;
export const DEFAULT_LEG_COUNT = 6;

// Keyboard
export const FORWARD_KEY = 87;
export const BACKWARD_KEY = 83;
export const LEFT_KEY = 65;
export const RIGHT_KEY = 68;
export const MOVE_LEFT_KEY = 90;
export const MOVE_RIGHT_KEY = 67;
export const RAISE_KEY = 82;
export const FALL_KEY = 70;

// Action constants
export const ACT_STANDBY = "act_standby";
export const ACT_PUTDOWN_TIPS = "act_putdown_tips";

export const DEFAULT_HEXAPOD_OPTIONS = {
  body_width: DEFAULT_BODY_WIDTH,
  body_length: DEFAULT_BODY_LENGTH,
  body_height: DEFAULT_BODY_HEIGHT,

  coxa_length: DEFAULT_COXA_LENGTH,
  femur_length: DEFAULT_FEMUR_LENGTH,
  tibia_length: DEFAULT_TIBIA_LENGTH,
  tarsus_length: DEFAULT_TARSUS_LENGTH,

  dof: DEFAULT_DOF,
  leg_count: DEFAULT_LEG_COUNT,
  body_shape: 'rectangle',
  body_radius: DEFAULT_BODY_WIDTH / 2,

  color: 0x333333,

  rotate_step: Math.PI / 18,
  fb_step: 15,
  lr_step: 10,
  up_step: 10,

  first_servo_idx: 0,

  leg_options: [
    // Left front / Right front (leg_count=3 uses these + left mid)
    {
      x: DEFAULT_BODY_WIDTH / 2, y: 0, z: -DEFAULT_BODY_LENGTH / 2,
      coxa: { length: DEFAULT_COXA_LENGTH, radius: DEFAULT_COXA_RADIUS, init_angle: DEFAULT_COXA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur: { length: DEFAULT_FEMUR_LENGTH, radius: DEFAULT_FEMUR_RADIUS, init_angle: DEFAULT_FEMUR_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia: { length: DEFAULT_TIBIA_LENGTH, radius: DEFAULT_TIBIA_RADIUS, init_angle: DEFAULT_TIBIA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tarsus: { length: DEFAULT_TARSUS_LENGTH, radius: DEFAULT_TARSUS_RADIUS, init_angle: DEFAULT_TARSUS_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      mirror: -1,
    },
    {
      x: DEFAULT_BODY_WIDTH / 2, y: 0, z: -DEFAULT_BODY_LENGTH / 2,
      coxa: { length: DEFAULT_COXA_LENGTH, radius: DEFAULT_COXA_RADIUS, init_angle: DEFAULT_COXA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur: { length: DEFAULT_FEMUR_LENGTH, radius: DEFAULT_FEMUR_RADIUS, init_angle: DEFAULT_FEMUR_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia: { length: DEFAULT_TIBIA_LENGTH, radius: DEFAULT_TIBIA_RADIUS, init_angle: DEFAULT_TIBIA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tarsus: { length: DEFAULT_TARSUS_LENGTH, radius: DEFAULT_TARSUS_RADIUS, init_angle: DEFAULT_TARSUS_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      mirror: 1,
    },
    // Left middle / Right middle (leg_count=3,4 use these)
    {
      x: DEFAULT_BODY_WIDTH / 2, y: 0, z: 0,
      coxa: { length: DEFAULT_COXA_LENGTH, radius: DEFAULT_COXA_RADIUS, init_angle: 0, servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur: { length: DEFAULT_FEMUR_LENGTH, radius: DEFAULT_FEMUR_RADIUS, init_angle: DEFAULT_FEMUR_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia: { length: DEFAULT_TIBIA_LENGTH, radius: DEFAULT_TIBIA_RADIUS, init_angle: DEFAULT_TIBIA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tarsus: { length: DEFAULT_TARSUS_LENGTH, radius: DEFAULT_TARSUS_RADIUS, init_angle: DEFAULT_TARSUS_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      mirror: -1,
    },
    {
      x: DEFAULT_BODY_WIDTH / 2, y: 0, z: 0,
      coxa: { length: DEFAULT_COXA_LENGTH, radius: DEFAULT_COXA_RADIUS, init_angle: 0, servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur: { length: DEFAULT_FEMUR_LENGTH, radius: DEFAULT_FEMUR_RADIUS, init_angle: DEFAULT_FEMUR_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia: { length: DEFAULT_TIBIA_LENGTH, radius: DEFAULT_TIBIA_RADIUS, init_angle: DEFAULT_TIBIA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tarsus: { length: DEFAULT_TARSUS_LENGTH, radius: DEFAULT_TARSUS_RADIUS, init_angle: DEFAULT_TARSUS_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      mirror: 1,
    },
    // Left rear / Right rear (only leg_count=6 uses these)
    {
      x: DEFAULT_BODY_WIDTH / 2, y: 0, z: DEFAULT_BODY_LENGTH / 2,
      coxa: { length: DEFAULT_COXA_LENGTH, radius: DEFAULT_COXA_RADIUS, init_angle: -DEFAULT_COXA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur: { length: DEFAULT_FEMUR_LENGTH, radius: DEFAULT_FEMUR_RADIUS, init_angle: DEFAULT_FEMUR_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia: { length: DEFAULT_TIBIA_LENGTH, radius: DEFAULT_TIBIA_RADIUS, init_angle: DEFAULT_TIBIA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tarsus: { length: DEFAULT_TARSUS_LENGTH, radius: DEFAULT_TARSUS_RADIUS, init_angle: DEFAULT_TARSUS_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      mirror: -1,
    },
    {
      x: DEFAULT_BODY_WIDTH / 2, y: 0, z: DEFAULT_BODY_LENGTH / 2,
      coxa: { length: DEFAULT_COXA_LENGTH, radius: DEFAULT_COXA_RADIUS, init_angle: -DEFAULT_COXA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur: { length: DEFAULT_FEMUR_LENGTH, radius: DEFAULT_FEMUR_RADIUS, init_angle: DEFAULT_FEMUR_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia: { length: DEFAULT_TIBIA_LENGTH, radius: DEFAULT_TIBIA_RADIUS, init_angle: DEFAULT_TIBIA_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      tarsus: { length: DEFAULT_TARSUS_LENGTH, radius: DEFAULT_TARSUS_RADIUS, init_angle: DEFAULT_TARSUS_INIT_ANGLE, servo_value: SERVO_CURRENT_VALUE, revert: false },
      mirror: 1,
    },
  ],
};
