import { useEffect, useRef, useState, useMemo } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { LIMB_NAMES } from '../hexapod/defaults';
import { history } from '../hexapod/history';
import LegEditor from './LegEditor';

function HexapodAttributesController(container: HTMLElement, bot: any) {
  this.container = container;
  this.bot = bot;
  this.attributes = get_bot_options();

  this.special_attrs = [
    ...LIMB_NAMES.map(n => n + '_length'),
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
  // Push current state to undo history before applying change
  history.push(this.bot.options);

  // Sync all keys from live bot options (may have been changed via other panels)
  let botOpts = this.bot.options;
  for (let key of Object.keys(botOpts)) {
    if (key === 'leg_options') continue;
    this.attributes[key] = botOpts[key];
  }
  if (botOpts.leg_options && this.attributes.leg_options) {
    for (let i = 0; i < Math.min(botOpts.leg_options.length, this.attributes.leg_options.length); i++) {
      this.attributes.leg_options[i] = botOpts.leg_options[i];
    }
  }

  if (history.autoSave) {
    set_bot_options(this.attributes);
  }
  this.bot.apply_attributes(this.attributes);
  if (history.autoSave) {
    history.markSaved(this.attributes);
  }
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
LIMB_NAMES.forEach(function (part) {
  HexapodAttributesController.prototype['handle_' + part + '_length'] = function (attr_name, input) {
    let self = this;
    input.setAttribute('value', this.get_attr(attr_name));
    input.addEventListener('change', function () {
      self.set_attr(attr_name, parseFloat(this.value));
      for (let idx = 0; idx < self.attributes.leg_options.length; idx++) {
        if (!self.attributes.leg_options[idx][part]) continue;
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
  const { botRef, botVersion, bumpBotVersion } = useHexapod();
  const containerRef = useRef<HTMLDivElement>(null);

  const saved = useMemo(() => get_bot_options(), []);
  const [dof, setDof] = useState(saved.dof || 3);
  const [dofLegs, setDofLegs] = useState<Set<number>>(() => {
    const count = saved.leg_count || 6;
    return new Set(Array.from({ length: count }, (_, i) => i));
  });
  const [legCount, setLegCount] = useState(saved.leg_count || 6);
  const [bodyShape, setBodyShape] = useState(saved.body_shape || 'rectangle');
  const [polyPlacement, setPolyPlacement] = useState(saved.polygon_leg_placement || 'vertex');
  const [oddOrientation, setOddOrientation] = useState(saved.polygon_odd_orientation || 'back');
  const [tipCircleScale, setTipCircleScale] = useState(saved.tip_circle_scale ?? 1);

  const applyConfig = (updates: Partial<any>) => {
    const bot = botRef.current;
    if (!bot) return;
    history.push(bot.options);
    Object.assign(bot.options, updates);
    bot.apply_attributes(bot.options);
    bumpBotVersion();
  };

  useEffect(() => {
    if (!containerRef.current || !botRef.current) return;

    let container = containerRef.current;
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
    const dof = attrs_control.attributes.dof || 3;
    const segNames = LIMB_NAMES.slice(0, Math.min(6, Math.max(2, dof)));
    for (const name of segNames) {
      attrs_control.make_input(leg_attrs, name + '_length', 'number', name.charAt(0).toUpperCase() + name.slice(1) + ' Length');
    }

    // Per-leg attributes — each leg shows only its own DOF's segments
    for (let idx = 0; idx < attrs_control.attributes.leg_options.length; idx++) {
      const legOpt = attrs_control.attributes.leg_options[idx];
      const legDof = legOpt.dof ?? attrs_control.attributes.dof ?? 3;
      const legSegNames = LIMB_NAMES.slice(0, Math.min(6, Math.max(2, legDof)));

      let leg_fieldset = attrs_control.make_fieldset(container, 'Leg ' + idx + ' Attrs', 'leg_' + idx + '_attrs', 'tab leg_attrs');
      let leg_content = attrs_control.make_container(leg_fieldset, null, 'tab_content');

      let pos_attrs = attrs_control.make_fieldset(leg_content, 'Position');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.x', 'number', 'pos x');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.y', 'number', 'pos y');
      attrs_control.make_input(pos_attrs, 'leg_options.' + idx + '.z', 'number', 'pos z');

      for (const name of legSegNames) {
        let seg_attrs = attrs_control.make_fieldset(leg_content, name.charAt(0).toUpperCase() + name.slice(1));
        attrs_control.make_input(seg_attrs, 'leg_options.' + idx + '.' + name + '.length', 'number', 'Length');
        attrs_control.make_input(seg_attrs, 'leg_options.' + idx + '.' + name + '.radius', 'number', 'Radius');
        attrs_control.make_input(seg_attrs, 'leg_options.' + idx + '.' + name + '.init_angle', 'number', 'Init Angle');
      }
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

  return (
    <div id="attrs_control">
      <LegEditor />

      <fieldset className="btns">
        <legend>DOF</legend>
        {[3,4,5,6].map(d => (
          <a key={d} href="#" className={`control_btn${dof === d ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault();
              const bot = botRef.current; if (!bot) return;
              history.push(bot.options);
              setDof(d); bot.options.dof = d;
              for (let i = 0; i < bot.options.leg_options.length; i++) {
                if (dofLegs.has(i)) bot.options.leg_options[i].dof = d;
              }
              bot.apply_attributes(bot.options); bumpBotVersion();
            }}>{d}-DOF</a>
        ))}
        <div style={{ marginTop: 4 }}>
          {Array.from({ length: legCount }, (_, i) => (
            <label key={i} style={{ marginRight: 6, cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={dofLegs.has(i)}
                onChange={() => setDofLegs(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                style={{ verticalAlign: 'middle' }} />{i}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="btns">
        <legend>Legs</legend>
        {[3,4,5,6,7,8,9].map(n => (
          <a key={n} href="#" className={`control_btn${legCount === n ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault();
              const bot = botRef.current; if (!bot) return;
              history.push(bot.options);
              setLegCount(n); setDofLegs(new Set(Array.from({ length: n }, (_, i) => i)));
              bot.options.leg_count = n;
              bot.apply_attributes(bot.options); bumpBotVersion();
              if (!bot.gait_controller.gaits[bot.options.gait || 'tripod']) { bot.options.gait = 'tripod'; }
            }}>{n}</a>
        ))}
      </fieldset>

      <fieldset className="btns">
        <legend>Body</legend>
        <a href="#" className={`control_btn${bodyShape === 'rectangle' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); setBodyShape('rectangle'); applyConfig({ body_shape: 'rectangle' }); }}>Rect</a>
        <a href="#" className={`control_btn${bodyShape === 'polygon' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); setBodyShape('polygon'); applyConfig({ body_shape: 'polygon' }); }}>Poly</a>
        {bodyShape === 'polygon' && (<>
          {' | '}
          <a href="#" className={`control_btn${polyPlacement === 'vertex' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); setPolyPlacement('vertex'); applyConfig({ polygon_leg_placement: 'vertex' }); }}>Vertex</a>
          <a href="#" className={`control_btn${polyPlacement === 'edge' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); setPolyPlacement('edge'); applyConfig({ polygon_leg_placement: 'edge' }); }}>Edge</a>
          {legCount % 2 !== 0 && (<>
            {' | '}
            <a href="#" className={`control_btn${oddOrientation === 'back' ? ' active' : ''}`}
              onClick={(e) => { e.preventDefault(); setOddOrientation('back'); applyConfig({ polygon_odd_orientation: 'back' }); }}>1-Back</a>
            <a href="#" className={`control_btn${oddOrientation === 'front' ? ' active' : ''}`}
              onClick={(e) => { e.preventDefault(); setOddOrientation('front'); applyConfig({ polygon_odd_orientation: 'front' }); }}>1-Front</a>
          </>)}
        </>)}
      </fieldset>

      <fieldset className="btns">
        <legend>Tip Spread</legend>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault();
          const bot = botRef.current; if (!bot) return;
          history.push(bot.options);
          const cur = bot.options.tip_circle_scale ?? 1;
          const next = Math.min(1.5, +(cur + 0.1).toFixed(1));
          setTipCircleScale(next); bot.options.tip_circle_scale = next;
          if (history.autoSave) set_bot_options(bot.options);
          bot.adjust_tip_spread(next); bumpBotVersion();
        }}>Expand</a>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault();
          const bot = botRef.current; if (!bot) return;
          history.push(bot.options);
          const cur = bot.options.tip_circle_scale ?? 1;
          const next = Math.max(0.1, +(cur - 0.1).toFixed(1));
          setTipCircleScale(next); bot.options.tip_circle_scale = next;
          if (history.autoSave) set_bot_options(bot.options);
          bot.adjust_tip_spread(next); bumpBotVersion();
        }}>Compact</a>
      </fieldset>

      <div ref={containerRef}></div>
    </div>
  );
}
