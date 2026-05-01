import { useEffect, useRef, useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { JoyStick } from '../hexapod/joystick2';
import SliderColumn from './SliderColumn';

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
  const [bodyX, setBodyX] = useState(0);
  const [bodyZ, setBodyZ] = useState(0);
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);

  useEffect(() => {
    const bot = botRef.current;
    if (!bot) return;
    setBodyY(Math.round(bot.body_mesh?.position?.y ?? 10));
    setRotX(Math.round(bot.body_mesh?.rotation?.x * 180 / Math.PI) || 0);
    setRotY(Math.round(bot.body_mesh?.rotation?.y * 180 / Math.PI) || 0);
    setRotZ(Math.round(bot.body_mesh?.rotation?.z * 180 / Math.PI) || 0);
    setBodyX(Math.round(bot.body_mesh?.position?.x ?? 0));
    setBodyZ(Math.round(bot.body_mesh?.position?.z ?? 0));
    setBodyY(Math.round(bot.body_mesh?.position?.y ?? 10));
  }, [botVersion, botRef]);

  const syncSliders = () => {
    const bot = botRef.current;
    if (!bot) return;
    setBodyY(Math.round(bot.body_mesh?.position?.y ?? 10));
    setBodyX(Math.round(bot.body_mesh?.position?.x ?? 0));
    setBodyZ(Math.round(bot.body_mesh?.position?.z ?? 0));
    setRotX(Math.round(bot.body_mesh?.rotation?.x * 180 / Math.PI) || 0);
    setRotY(Math.round(bot.body_mesh?.rotation?.y * 180 / Math.PI) || 0);
    setRotZ(Math.round(bot.body_mesh?.rotation?.z * 180 / Math.PI) || 0);
  };

  const handleBodyPos = (axis: string, v: number): boolean => {
    const bot = botRef.current;
    if (!bot) return false;
    const cur = (bot.body_mesh.position as any)[axis];
    const delta = v - cur;
    if (Math.abs(delta) < 0.5) return true;
    const ok = bot.transform_body({ ['d' + axis]: delta });
    bot.adjust_gait_guidelines();
    if (!ok) {
      if (axis === 'x') setBodyX(Math.round(cur));
      else if (axis === 'y') setBodyY(Math.round(cur));
      else if (axis === 'z') setBodyZ(Math.round(cur));
    }
    return ok;
  };

  const handleAxisRot = (axis: string, deg: number): boolean => {
    const bot = botRef.current;
    if (!bot) return false;
    const rad = deg * Math.PI / 180;
    const cur = (bot.body_mesh.rotation as any)[axis];
    const delta = rad - cur;
    if (Math.abs(delta) < 0.001) return true;
    const ok = bot.transform_body({ ['r' + axis]: delta });
    bot.adjust_gait_guidelines();
    return ok;
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    height: 150,
  };

  return (
    <div style={{ padding: '12px 10px', margin: '8px 0' }}>
      {/* Row 1: Joysticks */}
      <div style={rowStyle}>
        <div style={{ ...colStyle, justifyContent: 'flex-end' }}>
          <div ref={moveJsRef}></div>
          <span style={{ fontSize: 10, color: '#888', height: 16, lineHeight: '16px' }}>Move</span>
        </div>
        <div style={{ ...colStyle, justifyContent: 'flex-end' }}>
          <div ref={bodyJsRef}></div>
          <span style={{ fontSize: 10, color: '#888', height: 16, lineHeight: '16px' }}>Body</span>
        </div>
        <div style={{ ...colStyle, justifyContent: 'flex-end' }}>
          <div ref={rotJsRef}></div>
          <span style={{ fontSize: 10, color: '#888', height: 16, lineHeight: '16px' }}>Rot</span>
        </div>
      </div>

      {/* Row 2: Sliders */}
      <div style={rowStyle}>
      <SliderColumn value={bodyX} min={-80} max={80} label="X" title="Body X position"
        onChange={(v) => { setBodyX(v); return handleBodyPos('x', v); }}
      />
      <SliderColumn value={bodyY} min={10} max={150} label="Y" title="Body height"
        onChange={(v) => { setBodyY(v); return handleBodyPos('y', v); }}
      />
      <SliderColumn value={bodyZ} min={-80} max={80} label="Z" title="Body Z position"
        onChange={(v) => { setBodyZ(v); return handleBodyPos('z', v); }}
      />
      <SliderColumn value={rotX} min={-45} max={45} label="Rx°" title="Rotate X axis"
        displayValue={rotX + '°'}
        onChange={(v) => { setRotX(v); return handleAxisRot('x', v); }}
      />
      <SliderColumn value={rotY} min={-45} max={45} label="Ry°" title="Rotate Y axis"
        displayValue={rotY + '°'}
        onChange={(v) => { setRotY(v); return handleAxisRot('y', v); }}
      />
      <SliderColumn value={rotZ} min={-45} max={45} label="Rz°" title="Rotate Z axis"
        displayValue={rotZ + '°'}
        onChange={(v) => { setRotZ(v); return handleAxisRot('z', v); }}
      />
      </div>

      {/* Row 3: Body position buttons + tip lock toggle */}
      <div style={{ ...rowStyle, marginTop: 4 }}>
        <button className="control_btn" title="Save current pose"
          onClick={() => botRef.current?.save_body_home?.()}>Save Pose</button>
        <button className="control_btn" title="Reset to last saved pose"
          onClick={() => { botRef.current?.reset_body_to_home?.(); syncSliders(); }}>↺ Recall</button>
        <button className="control_btn" title="Reset body to init pose, keep leg attributes"
          onClick={() => {
            botRef.current?.reset_body_to_init?.();
            syncSliders();
          }}>↺ Init Pose</button>
        <label title="Tip lock is always enabled" style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked disabled /> Lock Tips
        </label>
      </div>
    </div>
  );
}
