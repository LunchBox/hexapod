import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';

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

function getGaitList(bot: any) {
  const gc = bot?.gait_controller;
  if (!gc?.gaits) return [];
  return Object.keys(gc.gaits).map(k => ({ value: k, label: k }));
}

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
  const { botRef, updateServoDisplay, bumpBotVersion } = useHexapod();
  const gaitIntervalRef = useRef(null);

  // Re-read localStorage on every mount so tab re-mount picks up latest state
  const saved = useMemo(() => get_bot_options(), []);

  // Active states for toggle groups
  const [drawType, setDrawType] = useState(saved.draw_type || 'mesh');
  const [moveMode, setMoveMode] = useState(saved.move_mode || 'move');
  const [gait, setGait] = useState(saved.gait || 'tripod');
  const [actionType, setActionType] = useState(saved.action_type || 'efficient');
  const [targetMode, setTargetMode] = useState(saved.target_mode || 'target');
  const [syncMode, setSyncMode] = useState(saved.sync_cmd ? 'sync' : 'manual');
  const [tipCircleScale, setTipCircleScale] = useState(saved.tip_circle_scale ?? 1);
  const [dof, setDof] = useState(saved.dof || 3);
  // Which legs to apply DOF changes to (default all checked)
  const [dofLegs, setDofLegs] = useState<Set<number>>(() => {
    const count = saved.leg_count || 6;
    return new Set(Array.from({ length: count }, (_, i) => i));
  });
  const [legCount, setLegCount] = useState(saved.leg_count || 6);
  const [bodyShape, setBodyShape] = useState(saved.body_shape || 'rectangle');
  const [polyPlacement, setPolyPlacement] = useState(saved.polygon_leg_placement || 'vertex');
  const [oddOrientation, setOddOrientation] = useState(saved.polygon_odd_orientation || 'back');
  const [bodyHeightVal, setBodyHeightVal] = useState((saved.body_height || 20) / 2);

  const gc = useCallback(() => botRef.current?.gait_controller, [botRef]);

  const handleAction = useCallback((action: string, value?: string) => {
    const bot = botRef.current;
    if (!bot) return;

    switch (action) {
      case 'act_draw_type_switch':
        setDrawType(value!);
        bot.draw_type = value;
        bot.options.draw_type = value;
        bot.scene.remove(bot.mesh);
        bot.draw();
        bot.apply_status(bot.get_status());
        break;
      case 'mode_switch':
        setMoveMode(value!);
        if (gc()) gc().move_mode = value;
        bot.options.move_mode = value;
        set_bot_options(bot.options);
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
        if (parseInt(value!) === 82) {
          bot.move_body('y', 5);
          setBodyHeightVal(bot.body_mesh.position.y);
        }
        if (parseInt(value!) === 70) {
          bot.move_body('y', -5);
          setBodyHeightVal(bot.body_mesh.position.y);
        }
        break;
      case 'act_expend': {
        const cur = bot.options.tip_circle_scale ?? 1;
        const next = Math.min(1.5, +(cur + 0.1).toFixed(1));
        setTipCircleScale(next);
        bot.options.tip_circle_scale = next;
        set_bot_options(bot.options);
        bot.adjust_tip_spread(next);
        break;
      }
      case 'act_compact': {
        const cur = bot.options.tip_circle_scale ?? 1;
        const next = Math.max(0.1, +(cur - 0.1).toFixed(1));
        setTipCircleScale(next);
        bot.options.tip_circle_scale = next;
        set_bot_options(bot.options);
        bot.adjust_tip_spread(next);
        break;
      }
        break;
      case 'gait_switch':
        setGait(value!);
        if (gc()) gc().switch_gait(value);
        bot.options.gait = value;
        set_bot_options(bot.options);
        break;
      case 'action_switch':
        setActionType(value!);
        if (gc()) gc().switch_action_type(value);
        bot.options.action_type = value;
        set_bot_options(bot.options);
        break;
      case 'target_mode_switch':
        setTargetMode(value!);
        if (gc()) gc().switch_target_mode(value);
        bot.options.target_mode = value;
        set_bot_options(bot.options);
        break;
      case 'act_send_cmd':
        bot.send_status();
        break;
      case 'act_sync_cmd':
        setSyncMode(value === 'sync' ? 'sync' : 'manual');
        bot.sync_cmd = value === 'sync';
        bot.options.sync_cmd = value === 'sync';
        set_bot_options(bot.options);
        break;
      case 'act_reset_configs':
        localStorage.removeItem('hexapod_options');
        window.location.reload();
        break;
      case 'act_toggle_dof_leg':
        const legIdx = parseInt(value!);
        setDofLegs(prev => {
          const next = new Set(prev);
          if (next.has(legIdx)) next.delete(legIdx); else next.add(legIdx);
          return next;
        });
        break;
      case 'act_disable_console':
        window['console']['log'] = function () { };
        break;
      case 'act_dof_switch':
        const newDof = parseInt(value!);
        setDof(newDof);
        bot.options.dof = newDof;
        // Apply DOF only to checked legs
        for (let i = 0; i < bot.options.leg_options.length; i++) {
          if (dofLegs.has(i)) {
            bot.options.leg_options[i].dof = newDof;
          }
        }
        bot.apply_attributes(bot.options);
        bumpBotVersion();
        break;
      case 'act_leg_count_switch':
        const newLegCount = parseInt(value!);
        setLegCount(newLegCount);
        // Sync DOF leg checkboxes to new leg count
        setDofLegs(new Set(Array.from({ length: newLegCount }, (_, i) => i)));
        bot.options.leg_count = newLegCount;
        bot.apply_attributes(bot.options);
        // Reset gait if current one no longer exists in new gait set
        if (!bot.gait_controller.gaits[bot.options.gait || 'tripod']) {
          bot.options.gait = 'tripod';
          setGait('tripod');
        }
        bumpBotVersion();
        break;
      case 'act_body_shape_switch':
        setBodyShape(value!);
        bot.options.body_shape = value;
        bot.apply_attributes(bot.options);
        if (!bot.gait_controller.gaits[bot.options.gait || 'tripod']) {
          bot.options.gait = 'tripod';
          setGait('tripod');
        }
        bumpBotVersion();
        break;
      case 'act_poly_placement_switch':
        setPolyPlacement(value!);
        bot.options.polygon_leg_placement = value;
        bot.apply_attributes(bot.options);
        bumpBotVersion();
        break;
      case 'act_odd_orientation_switch':
        setOddOrientation(value!);
        bot.options.polygon_odd_orientation = value;
        bot.apply_attributes(bot.options);
        bumpBotVersion();
        break;
    }
    updateServoDisplay();
  }, [botRef, gc, updateServoDisplay, dofLegs]);

  // Track pressed movement keys so combinations (e.g. W+A) work without
  // resetting the gait cycle on every key change.
  const pressedKeys = useRef<Set<number>>(new Set());

  // Keyboard handler
  useEffect(() => {
    const MOVE_KEYS = [87, 83, 65, 68, 90, 67]; // W S A D Z C

    const updateGaitDirections = () => {
      const ctrl = gc();
      if (!ctrl) return;
      const keys = pressedKeys.current;
      let fb = 0, lr = 0, rot = 0;
      if (keys.has(87)) fb += 1;   // W forward
      if (keys.has(83)) fb -= 1;   // S backward
      if (keys.has(90)) lr += 1;   // Z move left
      if (keys.has(67)) lr -= 1;   // C move right
      if (keys.has(65)) rot += 1;  // A rotate left
      if (keys.has(68)) rot -= 1;  // D rotate right

      const action = ctrl.actions['follow_joystick'];
      if (action) {
        action.fb_direction = fb;
        action.lr_direction = lr;
        action.rotate_direction = rot;
      }

      if (fb !== 0 || lr !== 0 || rot !== 0) {
        ctrl.expected_action = 'follow_joystick';
      } else {
        ctrl.stop();
      }
    };

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

      const mode = gc()?.move_mode;

      const handleRaise = () => {
        bot.move_body('y', 5);
        setBodyHeightVal(bot.body_mesh.position.y);
      };
      const handleFall = () => {
        bot.move_body('y', -5);
        setBodyHeightVal(bot.body_mesh.position.y);
      };

      if (mode === 'move') {
        if (e.keyCode === 82) { handleRaise(); return; }
        if (e.keyCode === 70) { handleFall(); return; }

        if (MOVE_KEYS.includes(e.keyCode)) {
          e.preventDefault();
          if (!pressedKeys.current.has(e.keyCode)) {
            pressedKeys.current.add(e.keyCode);
            updateGaitDirections();
          }
        }
      } else if (mode === 'move_body') {
        e.preventDefault();
        const fb = bot.options.fb_step || 15;
        const lr = bot.options.lr_step || 10;
        if (e.keyCode === 87) bot.move_body('z', -fb);        // W
        else if (e.keyCode === 83) bot.move_body('z', fb);    // S
        else if (e.keyCode === 65) bot.move_body('x', -lr);   // A
        else if (e.keyCode === 68) bot.move_body('x', lr);    // D
        else if (e.keyCode === 82) handleRaise();
        else if (e.keyCode === 70) handleFall();
      } else if (mode === 'rotate_body') {
        e.preventDefault();
        const rot = bot.options.rotate_step || Math.PI / 18;
        if (e.keyCode === 87) bot.rotate_body('x', rot);       // W: pitch fwd
        else if (e.keyCode === 83) bot.rotate_body('x', -rot); // S: pitch back
        else if (e.keyCode === 65) bot.rotate_body('z', rot);  // A: roll left
        else if (e.keyCode === 68) bot.rotate_body('z', -rot); // D: roll right
        else if (e.keyCode === 81) bot.rotate_body('y', rot);  // Q: yaw left
        else if (e.keyCode === 69) bot.rotate_body('y', -rot); // E: yaw right
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const mode = gc()?.move_mode;
      if (mode === 'move' && MOVE_KEYS.includes(e.keyCode)) {
        e.preventDefault();
        pressedKeys.current.delete(e.keyCode);
        updateGaitDirections();
      } else if (mode !== 'move') {
        e.preventDefault();
        if (gc()) gc().stop();
      }
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
        {[3,4,5,6].map(d => (
          <a key={d} href="#" className={`control_btn${dof === d ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('act_dof_switch', String(d)); }}>{d}-DOF</a>
        ))}
        <div style={{ marginTop: 4 }}>
          {Array.from({ length: legCount }, (_, i) => (
            <label key={i} style={{ marginRight: 6, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={dofLegs.has(i)}
                onChange={() => handleAction('act_toggle_dof_leg', String(i))}
                style={{ verticalAlign: 'middle' }}
              />
              {i}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="btns">
        <legend>Legs</legend>
        {[3,4,5,6,7,8,9].map(n => (
          <a key={n} href="#" className={`control_btn${legCount === n ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('act_leg_count_switch', String(n)); }}>{n}</a>
        ))}
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
      </fieldset>

      <fieldset className="btns">
        <legend>Gaits</legend>
        {getGaitList(botRef.current).map((item) => (
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

      <div style={{ height: 10 }}></div>

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
