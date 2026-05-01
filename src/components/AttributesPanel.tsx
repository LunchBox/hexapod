import { useEffect, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { LIMB_NAMES } from '../hexapod/defaults';
import { history, performUndo, performRedo, performSave } from '../hexapod/history';
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

  useEffect(() => {
    if (!containerRef.current || !botRef.current) return;

    let container = containerRef.current;
    // Clear and rebuild when bot structure changes (leg_count etc.)
    container.innerHTML = '';

    let attrs_control = new HexapodAttributesController(container, botRef.current);

    // ── Toolbar: undo / redo / auto-save / save ──
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    container.appendChild(toolbar);

    const makeBtn = (text: string, title: string, onClick: () => void, disabled: boolean) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.title = title;
      btn.disabled = disabled;
      btn.style.cssText = 'padding:2px 8px;font-size:12px;cursor:pointer;';
      if (disabled) btn.style.opacity = '0.4';
      btn.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
      return btn;
    };

    const bot = botRef.current;

    const undoBtn = makeBtn('↩', 'Undo (Ctrl+Z)', () => {
      if (performUndo(bot, bumpBotVersion)) updateToolbar();
    }, !history.canUndo());

    const redoBtn = makeBtn('↪', 'Redo (Ctrl+Y)', () => {
      if (performRedo(bot, bumpBotVersion)) updateToolbar();
    }, !history.canRedo());

    const autoSaveLabel = document.createElement('label');
    autoSaveLabel.style.cssText = 'font-size:12px;margin-left:8px;cursor:pointer;display:flex;align-items:center;gap:3px;';
    const autoSaveCb = document.createElement('input');
    autoSaveCb.type = 'checkbox';
    autoSaveCb.checked = history.autoSave;
    autoSaveCb.addEventListener('change', () => {
      history.autoSave = autoSaveCb.checked;
      if (history.autoSave && history.isDirty(bot.options)) {
        history.save(bot.options);
      }
      updateToolbar();
    });
    autoSaveLabel.appendChild(autoSaveCb);
    autoSaveLabel.appendChild(document.createTextNode('Auto Save'));

    const saveBtn = makeBtn('💾 Save', 'Save to localStorage (Ctrl+S)', () => {
      performSave(bot, bumpBotVersion);
      updateToolbar();
    }, false);

    const dirtyDot = document.createElement('span');
    dirtyDot.style.cssText = 'color:#e67e22;font-weight:bold;font-size:14px;margin-left:2px;';

    function updateToolbar() {
      undoBtn.disabled = !history.canUndo();
      undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1';
      redoBtn.disabled = !history.canRedo();
      redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1';
      const dirty = history.isDirty(bot.options);
      saveBtn.style.display = history.autoSave ? 'none' : 'inline-block';
      saveBtn.style.background = dirty ? '#e67e22' : '';
      saveBtn.style.color = dirty ? '#fff' : '';
      dirtyDot.textContent = dirty ? ' ⬤ unsaved' : '';
      autoSaveCb.checked = history.autoSave;
    }

    toolbar.appendChild(undoBtn);
    toolbar.appendChild(redoBtn);
    toolbar.appendChild(autoSaveLabel);
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(dirtyDot);
    updateToolbar();

    // Store updateToolbar on the controller so handlers can refresh it
    (attrs_control as any)._updateToolbar = updateToolbar;

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

    // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save
    const handleKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (performUndo(bot, bumpBotVersion)) updateToolbar();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        if (performRedo(bot, bumpBotVersion)) updateToolbar();
      } else if (e.key === 's' || e.key === 'S') {
        if (!history.autoSave) {
          e.preventDefault();
          performSave(bot, bumpBotVersion);
          updateToolbar();
        }
      }
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [botVersion, bumpBotVersion]);

  return (
    <div id="attrs_control">
      <LegEditor />
      <div ref={containerRef}></div>
    </div>
  );
}
