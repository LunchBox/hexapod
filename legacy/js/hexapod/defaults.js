

var current_bot;

///////////////////////////////////

var FORWARD_KEY = 87;   // w
var BACKWARD_KEY = 83;  // s
var LEFT_KEY = 65;      // a
var RIGHT_KEY = 68;     // d

// var HIGHER_KEY = 84;        // t, top
// var LOWER_KEY = 66;      // b, bottom


var MOVE_LEFT_KEY = 90; // z
var MOVE_RIGHT_KEY = 67; // c

var RAISE_KEY = 82; // r
var FALL_KEY = 70; // f


////////////////////////////////////


var FRAMES_KEY = "frames"; // frames db

var RUN_FRAMES = false;

var ANIMATE_TIMER = 0;
var DEFAULT_FRAMES_INTERVAL = 10;	// ms, better greater than 100, calculation might take more than 100 ms
var SEND_CMD_INTERVAL = 100;

var ANGLE_RANGE = 180; // degree
var SERVO_MIN_VALUE = 500;
var SERVO_MAX_VALUE = 2500;
var SERVO_CURRENT_VALUE = 1500;

// maximum servo angle change per ms
var MAX_ANGLE_UNIT = 60 / 120;   // 60 degree per 0.12 sec
// maximun servo value changes per ms
// var MAX_SERVO_VALUE_UNIT = MAX_ANGLE_UNIT * (SERVO_MAX_VALUE - SERVO_MIN_VALUE) / ANGLE_RANGE / 2; 
var SERVO_VALUE_TIME_UNIT = 120 / 60 * ANGLE_RANGE / (SERVO_MAX_VALUE - SERVO_MIN_VALUE);


var DIST_ERROR = 0.2;

var DEFAULT_MOVE_STEP = 30;


var SERVO_OPTIONS_KEY = "servo_options";

var HEXAPOD_OPTIONS_KEY = "hexapod_options";

// the middle pair legs position at middle of the length by default, could be chagne at the leg options.
var DEFAULT_BODY_WIDTH = 50;
var DEFAULT_BODY_LENGTH = 100; // DEFAULT_BODY_WIDTH * Math.sqrt(3);
var DEFAULT_BODY_HEIGHT = 20;

// // initial body height;
// var BODY_HEIGHT_OFFSET = 30;

// leg parameters
// http://masters.donntu.org/2014/etf/zhdanov/library/images/article9/article9_pic2.PNG
var DEFAULT_COXA_LENGTH = 32;
var DEFAULT_COXA_RADIUS = 10; // 粗細

var DEFAULT_FEMUR_LENGTH = 45;
var DEFAULT_FEMUR_RADIUS = 12;

var DEFAULT_TIBIA_LENGTH = 62;
var DEFAULT_TIBIA_RADIUS = 10;


// initial angle of 6 legs when servo_value is 1500/SERVO_CURRENT_VALUE, 
// init angle better the same as the angle above;
var DEFAULT_COXA_INIT_ANGLE = 30; // 45; // 0;
var DEFAULT_FEMUR_INIT_ANGLE = 30; // 35;
var DEFAULT_TIBIA_INIT_ANGLE = - 105; // -38; 

var COXA = 0;
var FEMUR = 1;
var TIBIA = 2;

var DEFAULT_HEXAPOD_OPTIONS = {

    body_width: DEFAULT_BODY_WIDTH,
    body_length: DEFAULT_BODY_LENGTH,
    body_height: DEFAULT_BODY_HEIGHT,

    // body_height_offset: BODY_HEIGHT_OFFSET,

    coxa_length: DEFAULT_COXA_LENGTH,
    femur_length: DEFAULT_FEMUR_LENGTH,
    tibia_length: DEFAULT_TIBIA_LENGTH,

    color: 0x333333,

    rotate_step: Math.PI / 18,
    fb_step: 15, // forward & backward step
    lr_step: 10, // left & right step
    up_step: 10,

    first_servo_idx: 0,

    leg_options: [
	    // left side 
	    {   x: DEFAULT_BODY_WIDTH / 2, 
	        y: 0, 
	        z: - DEFAULT_BODY_LENGTH / 2, 

	        coxa: {
	        	length: DEFAULT_COXA_LENGTH,
	        	radius: DEFAULT_COXA_RADIUS,
	        	init_angle: DEFAULT_COXA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 0,
	        	revert: false
	        }, 

	        femur: {
	        	length: DEFAULT_FEMUR_LENGTH,
	        	radius: DEFAULT_FEMUR_RADIUS,
	        	init_angle: DEFAULT_FEMUR_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 1,
	        	revert: false
	        },

	        tibia: {
	        	length: DEFAULT_TIBIA_LENGTH,
	        	radius: DEFAULT_TIBIA_RADIUS,
	        	init_angle: DEFAULT_TIBIA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 2,
	        	revert: false
	        },
	        
	        mirror: -1
	    }, 
	    {   x: DEFAULT_BODY_WIDTH / 2, 
	        y: 0, 
	        z: 0, 

	        coxa: {
	        	length: DEFAULT_COXA_LENGTH,
	        	radius: DEFAULT_COXA_RADIUS,
	        	init_angle: 0,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 3,
	        	revert: false
	        }, 

	        femur: {
	        	length: DEFAULT_FEMUR_LENGTH,
	        	radius: DEFAULT_FEMUR_RADIUS,
	        	init_angle: DEFAULT_FEMUR_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 4,
	        	revert: false
	        },

	        tibia: {
	        	length: DEFAULT_TIBIA_LENGTH,
	        	radius: DEFAULT_TIBIA_RADIUS,
	        	init_angle: DEFAULT_TIBIA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 5,
	        	revert: false
	        },

	        mirror: -1
	    },
	    {   x: DEFAULT_BODY_WIDTH / 2, 
	        y: 0, 
	        z: DEFAULT_BODY_LENGTH / 2, 

	        coxa: {
	        	length: DEFAULT_COXA_LENGTH,
	        	radius: DEFAULT_COXA_RADIUS,
	        	init_angle: - DEFAULT_COXA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 6,
	        	revert: false
	        }, 

	        femur: {
	        	length: DEFAULT_FEMUR_LENGTH,
	        	radius: DEFAULT_FEMUR_RADIUS,
	        	init_angle: DEFAULT_FEMUR_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 7,
	        	revert: false
	        },

	        tibia: {
	        	length: DEFAULT_TIBIA_LENGTH,
	        	radius: DEFAULT_TIBIA_RADIUS,
	        	init_angle: DEFAULT_TIBIA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 8,
	        	revert: false
	        },

	        mirror: -1
	    },  

	    // right side
	    {   x: DEFAULT_BODY_WIDTH / 2, 
	        y: 0, 
	        z: - DEFAULT_BODY_LENGTH / 2, 

	        coxa: {
	        	length: DEFAULT_COXA_LENGTH,
	        	radius: DEFAULT_COXA_RADIUS,
	        	init_angle: DEFAULT_COXA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 9,
	        	revert: false
	        }, 

	        femur: {
	        	length: DEFAULT_FEMUR_LENGTH,
	        	radius: DEFAULT_FEMUR_RADIUS,
	        	init_angle: DEFAULT_FEMUR_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 10,
	        	revert: false
	        },

	        tibia: {
	        	length: DEFAULT_TIBIA_LENGTH,
	        	radius: DEFAULT_TIBIA_RADIUS,
	        	init_angle: DEFAULT_TIBIA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 11,
	        	revert: false
	        },

	        mirror: 1
	    }, 
	    {   x: DEFAULT_BODY_WIDTH / 2, 
	        y: 0, 
	        z: 0, 

	        coxa: {
	        	length: DEFAULT_COXA_LENGTH,
	        	radius: DEFAULT_COXA_RADIUS,
	        	init_angle: 0,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 12,
	        	revert: false
	        }, 

	        femur: {
	        	length: DEFAULT_FEMUR_LENGTH,
	        	radius: DEFAULT_FEMUR_RADIUS,
	        	init_angle: DEFAULT_FEMUR_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 13,
	        	revert: false
	        },

	        tibia: {
	        	length: DEFAULT_TIBIA_LENGTH,
	        	radius: DEFAULT_TIBIA_RADIUS,
	        	init_angle: DEFAULT_TIBIA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 14,
	        	revert: false
	        },

	        mirror: 1
	    },
	    {   x: DEFAULT_BODY_WIDTH / 2, 
	        y: 0, 
	        z: DEFAULT_BODY_LENGTH / 2,

	        coxa: {
	        	length: DEFAULT_COXA_LENGTH,
	        	radius: DEFAULT_COXA_RADIUS,
	        	init_angle: - DEFAULT_COXA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 15,
	        	revert: false
	        }, 

	        femur: {
	        	length: DEFAULT_FEMUR_LENGTH,
	        	radius: DEFAULT_FEMUR_RADIUS,
	        	init_angle: DEFAULT_FEMUR_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 16,
	        	revert: false
	        },

	        tibia: {
	        	length: DEFAULT_TIBIA_LENGTH,
	        	radius: DEFAULT_TIBIA_RADIUS,
	        	init_angle: DEFAULT_TIBIA_INIT_ANGLE,
	        	servo_value: SERVO_CURRENT_VALUE,
	        	// servo_idx: 17,
	        	revert: false
	        }, 

	        mirror: 1
	    }
	]
};
