// Core type interfaces for hexapod classes

type MoveMode = 'move' | 'move_body' | 'rotate_body';
type PhysicsMode = 'none' | 'servo_constraint';
type DrawType = 'mesh' | 'bone' | 'points';
type TargetMode = 'translate' | 'target';
type ActionType = 'power' | 'efficient' | 'body_first' | 'fast';
type BodyShape = 'rectangle' | 'polygon';
type PolygonPlacement = 'vertex' | 'edge';
type PolygonOrientation = 'back' | 'front';

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
  dof?: number;
  coxa: LimbOptions;
  femur: LimbOptions;
  tibia: LimbOptions;
  [key: string]: any;  // dynamic segment names (tarsus, segment5, segment6, etc.)
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
  servo_speed: number;
  physics_mode: PhysicsMode;
  micro_steps?: number;
  ground_constraint?: boolean;
  servo_stall_threshold?: number;
  first_servo_idx: number;
  leg_options: HexapodLegOptions[];
  leg_count?: number;
  dof?: number;
  draw_type?: DrawType;
  gait?: string;
  action_type?: ActionType;
  target_mode?: TargetMode;
  move_mode?: MoveMode;
  sync_cmd?: boolean;
  body_shape?: BodyShape;
  polygon_leg_placement?: PolygonPlacement;
  polygon_odd_orientation?: PolygonOrientation;
  tip_circle_scale?: number;
  body_offset?: number;
  _tip_lock?: boolean;
  _body_home?: any;
  [key: string]: any;  // legacy/dynamic fields
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
  _rendered_servo_value: number;
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
  _home_servos?: number[];
  set_tip_pos(pos: any): PosResult;
  get_tip_pos(): any;
  capture_servo_home(): void;
  snap_to_home(strength: number): void;
}

interface GaitControllerInstance {
  bot: any;
  move_mode: MoveMode;
  target_mode: TargetMode;
  expected_action: any;
  stop(): void;
  act(action_name: any): void;
  fire_action(): void;
  follow(joystick: any): void;
  switch_gait(name: string): void;
  switch_target_mode(mode: TargetMode): void;
  switch_action_type(type: ActionType): void;
  reset_steps(): void;
  reset_action(): void;
}
