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

  useEffect(() => {
    if (inited.current || !moveJsRef.current || !bodyJsRef.current || !rotJsRef.current) return;
    inited.current = true;

    const stop = () => {
      const gc = botRef.current?.gait_controller;
      if (gc) {
        gc.stop();
        const im = gc.actions?.['internal_move'];
        if (im) im._homeSnapped = false;
      }
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
            const ok = bot.transform_body({ dx: v });
            bot.adjust_gait_guidelines();
            return ok;
          }}
        />
        <SliderColumn value={0} min={-24} max={24} label="Y" title="Nudge body height" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const ok = bot.transform_body({ dy: v });
            bot.adjust_gait_guidelines();
            return ok;
          }}
        />
        <SliderColumn value={0} min={-40} max={40} label="Z" title="Nudge body Z" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const ok = bot.transform_body({ dz: v });
            bot.adjust_gait_guidelines();
            return ok;
          }}
        />
        <SliderColumn value={0} min={-30} max={30} label="Rx°" title="Nudge rotate X" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const rad = v * Math.PI / 180;
            const ok = bot.transform_body({ rx: rad });
            bot.adjust_gait_guidelines();
            return ok;
          }}
        />
        <SliderColumn value={0} min={-30} max={30} label="Ry°" title="Nudge rotate Y" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const rad = v * Math.PI / 180;
            const ok = bot.transform_body({ ry: rad });
            bot.adjust_gait_guidelines();
            return ok;
          }}
        />
        <SliderColumn value={0} min={-30} max={30} label="Rz°" title="Nudge rotate Z" springBack
          onChange={(v) => {
            const bot = botRef.current; if (!bot) return false;
            const rad = v * Math.PI / 180;
            const ok = bot.transform_body({ rz: rad });
            bot.adjust_gait_guidelines();
            return ok;
          }}
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
