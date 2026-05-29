import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import appState from './appState.js';

// Minimal keyboard state tracker — replaces old THREEx.KeyboardState
class KeyboardState {
  pressed: Record<string, boolean> = {};
  private _down = (e: KeyboardEvent) => { this.pressed[e.keyCode] = true; };
  private _up = (e: KeyboardEvent) => { this.pressed[e.keyCode] = false; };
  constructor() {
    document.addEventListener('keydown', this._down);
    document.addEventListener('keyup', this._up);
  }
  destroy() {
    document.removeEventListener('keydown', this._down);
    document.removeEventListener('keyup', this._up);
  }
}

export function initScene(container: HTMLElement) {
  appState.container = container;
  appState.keyboard = new KeyboardState();
  appState.clock = new THREE.Clock();

  let SCREEN_WIDTH = container.offsetWidth;
  let SCREEN_HEIGHT = container.offsetHeight;

  // Scene
  appState.scene = new THREE.Scene();

  // Camera
  let VIEW_ANGLE = 45,
    ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT,
    NEAR = 1,
    FAR = 10000;
  appState.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
  appState.scene!.add(appState.camera!);
  appState.camera!.position.set(-600, 500, -600);

  // Renderer — WebGL is universally available in modern browsers
  appState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  appState.renderer!.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  appState.renderer!.setClearColor(0xdddddd, 0);
  container.appendChild(appState.renderer!.domElement);

  // Window resize
  function onWindowResize() {
    let w = container.offsetWidth;
    let h = container.offsetHeight;
    appState.camera!.aspect = w / h;
    appState.camera!.updateProjectionMatrix();
    appState.renderer!.setSize(w, h);
  }
  window.addEventListener('resize', onWindowResize, false);

  // OrbitControls
  appState.controls = new OrbitControls(appState.camera!, container);
  appState.controls.addEventListener('change', render);

  // Stats (still loaded as global from public/libs/)
  if (typeof Stats !== 'undefined') {
    appState.stats = new Stats();
    appState.stats.domElement.style.position = "absolute";
    appState.stats.domElement.style.bottom = "0px";
    (appState.stats.domElement.style as any).zIndex = 10;
    container.appendChild(appState.stats.domElement);
  }

  // Directional light
  let dLight = new THREE.DirectionalLight(0xffffff);
  dLight.position.set(1, 300, 0);

  // Particle light
  let particleLight = new THREE.Mesh(
    new THREE.SphereGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x44ff44 })
  );
  particleLight.position.set(1, 500, 0);

  // Grid
  let gridHelper = new THREE.GridHelper(1000, 20);
  gridHelper.position.set(0, 0, 0);
  gridHelper.rotation.set(0, 0, 0);
  appState.scene!.add(gridHelper);

  function render() {
    appState.renderer!.render(appState.scene!, appState.camera!);
  }

  function update() {
    // Drive servo animation via callback set by SceneCanvas
    if (appState.onAnimate) appState.onAnimate(performance.now());

    // Particle light animation
    let timer = Date.now() * 0.000025;
    particleLight.position.x = Math.sin(timer * 5) * 300;
    particleLight.position.z = Math.cos(timer * 5) * 300;
    dLight.position.x = Math.sin(timer * 5) * 300;
    dLight.position.z = Math.cos(timer * 5) * 300;

    appState.controls!.update(appState.clock!.getDelta());
    if (appState.stats) appState.stats!.update();
  }

  // Track rAF id so we can cancel on dispose; otherwise HMR / React
  // StrictMode remount stacks a fresh loop on top of the old one.
  let rafId = 0;
  let disposed = false;
  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    render();
    update();
  }
  rafId = requestAnimationFrame(animate);

  // Expose for external use
  appState.render = render;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onWindowResize, false);
    if (appState.controls) {
      try { appState.controls.dispose(); } catch { /* OrbitControls dispose may throw on partial init */ }
    }
    if (appState.keyboard) appState.keyboard.destroy();
    if (appState.renderer) {
      try {
        const dom = appState.renderer.domElement;
        if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
        appState.renderer.dispose();
        // Force WebGL context loss so the GPU resource pool is freed
        // immediately rather than waiting for GC. Browsers cap WebGL
        // contexts at ~16; without this HMR eventually goes black.
        const gl = appState.renderer.getContext();
        const lose = gl && (gl as any).getExtension && (gl as any).getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch { /* renderer dispose can throw on context already lost */ }
    }
    if (appState.stats && appState.stats.domElement && appState.stats.domElement.parentNode) {
      appState.stats.domElement.parentNode.removeChild(appState.stats.domElement);
    }
    appState.scene = null as any;
    appState.camera = null as any;
    appState.renderer = null as any;
    appState.controls = null as any;
    appState.stats = null as any;
    appState.keyboard = null as any;
    appState.clock = null as any;
    appState.onAnimate = null;
    appState.render = null as any;
    appState.container = null as any;
  };

  return {
    scene: appState.scene,
    camera: appState.camera,
    renderer: appState.renderer,
    controls: appState.controls,
    stats: appState.stats,
    keyboard: appState.keyboard,
    clock: appState.clock,
    dispose,
  };
}
