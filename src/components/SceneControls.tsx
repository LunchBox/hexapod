import { useEffect, useRef } from 'react';
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

type BodyPose = { px: number; py: number; pz: number; rx: number; ry: number; rz: number };
type Axis = 'px' | 'py' | 'pz' | 'rx' | 'ry' | 'rz';

function snapshotBodyPose(bot: any): BodyPose {
  const bm = bot.body_mesh;
  return {
    px: bm.position.x, py: bm.position.y, pz: bm.position.z,
    rx: bm.rotation.x, ry: bm.rotation.y, rz: bm.rotation.z,
  };
}

export default function SceneControls() {
  const { botRef } = useHexapod();
  const moveJsRef = useRef<HTMLDivElement>(null);
  const bodyJsRef = useRef<HTMLDivElement>(null);
  const rotJsRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);

  // Per-axis slider drag session state. accRef[axis] is the accumulated delta
  // for the current drag; sliderHome is the body pose at drag start.
  const accRef = useRef<Record<Axis, number>>({ px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 });
  const sliderHomeRef = useRef<BodyPose | null>(null);

  // Begin a slider drag session if one isn't already active.
  const ensureSliderSession = () => {
    const bot = botRef.current;
    if (!bot) return null;
    if (!sliderHomeRef.current) {
      bot.begin_body_tracking();
      sliderHomeRef.current = snapshotBodyPose(bot);
      accRef.current = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
    }
    return { bot, home: sliderHomeRef.current };
  };

  // Slider tick: accumulate delta on axis and write body_target.
  const sliderTick = (axis: Axis, delta: number) => {
    const session = ensureSliderSession();
    if (!session) return false;
    accRef.current[axis] += delta;
    session.bot.body_target = {
      ...session.home,
      [axis]: session.home[axis] + accRef.current[axis],
    };
    return true;
  };

  // Slider release: spring body back to home.
  const sliderRelease = () => {
    const bot = botRef.current;
    if (!bot || !sliderHomeRef.current) return;
    bot.body_target = { ...sliderHomeRef.current };
    bot._body_tracking_release_pending = true;
    sliderHomeRef.current = null;
    accRef.current = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
  };

  useEffect(() => {
    if (inited.current || !moveJsRef.current || !bodyJsRef.current || !rotJsRef.current) return;
    inited.current = true;

    // Walking joystick: routes through gc.follow / gc.stop. Unchanged.
    const stopWalking = () => {
      const gc = botRef.current?.gait_controller;
      gc?.stop();
    };
    const attachWalkingJoystick = (ref: typeof moveJsRef) => {
      makeJoystick(ref.current!, 45, (j) => {
        const bot = botRef.current;
        const gc = bot?.gait_controller;
        if (!gc) return;
        gc.move_mode = 'move';
        if (bot.options.move_mode !== 'move') {
          bot.options.move_mode = 'move';
          set_bot_options(bot.options);
        }
        gc.follow(j);
      }, stopWalking);
    };

    // Body-target tracking joysticks. The rAF loop in SceneCanvas chases
    // bot.body_target at servo_speed pace — no setInterval, no synchronous
    // transform_body. On release we set body_target = home and let rAF spring back.
    const attachBodyTargetJoystick = (
      ref: typeof bodyJsRef,
      compute: (j: any, home: BodyPose) => BodyPose,
    ) => {
      let homeSnapshot: BodyPose | null = null;
      makeJoystick(ref.current!, 45, (j) => {
        const bot = botRef.current;
        if (!bot) return;
        if (!homeSnapshot) {
          bot.begin_body_tracking();
          homeSnapshot = snapshotBodyPose(bot);
        }
        bot.body_target = compute(j, homeSnapshot);
      }, () => {
        const bot = botRef.current;
        if (!bot || !homeSnapshot) return;
        bot.body_target = { ...homeSnapshot };
        bot._body_tracking_release_pending = true;
        homeSnapshot = null;
      });
    };

    attachWalkingJoystick(moveJsRef);
    attachBodyTargetJoystick(bodyJsRef, (j, home) => {
      const max = 40;
      const fb_rate = max / j.radius;
      const lr_rate = max / j.radius;
      return {
        px: home.px + j.pos.x * lr_rate,
        py: home.py,
        pz: home.pz + j.pos.y * fb_rate,
        rx: home.rx, ry: home.ry, rz: home.rz,
      };
    });
    attachBodyTargetJoystick(rotJsRef, (j, home) => {
      const max = Math.PI / 12;
      const fb_rate = max / j.radius;
      const lr_rate = max / j.radius;
      return {
        px: home.px, py: home.py, pz: home.pz,
        rx: home.rx + j.pos.y * lr_rate,
        ry: home.ry,
        rz: home.rz - j.pos.x * fb_rate,
      };
    });
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

      {/* Row 2: Sliders — all 6 axes write bot.body_target via sliderTick. */}
      <div className="flex items-end gap-2.5 flex-wrap">
        <SliderColumn value={0} min={-40} max={40} label="X" title="Nudge body X" springBack
          onChange={(v) => sliderTick('px', v)} onDragEnd={sliderRelease} />
        <SliderColumn value={0} min={-24} max={24} label="Y" title="Nudge body height" springBack
          onChange={(v) => sliderTick('py', v)} onDragEnd={sliderRelease} />
        <SliderColumn value={0} min={-40} max={40} label="Z" title="Nudge body Z" springBack
          onChange={(v) => sliderTick('pz', v)} onDragEnd={sliderRelease} />
        <SliderColumn value={0} min={-30} max={30} label="Rx°" title="Nudge rotate X" springBack
          onChange={(v) => sliderTick('rx', v * Math.PI / 180)} onDragEnd={sliderRelease} />
        <SliderColumn value={0} min={-30} max={30} label="Ry°" title="Nudge rotate Y" springBack
          onChange={(v) => sliderTick('ry', v * Math.PI / 180)} onDragEnd={sliderRelease} />
        <SliderColumn value={0} min={-30} max={30} label="Rz°" title="Nudge rotate Z" springBack
          onChange={(v) => sliderTick('rz', v * Math.PI / 180)} onDragEnd={sliderRelease} />
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
