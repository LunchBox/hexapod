function update_leg(){
    this.leg.set_servo_value(this.limb_idx, this.value);

    current_bot.after_status_change();
}

function init_controls(bot){
    this.bot = bot;

    var joystick = new JoyStick(".joystick-container", 80);

    joystick.on_handler_activated = function(){
        current_bot.gait_controller.follow(this);
    }

    joystick.on_handler_deactivated = function(){
        current_bot.gait_controller.stop();
    }


    this.controller = document.getElementById("servo_controls");


    ////// Limbs Control //////////////////
    var bot_options = get_bot_options();
    var servo_idx = 0;
    for(var idx in bot.legs){
        var limbs = bot.legs[idx].limbs;

        for (var jdx = 0; jdx < limbs.length - 1; jdx ++) {

            var limb = limbs[jdx];

            // limb.servo_value = SERVO_CURRENT_VALUE;

            if (!bot_options.leg_options[idx][limb.type].servo_idx){
                bot_options.leg_options[idx][limb.type].servo_idx = servo_idx;
            }

            limb.servo_idx = bot_options.leg_options[idx][limb.type].servo_idx;

            var control_elem = document.createElement('div');
            control_elem.setAttribute("class", "range_widget");

            // var mark_label = idx * (limbs.length - 1) + jdx + 1;
            var mark = make_input({type: "number", value: limb.servo_idx, style: "width: 3em;"});
            control_elem.appendChild(mark);
            mark.leg = bot.legs[idx];
            mark.leg_idx = idx;
            mark.limb_idx = jdx;

            mark.addEventListener("change", function(){
                var bot_options = get_bot_options();
                var limb = this.leg.limbs[this.limb_idx];
                console.log(bot_options.leg_options[this.leg_idx]);
                limb.servo_idx = bot_options.leg_options[this.leg_idx][limb.type].servo_idx = this.value;
                set_bot_options(bot_options);
            });

            // var min_input = make_input({type: "number", class: "min", value: SERVO_MIN_VALUE});
            // control_elem.appendChild(min_input);
            // limb.min_control = min_input;
            // min_input.leg = bot.legs[idx];
            // min_input.limb_idx = jdx;

            // var max_input = make_input({type: "number", class: "max", value: SERVO_MAX_VALUE});
            // control_elem.appendChild(max_input);
            // limb.max_control = max_input;
            // max_input.leg = bot.legs[idx];
            // max_input.limb_idx = jdx;

            var range_input = make_input({type: "range", class: "range", min: SERVO_MIN_VALUE, max: SERVO_MAX_VALUE, value: SERVO_CURRENT_VALUE});
            control_elem.appendChild(range_input);
            limb.range_control = range_input;
            range_input.leg = bot.legs[idx];
            range_input.limb_idx = jdx;
            range_input.addEventListener("input", update_leg);

            var current_input = make_input({type: "number", class: "current", value: SERVO_CURRENT_VALUE});
            control_elem.appendChild(current_input);
            limb.current_control = current_input;
            current_input.leg = bot.legs[idx];
            current_input.limb_idx = jdx;
            current_input.addEventListener("change", update_leg);


            /////// The end position of the limb  ///////////////////

            var end_position = getWorldPosition(bot.mesh, limbs[jdx + 1]);

            var labels = ["x", "y", "z"];
            for(var kdx in labels) {
                var label = labels[kdx];
                var rounded_value = end_position[label].toFixed(2);

                var input_field = make_input({type: "number", name: label, class: "direction end_" + label, value: rounded_value});

                if (jdx != 2) {
                    input_field.disabled = true;
                }

                control_elem.appendChild(input_field);
                limb["end_" + label + "_control"] = input_field;
                input_field.leg = bot.legs[idx];
                input_field.limb_idx = jdx;

                if (jdx == 2) {
                    input_field.addEventListener("change", function(){

                        var tibia = this.leg.tibia;
                        var new_pos = new THREE.Vector3(tibia.end_x_control.value, tibia.end_y_control.value, tibia.end_z_control.value);
                        console.log("-- plan to move to: ");
                        console.log(new_pos);

                        var calculator = new PosCalculator(this.leg, new_pos);
                        calculator.run();

                        current_bot.after_status_change();

                    });
                }

            }
            


            /////// Revert  ///////////////////

            var revert_input_options = {type: "checkbox", name: "revert_input"};
            if (bot_options.leg_options[idx][limb.type].revert) {
                revert_input_options.checked = true;
            }
            var revert_input = make_input(revert_input_options);
            control_elem.appendChild(revert_input);

            revert_input.range_input = range_input;
            revert_input.leg = bot.legs[idx];
            revert_input.leg_idx = idx;
            revert_input.limb_idx = jdx;
            // revert_input.servo_idx = servo_idx;

            var revert_label = make_label("Revert", "revert_input");
            control_elem.appendChild(revert_label);

            revert_input.addEventListener("change", function(){
                console.log("revert_input clicked, current: " + this.checked);
                this.leg.limbs[this.limb_idx].revert = this.checked;

                this.leg.set_servo_value(this.limb_idx, this.range_input.value);

                var bot_options = get_bot_options();
                var limb = this.leg.limbs[this.limb_idx];
                bot_options.leg_options[this.leg_idx][limb.type].revert = this.checked;
                set_bot_options(bot_options);
            });


            ////////////////////////////////////

            controller.appendChild(control_elem);

            servo_idx += 1;
        }
    }


    bind_btns();

}







var move_step = 5;
var rotate_step = Math.PI / 36; //144;

var handle_keydown = function(e){

    if (e.ctrlKey || e.metaKey) {
        current_bot.gait_controller.stop();
        return;
    }

    // // Hold Mode
    // if (current_bot && current_bot.gait_controller.move_mode == "move_body" && e.which == FORWARD_KEY) {  
    //     current_bot.move_body("z", -move_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "move_body" && e.which == BACKWARD_KEY) {
    //     current_bot.move_body("z", move_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "move_body" && e.which == LEFT_KEY) {
    //     current_bot.move_body("x", -move_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "move_body" && e.which == RIGHT_KEY) { 
    //     current_bot.move_body("x", move_step);
    // }

    if (current_bot && current_bot.gait_controller.move_mode == "move" && e.which == RAISE_KEY) {
        current_bot.move_body("y", move_step);
    }

    if (current_bot && current_bot.gait_controller.move_mode == "move" && e.which == FALL_KEY) {
        current_bot.move_body("y", -move_step);
    }


    // Move Mode
    if (current_bot && current_bot.gait_controller.move_mode == "move") {  
        // current_bot.gait_controller.fire_action(e.which);
        current_bot.gait_controller.expected_action = e.which;
    }



    // // Rotate Body
    // if (current_bot && current_bot.gait_controller.move_mode == "rotate_body" && e.which == FORWARD_KEY) {
    //     current_bot.rotate_body("x", -rotate_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "rotate_body" && e.which == BACKWARD_KEY) {
    //     current_bot.rotate_body("x", rotate_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "rotate_body" && e.which == LEFT_KEY) {
    //     current_bot.rotate_body("z", rotate_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "rotate_body" && e.which == RIGHT_KEY) {
    //     current_bot.rotate_body("z", -rotate_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "rotate_body" && e.which == RAISE_KEY) {
    //     current_bot.rotate_body("y", rotate_step);
    // }

    // if (current_bot && current_bot.gait_controller.move_mode == "rotate_body" && e.which == FALL_KEY) {
    //     current_bot.rotate_body("y", -rotate_step);
    // }

    
}

var handle_keyup = function(e){
    console.log(e.which);

    e.preventDefault();

    current_bot.gait_controller.stop();
}

function bind_key_events() {
    document.body.addEventListener("keydown", handle_keydown);
    document.body.addEventListener("keyup", handle_keyup);

    setInterval(function(){
        // console.log("-- main loop ---------------------------------------------");
        current_bot.gait_controller.fire_action();
    }, 30);
}


//////////////////////////////////////////////////////////////////////////////////



var CONTROL_BTN_CLASS = "control_btn";

var event_container = {};

event_container.gait_switch = function(data_value){
    current_bot.gait_controller.switch_gait(data_value);
}

event_container.action_switch = function(data_value){
    current_bot.gait_controller.switch_action_type(data_value);
}

event_container.mode_switch = function(data_value){
    current_bot.gait_controller.move_mode = data_value;
}

// 运行 gait controller 里的 action 的一个 step
event_container.act_step = function(data_value){
    current_bot.gait_controller.act(data_value); 
    console.log(current_bot.legs); 
}

// 运行 gait controller 里的 action，如果没有 stop 会一直运行下去
event_container.act_action = function(data_value){
    current_bot.gait_controller.expected_action = data_value;
    // current_bot.gait_controller.fire_action(data_value);
    console.log(current_bot.legs); 
}

event_container.act_stop_motion = function(){
    current_bot.gait_controller.stop();
}

event_container.act_motion2 = function(data_value){
    var temp_actions = {};
    temp_actions[RAISE_KEY] = function(){ current_bot.move_body("y", move_step) };
    temp_actions[FALL_KEY] = function(){ current_bot.move_body("y", - move_step) };

    temp_actions[parseInt(data_value)]();

    console.log(current_bot.legs); 
}

event_container.act_reset_configs = function(data_value) {
    set_bot_options(null);

    location.reload();
}

event_container.target_mode_switch = function(data_value) {
    current_bot.gait_controller.switch_target_mode(data_value);
}

event_container.act_disable_console = function(){
    window['console']['log'] = function(){};
}

event_container.act_draw_type_switch = function(data_value){
    var status = current_bot.get_status();
    current_bot.draw_type = data_value;
    scene.remove(current_bot.mesh);

    current_bot.draw();
    current_bot.apply_status(status);
}

event_container.act_expend = function(){
    current_bot.tip_circle_scale += 0.1;
}
event_container.act_compact = function(){
    current_bot.tip_circle_scale -= 0.1;
}


event_container.act_send_cmd = function(){
    current_bot.send_status();
}

event_container.act_sync_cmd = function(data_value){
    current_bot.sync_cmd = data_value == "sync" ? true : false;
}




var playing_status = false;
var play_status_identify = null;
var play_status_idx = 0;

function play_status(){
    var rows = document.querySelectorAll("#status_history .sv_row");
    var status = rows[play_status_idx].data_value;
    current_bot.apply_status(status);

    play_status_idx += 1;
    if (play_status_idx >= rows.length){
        play_status_idx = 0;
    }

    var next_idx = play_status_idx + 1;
    if (next_idx >= rows.length){
        next_idx = 0;
    }
    var next_status = rows[next_idx].data_value;

    var interval = current_bot.get_min_interval(next_status.servo_values, status.servo_values);

    if (playing_status){
        if (play_status_identify){
            clearTimeout(play_status_identify);
            play_status_identify = null;
        }

        play_status_identify = setTimeout(function(){ 
            play_status();
        }, interval);
    } else {
        if (play_status_identify){
            clearTimeout(play_status_identify);
            play_status_identify = null;
        }
    }
}

event_container.act_play_status = function(){
    console.log("-- play status fired");
    playing_status = true;
    play_status();
}



function bind_btns(){
    var btns = document.querySelectorAll("." + CONTROL_BTN_CLASS);
    Array.prototype.forEach.call(btns, function(btn){
        btn.addEventListener("click", function(e){
            e.preventDefault();

            var data_type = this.getAttribute("data-type");
            var is_switch = (data_type == "switch");

            var action_name = this.getAttribute("data-action");

            if (is_switch){
                var naber_selector = "[data-action='" + action_name + "']";
                // console.log(naber_selector);

                var nabers = document.querySelectorAll(naber_selector);
                Array.prototype.forEach.call(nabers, function(naber){
                    remove_class(naber, "active");
                });
            }

            event_container[action_name](this.getAttribute("data-value"));

            if (is_switch){
                add_class(this, "active");
            }

            return false;
        });
    });
}







