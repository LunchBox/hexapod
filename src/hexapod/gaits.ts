import {
  FORWARD_KEY, BACKWARD_KEY, LEFT_KEY, RIGHT_KEY,
  MOVE_LEFT_KEY, MOVE_RIGHT_KEY, RAISE_KEY, FALL_KEY,
  DEFAULT_HEXAPOD_OPTIONS, ACT_STANDBY, ACT_PUTDOWN_TIPS,
} from './defaults.js';
import { generateAllGaits } from './gait_generator.js';

// ── GaitAction (base) ──────────────────────────────────────────

export class GaitAction {
  acting_idx: number;
  up_distance: number;
  fb_direction: number;
  lr_direction: number;
  rotate_direction: number;
  steps: any[];
  step_types: Record<string, any[]>;
  controller: any;

  constructor(controller?: any) {
    if (controller) this.controller = controller;
    this.acting_idx = 0;
    this.up_distance = (this.controller?.bot?.options?.up_step != null)
      ? this.controller.bot.options.up_step
      : DEFAULT_HEXAPOD_OPTIONS.up_step;
    this.fb_direction = 0;
    this.lr_direction = 0;
    this.rotate_direction = 0;
  }

  active_legs() {
    return this.controller.active_legs();
  }

  legs_up() {
    this.controller.legs_up(this.active_legs(), this.up_distance);
  }

  legs_down() {
    this.controller.legs_down(this.active_legs());
  }

  legs_move() {
    this.controller.move_tips(this.active_legs(), this.fb_direction, this.lr_direction, this.rotate_direction);
  }

  body_move() {
    this.controller.move_body(this.fb_direction, this.lr_direction, this.rotate_direction);
  }

  switch_legs() {
    this.controller.next_leg_group();
  }

  quit() {
    this.controller.stop();
  }

  next_step() {
    this.acting_idx += 1;
    if (this.acting_idx >= this.steps.length) {
      this.acting_idx = 0;
      this.controller.next_leg_group();
    }
  }

  run() {
    let step = this.steps[this.acting_idx];
    console.log(step);

    let _send_cmd = false;
    if (typeof step === "string") {
      (this as any)[step]();
      _send_cmd = true;
    } else {
      (this as any)[step.func]();
      _send_cmd = step.send_cmd;
    }

    this.next_step();
    return _send_cmd;
  }
}

// ── GaitStandby ────────────────────────────────────────────────

export class GaitStandby extends GaitAction {
  constructor(controller: any) {
    super(controller);
    this.steps = ["legs_up", "legs_move", "legs_down"];
  }
}

// ── GaitPutdownTips ────────────────────────────────────────────

export class GaitPutdownTips extends GaitAction {
  constructor(controller: any) {
    super(controller);
    this.steps = ["legs_down", "quit"];
  }

  active_legs() {
    return this.controller.all_legs;
  }
}

// ── GaitMove ───────────────────────────────────────────────────

export class GaitMove extends GaitAction {
  constructor(controller: any, fb_direction?: number, lr_direction?: number, rotate_direction?: number) {
    super(controller);
    this.fb_direction = fb_direction || 0;
    this.lr_direction = lr_direction || 0;
    this.rotate_direction = rotate_direction || 0;

    let power_type = ["legs_up", "legs_move", "legs_down", "body_move"];
    let efficient_type = ["legs_up", "legs_move", "body_move", "legs_down"];
    let body_first_type = ["legs_up", "body_move", "legs_move", "legs_down"];
    let fast_type = [
      { func: "legs_up", send_cmd: false },
      { func: "legs_move", send_cmd: false },
      { func: "body_move", send_cmd: true },
      { func: "legs_down", send_cmd: false },
    ];

    this.step_types = {
      "power": power_type,
      "efficient": efficient_type,
      "body_first": body_first_type,
      "fast": fast_type,
    };

    this.steps = this.step_types["efficient"];
  }
}

// ── GaitInternal ───────────────────────────────────────────────

export class GaitInternal extends GaitAction {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  homePos: { x: number; y: number; z: number };
  homeRot: { x: number; y: number; z: number };
  _homeSnapped: boolean;

  constructor(controller: any) {
    super(controller);
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.homePos = { x: 0, y: 0, z: 0 };
    this.homeRot = { x: 0, y: 0, z: 0 };
    this._homeSnapped = false;
    this.steps = ["move"];
  }

  snapshotHome() {
    if (this._homeSnapped) return;
    this._homeSnapped = true;
    let bm = this.controller.bot.body_mesh;
    this.homePos.x = bm.position.x; this.homePos.y = bm.position.y; this.homePos.z = bm.position.z;
    this.homeRot.x = bm.rotation.x; this.homeRot.y = bm.rotation.y; this.homeRot.z = bm.rotation.z;
  }

  move() {
    let bot = this.controller.bot;
    // Compute delta from current to target (home + joystick offset)
    let dRotZ = (this.homeRot.z + this.rotation.z) - bot.body_mesh.rotation.z;
    let dRotX = (this.homeRot.x + this.rotation.x) - bot.body_mesh.rotation.x;
    let dPosX = (this.homePos.x + this.position.x) - bot.body_mesh.position.x;
    let dPosZ = (this.homePos.z + this.position.z) - bot.body_mesh.position.z;
    bot.transform_body({ dx: dPosX, dz: dPosZ, rx: dRotX, rz: dRotZ });
  }
}

// ── GaitController ─────────────────────────────────────────────

export class GaitController {
  bot: any;
  all_legs: number[];
  gaits: Record<string, number[][]>;
  leg_groups: number[][];
  leg_group_idx: number;
  rotate_step: number;
  fb_step: number;
  lr_step: number;
  actions: Record<string, any>;
  target_modes: string[];
  target_mode: string;
  move_mode: string;
  expected_action: any;
  last_fire_time: number;
  last_act_time: number;
  last_act_completed_time: number;
  last_action: string;
  action_identify: any;
  on_action: any;
  fire_free: boolean;

  constructor(bot: any) {
    this.bot = bot;

    const n = bot.legs.length;
    this.all_legs = Array.from({ length: n }, (_, i) => i);

    // Build sides classification for gait validation
    const isOdd = n % 2 !== 0;
    const bodyShape = this.bot.options.body_shape || 'rectangle';
    const leftLegs: number[] = [];
    const rightLegs: number[] = [];
    let centerLeg: number | null = null;

    if (bodyShape === 'rectangle') {
      // Rectangle: sides by mirror/x-position (with epsilon for floating point)
      for (let i = 0; i < n; i++) {
        const x = this.bot.leg_layout?.[i]?.x ?? 0;
        if (x > 0.01) rightLegs.push(i);
        else if (x < -0.01) leftLegs.push(i);
        else if (isOdd) centerLeg = i;
        else rightLegs.push(i); // even N: center x=0 goes to right
      }
    } else {
      // Polygon: sides by angle around circle
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const c = Math.cos(angle);
        if (isOdd && Math.abs(c) < 0.001) {
          centerLeg = i;
        } else if (c > 0.001) {
          rightLegs.push(i);
        } else if (c < -0.001) {
          leftLegs.push(i);
        } else {
          if (Math.sin(angle) < 0) rightLegs.push(i);
          else leftLegs.push(i);
        }
      }
    }

    // Generate all valid gait phase-sequences grouped by legs-lifted count,
    // with cyclic-rotation deduplication (canonical: group containing leg 0 is first).
    this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);

    // Restore gait from options, fallback to first available
    let gaitName = this.bot.options.gait || 'tripod';
    this.leg_groups = this.gaits[gaitName] || Object.values(this.gaits)[0];
    // Safety: if no gaits at all (shouldn't happen), create a basic wave
    if (!this.leg_groups) {
      this.gaits['wave'] = Array.from({ length: n }, (_, i) => [i]);
      this.leg_groups = this.gaits['wave'];
    }
    this.leg_group_idx = 0;
    this.reset_steps();

    this.actions = {};
    this.actions[FORWARD_KEY] = new GaitMove(this, 1, 0, 0);
    this.actions[BACKWARD_KEY] = new GaitMove(this, -1, 0, 0);
    this.actions[LEFT_KEY] = new GaitMove(this, 0, 0, 1);
    this.actions[RIGHT_KEY] = new GaitMove(this, 0, 0, -1);
    this.actions[MOVE_LEFT_KEY] = new GaitMove(this, 0, 1, 0);
    this.actions[MOVE_RIGHT_KEY] = new GaitMove(this, 0, -1, 0);
    this.actions["follow_joystick"] = new GaitMove(this);
    this.actions["internal_move"] = new GaitInternal(this);
    this.actions[ACT_STANDBY] = new GaitStandby(this);
    this.actions[ACT_PUTDOWN_TIPS] = new GaitPutdownTips(this);

    this.target_modes = ["translate", "target"];
    this.target_mode = this.bot.options.target_mode || "target";

    this.move_mode = this.bot.options.move_mode || "move";

    // Apply persisted action type to all actions
    let actionType = this.bot.options.action_type || 'efficient';
    for (let key in this.actions) {
      let action = this.actions[key];
      if (action.step_types && action.step_types[actionType]) {
        action.steps = action.step_types[actionType];
      }
    }
  }

  reset_steps() {
    this.rotate_step = this.bot.rotate_step;
    this.fb_step = this.bot.fb_step;
    this.lr_step = this.bot.lr_step;
  }

  has_action(action_name: any) {
    return Object.keys(this.actions).indexOf(action_name.toString()) > -1;
  }

  fire_action() {
    if (!this.expected_action) {
      return;
    }

    let time = new Date().getTime();
    if (this.last_fire_time) {
      console.log("delta fire time: " + (time - this.last_fire_time));
    }
    this.last_fire_time = time;

    if (!this.has_action(this.expected_action)) {
      return;
    }

    if (!this.action_identify) {
      let time_interval = this.bot.hold_time;
      if (this.last_act_completed_time) {
        time_interval -= new Date().getTime() - this.last_act_completed_time;
      }

      this.action_identify = setTimeout(() => {
        let gait_controller = this.bot.gait_controller;
        gait_controller.act(gait_controller.expected_action);
        gait_controller.action_identify = null;
      }, time_interval);
    }

    this.on_action = this.expected_action;
  }

  stop() {
    console.log("clear timeout");
    if (typeof this.action_identify !== "undefined") {
      clearTimeout(this.action_identify);
      this.action_identify = null;
    }

    this.on_action = null;
    this.expected_action = null;
    this.fire_free = false;
    this.reset_steps();
  }

  act(action_name: any) {
    let time = new Date().getTime();
    if (this.last_act_time) {
      console.log("delta act time: " + (time - this.last_act_time));
    }
    this.last_act_time = time;

    if (this.last_action && action_name !== this.last_action) {
      this.actions[action_name].acting_idx = 0;
    }
    this.last_action = action_name;

    let _send_cmd = this.actions[action_name].run();
    this.bot.after_status_change(_send_cmd);
    this.bot.sync_guide_circles();

    console.log("-- calc time: " + (new Date().getTime() - time));
    console.log("-- cmd time required: " + this.bot.hold_time);

    this.last_act_completed_time = new Date().getTime();
  }

  next_leg_group() {
    this.leg_group_idx += 1;
    if (this.leg_group_idx >= this.leg_groups.length) {
      this.leg_group_idx = 0;
    }
  }

  active_legs() {
    return this.leg_groups[this.leg_group_idx];
  }

  reset_action() {
    for (let key in this.actions) {
      this.leg_group_idx = 0;
      this.actions[key].acting_idx = 0;
    }
  }

  switch_gait(gait_name: string) {
    this.reset_tips_to_home();
    this.leg_groups = this.gaits[gait_name];
    this.reset_action();
  }

  switch_target_mode(target_mode: string) {
    this.reset_tips_to_home();
    this.target_mode = target_mode;
    this.reset_action();
  }

  switch_action_type(type_name: string) {
    this.reset_tips_to_home();
    for (let key in this.actions) {
      let action = this.actions[key];
      if (action.step_types) {
        action.steps = action.step_types[type_name];
      }
    }
    this.reset_action();
  }

  reset_tips_to_home() {
    const bot = this.bot;
    bot.reset_guide_pos();
    bot.mesh.updateMatrixWorld();
    const localPositions = bot._guide_local_positions;
    if (localPositions) {
      for (let i = 0; i < bot.legs.length; i++) {
        const localHome = localPositions[i];
        if (localHome) {
          const worldHome = localHome.clone().applyMatrix4(bot.mesh.matrixWorld);
          worldHome.y = 0;
          bot.legs[i].set_tip_pos(worldHome);
          bot.legs[i].on_floor = true;
        }
      }
    }
    bot.adjust_gait_guidelines();
    bot.sync_guide_circles();
  }

  legs_up(leg_idxs: number[], target_offset: number) {
    for (let i = 0; i < leg_idxs.length; i++) {
      let idx = leg_idxs[i];
      let ori_pos = this.bot.legs[idx].get_tip_pos();
      ori_pos.y = target_offset;
      if (this.bot.legs[idx].set_tip_pos(ori_pos).success) {
        this.bot.legs[idx].on_floor = false;
      }
    }
  }

  legs_down(leg_idxs: number[]) {
    for (let i = 0; i < leg_idxs.length; i++) {
      let idx = leg_idxs[i];
      let ori_pos = this.bot.legs[idx].get_tip_pos();
      ori_pos.y = 0;
      if (this.bot.legs[idx].set_tip_pos(ori_pos).success) {
        this.bot.legs[idx].on_floor = true;
      }
    }
  }

  move_tips(leg_idxs: number[], fb_direction: number, lr_direction: number, rotate_direction: number) {
    let fb_offset = fb_direction * this.fb_step;
    let lr_offset = lr_direction * this.lr_step;
    let rotate_offset = rotate_direction * this.rotate_step;

    this.bot.reset_guide_pos();
    const gp = this.bot.guide_pos;
    gp.position.z -= fb_offset;
    gp.position.x -= lr_offset;
    gp.rotation.y += rotate_offset;

    for (let i = 0; i < leg_idxs.length; i++) {
      let idx = leg_idxs[i];
      let ori_pos = this.bot.legs[idx].get_tip_pos();
      let target_pos = this.bot.get_guide_pos(idx);
      ori_pos.x = target_pos.x;
      ori_pos.z = target_pos.z;
      this.bot.legs[idx].set_tip_pos(ori_pos);
    }
  }

  move_body(fb_direction: number, lr_direction: number, rotate_direction: number) {
    let fb_offset = fb_direction * this.fb_step;
    let lr_offset = lr_direction * this.lr_step;
    let rotate_offset = rotate_direction * this.rotate_step;

    let current_tips_pos = this.bot.get_tip_pos();

    this.bot.reset_guide_pos();
    const gp = this.bot.guide_pos;
    gp.position.z -= fb_offset / this.leg_groups.length * 3;
    gp.position.x -= lr_offset / this.leg_groups.length * 3;

    // Body center world position from guide_pos (vertex at index N)
    let target_pos = this.bot.get_guide_pos(this.bot.legs.length);
    this.bot.mesh.position.x = target_pos.x;
    this.bot.mesh.position.z = target_pos.z;

    this.bot.mesh.rotation.y += rotate_offset / this.leg_groups.length * 3;

    for (let idx = 0; idx < this.bot.legs.length; idx++) {
      if (this.bot.legs[idx].on_floor === true) {
        this.bot.legs[idx].set_tip_pos(current_tips_pos[idx]);
      }
    }
  }

  follow(joystick: any) {
    if (joystick.handler_activated) {
      switch (this.move_mode) {
        case "move":
          switch (this.target_mode) {
            case "translate":
              this.translate_with_joystick(joystick);
              break;
            case "target":
              this.target_with_joystick(joystick);
              break;
            default:
              console.log("-- just no idea of the move mode of the gait controller");
          }
          this.expected_action = "follow_joystick";
          break;
        case "move_body":
          let gait = this.actions["internal_move"];
          let pos = joystick.pos;
          gait.snapshotHome();
          let max_fb_distance = 40;
          let max_lr_distance = 40;
          let fb_rate = max_fb_distance / joystick.radius;
          let lr_rate = max_lr_distance / joystick.radius;
          gait.position.x = pos.x * lr_rate;
          gait.position.z = pos.y * fb_rate;
          this.expected_action = "internal_move";
          break;
        case "rotate_body":
          let gait2 = this.actions["internal_move"];
          let pos2 = joystick.pos;
          gait2.snapshotHome();
          let max_fb_radius = Math.PI / 12;
          let max_lr_radius = Math.PI / 12;
          let fb_rate2 = max_fb_radius / joystick.radius;
          let lr_rate2 = max_lr_radius / joystick.radius;
          gait2.rotation.z = -pos2.x * lr_rate2;
          gait2.rotation.x = pos2.y * lr_rate2;
          this.expected_action = "internal_move";
          break;
        default:
          console.log("-- just no idea of the move mode of the gait controller");
      }
    }
  }

  translate_with_joystick(joystick: any) {
    let pos = joystick.pos;
    let gait = this.actions["follow_joystick"];
    let max_fb_distance = 20;
    let max_lr_distance = 20;
    let fb_rate = max_fb_distance / joystick.radius;
    let lr_rate = max_lr_distance / joystick.radius;

    gait.fb_direction = -Math.sign(pos.y);
    this.fb_step = Math.abs(pos.y) * fb_rate;

    gait.lr_direction = -Math.sign(pos.x);
    this.lr_step = Math.abs(pos.x) * lr_rate;

    gait.rotate_direction = 0;
    this.rotate_step = 0;
  }

  target_with_joystick(joystick: any) {
    let pos = joystick.pos;
    let gait = this.actions["follow_joystick"];
    let max_fb_distance = 20;
    let max_lr_distance = 20;
    let fb_rate = max_fb_distance / joystick.radius;
    let lr_rate = max_lr_distance / joystick.radius;

    let diff_distance = Math.sqrt(Math.pow(pos.y, 2) + Math.pow(pos.x, 2));

    gait.fb_direction = -Math.sign(pos.y);
    this.fb_step = diff_distance * fb_rate;

    gait.lr_direction = 0;
    this.lr_step = 0;

    let diff_radius = 0;

    if (pos.y < 0) {
      gait.rotate_direction = -Math.sign(pos.x);
      diff_radius = (Math.atan2(-pos.y, pos.x) - Math.PI / 2);
    } else if (pos.y > 0) {
      gait.rotate_direction = Math.sign(pos.x);
      diff_radius = (Math.atan2(-pos.y, pos.x) + Math.PI / 2);
    }

    this.rotate_step = Math.abs(diff_radius / 10);
  }
}
