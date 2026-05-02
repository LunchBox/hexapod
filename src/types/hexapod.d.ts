// Core type interfaces for hexapod classes

interface PosResult {
  success: boolean;
  distance: number;
  iterations: number;
  values: number[];
}

interface HexapodLegOptions {
  x: number;
  y: number;
  z: number;
  mirror: number;
  coxa: LimbOptions;
  femur: LimbOptions;
  tibia: LimbOptions;
}

interface LimbOptions {
  length: number;
  radius: number;
  init_angle: number;
  servo_value: number;
  servo_idx?: number;
  revert: boolean;
}

interface HexapodOptions {
  body_width: number;
  body_length: number;
  body_height: number;
  coxa_length: number;
  femur_length: number;
  tibia_length: number;
  color: number;
  rotate_step: number;
  fb_step: number;
  lr_step: number;
  up_step: number;
  first_servo_idx: number;
  leg_options: HexapodLegOptions[];
}

interface ThreeObj {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  rotation: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  scale: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  children: any[];
  add(child: any): void;
  remove(child: any): void;
  clone(): any;
  updateMatrixWorld(): void;
  matrixWorld: any;
  visible: boolean;
  type: string;
}

interface LimbMesh extends ThreeObj {
  servo_value: number;
  servo_idx: number;
  revert: boolean;
  init_radius: number;
  init_angle: number;
  range_control?: HTMLInputElement;
  current_control?: HTMLInputElement;
  end_x_control?: HTMLInputElement;
  end_y_control?: HTMLInputElement;
  end_z_control?: HTMLInputElement;
}

interface HexapodLegInstance {
  bot: any;
  options: HexapodLegOptions;
  mesh: ThreeObj;
  mirror: number;
  on_floor: boolean;
  center_offset: number;
  coxa: LimbMesh;
  femur: LimbMesh;
  tibia: LimbMesh;
  tip: ThreeObj;
  limbs: [LimbMesh, LimbMesh, LimbMesh, ThreeObj];
  set_servo_value(limb_idx: number, value: number): void;
  set_servo_values(values: number[]): void;
  set_tip_pos(pos: any): PosResult;
  get_tip_pos(): any;
}

interface GaitControllerInstance {
  bot: any;
  move_mode: string;
  target_mode: string;
  expected_action: any;
  stop(): void;
  act(action_name: any): void;
  fire_action(): void;
  follow(joystick: any): void;
  switch_gait(name: string): void;
  switch_target_mode(mode: string): void;
  switch_action_type(type: string): void;
  reset_steps(): void;
  reset_action(): void;
}
