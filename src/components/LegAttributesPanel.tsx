import { useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { get_bot_options } from '../hexapod/hexapod';
import { LIMB_NAMES } from '../hexapod/defaults';
import { history } from '../hexapod/history';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import LegEditor from './LegEditor';
import AttrSlider from './AttrSlider';
import SliderColumn from './SliderColumn';

export default function LegAttributesPanel() {
  const { botRef, bumpBotVersion } = useHexapod();

  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(new Set());

  const toggleLeg = (idx: number) => {
    setExpandedLegs(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  };

  const bot = botRef.current;
  const opts = bot?.options || get_bot_options();
  const dof = opts.dof || 3;
  const legCount = opts.leg_count || 6;
  const segNames = LIMB_NAMES.slice(0, Math.min(6, Math.max(2, dof)));

  return (
    <div>
      <LegEditor />

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Configuration</CardTitle></CardHeader>
        <CardContent className="py-1 px-3 space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Apply to All Legs</div>
            <div className="flex flex-wrap gap-0.5">
              {[3,4,5,6].map(d => (
                <Button key={d}
                  variant={dof === d ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const bot = botRef.current; if (!bot) return;
                    history.push(bot.options);
                    bot.options.dof = d;
                    for (let i = 0; i < bot.options.leg_options.length; i++) {
                      bot.options.leg_options[i].dof = d;
                    }
                    bot.apply_attributes(bot.options); bumpBotVersion();
                  }}
                >{d}-DOF</Button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Legs</div>
            <div className="flex flex-wrap gap-0.5">
              {[3,4,5,6,7,8,9].map(n => (
                <Button key={n}
                  variant={legCount === n ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const bot = botRef.current; if (!bot) return;
                    history.push(bot.options);
                    bot.options.leg_count = n;
                    bot.apply_attributes(bot.options); bumpBotVersion();
                    if (!bot.gait_controller.gaits[bot.options.gait || 'tripod']) { bot.options.gait = 'tripod'; }
                  }}
                >{n}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Adjust</CardTitle></CardHeader>
        <CardContent className="py-1 px-3">
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
          onDragEnd={() => { const b = botRef.current; if (!b) return; b.save_body_home(); bumpBotVersion(); }}
        />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Legs Attrs</CardTitle></CardHeader>
        <CardContent className="py-1 px-3">
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
        </CardContent>
      </Card>

      {/* Per-leg attrs */}
      {opts.leg_options && opts.leg_options.map((legOpt: any, idx: number) => {
        const legDof = legOpt.dof ?? dof;
        const legSegNames = LIMB_NAMES.slice(0, Math.min(6, Math.max(2, legDof)));
        const isExpanded = expandedLegs.has(idx);
        return (
          <Card key={idx} className="mb-2">
            <CardHeader className="py-1.5 px-3 cursor-pointer select-none"
              onClick={() => toggleLeg(idx)}>
              <CardTitle className="text-xs">
                {isExpanded ? '▼' : '▶'} Leg {idx} Attrs
              </CardTitle>
            </CardHeader>
            {isExpanded && (
              <CardContent className="py-1 px-3">
                <div className="text-[11px] text-muted-foreground mb-1">Position</div>
                <AttrSlider label="pos x"
                  value={legOpt.x ?? 0} min={-300} max={300} step={1}
                  onChange={(v) => {
                    const b = botRef.current; if (!b) return;
                    history.push(b.options);
                    b.options.leg_options[idx].x = v;
                    b.apply_attributes(b.options);
                    bumpBotVersion();
                  }}
                />
                <AttrSlider label="pos y"
                  value={legOpt.y ?? 0} min={-300} max={300} step={1}
                  onChange={(v) => {
                    const b = botRef.current; if (!b) return;
                    history.push(b.options);
                    b.options.leg_options[idx].y = v;
                    b.apply_attributes(b.options);
                    bumpBotVersion();
                  }}
                />
                <AttrSlider label="pos z"
                  value={legOpt.z ?? 0} min={-300} max={300} step={1}
                  onChange={(v) => {
                    const b = botRef.current; if (!b) return;
                    history.push(b.options);
                    b.options.leg_options[idx].z = v;
                    b.apply_attributes(b.options);
                    bumpBotVersion();
                  }}
                />

                {legSegNames.map(name => {
                  if (!legOpt[name]) return null;
                  return (
                    <div key={name} className="mt-2">
                      <div className="text-[11px] text-muted-foreground mb-1">
                        {name.charAt(0).toUpperCase() + name.slice(1)}
                      </div>
                      <AttrSlider label="Length"
                        value={legOpt[name].length ?? 20} min={5} max={200} step={1}
                        onChange={(v) => {
                          const b = botRef.current; if (!b) return;
                          history.push(b.options);
                          b.options.leg_options[idx][name].length = v;
                          b.apply_attributes(b.options);
                          bumpBotVersion();
                        }}
                      />
                      <AttrSlider label="Radius"
                        value={legOpt[name].radius ?? 5} min={1} max={50} step={1}
                        onChange={(v) => {
                          const b = botRef.current; if (!b) return;
                          history.push(b.options);
                          b.options.leg_options[idx][name].radius = v;
                          b.apply_attributes(b.options);
                          bumpBotVersion();
                        }}
                      />
                      <AttrSlider label="Init Angle"
                        value={legOpt[name].init_angle ?? 0} min={-180} max={180} step={1}
                        displayValue={(() => { const v = legOpt[name].init_angle ?? 0; return (Number.isInteger(v) ? v : v.toFixed(2)) + '°'; })()}
                        onChange={(v) => {
                          const b = botRef.current; if (!b) return;
                          history.push(b.options);
                          b.options.leg_options[idx][name].init_angle = v;
                          b.apply_attributes(b.options);
                          bumpBotVersion();
                        }}
                      />
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
