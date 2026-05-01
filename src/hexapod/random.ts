import { SERVO_CURRENT_VALUE } from './defaults';

function rand(min: number, max: number): number {
  return Math.round(Math.random() * (max - min) + min);
}

function randFloat(min: number, max: number, decimals = 0): number {
  const v = Math.random() * (max - min) + min;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomOptions() {
  const legCount = rand(3, 9);
  const bodyShape = pick(['rectangle', 'polygon']);
  const bodyWidth = rand(30, 180);
  const bodyLength = rand(30, 180);
  const bodyHeight = rand(10, 80);
  const bodyOffset = rand(-30, 30);
  const dof = rand(2, 6);

  const coxaLen = rand(10, 60);
  const femurLen = rand(15, 80);
  const tibiaLen = rand(20, 100);
  const tarsusLen = rand(10, 60);
  const seg5Len = rand(10, 40);
  const seg6Len = rand(10, 30);

  const coxaAngle = rand(-45, 45);
  const femurAngle = rand(0, 60);
  const tibiaAngle = rand(-120, -30);
  const tarsusAngle = rand(-90, 0);
  const seg5Angle = rand(-60, 30);
  const seg6Angle = rand(-30, 30);

  const rotateStep = randFloat(0.05, 0.5, 2);
  const fbStep = rand(5, 80);
  const lrStep = rand(5, 60);
  const upStep = rand(2, 40);

  const gait = pick(['tripod', 'ripple', 'quad', 'wave', 'dual_tripod']);
  const actionType = pick(['efficient', 'power', 'body_first', 'fast']);

  const leg_options: any[] = [];
  for (let i = 0; i < legCount; i++) {
    const mirror = i % 2 === 0 ? -1 : 1;
    const segs: Record<string, any> = {
      coxa:   { length: coxaLen + rand(-10, 10), radius: rand(5, 15), init_angle: i < 2 ? coxaAngle : (i >= legCount - 2 ? -coxaAngle : 0), servo_value: SERVO_CURRENT_VALUE, revert: false },
      femur:  { length: femurLen + rand(-10, 10), radius: rand(5, 18), init_angle: femurAngle + rand(-10, 10), servo_value: SERVO_CURRENT_VALUE, revert: false },
      tibia:  { length: tibiaLen + rand(-15, 15), radius: rand(4, 14), init_angle: tibiaAngle + rand(-10, 10), servo_value: SERVO_CURRENT_VALUE, revert: false },
    };
    if (dof >= 4) segs.tarsus =  { length: tarsusLen + rand(-10, 10), radius: rand(3, 10), init_angle: tarsusAngle + rand(-10, 10), servo_value: SERVO_CURRENT_VALUE, revert: false };
    if (dof >= 5) segs.segment5 = { length: seg5Len + rand(-5, 5), radius: rand(2, 6), init_angle: seg5Angle + rand(-10, 10), servo_value: SERVO_CURRENT_VALUE, revert: false };
    if (dof >= 6) segs.segment6 = { length: seg6Len + rand(-5, 5), radius: rand(2, 4), init_angle: seg6Angle + rand(-10, 10), servo_value: SERVO_CURRENT_VALUE, revert: false };
    segs.dof = dof;
    leg_options.push({ x: 0, y: 0, z: 0, mirror, ...segs });
  }

  return {
    body_width: bodyWidth,
    body_length: bodyLength,
    body_height: bodyHeight,
    body_offset: bodyOffset,
    body_shape: bodyShape,
    polygon_leg_placement: pick(['vertex', 'edge']),
    polygon_odd_orientation: pick(['back', 'front']),
    coxa_length: coxaLen,
    femur_length: femurLen,
    tibia_length: tibiaLen,
    tarsus_length: tarsusLen,
    dof,
    leg_count: legCount,
    body_radius: rand(40, 150),
    color: 0x333333,
    rotate_step: rotateStep,
    fb_step: fbStep,
    lr_step: lrStep,
    up_step: upStep,
    first_servo_idx: 0,
    draw_type: 'mesh',
    gait,
    action_type: actionType,
    target_mode: 'target',
    move_mode: 'move',
    sync_cmd: false,
    _tip_lock: true,
    leg_options,
  };
}
