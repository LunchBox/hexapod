import {
  HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS, LIMB_NAMES, LIMB_DEFAULTS,
} from './defaults.js';
import { get_obj_from_local_storage, set_obj_to_local_storage } from './utils.js';
import { history } from './history.js';

/** Normalize a bot-options object in place: pad leg_options up to leg_count,
 *  ensure each leg has segment data for its DOF, and assign servo indices.
 *
 *  Servo-idx assignment is idempotent (only fills entries that are still
 *  undefined), so it is safe to run on already-normalized options. This must
 *  run on ANY options about to drive a rebuild — not just the localStorage
 *  read in get_bot_options. Preset configs (presets.ts), loaded JSON, and
 *  random options carry no servo_idx, so without this their command strings
 *  render "#undefined". apply_attributes calls it as the single chokepoint. */
export function normalize_bot_options(options: any) {
  if (!options || !Array.isArray(options.leg_options)) return options;

  const legCount = options.leg_count || 6;
  const globalDof = options.dof || 3;

  // Pad leg_options if fewer entries than leg count (e.g. 7-9 legs)
  while (options.leg_options.length < legCount) {
    let template = options.leg_options[options.leg_options.length - 1] || options.leg_options[0];
    options.leg_options.push(JSON.parse(JSON.stringify(template)));
  }

  // Ensure each leg_option has all segment data for its own DOF
  const defaultLeg = DEFAULT_HEXAPOD_OPTIONS.leg_options[0];
  let servoBase = options.first_servo_idx ?? 0;
  for (let i = 0; i < legCount; i++) {
    let leg_option = options.leg_options[i];
    const legDof = leg_option.dof ?? globalDof;
    const jointsPerLeg = Math.min(6, Math.max(2, legDof));
    const segNames = LIMB_NAMES.slice(0, jointsPerLeg);

    // Initialize per-leg DOF if not set
    if (leg_option.dof == null) leg_option.dof = globalDof;

    for (const name of segNames) {
      if (!leg_option[name]) {
        leg_option[name] = JSON.parse(JSON.stringify(defaultLeg[name] || {
          length: LIMB_DEFAULTS[name]?.length || 20,
          radius: LIMB_DEFAULTS[name]?.radius || 5,
          init_angle: LIMB_DEFAULTS[name]?.init_angle || 0,
          servo_value: 1500, revert: false,
        }));
      }
    }
    // Assign servo indices — cumulative offset for variable joints per leg
    for (let j = 0; j < segNames.length; j++) {
      if (typeof leg_option[segNames[j]].servo_idx === "undefined") {
        leg_option[segNames[j]].servo_idx = servoBase + j;
      }
    }
    servoBase += jointsPerLeg;
  }

  return options;
}

export function get_bot_options() {
  let options = get_obj_from_local_storage(HEXAPOD_OPTIONS_KEY, DEFAULT_HEXAPOD_OPTIONS);
  return normalize_bot_options(options);
}

export function set_bot_options(hexapod_options: any) {
  set_obj_to_local_storage(HEXAPOD_OPTIONS_KEY, hexapod_options);
  // Keep history._lastSaved in sync. Components call this directly on
  // every slider drag etc.; without marking, isDirty() reports stale,
  // the "unsaved" badge stays visible, and beforeunload warns even
  // though localStorage already has the latest options.
  history.markSaved(hexapod_options);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bot-options-saved', { detail: Date.now() }));
  }
}
