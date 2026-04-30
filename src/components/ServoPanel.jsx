import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import appState from '../hexapod/appState';
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
      appState.current_bot.after_status_change();
    };

    for (var idx in bot.legs) {
      var limbs = bot.legs[idx].limbs;

      for (var jdx = 0; jdx < limbs.length - 1; jdx++) {
        var limb = limbs[jdx];

        if (!bot_options.leg_options[idx][limb.type].servo_idx) {
          bot_options.leg_options[idx][limb.type].servo_idx = idx * 3 + jdx;
        }
        limb.servo_idx = bot_options.leg_options[idx][limb.type].servo_idx;

        var controlElem = document.createElement('div');
        controlElem.setAttribute('class', 'range_widget');

        // Servo index marker
        var mark = make_input({ type: 'number', value: limb.servo_idx, style: 'width: 3em;' });
        controlElem.appendChild(mark);
        mark.leg = bot.legs[idx];
        mark.leg_idx = idx;
        mark.limb_idx = jdx;

        mark.addEventListener('change', function () {
          var opts = get_bot_options();
          var l = this.leg.limbs[this.limb_idx];
          l.servo_idx = opts.leg_options[this.leg_idx][l.type].servo_idx = this.value;
          set_bot_options(opts);
        });

        // Range slider
        var rangeInput = make_input({ type: 'range', class: 'range', min: SERVO_MIN_VALUE, max: SERVO_MAX_VALUE, value: SERVO_CURRENT_VALUE });
        controlElem.appendChild(rangeInput);
        limb.range_control = rangeInput;
        rangeInput.leg = bot.legs[idx];
        rangeInput.limb_idx = jdx;
        rangeInput.addEventListener('input', updateLeg);

        // Current value input
        var currentInput = make_input({ type: 'number', class: 'current', value: SERVO_CURRENT_VALUE });
        controlElem.appendChild(currentInput);
        limb.current_control = currentInput;
        currentInput.leg = bot.legs[idx];
        currentInput.limb_idx = jdx;
        currentInput.addEventListener('change', updateLeg);

        // End position display
        var endPosition = getWorldPosition(bot.mesh, limbs[parseInt(jdx) + 1]);
        var labels = ['x', 'y', 'z'];
        for (var kdx in labels) {
          var label = labels[kdx];
          var roundedValue = endPosition[label].toFixed(2);

          var inputField = make_input({ type: 'number', name: label, class: 'direction end_' + label, value: roundedValue });

          if (jdx != 2) {
            inputField.disabled = true;
          }

          controlElem.appendChild(inputField);
          limb['end_' + label + '_control'] = inputField;
          inputField.leg = bot.legs[idx];
          inputField.limb_idx = jdx;

          if (jdx == 2) {
            inputField.addEventListener('change', function () {
              var tibia = this.leg.tibia;
              var newPos = new THREE.Vector3(
                parseFloat(tibia.end_x_control.value),
                parseFloat(tibia.end_y_control.value),
                parseFloat(tibia.end_z_control.value)
              );
              var calculator = new PosCalculator(this.leg, newPos);
              calculator.run();
              appState.current_bot.after_status_change();
            });
          }
        }

        // Revert checkbox
        var revertOpts = { type: 'checkbox', name: 'revert_input' };
        if (bot_options.leg_options[idx][limb.type].revert) {
          revertOpts.checked = true;
        }
        var revertInput = make_input(revertOpts);
        controlElem.appendChild(revertInput);

        revertInput.range_input = rangeInput;
        revertInput.leg = bot.legs[idx];
        revertInput.leg_idx = idx;
        revertInput.limb_idx = jdx;

        var revertLabel = document.createElement('label');
        revertLabel.setAttribute('for', 'revert_input');
        revertLabel.innerHTML = 'Revert';
        controlElem.appendChild(revertLabel);

        revertInput.addEventListener('change', function () {
          this.leg.limbs[this.limb_idx].revert = this.checked;
          this.leg.set_servo_value(this.limb_idx, this.range_input.value);

          var opts = get_bot_options();
          var l = this.leg.limbs[this.limb_idx];
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
