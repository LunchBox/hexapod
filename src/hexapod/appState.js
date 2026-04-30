// Mutable app state — replaces the old global variables.
// Initialized by SceneCanvas mount, consumed by all hexapod modules.

const state = {
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
