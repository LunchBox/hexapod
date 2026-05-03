import { useState, useRef } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options, set_bot_options } from '../hexapod/hexapod';
import { generateRandomOptions } from '../hexapod/random';
import { PRESETS } from '../hexapod/presets';
import { history } from '../hexapod/history';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Crosshair, Download, Upload, Shuffle, ArrowDown } from 'lucide-react';
import AttrSlider from './AttrSlider';
import SliderColumn from './SliderColumn';

export default function AttributesPanel() {
  const { botRef, bumpBotVersion } = useHexapod();

  const [wlLocked, setWlLocked] = useState(false);
  const [wlRatio, setWlRatio] = useState(0.5);
  const [hwlLocked, setHwlLocked] = useState(false);

  const bot = botRef.current;
  const opts = bot?.options || get_bot_options();
  const legCount = opts.leg_count || 6;
  const bodyShape = opts.body_shape || 'rectangle';
  const placement = opts.polygon_leg_placement || 'vertex';
  const firstLegDirection = opts.polygon_odd_orientation || 'back';

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
      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Profile</CardTitle></CardHeader>
        <CardContent className="py-1 px-3 space-y-3">
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" onClick={handleExport}><Download data-icon="inline-start" />Export</Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload data-icon="inline-start" />Import</Button>
            <Button variant="outline" size="sm" onClick={handleRandom}><Shuffle data-icon="inline-start" />Random</Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Presets</div>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => (
                <Button key={p.name} variant="outline" size="sm"
                  title={p.description}
                  onClick={(e) => {
                    e.preventDefault();
                    const b = botRef.current;
                    if (!b) return;
                    history.push(b.options);
                    const opts = JSON.parse(JSON.stringify(p.options));
                    set_bot_options(opts);
                    b.apply_attributes(opts);
                    setWlLocked(false);
                    setHwlLocked(false);
                    bumpBotVersion();
                  }}
                >{p.label}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Body</CardTitle></CardHeader>
        <CardContent className="py-1 px-3">
          <div className="flex flex-wrap items-center gap-1">
            <div className="flex gap-0.5">
              <Button variant={bodyShape === 'rectangle' ? 'default' : 'outline'} size="sm" onClick={() => applyConfig({ body_shape: 'rectangle' })}>Rect</Button>
              <Button variant={bodyShape === 'polygon' ? 'default' : 'outline'} size="sm" onClick={() => applyConfig({ body_shape: 'polygon' })}>Poly</Button>
            </div>
            {bodyShape === 'polygon' && (
              <>
                <span className="text-border mx-1">|</span>
                <div className="flex gap-0.5">
                  <Button variant={placement === 'vertex' ? 'default' : 'outline'} size="sm" onClick={() => applyConfig({ polygon_leg_placement: 'vertex' })}>Vertex</Button>
                  <Button variant={placement === 'edge' ? 'default' : 'outline'} size="sm" onClick={() => applyConfig({ polygon_leg_placement: 'edge' })}>Edge</Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  const w = opts.body_width || 50;
                  const l = opts.body_length || 100;
                  const avg = Math.round((w + l) / 2);
                  applyConfig({ body_width: avg, body_length: avg });
                }}>Regular</Button>
              </>
            )}
            {legCount % 2 !== 0 && (
              <div className="flex gap-0.5">
                <Button variant={firstLegDirection === 'back' ? 'default' : 'outline'} size="sm" onClick={() => applyConfig({ polygon_odd_orientation: 'back' })}>1-Back</Button>
                <Button variant={firstLegDirection === 'front' ? 'default' : 'outline'} size="sm" onClick={() => applyConfig({ polygon_odd_orientation: 'front' })}>1-Front</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Adjust</CardTitle></CardHeader>
        <CardContent className="py-1 px-3">
          <Button variant="outline" size="sm" className="mb-2" onClick={() => {
            const b = botRef.current;
            if (b) { b.reset_body_to_center(); bumpBotVersion(); }
          }}><Crosshair data-icon="inline-start" />Reset to Center</Button>
          <Button variant="outline" size="sm" className="mb-2" onClick={() => {
            const b = botRef.current;
            if (b) { b.squat_body(); bumpBotVersion(); }
          }}><ArrowDown data-icon="inline-start" />Squat</Button>
        <SliderColumn value={0} min={-40} max={40} step={1} label="Body X" horizontal springBack
          title="Nudge body X position"
          onChange={(v) => {
            const b = botRef.current; if (!b) return false;
            const ok = b.transform_body({ dx: v });
            b.adjust_gait_guidelines();
            return ok;
          }}
          onDragStart={() => { const b = botRef.current; if (b) history.push(b.options); }}
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
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
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
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
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
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
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
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
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
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
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
        />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Motions</CardTitle></CardHeader>
        <CardContent className="py-1 px-3">
          <AttrSlider label="Rotate Step"
            value={Math.round((opts.rotate_step || Math.PI / 14) * 180 / Math.PI)}
            min={1} max={90} step={1}
            displayValue={Math.round((opts.rotate_step || Math.PI / 14) * 180 / Math.PI) + '°'}
            title="Rotation angle per gait cycle (degrees)"
            onChange={(v) => applyConfig({ rotate_step: v * Math.PI / 180 })}
          />
          <AttrSlider label="F&B Step"
            value={opts.fb_step || 30} min={1} max={200} step={1}
            title="Forward/backward travel distance per gait cycle"
            onChange={(v) => applyConfig({ fb_step: v })}
          />
          <AttrSlider label="L&R Step"
            value={opts.lr_step || 30} min={1} max={200} step={1}
            title="Left/right travel distance per gait cycle"
            onChange={(v) => applyConfig({ lr_step: v })}
          />
          <AttrSlider label="Lift Height"
            value={opts.up_step ?? 10} min={1} max={80} step={1}
            title="How high leg tips lift during each gait step"
            onChange={(v) => applyConfig({ up_step: v })}
          />
          <AttrSlider label="Servo Speed"
            value={opts.servo_speed ?? 2000} min={100} max={10000} step={100}
            title="Servo rotation speed in units/sec"
            onChange={(v) => applyConfig({ servo_speed: v })}
          />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Body Attrs</CardTitle></CardHeader>
        <CardContent className="py-1 px-3">
          <div className="flex gap-3 mb-1 text-[11px]">
            <label className="cursor-pointer select-none">
              <input type="checkbox" checked={wlLocked}
                onChange={() => {
                  if (!wlLocked) {
                    const w = opts.body_width || 50;
                    const l = opts.body_length || 100;
                    setWlRatio(w / l);
                  }
                  setWlLocked(!wlLocked);
                }}
                className="align-middle mr-0.5" />
              Lock W/L
            </label>
            <label className="cursor-pointer select-none">
              <input type="checkbox" checked={hwlLocked}
                onChange={() => setHwlLocked(!hwlLocked)}
                className="align-middle mr-0.5" />
              Lock All
            </label>
          </div>
          <AttrSlider label="Body Height"
            value={opts.body_height || 20} min={5} max={200} step={1}
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
            value={opts.body_width || 50} min={10} max={500} step={1}
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
            value={opts.body_length || 100} min={10} max={500} step={1}
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
            value={opts.body_offset ?? 0} min={-100} max={100} step={1}
            onChange={(v) => applyConfig({ body_offset: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
