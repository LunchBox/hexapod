import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { history } from '../hexapod/history';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CircleStop, Wand2, Footprints, Terminal, Send, RefreshCw, Zap } from 'lucide-react';

// ── Gait cycle dot diagram ──────────────────────────────────────

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
    result.push({
      prefix,
      label: K_LABELS[prefix] || prefix,
      gaits,
    });
  }
  const kOrder = Object.keys(K_LABELS);
  result.sort((a, b) => kOrder.indexOf(a.prefix) - kOrder.indexOf(b.prefix));
  return result;
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

// ── Gait cycle dot diagram ──────────────────────────────────────

interface LegDot { x: number; z: number; }

function GaitDiagram({ groups, legLayout }: { groups: number[][] | null; legLayout: LegDot[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !groups || groups.length === 0 || !legLayout || legLayout.length === 0) return;

    const steps = groups.length;
    const n = legLayout.length;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of legLayout) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    const framePad = 2;
    const frameW = 28;
    const frameH = 36;
    const frameGap = 24;
    const labelGap = 4;
    const labelH = 8;

    const padX = 4;
    const padY = 2;
    const totalW = padX * 2 + steps * frameW + (steps - 1) * frameGap;
    const totalH = padY * 2 + frameH + labelGap + labelH;

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, totalW, totalH);

    const scale = Math.min(
      (frameW - framePad * 2) / rangeX,
      (frameH - framePad * 2) / rangeZ,
    );
    const cx = frameW / 2;
    const cz = frameH / 2;
    const dotR = 2.5;

    for (let s = 0; s < steps; s++) {
      const lifted = new Set(groups[s]);
      const fx = padX + s * (frameW + frameGap);
      for (let l = 0; l < n; l++) {
        const p = legLayout[l];
        const dx = fx + cx + (p.x - (minX + maxX) / 2) * scale;
        const dy = padY + cz + (p.z - (minZ + maxZ) / 2) * scale;
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = lifted.has(l) ? '#444' : '#ccc';
        ctx.fill();
      }
      ctx.fillStyle = '#666';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(s), fx + cx, padY + frameH + labelGap + labelH);
    }
  }, [groups, legLayout]);

  if (!groups || groups.length === 0 || !legLayout || legLayout.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', margin: '6px 0 0', imageRendering: 'pixelated' }}
    />
  );
}

export default function ControlPanel() {
  const { botRef, updateServoDisplay, bumpBotVersion } = useHexapod();
  const gaitIntervalRef = useRef(null);

  const saved = useMemo(() => get_bot_options(), []);

  const [drawType, setDrawType] = useState(saved.draw_type || 'mesh');
  const [moveMode, setMoveMode] = useState(saved.move_mode || 'move');
  const [gait, setGait] = useState(saved.gait || 'tripod');
  const [actionType, setActionType] = useState(saved.action_type || 'efficient');
  const [targetMode, setTargetMode] = useState(saved.target_mode || 'target');
  const [syncMode, setSyncMode] = useState(saved.sync_cmd ? 'sync' : 'manual');
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
    if (b) {
      b.options.micro_steps = v;
      set_bot_options(b.options);
    }
  }, [botRef]);

  const setPhysicsMode = useCallback((mode: 'none' | 'servo_constraint') => {
    setPhysicsModeState(mode);
    const b = botRef.current;
    if (b) {
      b.options.physics_mode = mode;
      set_bot_options(b.options);
    }
  }, [botRef]);

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
        history.push(bot.options);
        const newDof = parseInt(value!);
        setDof(newDof);
        bot.options.dof = newDof;
        for (let i = 0; i < bot.options.leg_options.length; i++) {
          if (dofLegs.has(i)) {
            bot.options.leg_options[i].dof = newDof;
          }
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

  const pressedKeys = useRef<Set<number>>(new Set());

  // Keyboard handler
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

  const gaitGroups = getGaitGroups(botRef.current);
  const activePrefix = gaitGroups.find(g => g.gaits.some(item => item.value === gait))?.prefix || gaitGroups[0]?.prefix;
  const activeGroup = gaitGroups.find(g => g.prefix === activePrefix);
  const handleKSwitch = (prefix: string) => {
    if (prefix === activePrefix) return;
    const group = gaitGroups.find(g => g.prefix === prefix);
    if (group?.gaits[0]?.value) handleAction('gait_switch', group.gaits[0].value);
  };

  return (
    <div>
      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Mode</CardTitle></CardHeader>
        <CardContent className="py-1 px-3 space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Move Mode</div>
            <div className="flex flex-wrap gap-0.5">
              {moveModes.map(m => (
                <Button key={m.value}
                  variant={moveMode === m.value ? 'default' : 'outline'}
                  size="sm" onClick={() => handleAction('mode_switch', m.value)}
                >{m.label}</Button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Gaits</div>
            <div className="flex flex-wrap gap-0.5 mb-1">
              {gaitGroups.map(g => (
                <Button key={g.prefix}
                  variant={activePrefix === g.prefix ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleKSwitch(g.prefix)}
                >{g.label}</Button>
              ))}
            </div>
            {activeGroup && (
              <div className="flex flex-wrap gap-0.5 max-h-[180px] overflow-y-auto mt-1">
                {activeGroup.gaits.map(item => (
                  <Button key={item.value}
                    variant={gait === item.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleAction('gait_switch', item.value)}
                  >{item.label}</Button>
                ))}
              </div>
            )}
          </div>

          <GaitDiagram
            groups={botRef.current?.gait_controller?.gaits[gait] ?? null}
            legLayout={botRef.current?.leg_layout?.map((l: any) => ({ x: l.x, z: l.z })) ?? null}
          />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Step</CardTitle></CardHeader>
        <CardContent className="py-1 px-3 space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Action Type</div>
            <div className="flex flex-wrap gap-0.5">
              {actionTypes.map(a => (
                <Button key={a.value}
                  variant={actionType === a.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleAction('action_switch', a.value)}
                >{a.value === 'fast' ? <>{a.label}<sub className="text-[9px]">beta</sub></> : a.label}</Button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Target</div>
            <div className="flex flex-wrap gap-0.5">
              {targetModes.map(t => (
                <Button key={t.value}
                  variant={targetMode === t.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleAction('target_mode_switch', t.value)}
                >{t.label}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Physics &amp; Render</CardTitle></CardHeader>
        <CardContent className="py-1 px-3 space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Physics</div>
            <div className="flex flex-wrap gap-0.5">
              <Button variant={physicsMode === 'none' ? 'default' : 'outline'} size="sm" onClick={() => setPhysicsMode('none')}>None</Button>
              <Button variant={physicsMode === 'servo_constraint' ? 'default' : 'outline'} size="sm" onClick={() => setPhysicsMode('servo_constraint')}>Servo Constraint</Button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span>Micro Steps:</span>
              <Slider value={[microSteps]} min={1} max={20} step={1}
                className="w-20"
                onValueChange={(v) => setMicroSteps(Array.isArray(v) ? v[0] : v)} />
              <span className="font-mono w-5">{microSteps}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Draw Type</div>
            <div className="flex flex-wrap gap-0.5">
              {drawTypes.map(d => (
                <Button key={d.value}
                  variant={drawType === d.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleAction('act_draw_type_switch', d.value)}
                >{d.label}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Actions</CardTitle></CardHeader>
        <CardContent className="py-1 px-3 space-y-3">
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" onClick={() => handleAction('act_stop_motion')}><CircleStop data-icon="inline-start" />Stop</Button>
            <Button variant="outline" size="sm" onClick={() => handleAction('act_action', 'act_standby')}><Wand2 data-icon="inline-start" />Standby</Button>
            <Button variant="outline" size="sm" onClick={() => handleAction('act_action', 'act_putdown_tips')}><Footprints data-icon="inline-start" />Putdown Tips</Button>
            <Button variant="outline" size="sm" onClick={() => handleAction('act_disable_console')}><Terminal data-icon="inline-start" />Disable Console</Button>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Keyboard</div>
            <div className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-[11px]">
              {[
                ['W', 'forward'], ['S', 'backward'], ['A', 'rotate L'], ['D', 'rotate R'],
                ['Z', 'move L'], ['C', 'move R'], ['R', 'raise'], ['F', 'fall'],
              ].map(([key, label]) => (
                <span key={key}>
                  <Button variant="outline" size="sm"
                    className="text-[10px] font-mono px-1 py-0.5 h-auto min-w-[20px]"
                    onClick={() => {
                      const codes: Record<string, [string, string]> = {
                        W: ['act_step', '87'], S: ['act_step', '83'], A: ['act_step', '65'],
                        D: ['act_step', '68'], Z: ['act_step', '90'], C: ['act_step', '67'],
                        R: ['act_motion2', '82'], F: ['act_motion2', '70'],
                      };
                      handleAction(codes[key][0], codes[key][1]);
                    }}
                  >{key}</Button>{' '}{label}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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
