import { useEffect, useRef, useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { JoyStick } from '../hexapod/joystick2';

function makeJoystick(
  container: HTMLElement, radius: number,
  onActivate: (j: any) => void, onDeactivate: () => void,
) {
  const j = new JoyStick(container, radius);
  j.on_handler_activated = function () { onActivate(this); };
  j.on_handler_deactivated = function () { onDeactivate(); };
  return j;
}

export default function SceneControls() {
  const { botRef, botVersion } = useHexapod();
  const moveJsRef = useRef<HTMLDivElement>(null);
  const bodyJsRef = useRef<HTMLDivElement>(null);
  const rotJsRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);

  // Init all 3 joysticks once
  useEffect(() => {
    if (inited.current || !moveJsRef.current || !bodyJsRef.current || !rotJsRef.current) return;
    inited.current = true;

    const stop = () => {
      const gc = botRef.current?.gait_controller;
      if (gc) {
        gc.stop();
        // Reset home snapshot for next activation
        const im = gc.actions?.['internal_move'];
        if (im) im._homeSnapped = false;
      }
    };

    // Move mode joystick
    makeJoystick(moveJsRef.current, 45, (j) => {
      const gc = botRef.current?.gait_controller;
      if (gc) { gc.move_mode = 'move'; gc.follow(j); }
    }, stop);

    // Move body joystick
    makeJoystick(bodyJsRef.current, 45, (j) => {
      const gc = botRef.current?.gait_controller;
      if (gc) { gc.move_mode = 'move_body'; gc.follow(j); }
    }, stop);

    // Rotate body joystick
    makeJoystick(rotJsRef.current, 45, (j) => {
      const gc = botRef.current?.gait_controller;
      if (gc) { gc.move_mode = 'rotate_body'; gc.follow(j); }
    }, stop);
  }, [botRef]);

  // Read current values from bot options on mount and when botVersion changes
  const [bodyY, setBodyY] = useState(10);
  const [tipScale, setTipScale] = useState(1);
  const [rotDeg, setRotDeg] = useState(10);
  const [fbStep, setFbStep] = useState(15);
  const [lrStep, setLrStep] = useState(10);

  useEffect(() => {
    const bot = botRef.current;
    if (!bot) return;
    setBodyY(Math.round(bot.body_mesh?.position?.y ?? 10));
    setTipScale(bot.options?.tip_circle_scale ?? 1);
    setRotDeg(Math.round(((bot.options?.rotate_step ?? Math.PI / 18) * 180) / Math.PI));
    setFbStep(bot.options?.fb_step ?? 15);
    setLrStep(bot.options?.lr_step ?? 10);
  }, [botVersion, botRef]);

  const handleSpreadChange = (v: number) => {
    const bot = botRef.current;
    if (!bot) return;
    bot.options.tip_circle_scale = v;
    set_bot_options(bot.options);
    bot.adjust_tip_spread(v);
    bot.adjust_gait_guidelines();
    setTipScale(v);
  };

  const syncSliders = () => {
    const bot = botRef.current;
    if (!bot) return;
    setBodyY(Math.round(bot.body_mesh?.position?.y ?? 10));
  };

  const handleHeightChange = (v: number) => {
    const bot = botRef.current;
    if (!bot?.body_mesh) return;
    const delta = v - bot.body_mesh.position.y;
    if (Math.abs(delta) > 0.01) {
      bot.move_body('y', delta);
      bot.adjust_gait_guidelines();
    }
    setBodyY(v);
  };

  const handleMotionChange = (key: string, value: number) => {
    const bot = botRef.current;
    if (!bot) return;
    (bot.options as any)[key] = value;
    set_bot_options(bot.options);
    if (key === 'rotate_step') {
      bot.rotate_step = value;
      bot.adjust_gait_guidelines();
    } else if (key === 'fb_step') { bot.fb_step = value; setFbStep(value); }
    else if (key === 'lr_step') { bot.lr_step = value; setLrStep(value); }
    const gc = bot.gait_controller;
    if (gc) gc.reset_steps();
  };

  const SLIDER_H = 100;
  const btnStyle: React.CSSProperties = {
    background: 'none', border: '1px solid #555', color: '#aaa',
    cursor: 'pointer', fontSize: 10, padding: '0 3px', lineHeight: 1,
  };
  const colStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    height: SLIDER_H + 50,
  };
  const sliderStyle: React.CSSProperties = {
    writingMode: 'vertical-lr', direction: 'rtl',
    height: SLIDER_H, cursor: 'pointer',
  };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: '#888', height: 16, lineHeight: '16px' };
  const valStyle: React.CSSProperties = { fontSize: 9, color: '#666', height: 14, lineHeight: '14px' };
  const btnH: React.CSSProperties = { ...btnStyle, height: 16, lineHeight: '14px' };

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap',
  };

  return (
    <div style={{ padding: '6px 10px', margin: '8px 0' }}>
      {/* Row 1: Joysticks */}
      <div style={rowStyle}>
        <div style={{ ...colStyle, justifyContent: 'flex-end' }}>
          <div ref={moveJsRef}></div>
          <span style={labelStyle}>Move</span>
        </div>
        <div style={{ ...colStyle, justifyContent: 'flex-end' }}>
          <div ref={bodyJsRef}></div>
          <span style={labelStyle}>Body</span>
        </div>
        <div style={{ ...colStyle, justifyContent: 'flex-end' }}>
          <div ref={rotJsRef}></div>
          <span style={labelStyle}>Rot</span>
        </div>
      </div>

      {/* Row 2: Sliders */}
      <div style={rowStyle}>
      {/* Body height */}
      <div style={colStyle}>
        <button style={btnH} onClick={() => handleHeightChange(Math.min(150, bodyY + 1))}>▲</button>
        <input type="range" min="10" max="150" value={bodyY} title="Body height"
          style={sliderStyle}
          onChange={(e) => handleHeightChange(parseFloat((e.target as HTMLInputElement).value))}
        />
        <button style={btnH} onClick={() => handleHeightChange(Math.max(10, bodyY - 1))}>▼</button>
        <span style={labelStyle}>H</span>
        <span style={valStyle}>{bodyY}</span>
      </div>

      {/* Expand/Compact */}
      <div style={colStyle}>
        <button style={btnH} onClick={() => handleSpreadChange(Math.min(1.5, +(tipScale + 0.1).toFixed(1)))}>▲</button>
        <input type="range" max="1.5" min="0.1" step="0.1" value={tipScale} title="Tip spread"
          style={sliderStyle}
          onChange={(e) => handleSpreadChange(parseFloat((e.target as HTMLInputElement).value))}
        />
        <button style={btnH} onClick={() => handleSpreadChange(Math.max(0.1, +(tipScale - 0.1).toFixed(1)))}>▼</button>
        <span style={labelStyle}>↔</span>
        <span style={valStyle}>{tipScale.toFixed(1)}</span>
      </div>

      {/* Rotate step */}
      <div style={colStyle}>
        <button style={btnH} onClick={() => {
          const v = Math.min(45, rotDeg + 1); setRotDeg(v); handleMotionChange('rotate_step', v * Math.PI / 180);
        }}>▲</button>
        <input type="range" min="1" max="45" value={rotDeg} title="Rotate step (°)"
          style={sliderStyle}
          onChange={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value);
            setRotDeg(v); handleMotionChange('rotate_step', v * Math.PI / 180);
          }}
        />
        <button style={btnH} onClick={() => {
          const v = Math.max(1, rotDeg - 1); setRotDeg(v); handleMotionChange('rotate_step', v * Math.PI / 180);
        }}>▼</button>
        <span style={labelStyle}>↻°</span>
        <span style={valStyle}>{rotDeg}°</span>
      </div>

      {/* FB step */}
      <div style={colStyle}>
        <button style={btnH} onClick={() => {
          const v = Math.min(50, fbStep + 1); setFbStep(v); handleMotionChange('fb_step', v);
        }}>▲</button>
        <input type="range" min="1" max="50" value={fbStep} title="F&B step (mm)"
          style={sliderStyle}
          onChange={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value);
            setFbStep(v); handleMotionChange('fb_step', v);
          }}
        />
        <button style={btnH} onClick={() => {
          const v = Math.max(1, fbStep - 1); setFbStep(v); handleMotionChange('fb_step', v);
        }}>▼</button>
        <span style={labelStyle}>↕</span>
        <span style={valStyle}>{fbStep}</span>
      </div>

      {/* LR step */}
      <div style={colStyle}>
        <button style={btnH} onClick={() => {
          const v = Math.min(50, lrStep + 1); setLrStep(v); handleMotionChange('lr_step', v);
        }}>▲</button>
        <input type="range" min="1" max="50" value={lrStep} title="L&R step (mm)"
          style={sliderStyle}
          onChange={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value);
            setLrStep(v); handleMotionChange('lr_step', v);
          }}
        />
        <button style={btnH} onClick={() => {
          const v = Math.max(1, lrStep - 1); setLrStep(v); handleMotionChange('lr_step', v);
        }}>▼</button>
        <span style={labelStyle}>⇔</span>
        <span style={valStyle}>{lrStep}</span>
      </div>
      </div>

      {/* Row 3: Body position buttons + tip lock toggle */}
      <div style={{ ...rowStyle, marginTop: 4 }}>
        <button className="control_btn" title="Save current pose"
          onClick={() => botRef.current?.save_body_home?.()}>Save Pose</button>
        <button className="control_btn" title="Reset to last saved pose"
          onClick={() => { botRef.current?.reset_body_to_home?.(); syncSliders(); }}>↺ Reset Pose</button>
        <button className="control_btn" title="Toggle tip lock (anchor tips when moving body)"
          onClick={() => {
            const bot = botRef.current;
            if (!bot) return;
            bot.options._tip_lock = !(bot.options._tip_lock !== false);
            set_bot_options(bot.options);
          }}
          style={{ background: botRef.current?.options?._tip_lock !== false ? '#2a4a2a' : '#4a2a2a' }}
        >📌 Lock</button>
      </div>
    </div>
  );
}
