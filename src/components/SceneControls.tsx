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
      <SliderColumn value={bodyX} min={-40} max={40} label="X" title="Nudge body X" springBack
        onChange={(v) => {
          const bot = botRef.current; if (!bot) return false;
          const ok = bot.transform_body({ dx: v });
          bot.adjust_gait_guidelines();
          if (ok) setBodyX(Math.round(bot.body_mesh.position.x));
          return ok;
        }}
      />
      <SliderColumn value={bodyY} min={-24} max={24} label="Y" title="Nudge body height" springBack
        onChange={(v) => {
          const bot = botRef.current; if (!bot) return false;
          const ok = bot.transform_body({ dy: v });
          bot.adjust_gait_guidelines();
          if (ok) setBodyY(Math.round(bot.body_mesh.position.y));
          return ok;
        }}
      />
      <SliderColumn value={bodyZ} min={-40} max={40} label="Z" title="Nudge body Z" springBack
        onChange={(v) => {
          const bot = botRef.current; if (!bot) return false;
          const ok = bot.transform_body({ dz: v });
          bot.adjust_gait_guidelines();
          if (ok) setBodyZ(Math.round(bot.body_mesh.position.z));
          return ok;
        }}
      />
      <SliderColumn value={rotX} min={-30} max={30} label="Rx°" title="Nudge rotate X" springBack
        onChange={(v) => {
          const bot = botRef.current; if (!bot) return false;
          const rad = v * Math.PI / 180;
          const ok = bot.transform_body({ rx: rad });
          bot.adjust_gait_guidelines();
          if (ok) setRotX(Math.round(bot.body_mesh.rotation.x * 180 / Math.PI));
          return ok;
        }}
      />
      <SliderColumn value={rotY} min={-30} max={30} label="Ry°" title="Nudge rotate Y" springBack
        onChange={(v) => {
          const bot = botRef.current; if (!bot) return false;
          const rad = v * Math.PI / 180;
          const ok = bot.transform_body({ ry: rad });
          bot.adjust_gait_guidelines();
          if (ok) setRotY(Math.round(bot.body_mesh.rotation.y * 180 / Math.PI));
          return ok;
        }}
      />
      <SliderColumn value={rotZ} min={-30} max={30} label="Rz°" title="Nudge rotate Z" springBack
        onChange={(v) => {
          const bot = botRef.current; if (!bot) return false;
          const rad = v * Math.PI / 180;
          const ok = bot.transform_body({ rz: rad });
          bot.adjust_gait_guidelines();
          if (ok) setRotZ(Math.round(bot.body_mesh.rotation.z * 180 / Math.PI));
          return ok;
        }}
      />
      </div>

      {/* Row 3: Body position buttons + tip lock toggle */}
      <div style={{ ...rowStyle, marginTop: 4 }}>
        <button className="control_btn" title="Save current pose"
          onClick={() => botRef.current?.save_body_home?.()}>Save Pose</button>
        <button className="control_btn" title="Reset rotation & stance to saved pose at current position"
          onClick={() => { botRef.current?.reset_body_to_home?.(true); syncSliders(); }}>↺ Recall</button>
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
