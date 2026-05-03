import appState from './appState.js';

export function initScene(container: HTMLElement) {
  appState.container = container;
  appState.keyboard = new (THREEx.KeyboardState as any)();
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
  appState.camera = new (THREE.PerspectiveCamera as any)(VIEW_ANGLE, ASPECT, NEAR, FAR);
  appState.scene!.add(appState.camera!);
  appState.camera!.position.set(-300, 300, -300);

  // Renderer
  if (Detector.webgl) {
    appState.renderer = new (THREE.WebGLRenderer as any)({ antialias: true, alpha: true });
  } else {
    appState.renderer = new (THREE.CanvasRenderer as any)();
  }
  appState.renderer!.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  appState.renderer!.setClearColor(0xdddddd, 0);
  container.appendChild(appState.renderer!.domElement);

  // Window resize
  window.addEventListener('resize', onWindowResize, false);

  function onWindowResize() {
    let w = container.offsetWidth;
    let h = container.offsetHeight;
    appState.camera!.aspect = w / h;
    appState.camera!.updateProjectionMatrix();
    appState.renderer!.setSize(w, h);
  }

  // OrbitControls
  appState.controls = new (THREE.OrbitControls as any)(appState.camera, container);
  appState.controls.addEventListener('change', render);

  // Stats
  appState.stats = new Stats();
  appState.stats.domElement.style.position = "absolute";
  appState.stats.domElement.style.bottom = "0px";
  (appState.stats.domElement.style as any).zIndex = 10;
  container.appendChild(appState.stats.domElement);

  // Directional light
  let dLight = new (THREE.DirectionalLight as any)(0xffffff);
  dLight.position.set(1, 300, 0);

  // Particle light
  let particleLight = new (THREE.Mesh as any)(
    new (THREE.SphereGeometry as any)(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x44ff44 })
  );
  particleLight.position.set(1, 500, 0);

  // Grid
  let gridHelper = new (THREE.GridHelper as any)(500, 100);
  gridHelper.position.set(0, 0, 0);
  gridHelper.rotation.set(0, 0, 0);
  appState.scene!.add(gridHelper);

  function render() {
    appState.renderer!.render(appState.scene!, appState.camera!);
  }

  function update() {
    // Drive servo animation from rAF loop for smooth 60fps interpolation
    if ((appState as any).current_bot?.update_servo_animations) {
      (appState as any).current_bot.update_servo_animations(performance.now());
    }

    // Particle light animation
    let timer = Date.now() * 0.000025;
    particleLight.position.x = Math.sin(timer * 5) * 300;
    particleLight.position.z = Math.cos(timer * 5) * 300;
    dLight.position.x = Math.sin(timer * 5) * 300;
    dLight.position.z = Math.cos(timer * 5) * 300;

    appState.controls!.update(appState.clock!.getDelta());
    appState.stats!.update();
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
    update();
  }

  animate();

  // Expose for external use
  appState.render = render;

  return {
    scene: appState.scene,
    camera: appState.camera,
    renderer: appState.renderer,
    controls: appState.controls,
    stats: appState.stats,
    keyboard: appState.keyboard,
    clock: appState.clock,
  };
}
