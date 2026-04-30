import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';

function HexapodAttributesController(container: HTMLElement, bot: any) {
  this.container = container;
  this.bot = bot;
  this.attributes = get_bot_options();

  this.special_attrs = [
    'coxa_length', 'femur_length', 'tibia_length', 'tarsus_length',
    'rotate_step', 'fb_step', 'lr_step',
    'body_radius', 'edge_length',
  ];
}

HexapodAttributesController.prototype.make_container = function (container, identify, class_name) {
  let elem = document.createElement('div');
  if (identify) elem.setAttribute('id', identify);
  if (class_name) elem.setAttribute('class', class_name);
  container.appendChild(elem);
  return elem;
};

HexapodAttributesController.prototype.make_fieldset = function (container, legend_name, identify, class_name) {
  let fieldset = document.createElement('fieldset');
  if (identify) fieldset.setAttribute('id', identify);
  if (class_name) fieldset.setAttribute('class', class_name);
  container.appendChild(fieldset);

  let legend = document.createElement('legend');
  legend.innerHTML = legend_name;
  fieldset.appendChild(legend);
  return fieldset;
};

HexapodAttributesController.prototype.get_attr = function (attr_name) {
  let attrs = attr_name.split('.');
  let value = this.attributes;
  for (let idx = 0; idx < attrs.length; idx++) {
    value = value[attrs[idx]];
  }
  return value;
};

HexapodAttributesController.prototype.set_attr = function (attr_name, value) {
  let attrs = attr_name.split('.');
  let obj = this.attributes;
  for (let i = 0; i < attrs.length - 1; i++) {
    obj = obj[attrs[i]];
  }
  obj[attrs[attrs.length - 1]] = value;
  // Persistence is done in redraw_bot() after syncing with live bot.options
};

HexapodAttributesController.prototype.redraw_bot = function () {
  // Sync top-level keys from live bot options (may have been changed via ControlPanel)
  let botOpts = this.bot.options;
  for (let key of ['leg_count', 'body_shape', 'dof', 'body_radius', 'body_width', 'body_length', 'body_height', 'polygon_leg_placement']) {
    if (key in botOpts) this.attributes[key] = botOpts[key];
  }
  set_bot_options(this.attributes);
  this.bot.apply_attributes(this.attributes);
};

HexapodAttributesController.prototype.make_input = function (container, attr_name, input_type, label_name) {
  let label = document.createElement('label');
  label.setAttribute('for', attr_name);
  label.innerHTML = label_name;
  container.appendChild(label);

  let input = document.createElement('input');
  input.setAttribute('type', input_type);
  input.setAttribute('id', attr_name);
  input.controller = this;

  if (this.special_attrs.indexOf(attr_name) > -1) {
    this['handle_' + attr_name](attr_name, input);
  } else {
    switch (input_type) {
      case 'checkbox':
        if (this.get_attr(attr_name)) {
          input.checked = true;
        }
        break;
      default:
        input.setAttribute('value', this.get_attr(attr_name));
        input.addEventListener('change', function () {
          this.controller.set_attr(attr_name, parseFloat(this.value));
          this.controller.redraw_bot();
        });
    }
  }

  container.appendChild(input);
};

// Special handlers
['coxa', 'femur', 'tibia', 'tarsus'].forEach(function (part) {
  HexapodAttributesController.prototype['handle_' + part + '_length'] = function (attr_name, input) {
    let self = this;
    input.setAttribute('value', this.get_attr(attr_name));
    input.addEventListener('change', function () {
      self.set_attr(attr_name, parseFloat(this.value));
      for (let idx = 0; idx < self.attributes.leg_options.length; idx++) {
        self.attributes.leg_options[idx][part].length = parseFloat(this.value);
      }
      self.redraw_bot();
    });
  };
});

HexapodAttributesController.prototype.handle_rotate_step = function (attr_name, input) {
  let self = this;
  let radius = parseFloat(this.get_attr(attr_name));
  let angle = Math.round(radius * 180 / Math.PI);
  input.setAttribute('value', angle);

  input.addEventListener('change', function () {
    let a = parseFloat(this.value);
    let r = a * Math.PI / 180;
    self.set_attr(attr_name, r);
    let bot = this.bot;
    bot.rotate_step = r;
    bot.gait_controller.reset_steps();
    bot.adjust_gait_guidelines();
  });
};

HexapodAttributesController.prototype.handle_fb_step = function (attr_name, input) {
  let self = this;
  input.setAttribute('value', parseFloat(this.get_attr(attr_name)));
  input.addEventListener('change', function () {
    let val = parseFloat(this.value);
    self.set_attr(attr_name, val);
    let bot = this.bot;
    bot.fb_step = val;
    bot.gait_controller.reset_steps();
  });
};

HexapodAttributesController.prototype.handle_lr_step = function (attr_name, input) {
  let self = this;
  input.setAttribute('value', parseFloat(this.get_attr(attr_name)));
  input.addEventListener('change', function () {
    let val = parseFloat(this.value);
    self.set_attr(attr_name, val);
    let bot = this.bot;
    bot.lr_step = val;
    bot.gait_controller.reset_steps();
  });
};

HexapodAttributesController.prototype.handle_body_radius = function (attr_name, input) {
  let self = this;
  input.setAttribute('value', parseFloat(this.get_attr(attr_name)));
  input.addEventListener('change', function () {
    let val = parseFloat(this.value);
    if (isNaN(val) || val <= 0) return;
    self.set_attr(attr_name, val);

    // Sync edge_length display
    let edgeInput = document.getElementById('edge_length') as HTMLInputElement;
    if (edgeInput) {
      let legCount = self.attributes.leg_count || 6;
      let edgeLen = 2 * val * Math.sin(Math.PI / legCount);
      edgeInput.value = edgeLen.toFixed(1);
    }

    self.redraw_bot();
  });
};

HexapodAttributesController.prototype.handle_edge_length = function (attr_name, input) {
  let self = this;
  // Display value computed from body_radius
  let bodyRadius = parseFloat(this.get_attr('body_radius')) || 80;
  let legCount = this.attributes.leg_count || 6;
  let edgeLen = 2 * bodyRadius * Math.sin(Math.PI / legCount);
  input.setAttribute('value', edgeLen.toFixed(1));

  input.addEventListener('change', function () {
    let val = parseFloat(this.value);
    if (isNaN(val) || val <= 0) return;
    let legCount = self.attributes.leg_count || 6;
    let newRadius = val / (2 * Math.sin(Math.PI / legCount));
    self.set_attr('body_radius', newRadius);

    // Sync body_radius input display
    let radiusInput = document.getElementById('body_radius') as HTMLInputElement;
    if (radiusInput) {
      radiusInput.value = newRadius.toFixed(1);
    }

    self.redraw_bot();
  });
};

export default function AttributesPanel() {
  const { botRef, botVersion } = useHexapod();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !botRef.current) return;

    let container = containerRef.current;
    // Clear and rebuild when bot structure changes (leg_count etc.)
    container.innerHTML = '';

    let attrs_control = new HexapodAttributesController(container, botRef.current);

    // Motions
    let motion_attrs = attrs_control.make_fieldset(container, 'Motions');
    attrs_control.make_input(motion_attrs, 'rotate_step', 'number', 'Rotate Step');
    attrs_control.make_input(motion_attrs, 'fb_step', 'number', 'F&B Step');
    attrs_control.make_input(motion_attrs, 'lr_step', 'number', 'L&R Step');

    // Body
    let body_attrs = attrs_control.make_fieldset(container, 'Body Attrs');
    attrs_control.make_input(body_attrs, 'body_height', 'number', 'Body Height');
    attrs_control.make_input(body_attrs, 'body_width', 'number', 'Body Width');
    attrs_control.make_input(body_attrs, 'body_length', 'number', 'Body Length');
    attrs_control.make_input(body_attrs, 'body_radius', 'number', 'Body Radius');
    attrs_control.make_input(body_attrs, 'edge_length', 'number', 'Edge Length');

    // Legs
    let leg_attrs = attrs_control.make_fieldset(container, 'Legs Attrs');
    attrs_control.make_input(leg_attrs, 'coxa_length', 'number', 'Coxa Length');
    attrs_control.make_input(leg_attrs, 'femur_length', 'number', 'Femur Length');
    attrs_control.make_input(leg_attrs, 'tibia_length', 'number', 'Tibia Length');
    attrs_control.make_input(leg_attrs, 'tarsus_length', 'number', 'Tarsus Length');

    // Per-leg attributes
    for (let idx = 0; idx < attrs_control.attributes.leg_options.length; idx++) {
      let leg_fieldset = attrs_control.make_fieldset(container, 'Leg ' + idx + ' Attrs', 'leg_' + idx + '_attrs', 'tab leg_attrs');
      let leg_content = attrs_control.make_container(leg_fieldset, null, 'tab_content');

      let pos_attrs = attrs_control.make_fieldset(leg_content, 'Position');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.x', 'number', 'pos x');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.y', 'number', 'pos y');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.z', 'number', 'pos z');

      let coxa_attrs = attrs_control.make_fieldset(leg_content, 'Coxa');
      attrs_control.make_input(coxa_attrs, 'leg_options.' + idx + '.coxa.length', 'number', 'Length');
      attrs_control.make_input(coxa_attrs, 'leg_options.' + idx + '.coxa.radius', 'number', 'Radius');
      attrs_control.make_input(coxa_attrs, 'leg_options.' + idx + '.coxa.init_angle', 'number', 'Init Angle');

      let femur_attrs = attrs_control.make_fieldset(leg_content, 'Femur');
      attrs_control.make_input(femur_attrs, 'leg_options.' + idx + '.femur.length', 'number', 'Length');
      attrs_control.make_input(femur_attrs, 'leg_options.' + idx + '.femur.radius', 'number', 'Radius');
      attrs_control.make_input(femur_attrs, 'leg_options.' + idx + '.femur.init_angle', 'number', 'Init Angle');

      let tibia_attrs = attrs_control.make_fieldset(leg_content, 'Tibia');
      attrs_control.make_input(tibia_attrs, 'leg_options.' + idx + '.tibia.length', 'number', 'Length');
      attrs_control.make_input(tibia_attrs, 'leg_options.' + idx + '.tibia.radius', 'number', 'Radius');
      attrs_control.make_input(tibia_attrs, 'leg_options.' + idx + '.tibia.init_angle', 'number', 'Init Angle');

      let tarsus_attrs = attrs_control.make_fieldset(leg_content, 'Tarsus');
      attrs_control.make_input(tarsus_attrs, 'leg_options.' + idx + '.tarsus.length', 'number', 'Length');
      attrs_control.make_input(tarsus_attrs, 'leg_options.' + idx + '.tarsus.radius', 'number', 'Radius');
      attrs_control.make_input(tarsus_attrs, 'leg_options.' + idx + '.tarsus.init_angle', 'number', 'Init Angle');
    }

    // Tab legend click handlers
    let tabLegends = container.querySelectorAll('.tab legend');
    Array.prototype.forEach.call(tabLegends, function (legend) {
      legend.addEventListener('click', function () {
        let tabContent = this.parentElement.querySelector('.tab_content');
        if (tabContent.style.display === 'block') {
          tabContent.style.display = 'none';
        } else {
          tabContent.style.display = 'block';
        }
      });
    });
  }, [botVersion]);

  return <div id="attrs_control" ref={containerRef}></div>;
}
