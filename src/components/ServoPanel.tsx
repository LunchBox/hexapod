import { useCallback, useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';

import { SERVO_MIN_VALUE, SERVO_MAX_VALUE } from '../hexapod/defaults';
import { set_bot_options } from '../hexapod/hexapod';
import { PosCalculator } from '../hexapod/pos_calculator';

export default function ServoPanel() {
  const { botRef, botVersion } = useHexapod();
  const tickRef = useRef(0);

  // Self-update servo display values from bot at ~10fps when mounted
  useEffect(() => {
    let active = true;
    const poll = () => {
      if (!active) return;
      const bot = botRef.current;
      if (!bot) { setTimeout(poll, 100); return; }

      for (let i = 0; i < bot.legs.length; i++) {
        const limbs = bot.legs[i].limbs;
        for (let j = 0; j < limbs.length - 1; j++) {
          const limb = limbs[j];
          if (limb.range_control) limb.range_control.value = limb.servo_value;
          if (limb.current_control) limb.current_control.value = limb.servo_value;
          // Update end position for last non-tip segment
          if (j === limbs.length - 2) {
            bot.mesh.updateMatrixWorld();
            const nextLimb = limbs[j + 1];
            if (nextLimb) {
              const v = new (window as any).THREE.Vector3();
              v.setFromMatrixPosition(nextLimb.matrixWorld);
              if (limb.end_x_control) limb.end_x_control.value = v.x.toFixed(2);
              if (limb.end_y_control) limb.end_y_control.value = v.y.toFixed(2);
              if (limb.end_z_control) limb.end_z_control.value = v.z.toFixed(2);
            }
          }
        }
      }
      tickRef.current = requestAnimationFrame(poll);
    };
    const id = requestAnimationFrame(poll);
    return () => { active = false; cancelAnimationFrame(id); cancelAnimationFrame(tickRef.current); };
  }, [botRef, botVersion]);

  const bot = botRef.current;
  if (!bot) return null;

  const updateLeg = useCallback((leg: any, limbIdx: number, value: number) => {
    leg.set_servo_value(limbIdx, value);
    bot.after_status_change();
  }, [bot]);

  const handleServoIdxChange = useCallback((leg: any, legIdx: number, limbIdx: number, value: string) => {
    const l = leg.limbs[limbIdx];
    const numVal = parseInt(value, 10);
    l.servo_idx = numVal;
    bot.options.leg_options[legIdx][l.type].servo_idx = numVal;
    set_bot_options(bot.options);
  }, [bot]);

  const handleRevertChange = useCallback((leg: any, legIdx: number, limbIdx: number, checked: boolean) => {
    leg.limbs[limbIdx].revert = checked;
    const rangeInput = leg.limbs[limbIdx].range_control;
    if (rangeInput) leg.set_servo_value(limbIdx, rangeInput.value);

    const l = leg.limbs[limbIdx];
    bot.options.leg_options[legIdx][l.type].revert = checked;
    set_bot_options(bot.options);
  }, [bot]);

  const handleEndPosChange = useCallback((leg: any, lastSeg: any) => {
    const newPos = new (window as any).THREE.Vector3(
      parseFloat(lastSeg.end_x_control.value),
      parseFloat(lastSeg.end_y_control.value),
      parseFloat(lastSeg.end_z_control.value),
    );
    const calculator = new PosCalculator(leg, newPos);
    calculator.run();
    bot.after_status_change();
  }, [bot]);

  // Compute cumulative servo index base per leg
  let servoBase = 0;
  const rows: React.ReactNode[] = [];

  for (let legIdx = 0; legIdx < bot.legs.length; legIdx++) {
    const leg = bot.legs[legIdx];
    const limbs = leg.limbs;
    const jointCount = limbs.length - 1;

    for (let jdx = 0; jdx < jointCount; jdx++) {
      const limb = limbs[jdx];
      const isLastSeg = jdx === limbs.length - 2; // last non-tip segment

      // Initialize servo index if not set
      if (!bot.options.leg_options[legIdx][limb.type].servo_idx) {
        bot.options.leg_options[legIdx][limb.type].servo_idx = servoBase + jdx;
      }
      limb.servo_idx = bot.options.leg_options[legIdx][limb.type].servo_idx;

      // Compute end position for display
      let endPos: any = { x: 0, y: 0, z: 0 };
      try {
        const nextLimb = limbs[jdx + 1];
        if (nextLimb) {
          bot.mesh.updateMatrixWorld();
          const v = new (window as any).THREE.Vector3();
          v.setFromMatrixPosition(nextLimb.matrixWorld);
          endPos = v;
        }
      } catch { /* use zeros */ }

      const revert = bot.options.leg_options[legIdx][limb.type].revert;

      rows.push(
        <div className="range_widget" key={`${legIdx}-${jdx}`}>
          <input type="number" defaultValue={limb.servo_idx}
            style={{ width: '3em' }}
            onChange={e => handleServoIdxChange(leg, legIdx, jdx, e.target.value)} />
          <input type="range" className="range"
            min={SERVO_MIN_VALUE} max={SERVO_MAX_VALUE}
            defaultValue={limb.servo_value}
            ref={el => { limb.range_control = el; }}
            onChange={e => updateLeg(leg, jdx, parseInt(e.target.value, 10))} />
          <input type="number" className="current"
            defaultValue={limb.servo_value}
            ref={el => { limb.current_control = el; }}
            onChange={e => updateLeg(leg, jdx, parseInt(e.target.value, 10))} />
          <input type="number" className="direction end_x"
            defaultValue={endPos.x.toFixed(2)}
            disabled={!isLastSeg}
            ref={el => { limb.end_x_control = el; }}
            onChange={() => handleEndPosChange(leg, limb)} />
          <input type="number" className="direction end_y"
            defaultValue={endPos.y.toFixed(2)}
            disabled={!isLastSeg}
            ref={el => { limb.end_y_control = el; }}
            onChange={() => handleEndPosChange(leg, limb)} />
          <input type="number" className="direction end_z"
            defaultValue={endPos.z.toFixed(2)}
            disabled={!isLastSeg}
            ref={el => { limb.end_z_control = el; }}
            onChange={() => handleEndPosChange(leg, limb)} />
          <input type="checkbox" name="revert_input"
            defaultChecked={revert}
            onChange={e => handleRevertChange(leg, legIdx, jdx, e.target.checked)} />
          <label>Revert</label>
        </div>
      );
    }
    servoBase += jointCount;
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Servo Values</h3>
      <div id="servo_controls" key={botVersion}>{rows}</div>
    </div>
  );
}
