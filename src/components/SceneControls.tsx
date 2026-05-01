import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { JoyStick } from '../hexapod/joystick2';

export default function SceneControls() {
  const { botRef } = useHexapod();
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<any>(null);

  // Joystick init
  useEffect(() => {
    if (!joystickContainerRef.current || joystickRef.current) return;
    const joystick = new JoyStick(joystickContainerRef.current, 60);
    joystick.on_handler_activated = function () {
      const gc = botRef.current?.gait_controller;
      if (gc) gc.follow(this);
    };
    joystick.on_handler_deactivated = function () {
      const gc = botRef.current?.gait_controller;
      if (gc) gc.stop();
    };
    joystickRef.current = joystick;
  }, [botRef]);

  const handleHeightChange = (v: number) => {
    const bot = botRef.current;
    if (!bot?.body_mesh) return;
    const delta = v - bot.body_mesh.position.y;
    if (Math.abs(delta) > 0.01) bot.move_body('y', delta);
  };

  const handleSpreadChange = (v: number) => {
    const bot = botRef.current;
    if (!bot) return;
    bot.options.tip_circle_scale = v;
    set_bot_options(bot.options);
    bot.adjust_tip_spread(v);
  };

  const bot = botRef.current;
  const bodyY = bot?.body_mesh?.position?.y ?? 10;
  const tipScale = bot?.options?.tip_circle_scale ?? 1;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 10px', marginTop: 6, flexWrap: 'wrap',
    }}>
      {/* Joystick */}
      <div className="joystick-container" ref={joystickContainerRef}></div>

      {/* Body height */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#888' }}>H</span>
        <input type="range" min="10" max="150" value={Math.round(bodyY)}
          title="Body height"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, cursor: 'pointer' }}
          onInput={(e) => handleHeightChange(parseFloat((e.target as HTMLInputElement).value))}
        />
        <span style={{ fontSize: 9, color: '#666' }}>{Math.round(bodyY)}</span>
      </div>

      {/* Expand/Compact */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#888' }}>↔</span>
        <input type="range" max="1.5" min="0.5" step="0.1" value={tipScale}
          title="Tip spread"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, cursor: 'pointer' }}
          onInput={(e) => handleSpreadChange(parseFloat((e.target as HTMLInputElement).value))}
        />
        <span style={{ fontSize: 9, color: '#666' }}>{tipScale.toFixed(1)}</span>
      </div>
    </div>
  );
}
