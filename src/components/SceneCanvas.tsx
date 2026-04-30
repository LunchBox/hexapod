import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { initScene } from '../hexapod/scene';
import { get_bot_options, build_bot } from '../hexapod/hexapod';
import appState from '../hexapod/appState';

export default function SceneCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { botRef, updateServoDisplay } = useHexapod();
  const initialized = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || initialized.current) return;
    initialized.current = true;

    // Clear any existing content (handles HMR re-renders)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const sceneObjs = initScene(container);

    const bot_options = get_bot_options();
    const bot = build_bot(bot_options);
    bot.onServoUpdate = updateServoDisplay;
    botRef.current = bot;
    appState.current_bot = bot;

    return () => {
      initialized.current = false;
      if (bot.mesh && sceneObjs.scene) {
        sceneObjs.scene.remove(bot.mesh);
      }
      bot.onServoUpdate = null;
      botRef.current = null;
      appState.current_bot = null;
    };
  }, [botRef, updateServoDisplay]);

  return (
    <div
      ref={containerRef}
      style={{
        width: 480,
        height: 320,
        overflow: 'hidden',
        position: 'relative',
        display: 'inline-block',
      }}
    />
  );
}
