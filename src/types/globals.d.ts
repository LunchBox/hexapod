// Type declarations for legacy Three.js r72 and other old scripts loaded via <script> tags

// DOM element extensions — the old code attaches custom properties to DOM elements
interface HTMLInputElement {
  controller?: any;
  leg?: any;
  leg_idx?: number;
  limb_idx?: number;
  range_control?: HTMLInputElement;
  current_control?: HTMLInputElement;
  end_x_control?: HTMLInputElement;
  end_y_control?: HTMLInputElement;
  end_z_control?: HTMLInputElement;
  range_input?: HTMLInputElement;
}

interface HTMLDivElement {
  data_value?: any;
}

// Augment document for old IE APIs
interface Document {
  selection?: {
    empty(): void;
  };
}

declare namespace THREE {
  class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    matrix: Matrix4;
    matrixWorld: Matrix4;
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    children: Object3D[];
    parent: Object3D | null;
    type: string;
    add(...objects: Object3D[]): void;
    remove(...objects: Object3D[]): void;
    clone(recursive?: boolean): this;
    updateMatrix(): void;
    updateMatrixWorld(): void;
    lookAt(vector: Vector3): void;
  }

  class Scene extends Object3D {
    fog: any;
  }

  class PerspectiveCamera extends Object3D {
    aspect: number;
    updateProjectionMatrix(): void;
  }

  class WebGLRenderer {
    domElement: HTMLCanvasElement;
    setSize(width: number, height: number): void;
    setClearColor(color: number, alpha: number): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
  }

  class CanvasRenderer extends WebGLRenderer { }

  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    clone(): Vector3;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    applyMatrix4(m: Matrix4): this;
    setFromMatrixPosition(m: Matrix4): this;
    normalize(): this;
    distanceTo(v: Vector3): number;
  }

  class Euler {
    x: number;
    y: number;
    z: number;
    order: string;
    constructor(x?: number, y?: number, z?: number, order?: string);
    set(x: number, y: number, z: number, order?: string): this;
    clone(): Euler;
    copy(e: Euler): this;
  }

  class Matrix4 {
    elements: Float32Array;
    makeRotationAxis(axis: Vector3, angle: number): this;
    makeRotationY(angle: number): this;
    makeRotationX(angle: number): this;
    makeTranslation(x: number, y: number, z: number): this;
    multiply(m: Matrix4): this;
    clone(): Matrix4;
  }

  class Geometry {
    vertices: Vector3[];
    applyMatrix(m: Matrix4): void;
    clone(): Geometry;
  }

  class BoxGeometry extends Geometry {
    constructor(width: number, height: number, depth: number);
  }

  class SphereGeometry extends Geometry {
    constructor(radius: number, widthSegments: number, heightSegments: number);
  }

  class PlaneGeometry extends Geometry {
    constructor(width: number, height: number, widthSegments?: number, heightSegments?: number);
  }

  class BufferGeometry extends Geometry { }

  class ShapeGeometry extends Geometry {
    constructor(shape: any);
  }

  class Material {
    color: any;
    side: number;
    visible: boolean;
  }

  class MeshBasicMaterial extends Material {
    constructor(opts?: { color?: number; vertexColors?: any });
  }

  class MeshLambertMaterial extends Material {
    constructor(opts?: { color?: number });
  }

  class MeshPhongMaterial extends Material {
    constructor(opts?: { color?: number });
  }

  class MeshNormalMaterial extends Material {
    constructor();
  }

  class LineBasicMaterial extends Material {
    constructor(opts?: { color?: number });
  }

  class PointsMaterial extends Material {
    size: number;
    constructor(opts?: { color?: number; size?: number });
  }

  class Mesh extends Object3D {
    constructor(geometry: Geometry, material: Material);
  }

  class Line extends Object3D {
    constructor(geometry: Geometry, material: Material);
  }

  class Points extends Object3D {
    constructor(geometry: Geometry, material: Material);
  }

  class GridHelper extends Line {
    constructor(size: number, step: number);
  }

  class AxisHelper extends Line {
    constructor(size: number);
  }

  class DirectionalLight extends Object3D {
    constructor(color: number);
  }

  class ArrowHelper extends Object3D {
    constructor(dir: Vector3, origin: Vector3, length: number, color: number, headLength?: number, headWidth?: number);
  }

  class Shape {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
  }

  class OrbitControls {
    target: Vector3;
    constructor(camera: PerspectiveCamera, domElement: HTMLElement);
    update(delta: number): void;
    addEventListener(type: string, listener: () => void): void;
    damping: number;
  }

  class Clock {
    constructor();
    getDelta(): number;
  }

  const VertexColors: any;
}

declare class Stats {
  domElement: HTMLDivElement;
  update(): void;
}

declare var Detector: {
  webgl: boolean;
};

declare namespace THREEx {
  class KeyboardState {
    pressed(key: string): boolean;
    constructor();
  }
}

// Socket.IO client (loaded as global by old script, or as module)
declare module 'socket.io-client' {
  interface Socket {
    on(event: string, cb: (...args: any[]) => void): void;
    emit(event: string, data: any): void;
    connected: boolean;
  }
  function io(url: string, opts?: any): Socket;
  export default io;
}
