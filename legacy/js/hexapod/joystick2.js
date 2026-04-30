 function JoyStick(container_selector, radius){
    this.container = document.querySelector(container_selector);

    this.handler_activated = false;

    this.radius = radius;
    this.margin = 20;

    this.center_x = this.radius + this.margin;
    this.center_y = this.radius + this.margin;

    this.handler_radius = 20;
    this.handler_x = this.center_x;
    this.handler_y = this.center_y;

    this.make_componemts();

    this.last_page_x;
    this.last_page_y;

    this.reset_handler();

    this.bind_events();
}

JoyStick.prototype.make_componemts = function(){
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.center_x * 2;
    this.canvas.height = this.center_y * 2;
    this.container.appendChild(this.canvas);

    this.context = this.canvas.getContext('2d');

    this.draw();
}

JoyStick.prototype.draw = function(){
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // range
    this.context.beginPath();
    this.context.lineWidth = 1;
    this.context.strokeStyle = '#333';

    this.context.arc(this.center_x, this.center_y, this.radius, 0, 2 * Math.PI, false);
    
    this.context.stroke();
    this.context.closePath();

    // handler
    this.context.beginPath();
    this.context.lineWidth = 3;
    this.context.strokeStyle = '#333';

    this.context.arc(this.handler_x, this.handler_y, this.handler_radius, 0, 2 * Math.PI, false);
    
    this.context.stroke();
    this.context.closePath();

    this.pos = this.translate_position();
    var msg = "x: " + this.pos.x.toFixed(1) + " y: " + this.pos.y.toFixed(1) + " radius: " + Math.sqrt(Math.pow(this.pos.x, 2) + Math.pow(this.pos.y, 2)).toFixed(1);
    this.context.fillText(msg, 2, 12);
}

JoyStick.prototype.translate_position = function(){
    return {x: this.handler_x - this.center_x, y: this.handler_y - this.center_y};
}

JoyStick.prototype.reset_handler = function(){
    this.handler_x = this.center_x;
    this.handler_y = this.center_y;

    this.handler_activated = false;

    this.draw();
    this.on_handler_deactivated();
}

JoyStick.prototype.handle_down = function(e_page_x, e_page_y){
    var related_x = e_page_x - this.canvas.offsetLeft - this.center_x;
    var related_y = e_page_y - this.canvas.offsetTop - this.center_y;

    if (Math.sqrt(Math.pow(related_x, 2) + Math.pow(related_y, 2)) < this.handler_radius){
        this.handler_activated = true;
    }
}

JoyStick.prototype.handle_move = function(e_page_x, e_page_y){
    // eventPage_container.innerHTML = "pageX: " + e.pageX + " pageY: " + e.pageY; 
    
    if (this.handler_activated){

        var delta_x = 0;
        var delta_y = 0;

        if (typeof(this.last_page_x) != "undefined"){
            delta_x = e_page_x - this.last_page_x;
            delta_y = e_page_y - this.last_page_y;
        }

        var target_x = this.handler_x + delta_x;
        var target_y = this.handler_y + delta_y;

        // out range
        var target_radius =Math.sqrt(Math.pow(target_x - this.center_x, 2) + Math.pow(target_y - this.center_y, 2));
        if(target_radius > this.radius) {
            var rate = 1.0 * this.radius / target_radius;
            this.handler_x = this.center_x + (target_x - this.center_x) * rate;
            this.handler_y = this.center_y + (target_y - this.center_y) * rate;
        } else {
            this.handler_x = target_x;
            this.handler_y = target_y;
        }

        this.draw();
        this.on_handler_activated();
    }

    this.last_page_x = e_page_x;
    this.last_page_y = e_page_y;
}

JoyStick.prototype.mouse_move = function(e){
    // eventPage_container.innerHTML = "pageX: " + e.pageX + " pageY: " + e.pageY; 
    e.preventDefault();
    
    this.handle_move(e.pageX, e.pageY);
}


JoyStick.prototype.mouse_down = function(e){
    console.log("mouse down");
    e.preventDefault();

    this.handle_down(e.pageX, e.pageY);
}

JoyStick.prototype.mouse_up = function(e){
    console.log("mouse up");
    e.preventDefault();

    this.reset_handler();
}


JoyStick.prototype.touch_start = function(e){
    console.log("touch down");
    e.preventDefault();

    this.handler_activated = true;
}

JoyStick.prototype.touch_move = function(e){
    e.preventDefault();

    var touchobj = e.changedTouches[0];
    this.handle_move(touchobj.pageX, touchobj.pageY);
}

JoyStick.prototype.touch_end = function(e){
    console.log("mouse up");
    e.preventDefault();

    this.reset_handler();
}




JoyStick.prototype.on_handler_activated = function(){};
JoyStick.prototype.on_handler_deactivated = function(){};

JoyStick.prototype.bind_events = function(e){
    this.canvas.addEventListener("mousemove", function(e){
        this.mouse_move(e);
    }.bind(this), false);

    this.canvas.addEventListener("mousedown", function(e){
        this.mouse_down(e);
    }.bind(this), false);

    this.canvas.addEventListener("mouseup", function(e){
        this.mouse_up(e);
    }.bind(this), false);

    // // for touch screen

    // this.rocker.addEventListener("touchmove", function(e){
    //     this.touch_move(e);
    // }.bind(this), false);

    // this.handler.addEventListener("touchstart", function(e){
    //     this.touch_start(e);
    // }.bind(this), false);

    // this.handler.addEventListener("touchend", function(e){
    //     this.touch_end(e);
    // }.bind(this), false);
}