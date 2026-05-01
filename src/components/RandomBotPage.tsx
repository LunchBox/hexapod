import { useEffect, useRef, useState, useCallback } from 'react';
import { generateRandomOptions } from '../hexapod/random';
import { set_bot_options } from '../hexapod/hexapod';
import { Hexapod } from '../hexapod/hexapod';
import './RandomBotPage.css';

function initPreviewScene(container: HTMLElement) {
  const w = container.offsetWidth;
  const h = container.offsetHeight;

  const scene = new THREE.Scene();
  const camera = new (THREE.PerspectiveCamera as any)(45, w / h, 1, 10000);
  camera.position.set(-300, 300, -300);
  scene.add(camera);

  const renderer = Detector.webgl
    ? new (THREE.WebGLRenderer as any)({ antialias: true, alpha: true })
    : new (THREE.CanvasRenderer as any)();
  renderer.setSize(w, h);
  renderer.setClearColor(0xdddddd, 0);
  container.appendChild(renderer.domElement);

  const controls = new (THREE.OrbitControls as any)(camera, container);

  const gridHelper = new (THREE.GridHelper as any)(500, 100);
  scene.add(gridHelper);

  const dLight = new (THREE.DirectionalLight as any)(0xffffff);
  dLight.position.set(1, 300, 0);
  scene.add(dLight);

  let running = true;
  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    const timer = Date.now() * 0.000025;
    dLight.position.x = Math.sin(timer * 5) * 300;
    dLight.position.z = Math.cos(timer * 5) * 300;
    controls.update(0.016);
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch);
  }
  window.addEventListener('resize', onResize);

  function dispose() {
    running = false;
    window.removeEventListener('resize', onResize);
    while (container.firstChild) container.removeChild(container.firstChild);
    controls.dispose?.();
    renderer.dispose?.();
  }

  return { scene, camera, renderer, controls, dispose };
}

export default function RandomBotPage({ onAccept }: { onAccept: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const botRef = useRef<any>(null);
  const [options, setOptions] = useState<any>(null);
  const randomize = useCallback(() => {
    const opts = generateRandomOptions();

    // Destroy old bot
    if (botRef.current && sceneRef.current) {
      sceneRef.current.scene.remove(botRef.current.mesh);
      botRef.current = null;
    }

    // Build new bot
    if (sceneRef.current) {
      try {
        const bot = new Hexapod(sceneRef.current.scene, opts);
        botRef.current = bot;
        bot.laydown();
        bot.putdown_tips();
        setOptions(opts);
      } catch (e) {
        console.error('Failed to build random bot', e);
      }
    }
  }, []);

  const handleUse = useCallback(() => {
    if (!options) return;
    set_bot_options(options);
    onAccept();
  }, [options, onAccept]);

  // Initialize preview scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const sceneObjs = initPreviewScene(container);
    sceneRef.current = sceneObjs;
    return () => sceneObjs.dispose();
  }, []);

  // Auto-randomize on first mount after scene is ready
  const didInit = useRef(false);
  useEffect(() => {
    if (!sceneRef.current || didInit.current) return;
    didInit.current = true;
    const t = setTimeout(randomize, 100);
    return () => clearTimeout(t);
  }, [randomize]);

  return (
    <div className="random-bot-page">
      <div className="random-preview" ref={containerRef} />
      <div className="random-controls">
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); randomize(); }}>
          Randomize
        </a>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleUse(); }}>
          Use This
        </a>
        {options && (
          <span className="random-info">
            {options.leg_count} legs | {options.dof}-DOF | {options.body_shape} | {options.gait}
          </span>
        )}
      </div>
    </div>
  );
}
