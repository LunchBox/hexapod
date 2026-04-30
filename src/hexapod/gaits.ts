import appState from './appState.js';
import {
  FORWARD_KEY, BACKWARD_KEY, LEFT_KEY, RIGHT_KEY,
  MOVE_LEFT_KEY, MOVE_RIGHT_KEY, RAISE_KEY, FALL_KEY,
  DEFAULT_HEXAPOD_OPTIONS, ACT_STANDBY, ACT_PUTDOWN_TIPS,
} from './defaults.js';
import { getWorldPosition } from './utils.js';
import { PosCalculator } from './pos_calculator.js';

export function GaitController(bot) {
  this.bot = bot;

  this.all_legs = [0, 1, 2, 3, 4, 5];

  this.gaits = {
    tripod: [[0, 2, 4], [1, 3, 5]],
    squirm: [[1, 4], [0, 3], [1, 4], [2, 5]],
    ripple: [[2, 3], [1, 5], [0, 4]],
    wave1: [[0], [1], [2], [3], [4], [5]],
    wave2: [[0], [3], [1], [4], [2], [5]],
  };

  this.leg_groups = this.gaits.tripod;
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
  this.target_mode = "target";

  this.move_mode = "move";
}

GaitController.prototype.reset_steps = function () {
  this.rotate_step = this.bot.rotate_step;
  this.fb_step = this.bot.fb_step;
  this.lr_step = this.bot.lr_step;
};

GaitController.prototype.has_action = function (action_name) {
  return Object.keys(this.actions).indexOf(action_name.toString()) > -1;
};

GaitController.prototype.fire_action = function () {
  if (!this.expected_action) {
    return;
  }

  var time = new Date().getTime();
  if (this.last_fire_time) {
    console.log("delta fire time: " + (time - this.last_fire_time));
  }
  this.last_fire_time = time;

  if (!this.has_action(this.expected_action)) {
    return;
  }

  if (!this.action_identify) {
    var time_interval = this.bot.hold_time;
    if (this.last_act_completed_time) {
      time_interval -= new Date().getTime() - this.last_act_completed_time;
    }

    this.action_identify = setTimeout(function () {
      var gait_controller = appState.current_bot.gait_controller;
      gait_controller.act(gait_controller.expected_action);
      gait_controller.action_identify = null;
    }, time_interval);
  }

  this.on_action = this.expected_action;
};

GaitController.prototype.stop = function () {
  console.log("clear interval");
  if (typeof (this.action_identify) != "undefined") {
    clearInterval(this.action_identify);
    this.action_identify = null;
  }

  this.on_action = null;
  this.expected_action = null;
  this.fire_free = false;
  this.reset_steps();
};

GaitController.prototype.act = function (action_name) {
  var time = new Date().getTime();
  if (this.last_act_time) {
    console.log("delta act time: " + (time - this.last_act_time));
  }
  this.last_act_time = time;

  if (this.last_action && action_name != this.last_action) {
    this.actions[action_name].acting_idx = 0;
  }
  this.last_action = action_name;

  var _send_cmd = this.actions[action_name].run();
  appState.current_bot.after_status_change(_send_cmd);

  console.log("-- calc time: " + (new Date().getTime() - time));
  console.log("-- cmd time required: " + this.bot.hold_time);

  this.last_act_completed_time = new Date().getTime();
};

GaitController.prototype.next_leg_group = function () {
  this.leg_group_idx += 1;
  if (this.leg_group_idx >= this.leg_groups.length) {
    this.leg_group_idx = 0;
  }
};

GaitController.prototype.active_legs = function () {
  return this.leg_groups[this.leg_group_idx];
};

GaitController.prototype.reset_action = function () {
  for (var key in this.actions) {
    this.leg_group_idx = 0;
    this.actions[key].acting_idx = 0;
  }
};

GaitController.prototype.switch_gait = function (gait_name) {
  this.legs_down(this.all_legs);
  this.leg_groups = this.gaits[gait_name];
  this.reset_action();
};

GaitController.prototype.switch_target_mode = function (target_mode) {
  this.legs_down(this.all_legs);
  this.target_mode = target_mode;
  this.reset_action();
};

GaitController.prototype.switch_action_type = function (type_name) {
  this.legs_down(this.all_legs);
  for (var key in this.actions) {
    var action = this.actions[key];
    if (action.step_types) {
      action.steps = action.step_types[type_name];
    }
  }
  this.reset_action();
};

GaitController.prototype.legs_up = function (leg_idxs, target_offset) {
  for (var i in leg_idxs) {
    var idx = leg_idxs[i];
    var ori_pos = appState.current_bot.legs[idx].get_tip_pos();
    ori_pos.y = target_offset;
    if (appState.current_bot.legs[idx].set_tip_pos(ori_pos)) {
      appState.current_bot.legs[idx].on_floor = false;
    }
  }
};

GaitController.prototype.legs_down = function (leg_idxs) {
  for (var i in leg_idxs) {
    var idx = leg_idxs[i];
    var ori_pos = appState.current_bot.legs[idx].get_tip_pos();
    ori_pos.y = 0;
    if (appState.current_bot.legs[idx].set_tip_pos(ori_pos)) {
      appState.current_bot.legs[idx].on_floor = true;
    }
  }
};

GaitController.prototype.move_tips = function (leg_idxs, fb_direction, lr_direction, rotate_direction) {
  var fb_offset = fb_direction * this.fb_step;
  var lr_offset = lr_direction * this.lr_step;
  var rotate_offset = rotate_direction * this.rotate_step;

  this.bot.reset_guide_pos();
  var gp = this.bot.guide_pos;

  gp.position.z -= fb_offset;
  gp.position.x -= lr_offset;
  gp.rotation.y += rotate_offset;

  var i;
  var len = leg_idxs.length;
  for (i = 0; i < len; i++) {
    var idx = leg_idxs[i];
    var ori_pos = appState.current_bot.legs[idx].get_tip_pos();
    var target_pos = this.bot.get_guide_pos(idx);
    ori_pos.x = target_pos.x;
    ori_pos.z = target_pos.z;
    appState.current_bot.legs[idx].set_tip_pos(ori_pos);
  }
};

GaitController.prototype.move_body = function (fb_direction, lr_direction, rotate_direction) {
  var fb_offset = fb_direction * this.fb_step;
  var lr_offset = lr_direction * this.lr_step;
  var rotate_offset = rotate_direction * this.rotate_step;

  var current_tips_pos = appState.current_bot.get_tip_pos();

  this.bot.reset_guide_pos();
  var gp = this.bot.guide_pos;

  gp.position.z -= fb_offset / this.leg_groups.length * 3;
  console.log(fb_offset / this.leg_groups.length * 3);

  gp.position.x -= lr_offset / this.leg_groups.length * 3;

  var target_pos = this.bot.get_guide_pos(this.bot.legs.length);
  appState.current_bot.mesh.position.x = target_pos.x;
  appState.current_bot.mesh.position.z = target_pos.z;

  appState.current_bot.mesh.rotation.y += rotate_offset / this.leg_groups.length * 3;

  for (var idx in appState.current_bot.legs) {
    if (appState.current_bot.legs[idx].on_floor == true) {
      appState.current_bot.legs[idx].set_tip_pos(current_tips_pos[idx]);
    }
  }
};

GaitController.prototype.follow = function (joystick) {
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
        var gait = this.actions["internal_move"];
        var pos = joystick.pos;
        var max_fb_distance = 40;
        var max_lr_distance = 40;
        var fb_rate = max_fb_distance / joystick.radius;
        var lr_rate = max_lr_distance / joystick.radius;
        gait.position.x = pos.x * lr_rate;
        gait.position.z = pos.y * fb_rate;
        this.expected_action = "internal_move";
        break;
      case "rotate_body":
        var gait2 = this.actions["internal_move"];
        var pos2 = joystick.pos;
        var max_fb_radius = Math.PI / 9;
        var max_lr_radius = Math.PI / 9;
        var fb_rate2 = max_fb_radius / joystick.radius;
        var lr_rate2 = max_lr_radius / joystick.radius;
        gait2.rotation.z = -pos2.x * lr_rate2;
        gait2.rotation.x = pos2.y * lr_rate2;
        this.expected_action = "internal_move";
        break;
      default:
        console.log("-- just no idea of the move mode of the gait controller");
    }
  }
};

GaitController.prototype.translate_with_joystick = function (joystick) {
  var pos = joystick.pos;
  var gait = this.actions["follow_joystick"];
  var max_fb_distance = 20;
  var max_lr_distance = 20;
  var fb_rate = max_fb_distance / joystick.radius;
  var lr_rate = max_lr_distance / joystick.radius;

  gait.fb_direction = -Math.sign(pos.y);
  this.fb_step = Math.abs(pos.y) * fb_rate;

  gait.lr_direction = -Math.sign(pos.x);
  this.lr_step = Math.abs(pos.x) * lr_rate;

  gait.rotate_direction = 0;
  this.rotate_step = 0;
};

GaitController.prototype.target_with_joystick = function (joystick) {
  var pos = joystick.pos;
  var gait = this.actions["follow_joystick"];
  var max_fb_distance = 20;
  var max_lr_distance = 20;
  var fb_rate = max_fb_distance / joystick.radius;
  var lr_rate = max_lr_distance / joystick.radius;

  var diff_distance = Math.sqrt(Math.pow(pos.y, 2) + Math.pow(pos.x, 2));

  gait.fb_direction = -Math.sign(pos.y);
  this.fb_step = diff_distance * fb_rate;

  gait.lr_direction = 0;
  this.lr_step = 0;

  var diff_radius = 0;

  if (pos.y < 0) {
    gait.rotate_direction = -Math.sign(pos.x);
    diff_radius = (Math.atan2(-pos.y, pos.x) - Math.PI / 2);
  } else if (pos.y > 0) {
    gait.rotate_direction = Math.sign(pos.x);
    diff_radius = (Math.atan2(-pos.y, pos.x) + Math.PI / 2);
  }

  this.rotate_step = Math.abs(diff_radius / 10);
};

// GaitAction base
export function GaitAction(controller?: any) {
  if (controller) this.controller = controller;
  this.acting_idx = 0;
  this.up_distance = DEFAULT_HEXAPOD_OPTIONS.up_step;
  this.fb_direction = 0;
  this.lr_direction = 0;
  this.rotate_direction = 0;
}

GaitAction.prototype.active_legs = function () {
  return this.controller.active_legs();
};

GaitAction.prototype.legs_up = function () {
  this.controller.legs_up(this.active_legs(), this.up_distance);
};

GaitAction.prototype.legs_down = function () {
  this.controller.legs_down(this.active_legs());
};

GaitAction.prototype.legs_move = function () {
  this.controller.move_tips(this.active_legs(), this.fb_direction, this.lr_direction, this.rotate_direction);
};

GaitAction.prototype.body_move = function () {
  this.controller.move_body(this.fb_direction, this.lr_direction, this.rotate_direction);
};

GaitAction.prototype.switch_legs = function () {
  this.controller.next_leg_group();
};

GaitAction.prototype.quit = function () {
  this.controller.stop();
};

GaitAction.prototype.next_step = function () {
  this.acting_idx += 1;
  if (this.acting_idx >= this.steps.length) {
    this.acting_idx = 0;
    this.controller.next_leg_group();
  }
};

GaitAction.prototype.run = function () {
  var step = this.steps[this.acting_idx];
  console.log(step);

  var _send_cmd = false;
  if (typeof (step) == "string") {
    this[step]();
    _send_cmd = true;
  } else {
    this[step.func]();
    _send_cmd = step.send_cmd;
  }

  this.next_step();
  return _send_cmd;
};

// GaitStandby
export function GaitStandby(controller) {
  this.controller = controller;
  this.steps = ["legs_up", "legs_move", "legs_down"];
}
GaitStandby.prototype = new GaitAction();

// GaitPutdownTips
export function GaitPutdownTips(controller) {
  this.controller = controller;
  this.steps = ["legs_down", "quit"];
}
GaitPutdownTips.prototype = new GaitAction();
GaitPutdownTips.prototype.active_legs = function () {
  return this.controller.all_legs;
};

// GaitMove
export function GaitMove(controller: any, fb_direction?: any, lr_direction?: any, rotate_direction?: any) {
  this.controller = controller;
  this.fb_direction = fb_direction;
  this.lr_direction = lr_direction;
  this.rotate_direction = rotate_direction;

  var power_type = ["legs_up", "legs_move", "legs_down", "body_move"];
  var efficient_type = ["legs_up", "legs_move", "body_move", "legs_down"];
  var body_first_type = ["legs_up", "body_move", "legs_move", "legs_down"];
  var fast_type = [
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
GaitMove.prototype = new GaitAction();

// GaitInternal
export function GaitInternal(controller) {
  this.controller = controller;
  this.position = { x: 0, y: 0, z: 0 };
  this.rotation = { x: 0, y: 0, z: 0 };
  this.steps = ["move"];
}
GaitInternal.prototype = new GaitAction();
GaitInternal.prototype.move = function () {
  var bot = this.controller.bot;
  var current_tips_pos = bot.get_tip_pos();

  bot.body_mesh.rotation.z = this.rotation.z;
  bot.body_mesh.rotation.x = this.rotation.x;

  bot.body_mesh.position.x = this.position.x;
  bot.body_mesh.position.z = this.position.z;

  var total_legs = bot.legs.length;
  for (var i = 0; i < total_legs; i++) {
    bot.legs[i].set_tip_pos(current_tips_pos[i]);
  }
};
