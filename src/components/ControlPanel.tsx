import { useEffect, useRef, useCallback, useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { JoyStick } from '../hexapod/joystick2';

const drawTypes = [
  { value: 'mesh', label: 'Mesh' },
  { value: 'bone', label: 'Bone' },
  { value: 'points', label: 'Points' },
];

const moveModes = [
  { value: 'move', label: 'Move Mode' },
  { value: 'move_body', label: 'Move Body' },
  { value: 'rotate_body', label: 'Rotate Body' },
];

const stepButtons = [
  { action: 'act_step', value: '87', label: 'Forward(w)' },
  { action: 'act_step', value: '83', label: 'Backward(s)' },
  { action: 'act_step', value: '90', label: 'Move Left(z)' },
  { action: 'act_step', value: '67', label: 'Move Right(c)' },
  { action: 'act_step', value: '65', label: 'Rotate Left(a)' },
  { action: 'act_step', value: '68', label: 'Rotate Right(d)' },
];

const gaits = [
  { value: 'tripod', label: 'Tripod' },
  { value: 'squirm', label: 'Squirm' },
  { value: 'ripple', label: 'Ripple' },
  { value: 'wave1', label: 'Wave1' },
  { value: 'wave2', label: 'Wave2' },
];

const actionTypes = [
  { value: 'power', label: 'power' },
  { value: 'efficient', label: 'efficient' },
  { value: 'body_first', label: 'body first' },
  { value: 'fast', label: 'fast' },
];

const targetModes = [
  { value: 'translate', label: 'translate' },
  { value: 'target', label: 'target' },
];

export default function ControlPanel() {
  const { botRef, updateServoDisplay } = useHexapod();
  const joystickRef = useRef(null);
  const joystickContainerRef = useRef(null);
  const gaitIntervalRef = useRef(null);

  // Active states for toggle groups
  const [drawType, setDrawType] = useState('mesh');
  const [moveMode, setMoveMode] = useState('move');
  const [gait, setGait] = useState('tripod');
  const [actionType, setActionType] = useState('efficient');
  const [targetMode, setTargetMode] = useState('target');
  const [syncMode, setSyncMode] = useState('manual');
  const [tipCircleScale, setTipCircleScale] = useState(1);
  const [dof, setDof] = useState(3);
  const [legCount, setLegCount] = useState(6);
  const [bodyShape, setBodyShape] = useState('rectangle');
  const [polyPlacement, setPolyPlacement] = useState('vertex');
  const [oddOrientation, setOddOrientation] = useState('back');

  const gc = useCallback(() => botRef.current?.gait_controller, [botRef]);

  const handleAction = useCallback((action: string, value?: string) => {
    const bot = botRef.current;
    if (!bot) return;

    switch (action) {
      case 'act_draw_type_switch':
        setDrawType(value!);
        bot.draw_type = value;
        bot.scene.remove(bot.mesh);
        bot.draw();
        bot.apply_status(bot.get_status());
        break;
      case 'mode_switch':
        setMoveMode(value!);
        if (gc()) gc().move_mode = value;
        break;
      case 'act_stop_motion':
        if (gc()) gc().stop();
        break;
      case 'act_action':
        if (gc()) gc().expected_action = value;
        break;
      case 'act_step':
        if (gc()) gc().act(parseInt(value!));
        break;
      case 'act_motion2':
        if (parseInt(value!) === 82) bot.move_body('y', 5);
        if (parseInt(value!) === 70) bot.move_body('y', -5);
        break;
      case 'act_expend':
        setTipCircleScale((s) => {
          const next = Math.min(1.5, +(s + 0.1).toFixed(1));
          bot.tip_circle_scale = next;
          return next;
        });
        break;
      case 'act_compact':
        setTipCircleScale((s) => {
          const next = Math.max(0.5, +(s - 0.1).toFixed(1));
          bot.tip_circle_scale = next;
          return next;
        });
        break;
      case 'gait_switch':
        setGait(value!);
        if (gc()) gc().switch_gait(value);
        break;
      case 'action_switch':
        setActionType(value!);
        if (gc()) gc().switch_action_type(value);
        break;
      case 'target_mode_switch':
        setTargetMode(value!);
        if (gc()) gc().switch_target_mode(value);
        break;
      case 'act_send_cmd':
        bot.send_status();
        break;
      case 'act_sync_cmd':
        setSyncMode(value === 'sync' ? 'sync' : 'manual');
        bot.sync_cmd = value === 'sync';
        break;
      case 'act_reset_configs':
        localStorage.removeItem('hexapod_options');
        window.location.reload();
        break;
      case 'act_disable_console':
        window['console']['log'] = function () { };
        break;
      case 'act_dof_switch':
        const newDof = parseInt(value!);
        setDof(newDof);
        bot.options.dof = newDof;
        bot.apply_attributes(bot.options);
        break;
      case 'act_leg_count_switch':
        const newLegCount = parseInt(value!);
        setLegCount(newLegCount);
        bot.options.leg_count = newLegCount;
        bot.apply_attributes(bot.options);
        break;
      case 'act_body_shape_switch':
        setBodyShape(value!);
        bot.options.body_shape = value;
        bot.apply_attributes(bot.options);
        break;
      case 'act_poly_placement_switch':
        setPolyPlacement(value!);
        bot.options.polygon_leg_placement = value;
        bot.apply_attributes(bot.options);
        break;
      case 'act_odd_orientation_switch':
        setOddOrientation(value!);
        bot.options.polygon_odd_orientation = value;
        bot.apply_attributes(bot.options);
        break;
    }
    updateServoDisplay();
  }, [botRef, gc, updateServoDisplay]);

  // Joystick init
  useEffect(() => {
    if (!joystickContainerRef.current || joystickRef.current) return;
    const joystick = new JoyStick(joystickContainerRef.current, 80);

    joystick.on_handler_activated = function () {
      if (gc()) gc().follow(this);
    };
    joystick.on_handler_deactivated = function () {
      if (gc()) gc().stop();
    };
    joystickRef.current = joystick;
  }, [gc]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const bot = botRef.current;
      if (!bot) return;

      if (e.ctrlKey || e.metaKey) {
        if (gc()) gc().stop();
        if (e.keyCode === 83) {
          e.preventDefault();
          const code = JSON.stringify(bot.options);
          const blob = new Blob([code], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'bot_config.json');
          link.dispatchEvent(new MouseEvent('click'));
        }
        return;
      }

      if (gc()?.move_mode === 'move') {
        if (e.keyCode === 82) bot.move_body('y', 5);
        if (e.keyCode === 70) bot.move_body('y', -5);
        if (gc()) gc().expected_action = e.keyCode;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      if (gc()) gc().stop();
    };

    document.body.addEventListener('keydown', handleKeyDown);
    document.body.addEventListener('keyup', handleKeyUp);

    gaitIntervalRef.current = setInterval(() => {
      if (gc()) gc().fire_action();
      updateServoDisplay();
    }, 30);

    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
      document.body.removeEventListener('keyup', handleKeyUp);
      clearInterval(gaitIntervalRef.current);
    };
  }, [botRef, gc, updateServoDisplay]);

  return (
    <div>
      <fieldset className="btns">
        <legend>Draw Type</legend>
        {drawTypes.map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${drawType === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('act_draw_type_switch', item.value); }}
          >
            {item.label}
          </a>
        ))}
      </fieldset>

      <fieldset className="btns">
        <legend>Body</legend>
        <a href="#" className={`control_btn${bodyShape === 'rectangle' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_body_shape_switch', 'rectangle'); }}>Rect</a>
        <a href="#" className={`control_btn${bodyShape === 'polygon' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_body_shape_switch', 'polygon'); }}>Poly</a>
        {bodyShape === 'polygon' && (
          <>
            {' | '}
            <a href="#" className={`control_btn${polyPlacement === 'vertex' ? ' active' : ''}`}
              onClick={(e) => { e.preventDefault(); handleAction('act_poly_placement_switch', 'vertex'); }}>Vertex</a>
            <a href="#" className={`control_btn${polyPlacement === 'edge' ? ' active' : ''}`}
              onClick={(e) => { e.preventDefault(); handleAction('act_poly_placement_switch', 'edge'); }}>Edge</a>
            {legCount % 2 !== 0 && (
              <>
                {' | '}
                <a href="#" className={`control_btn${oddOrientation === 'back' ? ' active' : ''}`}
                  onClick={(e) => { e.preventDefault(); handleAction('act_odd_orientation_switch', 'back'); }}>1-Back</a>
                <a href="#" className={`control_btn${oddOrientation === 'front' ? ' active' : ''}`}
                  onClick={(e) => { e.preventDefault(); handleAction('act_odd_orientation_switch', 'front'); }}>1-Front</a>
              </>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="btns">
        <legend>DOF</legend>
        <a href="#" className={`control_btn${dof === 3 ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_dof_switch', '3'); }}>3-DOF</a>
        <a href="#" className={`control_btn${dof === 4 ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_dof_switch', '4'); }}>4-DOF</a>
      </fieldset>

      <fieldset className="btns">
        <legend>Legs</legend>
        <a href="#" className={`control_btn${legCount === 3 ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_leg_count_switch', '3'); }}>3</a>
        <a href="#" className={`control_btn${legCount === 4 ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_leg_count_switch', '4'); }}>4</a>
        <a href="#" className={`control_btn${legCount === 5 ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_leg_count_switch', '5'); }}>5</a>
        <a href="#" className={`control_btn${legCount === 6 ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_leg_count_switch', '6'); }}>6</a>
      </fieldset>

      <fieldset className="btns">
        <legend>Move Mode</legend>
        {moveModes.map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${moveMode === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('mode_switch', item.value); }}
          >
            {item.label}
          </a>
        ))}
      </fieldset>

      <fieldset className="btns">
        <legend>...</legend>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_stop_motion'); }}>Stop</a>
        {' | '}
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_action', 'act_standby'); }}>Standby</a>
        {' | '}
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_action', 'act_putdown_tips'); }}>Putdown Tips</a>
        {' '}
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_reset_configs'); }}>Reset Configs</a>
        {' | '}
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_disable_console'); }}>Disable Console</a>
      </fieldset>

      <fieldset className="btns">
        <legend>...</legend>
        {stepButtons.map((btn) => (
          <span key={btn.value}>
            <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction(btn.action, btn.value); }}>
              {btn.label}
            </a>
            {['87', '90', '65'].includes(btn.value) && ' | '}
            {btn.value === '83' && <hr />}
            {btn.value === '68' && <hr />}
          </span>
        ))}

        <hr />

        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_motion2', '82'); }}>Raise(r)</a>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_motion2', '70'); }}>Fall(f)</a>
        {' | '}
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_expend'); }}>Expand</a>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_compact'); }}>Compact</a>
        <input type="range" max="1.5" min="0.5" step="0.1" value={tipCircleScale}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setTipCircleScale(v);
            if (botRef.current) botRef.current.tip_circle_scale = v;
          }}
        />
      </fieldset>

      <fieldset className="btns">
        <legend>Gaits</legend>
        {gaits.map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${gait === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('gait_switch', item.value); }}
          >
            {item.label}
          </a>
        ))}
      </fieldset>

      <fieldset className="btns">
        <legend>...</legend>
        {actionTypes.map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${actionType === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('action_switch', item.value); }}
          >
            {item.value === 'fast' ? <>{item.label}<sub>beta</sub></> : item.label}
          </a>
        ))}
        {' | '}
        {targetModes.map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${targetMode === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('target_mode_switch', item.value); }}
          >
            {item.label}
          </a>
        ))}
      </fieldset>

      <div className="joystick-container" ref={joystickContainerRef}></div>

      <div style={{ marginTop: 10 }}>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_send_cmd'); }}>Send</a>
        {' | '}
        <a
          href="#"
          className={`control_btn${syncMode === 'sync' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_sync_cmd', 'sync'); }}
        >
          Sync
        </a>
        <a
          href="#"
          className={`control_btn${syncMode === 'manual' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); handleAction('act_sync_cmd', ''); }}
        >
          Manually
        </a>
      </div>
    </div>
  );
}
