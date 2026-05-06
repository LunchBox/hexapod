import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
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
  const { botRef } = useHexapod();
  const moveJsRef = useRef<HTMLDivElement>(null);
  const bodyJsRef = useRef<HTMLDivElement>(null);
  const rotJsRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);

  // Accumulated delta per axis during current drag session
  const accRef = useRef({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });

  const restoreHome = (axis: keyof typeof accRef.current) => {
    const bot = botRef.current;
    if (!bot) return;
    const total = accRef.current[axis];
    if (Math.abs(total) < 0.001) return;
    accRef.current[axis] = 0;
    const useServo = bot.options.physics_mode === 'servo_constraint';
    const opts: any = {};
    if (axis === 'x') opts.dx = -total;
    else if (axis === 'y') opts.dy = -total;
    else if (axis === 'z') opts.dz = -total;
    else if (axis === 'rx') opts.rx = -total;
    else if (axis === 'ry') opts.ry = -total;
    else if (axis === 'rz') opts.rz = -total;
    if (useServo) {
      bot.transform_body_servo(opts);
    } else {
      bot.transform_body(opts);
      bot.recalibrate_legs_to_home();
    }
    bot.adjust_gait_guidelines();
  };

  useEffect(() => {
    if (inited.current || !moveJsRef.current || !bodyJsRef.current || !rotJsRef.current) return;
    inited.current = true;

    const stop = () => {
      const bot = botRef.current;
      const gc = bot?.gait_controller;
      if (!gc || !bot) return;
      const im = gc.actions?.['internal_move'];
      // For move_body / rotate_body, restore body to snapshot home on release
      if (im?._homeSnapped && (gc.move_mode === 'move_body' || gc.move_mode === 'rotate_body')) {
        const h = im.homePos, hr = im.homeRot;
        const bm = bot.body_mesh;
        const dx = h.x - bm.position.x, dy = h.y - bm.position.y, dz = h.z - bm.position.z;
        const rx = hr.x - bm.rotation.x, ry = hr.y - bm.rotation.y, rz = hr.z - bm.rotation.z;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001 || Math.abs(dz) > 0.001 ||
            Math.abs(rx) > 0.001 || Math.abs(ry) > 0.001 || Math.abs(rz) > 0.001) {
          const useServo = bot.options.physics_mode === 'servo_constraint';
          if (useServo) {
            bot.transform_body_servo({ dx, dy, dz, rx, ry, rz });
          } else {
            bot.transform_body({ dx, dy, dz, rx, ry, rz });
            bot.recalibrate_legs_to_home();
          }
          bot.adjust_gait_guidelines();
        }
      }
      gc.stop();
      if (im) im._homeSnapped = false;
    };

    makeJoystick(moveJsRef.current, 45, (j) => {
      const gc = botRef.current?.gait_controller;
      if (gc) { gc.move_mode = 'move'; gc.follow(j); }
    }, stop);

    makeJoystick(bodyJsRef.current, 45, (j) => {
      const gc = botRef.current?.gait_controller;
      if (gc) { gc.move_mode = 'move_body'; gc.follow(j); }
    }, stop);

    makeJoystick(rotJsRef.current, 45, (j) => {
      const gc = botRef.current?.gait_controller;
      if (gc) { gc.move_mode = 'rotate_body'; gc.follow(j); }
    }, stop);
  }, [botRef]);

  return (
    <div className="py-3 px-2.5 my-2">
      {/* Row 1: Joysticks */}
      <div className="flex items-end gap-2.5 flex-wrap">
        <div className="flex flex-col items-center justify-end h-[150px]">
          <div ref={moveJsRef}></div>
          <span className="text-[10px] text-muted-foreground h-4 leading-4">Move</span>
        </div>
        <div className="flex flex-col items-center justify-end h-[150px]">
          <div ref={bodyJsRef}></div>
          <span className="text-[10px] text-muted-foreground h-4 leading-4">Body</span>
        </div>
        <div className="flex flex-col items-center justify-end h-[150px]">
          <div ref={rotJsRef}></div>
          <span className="text-[10px] text-muted-foreground h-4 leading-4">Rot</span>
        </div>
      </div>

      {/* Row 2: Sliders */}
      <div className="flex items-end gap-2.5 flex-wrap">
        <SliderColumn value={0} min={-40} max={40} label="X" title="Nudge body X" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            accRef.current.x += v;
            const ok = bot.transform_body({ dx: v });
            bot.adjust_gait_guidelines();
            return ok;
          }}
          onDragEnd={() => restoreHome('x')}
        />
        <SliderColumn value={0} min={-24} max={24} label="Y" title="Nudge body height" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            accRef.current.y += v;
            const ok = bot.transform_body({ dy: v });
            bot.adjust_gait_guidelines();
            return ok;
          }}
          onDragEnd={() => restoreHome('y')}
        />
        <SliderColumn value={0} min={-40} max={40} label="Z" title="Nudge body Z" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            accRef.current.z += v;
            const ok = bot.transform_body({ dz: v });
            bot.adjust_gait_guidelines();
            return ok;
          }}
          onDragEnd={() => restoreHome('z')}
        />
        <SliderColumn value={0} min={-30} max={30} label="Rx°" title="Nudge rotate X" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const rad = v * Math.PI / 180;
            accRef.current.rx += rad;
            const ok = bot.transform_body({ rx: rad });
            bot.adjust_gait_guidelines();
            return ok;
          }}
          onDragEnd={() => restoreHome('rx')}
        />
        <SliderColumn value={0} min={-30} max={30} label="Ry°" title="Nudge rotate Y" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const rad = v * Math.PI / 180;
            accRef.current.ry += rad;
            const ok = bot.transform_body({ ry: rad });
            bot.adjust_gait_guidelines();
            return ok;
          }}
          onDragEnd={() => restoreHome('ry')}
        />
        <SliderColumn value={0} min={-30} max={30} label="Rz°" title="Nudge rotate Z" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const rad = v * Math.PI / 180;
            accRef.current.rz += rad;
            const ok = bot.transform_body({ rz: rad });
            bot.adjust_gait_guidelines();
            return ok;
          }}
          onDragEnd={() => restoreHome('rz')}
        />
      </div>

      {/* Row 3: tip lock toggle */}
      <div className="flex items-end gap-2.5 flex-wrap mt-1">
        <label className="text-[11px] text-muted-foreground flex items-center gap-1">
          <input type="checkbox" checked disabled /> Lock Tips
        </label>
      </div>
    </div>
  );
}
