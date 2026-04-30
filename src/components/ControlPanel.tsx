import { useEffect, useRef, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import appState from '../hexapod/appState';
import { JoyStick } from '../hexapod/joystick2';

// Button groups as data to keep JSX concise
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

  // Helper to get gait controller
  const gc = useCallback(() => botRef.current?.gait_controller, [botRef]);

  // Button click handler
  const handleAction = useCallback((action: string, value?: string) => {
    const bot = botRef.current;
    if (!bot) return;

    switch (action) {
      case 'act_draw_type_switch':
        bot.draw_type = value;
        appState.scene.remove(bot.mesh);
        bot.draw();
        bot.apply_status(bot.get_status());
        break;
      case 'mode_switch':
        if (gc()) gc().move_mode = value;
        break;
      case 'act_stop_motion':
        if (gc()) gc().stop();
        break;
      case 'act_action':
        if (gc()) gc().expected_action = value;
        break;
      case 'act_step':
        if (gc()) gc().act(parseInt(value));
        break;
      case 'act_motion2':
        if (parseInt(value) === 82) bot.move_body('y', 5);
        if (parseInt(value) === 70) bot.move_body('y', -5);
        break;
      case 'act_expend':
        bot.tip_circle_scale += 0.1;
        break;
      case 'act_compact':
        bot.tip_circle_scale -= 0.1;
        break;
      case 'gait_switch':
        if (gc()) gc().switch_gait(value);
        break;
      case 'action_switch':
        if (gc()) gc().switch_action_type(value);
        break;
      case 'target_mode_switch':
        if (gc()) gc().switch_target_mode(value);
        break;
      case 'act_send_cmd':
        bot.send_status();
        break;
      case 'act_sync_cmd':
        bot.sync_cmd = value === 'sync';
        break;
      case 'act_reset_configs':
        localStorage.removeItem('hexapod_options');
        window.location.reload();
        break;
      case 'act_disable_console':
        window['console']['log'] = function () { };
        break;
      default:
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
    const handleKeyDown = (e) => {
      const bot = botRef.current;
      if (!bot) return;

      if (e.ctrlKey || e.metaKey) {
        if (gc()) gc().stop();
        if (e.keyCode === 83) {
          e.preventDefault();
          // Save config
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

    const handleKeyUp = (e) => {
      e.preventDefault();
      if (gc()) gc().stop();
    };

    document.body.addEventListener('keydown', handleKeyDown);
    document.body.addEventListener('keyup', handleKeyUp);

    // Main gait loop
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

  const SwitchGroup = ({ legend, items, action }) => (
    <fieldset className="btns">
      <legend>{legend}</legend>
      {items.map((item) => (
        <a
          key={`${action}-${item.value}`}
          href="#"
          data-type="switch"
          data-value={item.value}
          data-action={action}
          className={`control_btn${item.value === 'mesh' || item.value === 'move' || item.value === 'tripod' || item.value === 'efficient' || item.value === 'target' ? ' active' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            handleAction(action, item.value);
          }}
        >
          {item.label}
        </a>
      ))}
    </fieldset>
  );

  return (
    <div>
      <SwitchGroup legend="Draw Type" items={drawTypes} action="act_draw_type_switch" />
      <SwitchGroup legend="Move Mode" items={moveModes} action="mode_switch" />

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
        <input type="range" max="1.5" min="0.5" step="0.1" defaultValue="1"
          onChange={(e) => {
            if (botRef.current) botRef.current.tip_circle_scale = parseFloat(e.target.value);
          }}
        />
      </fieldset>

      <SwitchGroup legend="Gaits" items={gaits} action="gait_switch" />

      <fieldset className="btns">
        <legend>...</legend>
        {actionTypes.map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${item.value === 'efficient' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('action_switch', item.value); }}
          >
            {item.value === 'fast' ? <>{item.label}<sub>beta</sub></> : item.label}
          </a>
        ))}
        {' | '}
        <SwitchGroupContainerless items={targetModes} action="target_mode_switch" defaultActive="target" onClick={handleAction} />
      </fieldset>

      <div className="joystick-container" ref={joystickContainerRef}></div>

      <div style={{ marginTop: 10 }}>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_send_cmd'); }}>Send</a>
        {' | '}
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleAction('act_sync_cmd', 'sync'); }}>Sync</a>
        <a href="#" className="control_btn active" onClick={(e) => { e.preventDefault(); handleAction('act_sync_cmd', ''); }}>Manually</a>
      </div>
    </div>
  );
}

// Small inline switch group (for target mode within fieldset)
function SwitchGroupContainerless({ items, action, defaultActive, onClick }) {
  return items.map((item) => (
    <a
      key={item.value}
      href="#"
      className={`control_btn${item.value === defaultActive ? ' active' : ''}`}
      onClick={(e) => { e.preventDefault(); onClick(action, item.value); }}
    >
      {item.label}
    </a>
  ));
}
