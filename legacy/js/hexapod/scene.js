// standard global variables
var container, scene, camera, renderer, controls, stats;
var keyboard = new THREEx.KeyboardState();
var clock = new THREE.Clock();



var model_info = document.querySelector("#model_info");

// Container
container = document.getElementById("scene");

// custom global variables
var SCREEN_WIDTH = container.offsetWidth;
var SCREEN_HEIGHT = container.offsetHeight;

// Scene
var scene = new THREE.Scene();
// scene.fog = new THREE.FogExp2( 0x9999ff, 0.00025 );

// Camera
var VIEW_ANGLE = 45, ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT, NEAR = 1, FAR = 10000;
camera = new THREE.PerspectiveCamera( 
    VIEW_ANGLE,     // Field of view
    ASPECT,         // Aspect ratio
    NEAR,           // Near 
    FAR             // Far
);
scene.add(camera);
camera.position.set(-300, 300, -300);
var camera_look_point = new THREE.Vector3(0,0,0); // control by orbitcontrols.target
// camera.lookAt(camera_look_point);
// camera.position.set(0,15,40);
// camera.lookAt(scene.position);  


// Renderer 
if (Detector.webgl) {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
} else {
    renderer = new THREE.CanvasRenderer();
}
renderer.setSize( SCREEN_WIDTH, SCREEN_HEIGHT );
renderer.setClearColor( 0xdddddd, 0);
// renderer.setClearColor( 0xffffff, 0 );

// renderer.shadowMap.enabled = true;
// renderer.shadowMapSoft = true;

container.appendChild( renderer.domElement );


// on window resized;
window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize(){
    var container = document.getElementById("scene");

    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( container.offsetWidth, container.offsetHeight );

}

// Controls
controls = new THREE.OrbitControls(camera, container);
// controls.target = new THREE.Vector3(1000, 0, 0);
// controls.target = new THREE.Vector3(1500, 500, 0);
// camera.lookAt(new THREE.Vector3(1500, 500, 0));
// controls.damping = 0.2;
controls.addEventListener( 'change', render );

// Stats
stats = new Stats();
stats.domElement.style.position = "absolute";
stats.domElement.style.bottom = "0px";
stats.domElement.style.zIndex = 10;
container.appendChild(stats.domElement);


// Directional light
var dLight = new THREE.DirectionalLight(0xffffff);
dLight.position.set(1, 300, 0);
// dLight.castShadow = true;
// dLight.shadowCameraVisible = true;
// dLight.shadowDarkness = 0.2;
// dLight.shadowMapWidth = dLight.shadowMapHeight = 1000;
// scene.add(dLight);

// Particle of light
var particleLight = new THREE.Mesh( new THREE.SphereGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x44ff44 }));
particleLight.position.set(1, 500, 0);
// this.scene.add(particleLight);


// Simple Ground
var groundGeometry = new THREE.PlaneGeometry(200, 200, 1, 1);
ground = new THREE.Mesh(groundGeometry, new THREE.MeshBasicMaterial({
    // color: 0x9669FE
    color: 0xdddddd
}));
ground.position.y = -1;
ground.rotation.x = - Math.PI / 2;
// ground.receiveShadow = true;
// scene.add(ground);

// Mesh
// var geometry = new THREE.BoxGeometry( 100, 100, 100 );
// var material = new THREE.MeshLambertMaterial( { color: 0x9999ff } );
// var cube = new THREE.Mesh( geometry, material );
// cube.position.y = 100;
// cube.castShadow = cube.receiveShadow = true;
// scene.add( cube );



// 1. ArrowHelper
// It draws a 3D arrow (starting in origin in the direction dir for a certain length) in space. This helps to understand the direction of a vector in space.
// var directionV3 = new THREE.Vector3(1, 0, 1);
// var originV3 = new THREE.Vector3(0, 200, 0);
// var arrowHelper = new THREE.ArrowHelper(directionV3, originV3, 100, 0xccc, 20, 10); // 100 is length, 20 and 10 are head length and width
// scene.add(arrowHelper);

// 2. AxisHelper
// It draws an axis object to visualize the the 3 axis in a simple way. The X axis is red. The Y axis is green. The Z axis is blue.
var axisHelper = new THREE.AxisHelper(800); // 500 is size
// scene.add(axisHelper);

// 3. BoundingBoxHelper
// var bboxHelper = new THREE.BoundingBoxHelper(cube, 0x999999);
// scene.add(bboxHelper);

// // 4. CameraHelper
// var cameraParObj = new THREE.Object3D();
// cameraParObj.position.y = 200;
// cameraParObj.position.z = 700;
// scene.add(cameraParObj);

// perspectiveCamera = new THREE.PerspectiveCamera(90, SCREEN_WIDTH / SCREEN_HEIGHT, 0.01, 500);
// cameraParObj.add(perspectiveCamera);
// // cameraParObj.lookAt(new THREE.Vector3(0,0,0));
 
// var cameraHelper = new THREE.CameraHelper(perspectiveCamera);
// scene.add(cameraHelper);

var gridHelper = new THREE.GridHelper(500, 100); // 500 is grid size, 50 is grid step
gridHelper.position = new THREE.Vector3(0, 0, 0);
gridHelper.rotation = new THREE.Euler(0, 0, 0);
scene.add(gridHelper);


function animate(){
    requestAnimationFrame(animate);

    render();
    update();
}


// var geometry = new THREE.BoxGeometry(5,5,20);
// geometry.applyMatrix( new THREE.Matrix4().makeRotationY( Math.PI/2 ) );
// geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0,-6,0) );
// // geometry.applyMatrix( new THREE.Matrix4().makeTranslation(50,0,0) );

// var cube = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
// // cube.rotateY(Math.PI/2);
// // cube.rotation.order = 'ZXY';
// cube.position.set(0,-12,0);
// cube.rotation.x -= Math.PI/8;
// scene.add(cube);
// scene.add(drawAxes(10, cube.position, cube.rotation));

// var sphereGeometry = new THREE.SphereGeometry(10,20,20);
// var sphere = new THREE.Mesh(
//     sphereGeometry,
//     new THREE.MeshPhongMaterial( { color: 0x000000 } ));
// sphere.position.set(0, 0, 0);
// sphere.geometry.applyMatrix( new THREE.Matrix4().makeTranslation(0, 200, -200) );
// scene.add(sphere);

function apply_position(mesh, position){
    mesh.position.x = position.x;
    mesh.position.y = position.y;
    mesh.position.z = position.z;
}

function clone_vector(v){
    return new THREE.Vector3(v.x, v.y, v.z);
}

// http://stackoverflow.com/questions/28036410/how-to-move-object-from-position-x-y-to-newx-newy-in-three-js
var direction = new THREE.Vector3(0.3, 0.5, 0);
var _tick = 0;
var _matrix = new THREE.Matrix4();

var rectGeom, rectMesh;

function update(){
    if (keyboard.pressed("z")) {
        // do something
    }
    // add to position
    // cube.position.add(direction);

    // smoothly move the particleLight
    var timer = Date.now() * 0.000025;
    particleLight.position.x = Math.sin(timer * 5) * 300;
    particleLight.position.z = Math.cos(timer * 5) * 300;

    dLight.position.x = Math.sin(timer * 5) * 300;
    dLight.position.z = Math.cos(timer * 5) * 300;


    // // sphereGeometry.applyMatrix4( new THREE.Matrix4().makeTranslation(0, 200, -200) );
    // var division = 1800;
    // var axis = clone_vector(current_bot.mesh.position);
    // var radians = Math.PI * 2 / division * (Date.now() % division);


    // //// draw the foots;
    // if (current_bot) {
    //     if (rectMesh) {
    //         scene.remove(rectMesh);
    //     }

    //     var p1 = current_bot.legs[0].get_tip_pos();
    //     var p2 = current_bot.legs[2].get_tip_pos();
    //     var p3 = current_bot.legs[4].get_tip_pos();

    //     var rectShape = new THREE.Shape();
    //     rectShape.moveTo(p1.x, p1.z);
    //     rectShape.lineTo(p2.x, p2.z);
    //     rectShape.lineTo(p3.x, p3.z);
    //     rectShape.lineTo(p1.x, p1.z);

    //     rectGeom = new THREE.ShapeGeometry( rectShape );
    //     rectGeom.applyMatrix( new THREE.Matrix4().makeRotationX( - Math.PI / 2 ) );
    //     rectMesh = new THREE.Mesh( rectGeom, new THREE.MeshBasicMaterial( { color: 0xff0000 } ) ) ;

    //     // console.log(rectMesh);

    //     scene.add( rectMesh );
    // }
    

    controls.update(clock.getDelta());
    stats.update();
    _tick ++;
}


function render() {
    renderer.render( scene, camera );
}
// render();
animate();