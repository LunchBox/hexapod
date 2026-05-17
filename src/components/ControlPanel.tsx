import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { history } from '../hexapod/history';
import { Button } from '@/components/ui/button';
import { Send, RefreshCw, Zap } from 'lucide-react';
import GaitCard from './GaitCard';
import StepCard from './StepCard';
import PhysicsCard from './PhysicsCard';
import ActionsCard from './ActionsCard';

// ── Gait group helpers ────────────────────────────────────────────

const K_LABELS: Record<string, string> = {
  wave: 'Wave (k=1)',
  ripple: 'Ripple (k=2)',
  tripod: 'Tripod (k=3)',
  quad: 'Quad (k=4)',
};

interface GaitGroup {
  prefix: string;
  label: string;
  gaits: { value: string; label: string }[];
}

function getGaitGroups(bot: any): GaitGroup[] {
  const gc = bot?.gait_controller;
  if (!gc?.gaits) return [];
  const names = Object.keys(gc.gaits);
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const name of names) {
    const prefix = name.match(/^[a-z]+/)![0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push({ value: name, label: name });
  }
  const result: GaitGroup[] = [];
  for (const [prefix, gaits] of groups) {
    gaits.sort((a, b) => {
      const na = parseInt(a.label.match(/\d+$/)?.[0] || '1');
      const nb = parseInt(b.label.match(/\d+$/)?.[0] || '1');
      return na - nb;
    });
    result.push({ prefix, label: K_LABELS[prefix] || prefix, gaits });
  }
  const kOrder = Object.keys(K_LABELS);
  result.sort((a, b) => kOrder.indexOf(a.prefix) - kOrder.indexOf(b.prefix));
  return result;
}

// ── ControlPanel ──────────────────────────────────────────────────

export default function ControlPanel() {
  const { botRef, updateServoDisplay, bumpBotVersion } = useHexapod();
  const gaitIntervalRef = useRef(null);

  const saved = useMemo(() => get_bot_options(), []);

  const [gait, setGait] = useState(saved.gait || 'tripod');
  const [actionType, setActionType] = useState(saved.action_type || 'efficient');
  const [targetMode, setTargetMode] = useState(saved.target_mode || 'target');
  const [syncMode, setSyncMode] = useState(saved.sync_cmd ? 'sync' : 'manual');
  const [drawType, setDrawType] = useState(saved.draw_type || 'mesh');
  const [dof, setDof] = useState(saved.dof || 3);
  const [dofLegs, setDofLegs] = useState<Set<number>>(() => {
    const count = saved.leg_count || 6;
    return new Set(Array.from({ length: count }, (_, i) => i));
  });
  const [legCount, setLegCount] = useState(saved.leg_count || 6);
  const [bodyShape, setBodyShape] = useState(saved.body_shape || 'rectangle');
  const [polyPlacement, setPolyPlacement] = useState(saved.polygon_leg_placement || 'vertex');
  const [oddOrientation, setOddOrientation] = useState(saved.polygon_odd_orientation || 'back');
  const [bodyHeightVal, setBodyHeightVal] = useState((saved.body_height || 20) / 2);
  const [physicsMode, setPhysicsModeState] = useState<'none' | 'servo_constraint'>(
    (saved.physics_mode as 'none' | 'servo_constraint') || 'none'
  );
  const [microSteps, setMicroStepsState] = useState(saved.micro_steps || 1);

  const setMicroSteps = useCallback((v: number) => {
    setMicroStepsState(v);
    const b = botRef.current;
    if (b) { b.options.micro_steps = v; set_bot_options(b.options); }
  }, [botRef]);

  const setPhysicsMode = useCallback((mode: 'none' | 'servo_constraint') => {
    setPhysicsModeState(mode);
    const b = botRef.current;
    if (b) { b.options.physics_mode = mode; set_bot_options(b.options); }
  }, [botRef]);

  const gc = useCallback(() => botRef.current?.gait_controller, [botRef]);

  const applyOption = useCallback((key: string, value: any, setState: (v: any) => void, gcSync?: () => void) => {
    const bot = botRef.current;
    if (!bot) return;
    history.push(bot.options);
    setState(value);
    if (gcSync) gcSync();
    bot.options[key] = value;
    set_bot_options(bot.options);
  }, [botRef]);

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
      case 'gait_switch':
        applyOption('gait', value, setGait, () => gc()?.switch_gait(value));
        break;
      case 'action_switch':
        applyOption('action_type', value, setActionType, () => gc()?.switch_action_type(value));
        break;
      case 'target_mode_switch':
        applyOption('target_mode', value, setTargetMode, () => gc()?.switch_target_mode(value));
        break;
      case 'act_send_cmd':
        bot.send_status();
        break;
      case 'act_sync_cmd':
        history.push(bot.options);
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
        history.push(bot.options);
        const newDof = parseInt(value!);
        setDof(newDof);
        bot.options.dof = newDof;
        for (let i = 0; i < bot.options.leg_options.length; i++) {
          if (dofLegs.has(i)) bot.options.leg_options[i].dof = newDof;
        }
        bot.apply_attributes(bot.options);
        bumpBotVersion();
        break;
      case 'act_leg_count_switch':
        history.push(bot.options);
        const newLegCount = parseInt(value!);
        setLegCount(newLegCount);
        setDofLegs(new Set(Array.from({ length: newLegCount }, (_, i) => i)));
        bot.options.leg_count = newLegCount;
        bot.apply_attributes(bot.options);
        if (!bot.gait_controller.gaits[bot.options.gait || 'tripod']) {
          bot.options.gait = 'tripod';
          setGait('tripod');
        }
        bumpBotVersion();
        break;
      case 'act_body_shape_switch':
        history.push(bot.options);
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
        history.push(bot.options);
        setPolyPlacement(value!);
        bot.options.polygon_leg_placement = value;
        bot.apply_attributes(bot.options);
        bumpBotVersion();
        break;
      case 'act_odd_orientation_switch':
        history.push(bot.options);
        setOddOrientation(value!);
        bot.options.polygon_odd_orientation = value;
        bot.apply_attributes(bot.options);
        bumpBotVersion();
        break;
    }
    updateServoDisplay();
  }, [botRef, gc, updateServoDisplay, dofLegs, bumpBotVersion, applyOption]);

  // ── Keyboard handler ────────────────────────────────────────────

  const pressedKeys = useRef<Set<number>>(new Set());

  useEffect(() => {
    const MOVE_KEYS = [87, 83, 65, 68, 90, 67];

    const updateGaitDirections = () => {
      const ctrl = gc();
      if (!ctrl) return;
      const keys = pressedKeys.current;
      let fb = 0, lr = 0, rot = 0;
      if (keys.has(87)) fb += 1;
      if (keys.has(83)) fb -= 1;
      if (keys.has(90)) lr += 1;
      if (keys.has(67)) lr -= 1;
      if (keys.has(65)) rot += 1;
      if (keys.has(68)) rot -= 1;

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

      if (MOVE_KEYS.includes(e.keyCode)) {
        e.preventDefault();
        if (!pressedKeys.current.has(e.keyCode)) {
          pressedKeys.current.add(e.keyCode);
          updateGaitDirections();
        }
      }

      if (e.keyCode === 82) {
        bot.move_body('y', 5);
        setBodyHeightVal(bot.body_mesh.position.y);
      }
      if (e.keyCode === 70) {
        bot.move_body('y', -5);
        setBodyHeightVal(bot.body_mesh.position.y);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (MOVE_KEYS.includes(e.keyCode)) {
        e.preventDefault();
        pressedKeys.current.delete(e.keyCode);
        updateGaitDirections();
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

  // ── Gaits UI state ──────────────────────────────────────────────

  const gaitGroups = getGaitGroups(botRef.current);
  const activePrefix = gaitGroups.find(g => g.gaits.some(item => item.value === gait))?.prefix || gaitGroups[0]?.prefix;
  const activeGroup = gaitGroups.find(g => g.prefix === activePrefix);
  const handleKSwitch = (prefix: string) => {
    if (prefix === activePrefix) return;
    const group = gaitGroups.find(g => g.prefix === prefix);
    if (group?.gaits[0]?.value) handleAction('gait_switch', group.gaits[0].value);
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div>
      <GaitCard
        gaitGroups={gaitGroups}
        activePrefix={activePrefix}
        activeGroup={activeGroup}
        gait={gait}
        onSwitchK={handleKSwitch}
        onAction={handleAction}
      />

      <StepCard
        actionType={actionType}
        targetMode={targetMode}
        onAction={handleAction}
      />

      <PhysicsCard
        physicsMode={physicsMode}
        drawType={drawType}
        microSteps={microSteps}
        onPhysicsMode={setPhysicsMode}
        onMicroSteps={setMicroSteps}
        onAction={handleAction}
      />

      <ActionsCard onAction={handleAction} />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => handleAction('act_send_cmd')}><Send data-icon="inline-start" />Send</Button>
        <Button variant={syncMode === 'sync' ? 'default' : 'outline'} size="sm"
          onClick={() => handleAction('act_sync_cmd', 'sync')}><RefreshCw data-icon="inline-start" />Sync</Button>
        <Button variant={syncMode === 'manual' ? 'default' : 'outline'} size="sm"
          onClick={() => handleAction('act_sync_cmd', '')}><Zap data-icon="inline-start" />Manual</Button>
      </div>
    </div>
  );
}
