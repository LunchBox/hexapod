import appState from './appState.js';

export function initScene(container) {
  appState.container = container;
  appState.keyboard = new THREEx.KeyboardState();
  appState.clock = new THREE.Clock();

  var SCREEN_WIDTH = container.offsetWidth;
  var SCREEN_HEIGHT = container.offsetHeight;

  // Scene
  appState.scene = new THREE.Scene();

  // Camera
  var VIEW_ANGLE = 45,
    ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT,
    NEAR = 1,
    FAR = 10000;
  appState.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
  appState.scene.add(appState.camera);
  appState.camera.position.set(-300, 300, -300);

  // Renderer
  if (Detector.webgl) {
    appState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } else {
    appState.renderer = new THREE.CanvasRenderer();
  }
  appState.renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  appState.renderer.setClearColor(0xdddddd, 0);
  container.appendChild(appState.renderer.domElement);

  // Window resize
  window.addEventListener('resize', onWindowResize, false);

  function onWindowResize() {
    var w = container.offsetWidth;
    var h = container.offsetHeight;
    appState.camera.aspect = w / h;
    appState.camera.updateProjectionMatrix();
    appState.renderer.setSize(w, h);
  }

  // OrbitControls
  appState.controls = new THREE.OrbitControls(appState.camera, container);
  appState.controls.addEventListener('change', render);

  // Stats
  appState.stats = new Stats();
  appState.stats.domElement.style.position = "absolute";
  appState.stats.domElement.style.bottom = "0px";
  appState.stats.domElement.style.zIndex = 10;
  container.appendChild(appState.stats.domElement);

  // Directional light
  var dLight = new THREE.DirectionalLight(0xffffff);
  dLight.position.set(1, 300, 0);

  // Particle light
  var particleLight = new THREE.Mesh(
    new THREE.SphereGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x44ff44 })
  );
  particleLight.position.set(1, 500, 0);

  // Grid
  var gridHelper = new THREE.GridHelper(500, 100);
  gridHelper.position.set(0, 0, 0);
  gridHelper.rotation.set(0, 0, 0);
  appState.scene.add(gridHelper);

  function render() {
    appState.renderer.render(appState.scene, appState.camera);
  }

  function update() {
    // Particle light animation
    var timer = Date.now() * 0.000025;
    particleLight.position.x = Math.sin(timer * 5) * 300;
    particleLight.position.z = Math.cos(timer * 5) * 300;
    dLight.position.x = Math.sin(timer * 5) * 300;
    dLight.position.z = Math.cos(timer * 5) * 300;

    appState.controls.update(appState.clock.getDelta());
    appState.stats.update();
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

export function apply_position(mesh, position) {
  mesh.position.x = position.x;
  mesh.position.y = position.y;
  mesh.position.z = position.z;
}

export function clone_vector(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}
