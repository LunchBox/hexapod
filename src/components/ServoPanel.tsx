import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';

import { SERVO_MIN_VALUE, SERVO_MAX_VALUE, SERVO_CURRENT_VALUE } from '../hexapod/defaults';
import { getWorldPosition, make_input } from '../hexapod/utils';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { PosCalculator } from '../hexapod/pos_calculator';

export default function ServoPanel() {
  const { botRef, updateServoDisplay } = useHexapod();
  const containerRef = useRef(null);
  const built = useRef(false);

  useEffect(() => {
    if (built.current || !containerRef.current) return;
    const bot = botRef.current;
    if (!bot) return;
    built.current = true;

    const controller = containerRef.current;
    const bot_options = get_bot_options();

    const updateLeg = function () {
      this.leg.set_servo_value(this.limb_idx, this.value);
      bot.after_status_change();
    };

    for (let idx = 0; idx < bot.legs.length; idx++) {
      const legIdx = idx;
      let limbs = bot.legs[idx].limbs;

      for (let jdx = 0; jdx < limbs.length - 1; jdx++) {
        let limb = limbs[jdx];

        if (!bot_options.leg_options[idx][limb.type].servo_idx) {
          bot_options.leg_options[idx][limb.type].servo_idx = legIdx * 3 + jdx;
        }
        limb.servo_idx = bot_options.leg_options[idx][limb.type].servo_idx;

        let controlElem = document.createElement('div');
        controlElem.setAttribute('class', 'range_widget');

        // Servo index marker
        let mark = make_input({ type: 'number', value: limb.servo_idx, style: 'width: 3em;' });
        controlElem.appendChild(mark);
        mark.leg = bot.legs[idx];
        mark.leg_idx = legIdx;
        mark.limb_idx = jdx;

        mark.addEventListener('change', function () {
          let opts = get_bot_options();
          let l = this.leg.limbs[this.limb_idx];
          l.servo_idx = opts.leg_options[this.leg_idx][l.type].servo_idx = this.value;
          set_bot_options(opts);
        });

        // Range slider
        let rangeInput = make_input({ type: 'range', class: 'range', min: SERVO_MIN_VALUE, max: SERVO_MAX_VALUE, value: SERVO_CURRENT_VALUE });
        controlElem.appendChild(rangeInput);
        limb.range_control = rangeInput;
        rangeInput.leg = bot.legs[idx];
        rangeInput.limb_idx = jdx;
        rangeInput.addEventListener('input', updateLeg);

        // Current value input
        let currentInput = make_input({ type: 'number', class: 'current', value: SERVO_CURRENT_VALUE });
        controlElem.appendChild(currentInput);
        limb.current_control = currentInput;
        currentInput.leg = bot.legs[idx];
        currentInput.limb_idx = jdx;
        currentInput.addEventListener('change', updateLeg);

        // End position display
        let endPosition: any = getWorldPosition(bot.mesh, limbs[jdx + 1]);
        let labels = ['x', 'y', 'z'];
        for (let kdx = 0; kdx < labels.length; kdx++) {
          let label = labels[kdx];
          let roundedValue = endPosition[label].toFixed(2);

          let inputField = make_input({ type: 'number', name: label, class: 'direction end_' + label, value: roundedValue });

          if (jdx !== 2) {
            inputField.disabled = true;
          }

          controlElem.appendChild(inputField);
          limb['end_' + label + '_control'] = inputField;
          inputField.leg = bot.legs[idx];
          inputField.limb_idx = jdx;

          if (jdx === 2) {
            inputField.addEventListener('change', function () {
              let tibia = this.leg.tibia;
              let newPos = new THREE.Vector3(
                parseFloat(tibia.end_x_control.value),
                parseFloat(tibia.end_y_control.value),
                parseFloat(tibia.end_z_control.value)
              );
              let calculator = new PosCalculator(this.leg, newPos);
              calculator.run();
              bot.after_status_change();
            });
          }
        }

        // Revert checkbox
        let revertOpts: any = { type: 'checkbox', name: 'revert_input' };
        if (bot_options.leg_options[idx][limb.type].revert) {
          revertOpts.checked = true;
        }
        let revertInput = make_input(revertOpts);
        controlElem.appendChild(revertInput);

        revertInput.range_input = rangeInput;
        revertInput.leg = bot.legs[idx];
        (revertInput as any).leg_idx = legIdx;
        revertInput.limb_idx = jdx;

        let revertLabel = document.createElement('label');
        revertLabel.setAttribute('for', 'revert_input');
        revertLabel.innerHTML = 'Revert';
        controlElem.appendChild(revertLabel);

        revertInput.addEventListener('change', function () {
          this.leg.limbs[this.limb_idx].revert = this.checked;
          this.leg.set_servo_value(this.limb_idx, this.range_input.value);

          let opts = get_bot_options();
          let l = this.leg.limbs[this.limb_idx];
          opts.leg_options[this.leg_idx][l.type].revert = this.checked;
          set_bot_options(opts);
        });

        controller.appendChild(controlElem);
      }
    }
  }, [botRef]);

  return (
    <div>
      <h3>Servo Values</h3>
      <div id="servo_controls" ref={containerRef} style={{ marginTop: 10 }}></div>
    </div>
  );
}
