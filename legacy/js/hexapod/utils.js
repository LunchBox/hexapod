function uniq(array){
    var n = []; 
    for(var i = 0; i < array.length; i++) 
    {
        if (n.indexOf(array[i]) == -1) n.push(array[i]);
    }
    return n;
}

function apply_xyz(obj_a, obj_b){
    obj_a.x = obj_b.x;
    obj_a.y = obj_b.y;
    obj_a.z = obj_b.z;
}

function clearSelection() {
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    } else if (document.selection) {
        document.selection.empty();
    }
}


function has_class(elem, class_name){
    var class_names = elem.getAttribute("class").split(" ");
    return class_names.indexOf(class_name) > -1;
}
function add_class(elem, class_name){
    var class_names = elem.getAttribute("class").split(" ");
    class_names.push(class_name);
    elem.setAttribute("class", uniq(class_names).join(" "));
}

function remove_class(elem, class_name){
    var class_names = uniq(elem.getAttribute("class").split(" "));
    var idx = class_names.indexOf(class_name);
    if (idx > -1) {
        class_names.splice(idx, 1); // remove it from the array;
    }
    elem.setAttribute("class", class_names.join(" "));
}

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds){
            break;
        }
    }
}


function make_input(options){
    var input = document.createElement('input');
    for(var key in options) {
        input.setAttribute(key, options[key]);
    }

    return input;
}

function make_label(name, label_for){
    var label = document.createElement('label');
    label.setAttribute("for", label_for);
    label.innerHTML = name;
    return label;
}


function getWorldPosition(root_mesh, mesh){
    root_mesh.updateMatrixWorld();

    var vector = new THREE.Vector3();
    vector.setFromMatrixPosition(mesh.matrixWorld);

    return vector;
};


function get_obj_from_local_storage(key, default_value){
    if(typeof(Storage) !== "undefined") {
        var obj_string = localStorage[key];
        var obj; 

        if (obj_string) {
            obj = JSON.parse(obj_string);
            if (obj == null) {
                obj = default_value;
            }
        } else {
            obj = default_value;
        }

        return obj;
    } else {
        // Sorry! No Web Storage support..
    }
}

function set_obj_to_local_storage(key, obj){
    if(typeof(Storage) !== "undefined") {
        if (obj == null) {
            localStorage[key] = null;
        } else {
            localStorage[key] = JSON.stringify(obj);
        }
    } else {
        // Sorry! No Web Storage support..
    }
}

function degree_to_redius(degree){
    return Math.PI * degree / 180;
}


// USE AxisHelper instead
// var axisHelper = new THREE.AxisHelper(800);
// mesh.add(axisHelper);
//
// http://rwoodley.org/?p=1073
// http://rwoodley.org/MyContent/WIP/36-RotationsExample/example.html
// function drawAxes(size,position, rotation) {
//     size = size || 1;
//     var vertices = new Float32Array( [
//         0, 0, 0, size, 0, 0,
//         0, 0, 0, 0, size, 0,
//         0, 0, 0, 0, 0, size
//         ] );
//     var colors = new Float32Array( [
//         1, 0, 0, 1, 0.6, 0,
//         0, 1, 0, 0.6, 1, 0,
//         0, 0, 1, 0, 0.6, 1
//         ] );
//     var geometry = new THREE.BufferGeometry();
//     geometry.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
//     geometry.addAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
//     var material = new THREE.LineBasicMaterial( { vertexColors: THREE.VertexColors } );
//     var mesh = new THREE.Line(geometry, material, THREE.LineSegments );
//     mesh.position.set(position.x, position.y, position.z);
//     mesh.rotation.set(rotation.x, rotation.y, rotation.z);
//     return mesh;
// }

var logger = function(){
    var oldConsoleLog = null;
    var pub = {};

    pub.enableLogger =  function enableLogger() {
        if(oldConsoleLog == null)
            return;

        window['console']['log'] = oldConsoleLog;
    };

    pub.disableLogger = function disableLogger(){
        oldConsoleLog = console.log;
        window['console']['log'] = function() {};
    };

    return pub;
}();



// enable/disable the console.log to improve the performance
// logger.disableLogger();
















// http://stackoverflow.com/questions/11060734/how-to-rotate-a-3d-object-on-axis-three-js
var rotObjectMatrix;
function rotateAroundObjectAxis(object, axis, radians) {
    rotObjectMatrix = new THREE.Matrix4();
    rotObjectMatrix.makeRotationAxis(axis.normalize(), radians);

    // old code for Three.JS pre r54:
    // object.matrix.multiplySelf(rotObjectMatrix);      // post-multiply
    // new code for Three.JS r55+:
    object.matrix.multiply(rotObjectMatrix);

    // old code for Three.js pre r49:
    // object.rotation.getRotationFromMatrix(object.matrix, object.scale);
    // old code for Three.js r50-r58:
    // object.rotation.setEulerFromRotationMatrix(object.matrix);
    // new code for Three.js r59+:
    object.rotation.setFromRotationMatrix(object.matrix);
}

var rotWorldMatrix;
// Rotate an object around an arbitrary axis in world space       
function rotateAroundWorldAxis(object, axis, radians) {
    rotWorldMatrix = new THREE.Matrix4();
    rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);

    // old code for Three.JS pre r54:
    //  rotWorldMatrix.multiply(object.matrix);
    // new code for Three.JS r55+:
    rotWorldMatrix.multiply(object.matrix);                // pre-multiply

    object.matrix = rotWorldMatrix;

    // old code for Three.js pre r49:
    // object.rotation.getRotationFromMatrix(object.matrix, object.scale);
    // old code for Three.js pre r59:
    // object.rotation.setEulerFromRotationMatrix(object.matrix);
    // code for r59+:
    object.rotation.setFromRotationMatrix(object.matrix);
}