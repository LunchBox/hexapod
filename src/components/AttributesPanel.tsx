import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import appState from '../hexapod/appState';

function HexapodAttributesController(container) {
  this.container = container;
  this.attributes = get_bot_options();

  this.special_attrs = [
    'coxa_length', 'femur_length', 'tibia_length',
    'rotate_step', 'fb_step', 'lr_step',
  ];
}

HexapodAttributesController.prototype.make_container = function (container, identify, class_name) {
  var elem = document.createElement('div');
  if (identify) elem.setAttribute('id', identify);
  if (class_name) elem.setAttribute('class', class_name);
  container.appendChild(elem);
  return elem;
};

HexapodAttributesController.prototype.make_fieldset = function (container, legend_name, identify, class_name) {
  var fieldset = document.createElement('fieldset');
  if (identify) fieldset.setAttribute('id', identify);
  if (class_name) fieldset.setAttribute('class', class_name);
  container.appendChild(fieldset);

  var legend = document.createElement('legend');
  legend.innerHTML = legend_name;
  fieldset.appendChild(legend);
  return fieldset;
};

HexapodAttributesController.prototype.get_attr = function (attr_name) {
  var attrs = attr_name.split('.');
  var value = this.attributes;
  for (var idx in attrs) {
    value = value[attrs[idx]];
  }
  return value;
};

HexapodAttributesController.prototype.set_attr = function (attr_name, value) {
  var attrs = attr_name.split('.');
  var cmd = 'this.attributes';
  for (var idx in attrs) {
    cmd += "['" + attrs[idx] + "']";
  }
  cmd += ' = ' + value;
  eval(cmd);
  set_bot_options(this.attributes);
};

HexapodAttributesController.prototype.redraw_bot = function () {
  appState.current_bot.apply_attributes(this.attributes);
};

HexapodAttributesController.prototype.make_input = function (container, attr_name, input_type, label_name) {
  var label = document.createElement('label');
  label.setAttribute('for', attr_name);
  label.innerHTML = label_name;
  container.appendChild(label);

  var input = document.createElement('input');
  input.setAttribute('type', input_type);
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
['coxa', 'femur', 'tibia'].forEach(function (part) {
  HexapodAttributesController.prototype['handle_' + part + '_length'] = function (attr_name, input) {
    var self = this;
    input.setAttribute('value', this.get_attr(attr_name));
    input.addEventListener('change', function () {
      self.set_attr(attr_name, parseFloat(this.value));
      for (var idx in self.attributes.leg_options) {
        self.attributes.leg_options[idx][part].length = parseFloat(this.value);
      }
      set_bot_options(self.attributes);
      self.redraw_bot();
    });
  };
});

HexapodAttributesController.prototype.handle_rotate_step = function (attr_name, input) {
  var self = this;
  var radius = parseFloat(this.get_attr(attr_name));
  var angle = Math.round(radius * 180 / Math.PI);
  input.setAttribute('value', angle);

  input.addEventListener('change', function () {
    var a = parseFloat(this.value);
    var r = a * Math.PI / 180;
    self.set_attr(attr_name, r);
    var bot = appState.current_bot;
    bot.rotate_step = r;
    bot.gait_controller.reset_steps();
    bot.adjust_gait_guidelines();
  });
};

HexapodAttributesController.prototype.handle_fb_step = function (attr_name, input) {
  var self = this;
  input.setAttribute('value', parseFloat(this.get_attr(attr_name)));
  input.addEventListener('change', function () {
    var val = parseFloat(this.value);
    self.set_attr(attr_name, val);
    var bot = appState.current_bot;
    bot.fb_step = val;
    bot.gait_controller.reset_steps();
  });
};

HexapodAttributesController.prototype.handle_lr_step = function (attr_name, input) {
  var self = this;
  input.setAttribute('value', parseFloat(this.get_attr(attr_name)));
  input.addEventListener('change', function () {
    var val = parseFloat(this.value);
    self.set_attr(attr_name, val);
    var bot = appState.current_bot;
    bot.lr_step = val;
    bot.gait_controller.reset_steps();
  });
};

export default function AttributesPanel() {
  const containerRef = useRef(null);
  const built = useRef(false);

  useEffect(() => {
    if (built.current || !containerRef.current) return;
    built.current = true;

    var container = containerRef.current;
    var attrs_control = new HexapodAttributesController(container);

    // Motions
    var motion_attrs = attrs_control.make_fieldset(container, 'Motions');
    attrs_control.make_input(motion_attrs, 'rotate_step', 'number', 'Rotate Step');
    attrs_control.make_input(motion_attrs, 'fb_step', 'number', 'F&B Step');
    attrs_control.make_input(motion_attrs, 'lr_step', 'number', 'L&R Step');

    // Body
    var body_attrs = attrs_control.make_fieldset(container, 'Body Attrs');
    attrs_control.make_input(body_attrs, 'body_height', 'number', 'Body Height');
    attrs_control.make_input(body_attrs, 'body_width', 'number', 'Body Width');
    attrs_control.make_input(body_attrs, 'body_length', 'number', 'Body Length');

    // Legs
    var leg_attrs = attrs_control.make_fieldset(container, 'Legs Attrs');
    attrs_control.make_input(leg_attrs, 'coxa_length', 'number', 'Coxa Length');
    attrs_control.make_input(leg_attrs, 'femur_length', 'number', 'Femur Length');
    attrs_control.make_input(leg_attrs, 'tibia_length', 'number', 'Tibia Length');

    // Per-leg attributes
    for (var idx in attrs_control.attributes.leg_options) {
      var leg_fieldset = attrs_control.make_fieldset(container, 'Leg ' + idx + ' Attrs', 'leg_' + idx + '_attrs', 'tab leg_attrs');
      var leg_content = attrs_control.make_container(leg_fieldset, null, 'tab_content');

      var pos_attrs = attrs_control.make_fieldset(leg_content, 'Position');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.x', 'number', 'pos x');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.y', 'number', 'pos y');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.z', 'number', 'pos z');

      var coxa_attrs = attrs_control.make_fieldset(leg_content, 'Coxa');
      attrs_control.make_input(coxa_attrs, 'leg_options.' + idx + '.coxa.length', 'number', 'Length');
      attrs_control.make_input(coxa_attrs, 'leg_options.' + idx + '.coxa.radius', 'number', 'Radius');
      attrs_control.make_input(coxa_attrs, 'leg_options.' + idx + '.coxa.init_angle', 'number', 'Init Angle');

      var femur_attrs = attrs_control.make_fieldset(leg_content, 'Femur');
      attrs_control.make_input(femur_attrs, 'leg_options.' + idx + '.femur.length', 'number', 'Length');
      attrs_control.make_input(femur_attrs, 'leg_options.' + idx + '.femur.radius', 'number', 'Radius');
      attrs_control.make_input(femur_attrs, 'leg_options.' + idx + '.femur.init_angle', 'number', 'Init Angle');

      var tibia_attrs = attrs_control.make_fieldset(leg_content, 'Tibia');
      attrs_control.make_input(tibia_attrs, 'leg_options.' + idx + '.tibia.length', 'number', 'Length');
      attrs_control.make_input(tibia_attrs, 'leg_options.' + idx + '.tibia.radius', 'number', 'Radius');
      attrs_control.make_input(tibia_attrs, 'leg_options.' + idx + '.tibia.init_angle', 'number', 'Init Angle');
    }

    // Tab legend click handlers
    var tabLegends = container.querySelectorAll('.tab legend');
    Array.prototype.forEach.call(tabLegends, function (legend) {
      legend.addEventListener('click', function () {
        var tabContent = this.parentElement.querySelector('.tab_content');
        if (tabContent.style.display === 'block') {
          tabContent.style.display = 'none';
        } else {
          tabContent.style.display = 'block';
        }
      });
    });
  }, []);

  return <div id="attrs_control" ref={containerRef}></div>;
}
