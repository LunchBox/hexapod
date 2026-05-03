import { useState, useEffect, useCallback, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { LIMB_NAMES } from '../hexapod/defaults';
import { generateRandomOptions } from '../hexapod/random';
import { history, performUndo, performRedo, performSave } from '../hexapod/history';
import LegEditor from './LegEditor';
import AttrSlider from './AttrSlider';
import SliderColumn from './SliderColumn';

export default function AttributesPanel() {
  const { botRef, botVersion, bumpBotVersion } = useHexapod();

  const [dofLegs, setDofLegs] = useState<Set<number>>(() => {
    const o = get_bot_options();
    const c = o.leg_count || 6;
    return new Set(Array.from({ length: c }, (_, i) => i));
  });

  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(new Set());

  const toggleLeg = (idx: number) => {
    setExpandedLegs(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  };

  // Body lock states — capture ratios when locked
  const [wlLocked, setWlLocked] = useState(false);
  const [wlRatio, setWlRatio] = useState(0.5);
  const [hwlLocked, setHwlLocked] = useState(false);

  // Toolbar state
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Keyboard shortcuts for undo/redo/save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const bot = botRef.current;
      if (!bot) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (performUndo(bot, bumpBotVersion)) refresh();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        if (performRedo(bot, bumpBotVersion)) refresh();
      } else if (e.key === 's' || e.key === 'S') {
        if (!history.autoSave) {
          e.preventDefault();
          performSave(bot, bumpBotVersion);
          refresh();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [botRef, bumpBotVersion, refresh]);

  // Read config from bot.options directly (single source of truth)
  const bot = botRef.current;
  const opts = bot?.options || get_bot_options();
  const dof = opts.dof || 3;
  const legCount = opts.leg_count || 6;
  const bodyShape = opts.body_shape || 'rectangle';
  const placement = opts.polygon_leg_placement || 'vertex';
  const firstLegDirection = opts.polygon_odd_orientation || 'back';
  const segNames = LIMB_NAMES.slice(0, Math.min(6, Math.max(2, dof)));

  const applyConfig = (updates: Partial<any>) => {
    const b = botRef.current;
    if (!b) return;
    history.push(b.options);
    Object.assign(b.options, updates);
    b.apply_attributes(b.options);
    bumpBotVersion();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const b = botRef.current;
    const data = b?.options || get_bot_options();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `hexapod-profile-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data.leg_options || !Array.isArray(data.leg_options)) {
          alert('Invalid profile file: missing leg_options');
          return;
        }
        const b = botRef.current;
        if (b) {
          history.push(b.options);
          set_bot_options(data);
          b.apply_attributes(data);
          bumpBotVersion();
        } else {
          set_bot_options(data);
        }
      } catch (err: any) {
        alert('Failed to parse profile: ' + err.message);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  const handleRandom = (e: React.MouseEvent) => {
    e.preventDefault();
    const b = botRef.current;
    if (!b) return;
    const opts = generateRandomOptions();
    history.push(b.options);
    b.apply_attributes(opts);
    bumpBotVersion();
  };

  return (
    <div id="attrs_control">
      <fieldset className="btns">
        <legend>Profile</legend>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handleExport(); }}>Export</a>
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}>Import</a>
        <a href="#" className="control_btn" onClick={handleRandom}>Random</a>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={handleImport} />
      </fieldset>

      <fieldset className="btns" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <legend>History</legend>
        {(() => {
          const canUndo = history.canUndo();
          const canRedo = history.canRedo();
          const dirty = bot ? history.isDirty(bot.options) : false;
          const btnStyle = (disabled: boolean): React.CSSProperties => ({
            padding: '2px 10px', fontSize: 13,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.35 : 1,
            border: '1px solid #888', borderRadius: 3, background: '#eee',
          });
          return (
            <>
              <button style={btnStyle(!canUndo)} disabled={!canUndo}
                onClick={() => { const b = botRef.current; if (b && performUndo(b, bumpBotVersion)) refresh(); }}
                title="Undo (Ctrl+Z)">↩ Undo</button>
              <button style={btnStyle(!canRedo)} disabled={!canRedo}
                onClick={() => { const b = botRef.current; if (b && performRedo(b, bumpBotVersion)) refresh(); }}
                title="Redo (Ctrl+Y)">↪ Redo</button>
              <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 8 }}>
                <input type="checkbox" checked={history.autoSave}
                  onChange={(e) => {
                    history.autoSave = e.currentTarget.checked;
                    const b = botRef.current;
                    if (history.autoSave && b && history.isDirty(b.options)) { history.save(b.options); }
                    refresh();
                  }} />
                Auto Save
              </label>
              {!history.autoSave && (
                <button style={{ ...btnStyle(false), background: dirty ? '#e67e22' : '#eee', color: dirty ? '#fff' : '#333', fontWeight: dirty ? 'bold' : 'normal' }}
                  onClick={() => { const b = botRef.current; if (b) { performSave(b, bumpBotVersion); refresh(); } }}
                  title="Save (Ctrl+S)">💾 Save</button>
              )}
              {dirty && (
                <span style={{ color: '#e67e22', fontSize: 12, fontWeight: 'bold' }}>⬤ unsaved</span>
              )}
              <a href="#" className="control_btn" style={{ marginLeft: 12 }}
                onClick={(e) => { e.preventDefault();
                  localStorage.removeItem('hexapod_options');
                  window.location.reload();
                }}>Reset Configs</a>
            </>
          );
        })()}
      </fieldset>

      <LegEditor />

      <fieldset className="btns">
        <legend>DOF</legend>
        {[3,4,5,6].map(d => (
          <a key={d} href="#" className={`control_btn${dof === d ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault();
              const bot = botRef.current; if (!bot) return;
              history.push(bot.options);
              bot.options.dof = d;
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
              setDofLegs(new Set(Array.from({ length: n }, (_, i) => i)));
              bot.options.leg_count = n;
              bot.apply_attributes(bot.options); bumpBotVersion();
              if (!bot.gait_controller.gaits[bot.options.gait || 'tripod']) { bot.options.gait = 'tripod'; }
            }}>{n}</a>
        ))}
      </fieldset>

      <fieldset className="btns">
        <legend>Body</legend>
        <a href="#" className={`control_btn${bodyShape === 'rectangle' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); applyConfig({ body_shape: 'rectangle' }); }}>Rect</a>
        <a href="#" className={`control_btn${bodyShape === 'polygon' ? ' active' : ''}`}
          onClick={(e) => { e.preventDefault(); applyConfig({ body_shape: 'polygon' }); }}>Poly</a>
        {bodyShape === 'polygon' && (<>
          {' | '}
          <a href="#" className={`control_btn${placement === 'vertex' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); applyConfig({ polygon_leg_placement: 'vertex' }); }}>Vertex</a>
          <a href="#" className={`control_btn${placement === 'edge' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); applyConfig({ polygon_leg_placement: 'edge' }); }}>Edge</a>
          {' | '}
          <a href="#" className="control_btn" onClick={(e) => { e.preventDefault();
            const w = opts.body_width || 50;
            const l = opts.body_length || 100;
            const avg = Math.round((w + l) / 2);
            applyConfig({ body_width: avg, body_length: avg });
          }}>Regular</a>
        </>)}
        {legCount % 2 !== 0 && (<>
          <a href="#" className={`control_btn${firstLegDirection === 'back' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); applyConfig({ polygon_odd_orientation: 'back' }); }}>1-Back</a>
          <a href="#" className={`control_btn${firstLegDirection === 'front' ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); applyConfig({ polygon_odd_orientation: 'front' }); }}>1-Front</a>
        </>)}
      </fieldset>

      <fieldset className="btns">
        <legend>Adjust</legend>
        <SliderColumn value={0} min={-30} max={30} step={1} label="Tip Spread" horizontal springBack
          title="Drag to spread/compact tips"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const cx = b.body_mesh.position.x;
            const cz = b.body_mesh.position.z;
            for (let i = 0; i < b.legs.length; i++) {
              const tip = b.legs[i].get_tip_pos();
              const dx = tip.x - cx;
              const dz = tip.z - cz;
              const dist = Math.sqrt(dx * dx + dz * dz) || 1;
              const newDist = Math.max(5, dist + v);
              tip.x = cx + (dx / dist) * newDist;
              tip.z = cz + (dz / dist) * newDist;
              b.legs[i].set_tip_pos(tip);
            }
            b.sync_guide_circles();
            b.adjust_gait_guidelines();
            b.after_status_change();
            return true;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
        <SliderColumn value={0} min={-40} max={40} step={1} label="Body X" horizontal springBack
          title="Nudge body X position"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ dx: v });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
        <SliderColumn value={0} min={-24} max={24} step={1} label="Body Y" horizontal springBack
          title="Nudge body height"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ dy: v });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
        <SliderColumn value={0} min={-40} max={40} step={1} label="Body Z" horizontal springBack
          title="Nudge body Z position"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ dz: v });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
        <SliderColumn value={0} min={-30} max={30} step={1} label="Rot X" horizontal springBack
          title="Nudge body rotation X"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ rx: v * Math.PI / 180 });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
        <SliderColumn value={0} min={-30} max={30} step={1} label="Rot Y" horizontal springBack
          title="Nudge body rotation Y"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ ry: v * Math.PI / 180 });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
        <SliderColumn value={0} min={-30} max={30} step={1} label="Rot Z" horizontal springBack
          title="Nudge body rotation Z"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ rz: v * Math.PI / 180 });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => {
            const b = botRef.current; if (!b) return;
            b.save_body_home();
            bumpBotVersion();
          }}
        />
      </fieldset>

      {/* ── Motions ── */}
      <fieldset className="attr-fieldset">
        <legend>Motions</legend>
        <AttrSlider label="Rotate Step"
          value={Math.round((opts.rotate_step || Math.PI / 14) * 180 / Math.PI)}
          min={1} max={90} step={1}
          displayValue={Math.round((opts.rotate_step || Math.PI / 14) * 180 / Math.PI) + '°'}
          title="Rotation angle per gait cycle (degrees)"
          onChange={(v) => applyConfig({ rotate_step: v * Math.PI / 180 })}
        />
        <AttrSlider label="F&B Step"
          value={opts.fb_step || 30}
          min={1} max={200} step={1}
          title="Forward/backward travel distance per gait cycle"
          onChange={(v) => applyConfig({ fb_step: v })}
        />
        <AttrSlider label="L&R Step"
          value={opts.lr_step || 30}
          min={1} max={200} step={1}
          title="Left/right travel distance per gait cycle"
          onChange={(v) => applyConfig({ lr_step: v })}
        />
        <AttrSlider label="Lift Height"
          value={opts.up_step ?? 10}
          min={1} max={80} step={1}
          title="How high leg tips lift during each gait step"
          onChange={(v) => applyConfig({ up_step: v })}
        />
        <AttrSlider label="Servo Speed"
          value={opts.servo_speed ?? 2000}
          min={100} max={10000} step={100}
          title="Servo rotation speed in units/sec. 2000 = full 180° sweep in 1 second."
          onChange={(v) => applyConfig({ servo_speed: v })}
        />
      </fieldset>

      {/* ── Body Attrs ── */}
      <fieldset className="attr-fieldset">
        <legend>Body Attrs</legend>
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 11 }}>
          <label style={{ cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={wlLocked}
              onChange={() => {
                if (!wlLocked) {
                  const w = opts.body_width || 50;
                  const l = opts.body_length || 100;
                  setWlRatio(w / l);
                }
                setWlLocked(!wlLocked);
              }}
              style={{ verticalAlign: 'middle', marginRight: 2 }} />
            Lock W/L
          </label>
          <label style={{ cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={hwlLocked}
              onChange={() => setHwlLocked(!hwlLocked)}
              style={{ verticalAlign: 'middle', marginRight: 2 }} />
            Lock All
          </label>
        </div>
        <AttrSlider label="Body Height"
          value={opts.body_height || 20}
          min={5} max={200} step={1}
          onChange={(v) => {
            if (!hwlLocked) { applyConfig({ body_height: v }); return; }
            const oldH = opts.body_height || 20;
            const oldW = opts.body_width || 50;
            const oldL = opts.body_length || 100;
            const f = v / oldH;
            applyConfig({ body_height: v, body_width: Math.round(oldW * f), body_length: Math.round(oldL * f) });
          }}
        />
        <AttrSlider label="Body Width"
          value={opts.body_width || 50}
          min={10} max={500} step={1}
          onChange={(v) => {
            if (hwlLocked) {
              const oldH = opts.body_height || 20;
              const oldW = opts.body_width || 50;
              const oldL = opts.body_length || 100;
              const f = v / oldW;
              applyConfig({ body_width: v, body_height: Math.round(oldH * f), body_length: Math.round(oldL * f) });
            } else if (wlLocked) {
              applyConfig({ body_width: v, body_length: Math.round(v / wlRatio) });
            } else {
              applyConfig({ body_width: v });
            }
          }}
        />
        <AttrSlider label="Body Length"
          value={opts.body_length || 100}
          min={10} max={500} step={1}
          onChange={(v) => {
            if (hwlLocked) {
              const oldH = opts.body_height || 20;
              const oldW = opts.body_width || 50;
              const oldL = opts.body_length || 100;
              const f = v / oldL;
              applyConfig({ body_length: v, body_height: Math.round(oldH * f), body_width: Math.round(oldW * f) });
            } else if (wlLocked) {
              applyConfig({ body_length: v, body_width: Math.round(v * wlRatio) });
            } else {
              applyConfig({ body_length: v });
            }
          }}
        />
        <AttrSlider label="Body Offset"
          value={opts.body_offset ?? 0}
          min={-100} max={100} step={1}
          onChange={(v) => applyConfig({ body_offset: v })}
        />
      </fieldset>

      {/* ── Legs Attrs (global) ── */}
      <fieldset className="attr-fieldset">
        <legend>Legs Attrs</legend>
        {segNames.map(name => (
          <AttrSlider key={name}
            label={name.charAt(0).toUpperCase() + name.slice(1) + ' Length'}
            value={opts[name + '_length'] || 20}
            min={5} max={200} step={1}
            onChange={(v) => {
              const b = botRef.current; if (!b) return;
              history.push(b.options);
              b.options[name + '_length'] = v;
              for (let i = 0; i < b.options.leg_options.length; i++) {
                if (b.options.leg_options[i][name]) {
                  b.options.leg_options[i][name].length = v;
                }
              }
              b.apply_attributes(b.options);
              bumpBotVersion();
            }}
          />
        ))}
      </fieldset>

      {/* ── Per-leg attrs ── */}
      {opts.leg_options && opts.leg_options.map((legOpt: any, idx: number) => {
        const legDof = legOpt.dof ?? dof;
        const legSegNames = LIMB_NAMES.slice(0, Math.min(6, Math.max(2, legDof)));
        const isExpanded = expandedLegs.has(idx);
        return (
          <fieldset key={idx} className="attr-fieldset tab leg_attrs">
            <legend onClick={() => toggleLeg(idx)}
              style={{ cursor: 'pointer', userSelect: 'none' }}>
              {isExpanded ? '▼' : '▶'} Leg {idx} Attrs
            </legend>
            {isExpanded && (
              <div className="tab_content active">
                <fieldset className="attr-fieldset">
                  <legend>Position</legend>
                  <AttrSlider label="pos x"
                    value={legOpt.x ?? 0}
                    min={-300} max={300} step={1}
                    onChange={(v) => {
                      const b = botRef.current; if (!b) return;
                      history.push(b.options);
                      b.options.leg_options[idx].x = v;
                      b.apply_attributes(b.options);
                      bumpBotVersion();
                    }}
                  />
                  <AttrSlider label="pos y"
                    value={legOpt.y ?? 0}
                    min={-300} max={300} step={1}
                    onChange={(v) => {
                      const b = botRef.current; if (!b) return;
                      history.push(b.options);
                      b.options.leg_options[idx].y = v;
                      b.apply_attributes(b.options);
                      bumpBotVersion();
                    }}
                  />
                  <AttrSlider label="pos z"
                    value={legOpt.z ?? 0}
                    min={-300} max={300} step={1}
                    onChange={(v) => {
                      const b = botRef.current; if (!b) return;
                      history.push(b.options);
                      b.options.leg_options[idx].z = v;
                      b.apply_attributes(b.options);
                      bumpBotVersion();
                    }}
                  />
                </fieldset>

                {legSegNames.map(name => {
                  if (!legOpt[name]) return null;
                  return (
                    <fieldset key={name} className="attr-fieldset">
                      <legend>{name.charAt(0).toUpperCase() + name.slice(1)}</legend>
                      <AttrSlider label="Length"
                        value={legOpt[name].length ?? 20}
                        min={5} max={200} step={1}
                        onChange={(v) => {
                          const b = botRef.current; if (!b) return;
                          history.push(b.options);
                          b.options.leg_options[idx][name].length = v;
                          b.apply_attributes(b.options);
                          bumpBotVersion();
                        }}
                      />
                      <AttrSlider label="Radius"
                        value={legOpt[name].radius ?? 5}
                        min={1} max={50} step={1}
                        onChange={(v) => {
                          const b = botRef.current; if (!b) return;
                          history.push(b.options);
                          b.options.leg_options[idx][name].radius = v;
                          b.apply_attributes(b.options);
                          bumpBotVersion();
                        }}
                      />
                      <AttrSlider label="Init Angle"
                        value={legOpt[name].init_angle ?? 0}
                        min={-180} max={180} step={1}
                        displayValue={(() => { const v = legOpt[name].init_angle ?? 0; return (Number.isInteger(v) ? v : v.toFixed(2)) + '°'; })()}
                        onChange={(v) => {
                          const b = botRef.current; if (!b) return;
                          history.push(b.options);
                          b.options.leg_options[idx][name].init_angle = v;
                          b.apply_attributes(b.options);
                          bumpBotVersion();
                        }}
                      />
                    </fieldset>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
