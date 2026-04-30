

function Hexapod(scene, options){
    // this.options = options;
    this.apply_attributes(options);

    // this.color = 0x333333;

    this.draw_types = ["mesh", "bone", "points"];
    this.draw_type = "mesh";

    // for calculate tips offset
    this.tip_circle_scale = 1;

    // cache the servo values, for calculate the minimun time interval to next servo values
    
    this.socket = io('http://localhost:8888', {reconnection: false});
    this.socket.on('message', function(data){
        console.log(data.message);
    });
    this.socket.on('disconnect', function(data){
        console.log("-- lost socket connect.");
    });
    this.sync_cmd = false;

    return this;
}

Hexapod.prototype.apply_attributes = function(options){
    this.options = options;

    this.rotate_step = this.options.rotate_step; // in radius
    this.fb_step = this.options.fb_step; // real body move is move_step / leg_groups.length * 3
    this.lr_step = this.options.lr_step;

    if (this.mesh){
        scene.remove(this.mesh);
    }

    this.draw();

    this.gait_controller = new GaitController(this);

    this.on_servo_values = this.get_servo_values();
}

Hexapod.prototype.draw = function(){
    this.mesh = new THREE.Object3D();
    scene.add(this.mesh);

    this.body_mesh = this.draw_body();
    this.mesh.add( this.body_mesh );
    
    this.legs = [];
    for (var idx in this.options.leg_options) {
        var leg = new HexapodLeg(this, this.options.leg_options[idx]);

        this.body_mesh.add(leg.mesh);
        this.legs.push(leg);
    }

    this.laydown();
    this.putdown_tips();

    this.draw_gait_guide();
    this.draw_gait_guidelines();

    // var egh = new THREE.EdgesHelper( this.body_mesh, 0x00ffff );
    // egh.material.linewidth = 1;
    // scene.add( egh );

    // helper = new THREE.WireframeHelper( this.body_mesh );
    // helper.material.color.set( 0x0000ff );
    // scene.add( helper );
}

Hexapod.prototype.draw_body = function(){
    var geometry, mesh, axisHelper;

    var color = this.options.color ? this.options.color : 0x333333;

    switch(this.draw_type) {
    case "bone":
        material = new THREE.LineBasicMaterial( { color: color } );

        geometry = new THREE.Geometry();
        for (var i in this.options.leg_options){
            var opt = this.options.leg_options[i];
            geometry.vertices.push(new THREE.Vector3(opt.mirror * opt.x, opt.y, opt.mirror * opt.z));
        }
        mesh = new THREE.Line( geometry, material );
        break;
    case "points":
        material = new THREE.PointsMaterial( { color: color } );

        geometry = new THREE.Geometry();
        for (var i in this.options.leg_options){
            var opt = this.options.leg_options[i];
            geometry.vertices.push(new THREE.Vector3(opt.mirror * opt.x, opt.y, opt.mirror * opt.z));
        }
        mesh = new THREE.Points( geometry, material );
        break;
    default:
        material = new THREE.MeshBasicMaterial( { color: color } );

        geometry = new THREE.BoxGeometry( this.options.body_width, this.options.body_height, this.options.body_length );
        // geometry = new THREE.CylinderGeometry( this.options.body_width, this.options.body_width, this.options.body_height, 16 );
        mesh = new THREE.Mesh( geometry, material );
        axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.position.y = this.options.body_height / 2; // + this.options.body_height_offset;
    return mesh;
}



Hexapod.prototype.draw_gait_guide = function(){
    // console.log("-------hello");
    // this.mesh.updateMatrixWorld();

    var material = new THREE.PointsMaterial( { color: 0x000000, size: 20 } );
    var geometry = new THREE.Geometry();

    var total_legs = this.legs.length;      
    for(var i = 0; i < total_legs; i++) {
        geometry.vertices.push(this.legs[i].get_tip_pos());
    }
    geometry.vertices.push(new THREE.Vector3(0, 0, 0));

    this.guide_pos = new THREE.Points( geometry, material );

    this.mesh.add(this.guide_pos);
}

Hexapod.prototype.reset_guide_pos = function(){
    var gp = this.guide_pos;
    gp.position.set(0, 0, 0);
    gp.rotation.set(0, 0, 0);
    gp.scale.set(1, 1, 1);
}

Hexapod.prototype.get_guide_pos = function(leg_idx){
    this.guide_pos.scale.set(this.tip_circle_scale, this.tip_circle_scale, this.tip_circle_scale);

    this.mesh.updateMatrixWorld();

    var vector = this.guide_pos.geometry.vertices[leg_idx].clone();
    vector.applyMatrix4( this.guide_pos.matrixWorld );
    return vector;
}

Hexapod.prototype.draw_gait_guidelines = function(){
    this.mesh.updateMatrixWorld();

    var material = new THREE.LineBasicMaterial({color: 0xcc3300});
    this.guideline = new THREE.Object3D();
    for (var idx in this.legs) {
        var geometry = new THREE.Geometry();

        var mesh_pos = this.mesh.position.clone();

        var tip_pos = this.legs[idx].get_tip_pos();

        geometry.vertices.push(
            mesh_pos,
            tip_pos
        );

        var line = new THREE.Line(geometry, material);
        this.guideline.add(line);
    }
    this.mesh.add(this.guideline);

    this.left_gl = this.guideline.clone();
    this.left_gl.rotation.y = this.rotate_step;
    this.mesh.add(this.left_gl);

    this.right_gl = this.guideline.clone();
    this.right_gl.rotation.y = - this.rotate_step;
    this.mesh.add(this.right_gl);
}

Hexapod.prototype.adjust_gait_guidelines = function(){
    this.left_gl.rotation.y = this.rotate_step;
    this.right_gl.rotation.y = - this.rotate_step;
}

Hexapod.prototype.get_servo_values = function(leg_idxs){
    var values = [];       
    var total_legs = this.legs.length;      
    for(var i = 0; i < total_legs; i++) {
        var leg = this.legs[i];
        values.push(leg.coxa.servo_value);
        values.push(leg.femur.servo_value);
        values.push(leg.tibia.servo_value);
    }
    return values;
}

Hexapod.prototype.get_status = function(){
    var status = {
        "mesh": {
            "position": this.mesh.position.clone(),
            "rotation": this.mesh.rotation.clone()
        },
        "body_mesh": {
            "position": this.body_mesh.position.clone(),
            "rotation": this.body_mesh.rotation.clone()
        },
        "center_offset": this.center_offset,
        "servo_values": this.get_servo_values() // store the servo values but may not need to apply it?
    }

    status["legs"] = {};
    var limbs = ["coxa", "femur", "tibia"];
    var total_legs = this.legs.length; 
    for(var i = 0; i < total_legs; i++) {
        var leg = this.legs[i];
        status["legs"][i] = {
            "on_floor": leg.on_floor
        }

        for (var j in limbs){
            limb_idx = limbs[j];
            limb = this.legs[i][limb_idx];
            status["legs"][i][limb_idx] = {
                "position": limb.position.clone(),
                "rotation": limb.rotation.clone(),
                "servo_value": limb.servo_value,
                "servo_idx": limb.servo_idx
            }
        }
    }


    return status;
}

Hexapod.prototype.get_min_interval = function(new_servo_values, old_servo_values){
    var len = new_servo_values.length;
    var intervals = [DEFAULT_FRAMES_INTERVAL];
    for(var i = 0; i < len; i++) {
        // var temp = Math.abs(new_servo_values[i] - old_servo_values[i]) / MAX_SERVO_VALUE_UNIT;
        var temp = Math.abs(new_servo_values[i] - old_servo_values[i]) * SERVO_VALUE_TIME_UNIT;
        intervals.push(temp);
    }
    return Math.round(Math.max.apply(null, intervals));
}   

Hexapod.prototype.apply_status = function(status){
    apply_xyz(this.mesh.position, status.mesh.position);
    apply_xyz(this.mesh.rotation, status.mesh.rotation);

    apply_xyz(this.body_mesh.position, status.body_mesh.position);
    apply_xyz(this.body_mesh.rotation, status.body_mesh.rotation);

    this.center_offset = status.center_offset;

    var limb_names = ["coxa", "femur", "tibia"];
    var total_limb_names = limb_names.length;
    var total_legs = this.legs.length; 
    for(var i = 0; i < total_legs; i++) {
        var leg = this.legs[i];
        var leg_status = status["legs"][i];

        leg.on_floor = leg_status.on_floor;

        for(var j = 0; j < total_limb_names; j++) {
            limb_name = limb_names[j];
            limb = leg[limb_name];
            limb_status = leg_status[limb_name];

            apply_xyz(limb.position, limb_status.position);
            apply_xyz(limb.rotation, limb_status.rotation);

            limb.servo_value = limb_status.servo_value;
            limb.servo_idx = limb_status.servo_idx;
        }
    }
    return status;
}

Hexapod.prototype.format_servo_values = function(servo_values){
    var formatted_value = [];
    var total_values = servo_values.length;
    for(var idx = 0; idx < total_values; idx ++) {
        var i = Math.floor(idx / 3);
        var j = idx % 3;

        formatted_value.push("#" + this.legs[i].limbs[j].servo_idx + " P"  + servo_values[idx]);
    }
    return formatted_value.join(" ");
}

Hexapod.prototype.display_status = function(container){
    var servo_values = this.get_servo_values();

    var row = document.createElement('div');
    row.setAttribute("class", "sv_row");
    container.appendChild(row);

    row.data_value = this.get_status();

    var data = document.createElement('div');
    data.setAttribute("class", "data");
    data.innerHTML = this.format_servo_values(servo_values);
    row.appendChild(data);

    

    row.addEventListener("dblclick", function(){
        current_bot.apply_status(this.data_value);

        Array.prototype.forEach.call(document.querySelectorAll(".sv_row.active"), function(elem){
            remove_class(elem, "active");
        });
        add_class(this, "active");

        clearSelection();
    });

    // scroll to bottom;
    container.scrollTop = container.scrollHeight;
}

Hexapod.prototype.get_tip_pos = function(){
    var tips_pos = [];  
    var total_legs = this.legs.length;
    for(var i = 0; i < total_legs; i++){
        tips_pos.push(this.legs[i].get_tip_pos());
    }
    return tips_pos;
}


// ---------- motions ----------------------------------------------

Hexapod.prototype.move_body = function(direction, distance){
    var current_tips_pos = this.get_tip_pos();
    
    this.body_mesh.position[direction] += distance;

    var total_legs = this.legs.length;
    for(var i = 0; i < total_legs; i++){
        this.legs[i].set_tip_pos(current_tips_pos[i]);
    }
    
    this.after_status_change();
}

Hexapod.prototype.float = function(direction, distance){
    this.mesh.position[direction] += distance;

    this.after_status_change();
}

// put lowest tip on floor;
Hexapod.prototype.laydown = function(){
    console.log("-- laydown fired");

    var tip_pos;
    var total_legs = this.legs.length;
    var ys = [];
    for(var i = 0; i < total_legs; i++){
        tip_pos = this.legs[i].get_tip_pos();

        ys.push(tip_pos.y);
    }

    var min_y = Math.min.apply(null, ys);
    this.body_mesh.position.y -= min_y;

    this.after_status_change();
}

Hexapod.prototype.putdown_tips = function(){
    console.log("-- putdown tips fired");
    var tip_pos;
    var total_legs = this.legs.length;
    for(var i = 0; i < total_legs; i++){
        tip_pos = this.legs[i].get_tip_pos();
        tip_pos.y = 0;

        this.legs[i].set_tip_pos(tip_pos);
    }

    this.after_status_change();
}

Hexapod.prototype.rotate_body = function(direction, radius){

    var current_tips_pos = this.get_tip_pos();

    this.body_mesh.rotation[direction] += radius;

    this.body_mesh.updateMatrixWorld();

    var total_legs = this.legs.length;
    for(var i = 0; i < total_legs; i++){
        this.legs[i].set_tip_pos(current_tips_pos[i]);
    }

    this.after_status_change();
}

///  -------------------------------------------------------------------------------------------------------------

Hexapod.prototype.after_status_change = function(send_cmd){
    // console.log(send_cmd);
    // console.log("-- after status changed");

    // update the UI
    this.display_values();

    // send the status
    var servo_values = this.get_servo_values();
    var cmd = this.build_cmd(servo_values);
    document.querySelector("#servo_values").innerHTML = cmd;

    // sync status to physical bot
    if (this.sync_cmd){

        if (typeof(send_cmd) == "undefined" || send_cmd){
            this.send_cmd(cmd);
        
            // hold the actions for the bot to execute the cmd;
            this.hold_time = this.get_min_interval(servo_values, this.on_servo_values);
            // this.hold_time = 10;

            this.on_servo_values = servo_values;
        } else {
            this.hold_time = 0;
        }
    } else {
        this.hold_time = 0;
    }

    if (this.on_servo_values){
        document.querySelector("#on_servo_values").innerHTML = this.format_servo_values(this.on_servo_values);
    } 

    // record the status
    var container = document.querySelector("#status_history");
    this.display_status(container);

    this.draw_time_interval(this.hold_time);    
}

Hexapod.prototype.send_status = function(){
    // display commands
    var servo_values = this.get_servo_values();
    var cmd = this.build_cmd(servo_values);

    document.querySelector("#servo_values").innerHTML = cmd;
    
    this.send_cmd(cmd);
    this.on_servo_values = servo_values;

    if (this.on_servo_values){
        document.querySelector("#on_servo_values").innerHTML = this.format_servo_values(this.on_servo_values);
    }
}

Hexapod.prototype.display_values = function(){

    var limb, next_limb, servo_value, vector;
    var total_legs = this.legs.length;
    for(var i = 0; i < total_legs; i++){
        for (var jdx in this.legs[i].limbs){
            limb = this.legs[i].limbs[jdx];
            servo_value = limb.servo_value;

            if (limb.range_control){
                limb.range_control.value = servo_value;
                limb.current_control.value = servo_value;
            }


            next_limb = this.legs[i].limbs[parseInt(jdx) + 1];
            if (next_limb && limb.end_x_control){
                vector = getWorldPosition(this.mesh, next_limb);

                limb.end_x_control.value = vector.x.toFixed(2);
                limb.end_y_control.value = vector.y.toFixed(2);
                limb.end_z_control.value = vector.z.toFixed(2);
            }
        }
    }
}

Hexapod.prototype.build_cmd = function(servo_values){
    var cmd = this.format_servo_values(servo_values);

    if (this.on_servo_values) {
        var interval = this.get_min_interval(servo_values, this.on_servo_values);
        cmd += " T" + interval;
    } else {
        cmd += " T500";
    }

    return cmd;
}  

// Hexapod.prototype.send_status = function(){
//     this.sync_cmd = false;

//     var servo_values = this.get_servo_values();
//     var cmd = this.build_cmd(servo_values);

//     this.send_cmd(cmd);
//     this.on_servo_values = servo_values;

//     // var container = document.querySelector("#status_history");
//     // this.display_status();
//     // this.after_status_change();
// }

Hexapod.prototype.send_cmd = function(cmd){
    console.log("-- send_cmd fired.")
    // console.log(cmd);

    if (this.socket.connected){
        this.socket.emit('client_data', { str: cmd });
    }
}   

Hexapod.prototype.draw_time_interval = function(time_interval){
    var canvas = document.getElementById('chart');
    var context = canvas.getContext('2d');
    context.fillStyle = '#333';

    var max_number = 100;
    var scale = 1/2;
    var gap = Math.round((canvas.width - 60) / max_number);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "12px Arial";

    // crap!
    context.beginPath();
    context.rect(0, 25, canvas.width, 0.5);
    context.fillText(25 / scale, 0, canvas.height - 25 + 4);
    context.rect(0, 50, canvas.width, 0.5);
    context.fillText(50 / scale, 0, canvas.height - 50 + 4);
    context.rect(0, 75, canvas.width, 0.5);
    context.fillText(75 / scale, 0, canvas.height - 75 + 4);
    context.fillStyle = '#ccc';
    context.fill();

    if (time_interval < 1){
        return;
    }

    if (!this.time_interval_stack){
        this.time_interval_stack = [];
    }

    this.time_interval_stack.push(time_interval);    

    if (this.time_interval_stack.length > max_number){
        this.time_interval_stack = this.time_interval_stack.slice(this.time_interval_stack.length - max_number, max_number);
    }

    var total = 0;
    for (var i = 0; i < this.time_interval_stack.length; i++){
        var h = this.time_interval_stack[i] * scale; // * canvas.height / 200.0; // normalize
        total += this.time_interval_stack[i];

        context.beginPath();
        context.rect(i * gap + 30, canvas.height - h, 0.5, h);
        context.fillStyle = '#333';
        context.fill();
    }

    var avg = (total / this.time_interval_stack.length).toFixed(2);
    context.fillText("average: " + avg + "ms", 2, 12);
    
}

function HexapodLeg(bot, options){
    // console.log(options);

    this.bot = bot;
    this.options = options;
    this.mesh = new THREE.Object3D();
    // this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mirror = options.mirror;

    ////////////////////// for gait moving mark

    this.on_floor = true;

    this.center_offset = 0; 

    this.color = 0xbb1100;

    // coxa
    this.coxa = this.draw_coxa();
    this.mesh.add(this.coxa);

    // femur
    this.femur = this.draw_femur();
    this.coxa.add(this.femur);

    // tibia
    this.tibia = this.draw_tibia();
    this.femur.add(this.tibia);
    

    // tip
    geometry = new THREE.Geometry();
    geometry.vertices.push(new THREE.Vector3(0, 0, 0));
    var tip = new THREE.Points(geometry, new THREE.PointsMaterial());
    tip.type = "tip";

    tip.position.y = options.tibia.length;
    tip.visible = false;

    this.tibia.add(tip);

    this.tip = tip;

    this.limbs = [this.coxa, this.femur, this.tibia, this.tip];

    return this;
}

HexapodLeg.prototype.draw_coxa = function(){
    var geometry, mesh, axisHelper;

    switch(this.bot.draw_type) {
    case "bone":
        material = new THREE.LineBasicMaterial( { color: this.color } );

        geometry = new THREE.Geometry();
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.coxa.length / 2, 0) );
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.coxa.length, 0));

        mesh = new THREE.Line(geometry, material);
        break;
    case "points":
        material = new THREE.PointsMaterial( { color: this.color } );

        geometry = new THREE.Geometry();
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.coxa.length / 2, 0) );
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.coxa.length, 0));

        mesh = new THREE.Points(geometry, material);
        break;
    default:
        material = new THREE.MeshBasicMaterial( { color: this.color } );

        geometry = new THREE.BoxGeometry( this.options.coxa.radius, this.options.coxa.length, this.options.coxa.radius);
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.coxa.length / 2, 0) );
        mesh = new THREE.Mesh( geometry, material);

        axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.type = "coxa";

    mesh.position.x = this.options.mirror * this.options.x;
    mesh.position.y = this.options.y;
    mesh.position.z = this.options.z;

    mesh.rotation.z = - this.options.mirror * Math.PI / 2;
    mesh.rotation.y = this.options.mirror * degree_to_redius(this.options.coxa.init_angle); //mirror * coxa_init_angle;
    // mesh.rotation.z += - this.options.mirror * Math.PI / 12;

    mesh.init_radius = degree_to_redius(this.options.coxa.init_angle);
    mesh.init_angle = this.options.coxa.init_angle;

    mesh.servo_value = this.options.coxa.servo_value;
    mesh.servo_idx = this.options.coxa.servo_idx;
    mesh.revert = this.options.coxa.revert;
    
    return mesh;
}

HexapodLeg.prototype.draw_femur = function(){
    var geometry, mesh, axisHelper;

    switch(this.bot.draw_type) {
    case "bone":
        material = new THREE.LineBasicMaterial( { color: this.color } );

        geometry = new THREE.Geometry();
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.femur.length / 2,0) );
    
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.femur.length, 0));

        mesh = new THREE.Line( geometry, material );
        break;
    case "points":
        material = new THREE.PointsMaterial( { color: this.color } );

        geometry = new THREE.Geometry();
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.femur.length / 2,0) );
    
        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.femur.length, 0));

        mesh = new THREE.Points( geometry, material );
        break;
    default:
        material = new THREE.MeshBasicMaterial( { color: this.color } );

        geometry = new THREE.BoxGeometry( this.options.femur.radius, this.options.femur.length, this.options.femur.radius);
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.femur.length / 2,0) );
        mesh = new THREE.Mesh( geometry, material );

        axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.type = "femur";

    mesh.position.y = this.options.coxa.length;
    mesh.rotation.z = this.options.mirror * degree_to_redius(this.options.femur.init_angle);
    mesh.init_radius = degree_to_redius(this.options.femur.init_angle);
    mesh.init_angle = this.options.femur.init_angle;

    mesh.servo_value = this.options.femur.servo_value;
    mesh.servo_idx = this.options.femur.servo_idx;
    mesh.revert = this.options.femur.revert;

    return mesh;
}

HexapodLeg.prototype.draw_tibia = function(){
    var geometry, mesh, axisHelper;

    switch(this.bot.draw_type) {
    case "bone":
        material = new THREE.LineBasicMaterial( { color: this.color } );

        geometry = new THREE.Geometry();
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.tibia.length / 2,0) );

        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.tibia.length, 0));

        mesh = new THREE.Line( geometry, material );
        break;
    case "points":
        material = new THREE.PointsMaterial( { color: this.color } );

        geometry = new THREE.Geometry();
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.tibia.length / 2,0) );

        geometry.vertices.push(new THREE.Vector3(0, 0, 0));
        geometry.vertices.push(new THREE.Vector3(0, this.options.tibia.length, 0));

        mesh = new THREE.Points( geometry, material );
        break;
    default:
        material = new THREE.MeshBasicMaterial( { color: this.color } );

        geometry = new THREE.BoxGeometry( this.options.tibia.radius, this.options.tibia.length, this.options.tibia.radius);
        geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, this.options.tibia.length / 2,0) );
        mesh = new THREE.Mesh( geometry, material );

        axisHelper = new THREE.AxisHelper(30);
        mesh.add(axisHelper);
    }

    mesh.type = "tibia";

    mesh.position.y = this.options.femur.length;
    mesh.rotation.z = this.options.mirror * degree_to_redius(this.options.tibia.init_angle);
    mesh.init_radius = degree_to_redius(this.options.tibia.init_angle);
    mesh.init_angle = this.options.tibia.init_angle;

    mesh.servo_value = this.options.tibia.servo_value;
    mesh.servo_idx = this.options.tibia.servo_idx;
    mesh.revert = this.options.tibia.revert;
    
    return mesh;
}



HexapodLeg.prototype.set_init_angle = function(limb_idx, angle){
    var ori_radius = this.limbs[limb_idx].init_radius;
    console.log("ori radius: " + ori_radius);

    var new_radius = degree_to_redius(angle);
    console.log("new radius: " + new_radius);

    var limb_mesh = this.limbs[limb_idx];
    limb_mesh.init_radius = new_radius;

    if (limb_idx == 0) {
        limb_mesh.rotation.y = this.mirror * new_radius;
    } else {
        limb_mesh.rotation.z = this.mirror * new_radius;
    }
}

HexapodLeg.prototype.get_angle = function(limb_idx){
    var limb = this.limbs[limb_idx];

    if (limb_idx == 0){
        return this.mirror * limb.rotation.y / Math.PI * 180;
    } else {
        return this.mirror * limb.rotation.z / Math.PI * 180;
    }
}

HexapodLeg.prototype.set_angle = function(limb_idx, angle){
    var limb = this.limbs[limb_idx];

    var current_angle = this.get_angle(limb_idx);

    var diff_servo_value = this.mirror * ((SERVO_MAX_VALUE - SERVO_MIN_VALUE) / 2) * (angle - current_angle) / 90;

    var new_servo_value = limb.servo_value + diff_servo_value;

    this.set_servo_value(limb_idx, new_servo_value);
}

HexapodLeg.prototype.set_servo_values = function(values){
    var total_values = values.length;
    for(var i = 0; i < total_values; i++) {
        this.set_servo_value(i, values[i]);
    }
}

HexapodLeg.prototype.set_servo_value = function(limb_idx, value){

    var delta = value - (SERVO_MAX_VALUE - SERVO_MIN_VALUE) / 2 - SERVO_MIN_VALUE;

    var delta_radius = ((1.0 * delta) / (SERVO_MAX_VALUE - SERVO_MIN_VALUE)) * Math.PI;

    var limb_mesh = this.limbs[limb_idx];

    if (limb_mesh.revert) {
        delta_radius *= -1;
    }
    
    if (limb_idx == 0) {
        limb_mesh.rotation.y = this.mirror * limb_mesh.init_radius + delta_radius;
    } else {
        limb_mesh.rotation.z = this.mirror * limb_mesh.init_radius + delta_radius;
    }
    
    var _value = Math.round(value);
    this.limbs[limb_idx].servo_value = _value;

}

HexapodLeg.prototype.get_tip_pos = function() {
    return getWorldPosition(this.bot.mesh, this.tip);
}

HexapodLeg.prototype.set_tip_pos = function(new_pos){
    var calculator = new PosCalculator(this, new_pos);
    return calculator.run();
}


function get_bot_options(){
    var options = get_obj_from_local_storage(HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS);

        // get rid of these !!!
    for (var i = 0; i < options.leg_options.length; i++){
        var leg_option = options.leg_options[i];
        if (typeof(leg_option.coxa.servo_idx) == "undefined"){
            leg_option.coxa.servo_idx = options.first_servo_idx + i * 3;
        }
        if (typeof(leg_option.femur.servo_idx) == "undefined"){
            leg_option.femur.servo_idx = options.first_servo_idx + i * 3 + 1;
        }
        if (typeof(leg_option.tibia.servo_idx) == "undefined"){
            leg_option.tibia.servo_idx = options.first_servo_idx + i * 3 + 2;
        }
    }

    return options;
}

function set_bot_options(hexapod_options){
    set_obj_to_local_storage(HEXAPOD_OPTIONS_KEY, hexapod_options);
}

function build_bot(bot_options){
    var bot = new Hexapod(scene, bot_options);
    return bot;  
}
