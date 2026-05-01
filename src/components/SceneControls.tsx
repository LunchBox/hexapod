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

  const handleMotionChange = (key: string, value: number) => {
    const bot = botRef.current;
    if (!bot) return;
    (bot.options as any)[key] = value;
    set_bot_options(bot.options);
    if (key === 'rotate_step') bot.rotate_step = value;
    else if (key === 'fb_step') bot.fb_step = value;
    else if (key === 'lr_step') bot.lr_step = value;
    const gc = bot.gait_controller;
    if (gc) gc.reset_steps();
  };

  const bot = botRef.current;
  const bodyY = bot?.body_mesh?.position?.y ?? 10;
  const tipScale = bot?.options?.tip_circle_scale ?? 1;
  const rotDeg = Math.round(((bot?.options?.rotate_step ?? Math.PI / 18) * 180) / Math.PI);
  const fbStep = bot?.options?.fb_step ?? 15;
  const lrStep = bot?.options?.lr_step ?? 10;

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

      {/* Rotate step */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#888' }}>↻°</span>
        <input type="range" min="1" max="45" value={rotDeg}
          title="Rotate step (°)"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, cursor: 'pointer' }}
          onInput={(e) => handleMotionChange('rotate_step', parseFloat((e.target as HTMLInputElement).value) * Math.PI / 180)}
        />
        <span style={{ fontSize: 9, color: '#666' }}>{rotDeg}°</span>
      </div>

      {/* FB step */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#888' }}>↕</span>
        <input type="range" min="1" max="50" value={fbStep}
          title="F&B step (mm)"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, cursor: 'pointer' }}
          onInput={(e) => handleMotionChange('fb_step', parseFloat((e.target as HTMLInputElement).value))}
        />
        <span style={{ fontSize: 9, color: '#666' }}>{fbStep}</span>
      </div>

      {/* LR step */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#888' }}>⇔</span>
        <input type="range" min="1" max="50" value={lrStep}
          title="L&R step (mm)"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, cursor: 'pointer' }}
          onInput={(e) => handleMotionChange('lr_step', parseFloat((e.target as HTMLInputElement).value))}
        />
        <span style={{ fontSize: 9, color: '#666' }}>{lrStep}</span>
      </div>
    </div>
  );
}
