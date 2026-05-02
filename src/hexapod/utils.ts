export function uniq(array) {
  let n = [];
  for (let i = 0; i < array.length; i++) {
    if (n.indexOf(array[i]) === -1) n.push(array[i]);
  }
  return n;
}

export function apply_xyz(obj_a, obj_b) {
  obj_a.x = obj_b.x;
  obj_a.y = obj_b.y;
  obj_a.z = obj_b.z;
}

export function clearSelection() {
  if (window.getSelection) {
    window.getSelection().removeAllRanges();
  } else if (document.selection) {
    document.selection.empty();
  }
}

export function has_class(elem, class_name) {
  let class_names = elem.getAttribute("class").split(" ");
  return class_names.indexOf(class_name) > -1;
}

export function add_class(elem, class_name) {
  let class_names = elem.getAttribute("class").split(" ");
  class_names.push(class_name);
  elem.setAttribute("class", uniq(class_names).join(" "));
}

export function remove_class(elem, class_name) {
  let class_names = uniq(elem.getAttribute("class").split(" "));
  let idx = class_names.indexOf(class_name);
  if (idx > -1) {
    class_names.splice(idx, 1);
  }
  elem.setAttribute("class", class_names.join(" "));
}

export function sleep(milliseconds) {
  let start = new Date().getTime();
  for (let i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

export function make_input(options) {
  let input = document.createElement('input');
  for (let key in options) {
    input.setAttribute(key, options[key]);
  }
  return input;
}

export function make_label(name, label_for) {
  let label = document.createElement('label');
  label.setAttribute("for", label_for);
  label.innerHTML = name;
  return label;
}

export function getWorldPosition(root_mesh, mesh) {
  root_mesh.updateMatrixWorld();
  let vector = new THREE.Vector3();
  vector.setFromMatrixPosition(mesh.matrixWorld);
  return vector;
}

export function get_obj_from_local_storage(key, default_value) {
  if (typeof (Storage) !== "undefined") {
    let obj_string = localStorage[key];
    let obj;
    if (obj_string) {
      obj = JSON.parse(obj_string);
      if (obj == null) {
        obj = default_value;
      }
    } else {
      obj = default_value;
    }
    return obj;
  }
}

export function set_obj_to_local_storage(key, obj) {
  if (typeof (Storage) !== "undefined") {
    if (obj == null) {
      localStorage[key] = null;
    } else {
      localStorage[key] = JSON.stringify(obj);
    }
  }
}

export function degree_to_radians(degree: number): number {
  return Math.PI * degree / 180;
}

/** @deprecated Use degree_to_radians instead */
export const degree_to_redius = degree_to_radians;

// Rotate an object around an arbitrary axis in object space
let rotObjectMatrix;
export function rotateAroundObjectAxis(object, axis, radians) {
  rotObjectMatrix = new THREE.Matrix4();
  rotObjectMatrix.makeRotationAxis(axis.normalize(), radians);
  object.matrix.multiply(rotObjectMatrix);
  object.rotation.setFromRotationMatrix(object.matrix);
}

// Rotate an object around an arbitrary axis in world space
let rotWorldMatrix;
export function rotateAroundWorldAxis(object, axis, radians) {
  rotWorldMatrix = new THREE.Matrix4();
  rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
  rotWorldMatrix.multiply(object.matrix);
  object.matrix = rotWorldMatrix;
  object.rotation.setFromRotationMatrix(object.matrix);
}

export let logger = (function () {
  let oldConsoleLog: any = null;
  let pub: { enableLogger: () => void; disableLogger: () => void } = {
    enableLogger: function () { },
    disableLogger: function () { },
  };

  pub.enableLogger = function enableLogger() {
    if (oldConsoleLog == null) return;
    window['console']['log'] = oldConsoleLog;
  };

  pub.disableLogger = function disableLogger() {
    oldConsoleLog = console.log;
    window['console']['log'] = function () { };
  };

  return pub;
})();

