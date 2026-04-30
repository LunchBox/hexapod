// Mutable app state — replaces the old global variables.
// Initialized by SceneCanvas mount, consumed by all hexapod modules.

interface AppState {
  container: HTMLElement | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: THREE.OrbitControls | null;
  stats: Stats | null;
  keyboard: any;
  clock: THREE.Clock | null;
  current_bot: any;
  render?: () => void;
}

const state: AppState = {
  container: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  stats: null,
  keyboard: null,
  clock: null,
  current_bot: null,
};

export default state;
