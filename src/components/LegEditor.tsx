import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { getSegNamesForLeg, computeJointPositions, getActualJointPositions, applyJointMove } from '../hexapod/hexapod';
import { history } from '../hexapod/history';
import { Button } from '@/components/ui/button';
import { CheckCheck, ArrowDownToLine, X } from 'lucide-react';

interface Point { x: number; y: number }

const BASE_COLORS = ['#00C896', '#448AFF', '#FF6D00', '#7C4DFF', '#00BCD4', '#E91E8C'];
const JOINT_R = 7, HIT_R = 16;
const JOINT_FILL = '#fff';

function computeView(pts: Point[], w: number, h: number) {
  const pad = 40;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(0, ...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys);
  const legW = maxX - minX || 1, legH = maxY - minY || 1;
  const scale = Math.min((w - pad * 2) / legW, (h - pad * 2) / legH);
  const ox = pad - minX * scale + (w - pad * 2 - legW * scale) / 2;
  const oy = pad - minY * scale + (h - pad * 2 - legH * scale) / 2;
  return { scale, ox, oy };
}

function toScreen(p: Point, v: { scale: number; ox: number; oy: number }): Point {
  return { x: p.x * v.scale + v.ox, y: p.y * v.scale + v.oy };
}

function toLeg(sx: number, sy: number, v: { scale: number; ox: number; oy: number }): Point {
  return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
}

export default function LegEditor() {
  const { botRef, bumpBotVersion, botVersion } = useHexapod();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ joint: number; startLeg: Point; startScreen: Point; opts: any; view: { scale: number; ox: number; oy: number }; refLeg: number } | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef<number>(-1);
  const sizeRef = useRef({ w: 400, h: 220 });

  // Independent leg checkboxes for LegEditor (default all checked)
  const [editorLegs, setEditorLegs] = useState<Set<number>>(() => {
    const bot = botRef.current;
    const count = bot?.legs?.length || 6;
    return new Set(Array.from({ length: count }, (_, i) => i));
  });

  const prevLegCount = useRef(0);

  // Sync editorLegs only when leg count actually changes
  useEffect(() => {
    const bot = botRef.current;
    if (!bot) return;
    const count = bot.legs.length;
    if (prevLegCount.current !== count) {
      setEditorLegs(prev => {
        const next = new Set(prev);
        // New legs (beyond previous count) default to checked
        for (let i = prevLegCount.current; i < count; i++) next.add(i);
        // Remove legs that no longer exist
        for (const i of next) { if (i >= count) next.delete(i); }
        return next;
      });
      prevLegCount.current = count;
    }
  }, [botVersion, botRef]);

  const getCheckedLegs = useCallback((): number[] => {
    const bot = botRef.current;
    if (!bot) return [];
    const count = bot.legs.length;
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      if (editorLegs.has(i)) result.push(i);
    }
    return result;
  }, [botRef, editorLegs]);

  const checkedLegsCompatible = useCallback((): { ok: boolean; dof: number; refLeg: number; reason: string } => {
    const bot = botRef.current;
    if (!bot) return { ok: false, dof: 0, refLeg: -1, reason: 'No bot' };
    const checked = getCheckedLegs();
    if (checked.length === 0) return { ok: false, dof: 0, refLeg: -1, reason: 'No legs selected' };
    const refLeg = checked[0];
    const refOpt = bot.options.leg_options[refLeg];
    const refDof = refOpt?.dof ?? bot.options.dof ?? 3;
    const refSegNames = getSegNamesForLeg(bot.options, refLeg);
    // Collect ref lengths + init_angles (skip coxa.init_angle — it varies by leg position)
    const refParams: Record<string, { len: number; angle: number }> = {};
    for (const seg of refSegNames) {
      if (!refOpt[seg]) continue;
      refParams[seg] = { len: refOpt[seg].length ?? 20, angle: refOpt[seg].init_angle ?? 0 };
    }
    for (const i of checked) {
      const legOpt = bot.options.leg_options[i];
      const legDof = legOpt?.dof ?? bot.options.dof ?? 3;
      if (legDof !== refDof) return { ok: false, dof: 0, refLeg: -1, reason: `Leg ${i} DOF (${legDof}) differs from leg ${refLeg} (${refDof})` };
      const legSegNames = getSegNamesForLeg(bot.options, i);
      for (const seg of refSegNames) {
        if (seg === 'coxa') continue; // coxa angle varies by leg position — skip
        const refLen = refParams[seg]?.len ?? 20;
        const refAngle = refParams[seg]?.angle ?? 0;
        const legLen = legOpt[seg]?.length ?? 20;
        const legAngle = legOpt[seg]?.init_angle ?? 0;
        if (Math.abs(legLen - refLen) > 0.01) return { ok: false, dof: 0, refLeg: -1, reason: `Leg ${i} ${seg} length (${legLen.toFixed(0)}) ≠ leg ${refLeg} (${refLen.toFixed(0)})` };
        if (Math.abs(legAngle - refAngle) > 0.01) return { ok: false, dof: 0, refLeg: -1, reason: `Leg ${i} ${seg} angle (${legAngle.toFixed(1)}°) ≠ leg ${refLeg} (${refAngle.toFixed(1)}°)` };
      }
    }
    return { ok: true, dof: refDof, refLeg, reason: '' };
  }, [botRef, getCheckedLegs]);

  const getOpts = useCallback(() => {
    const bot = botRef.current;
    if (!bot) return null;
    return bot.options;
  }, [botRef]);

  const applyOpts = useCallback((opts: any, immediate: boolean) => {
    const bot = botRef.current;
    if (!bot) return;
    if (immediate) {
      if (throttleRef.current) { clearTimeout(throttleRef.current); throttleRef.current = null; }
      bot.apply_attributes(opts);
      bumpBotVersion();
    }
  }, [botRef, bumpBotVersion]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const opts = getOpts();
    if (!opts) return;

    const valid = checkedLegsCompatible();
    const cw = sizeRef.current.w, ch = sizeRef.current.h;

    // If no valid reference leg, show disabled state
    if (!valid.ok) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#999';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      const reason = valid.reason || 'Selected legs are incompatible';
      ctx.fillText(reason, cw / 2, ch / 2 - 4);
      ctx.fillText('— editor disabled —', cw / 2, ch / 2 + 12);
      ctx.textAlign = 'start';
      return;
    }

    const refLeg = valid.refLeg;
    // When not dragging: show actual 3D joint positions (matches scene).
    // During drag: use opts-based positions for live feedback (servo values stale).
    let pts;
    if (dragRef.current) {
      pts = computeJointPositions(opts, refLeg);
    } else {
      const bot = botRef.current;
      const actual = bot ? getActualJointPositions(bot, refLeg) : null;
      pts = actual || computeJointPositions(opts, refLeg);
    }
    const view = dragRef.current?.view || computeView(pts, sizeRef.current.w, sizeRef.current.h);
    const sp = pts.map(p => toScreen(p, view));

    ctx.clearRect(0, 0, cw, ch);

    // Grid
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    const gridStep = 20 * view.scale;
    for (let x = view.ox % gridStep; x < cw; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = view.oy % gridStep; y < ch; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }

    // Segments
    for (let i = 0; i < sp.length - 1; i++) {
      ctx.strokeStyle = BASE_COLORS[i % BASE_COLORS.length];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sp[i].x, sp[i].y);
      ctx.lineTo(sp[i + 1].x, sp[i + 1].y);
      ctx.stroke();

      // Length label
      const mx = (sp[i].x + sp[i + 1].x) / 2;
      const my = (sp[i].y + sp[i + 1].y) / 2;
      const len = Math.sqrt(
        (pts[i + 1].x - pts[i].x) ** 2 + (pts[i + 1].y - pts[i].y) ** 2
      );
      ctx.fillStyle = '#555';
      ctx.font = '10px monospace';
      ctx.fillText(len.toFixed(0), mx + 4, my - 4);
    }

    // Joints
    for (let i = 0; i < sp.length; i++) {
      const isHovered = hoverRef.current === i;
      ctx.fillStyle = i === 0 ? '#666' : (isHovered ? '#ff0' : JOINT_FILL);
      ctx.beginPath();
      ctx.arc(sp[i].x, sp[i].y, JOINT_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Angle arcs for non-first segments
    const leg = opts.leg_options[refLeg];
    const arcR = 25;

    function drawArc(j: number, a1Deg: number, a2Deg: number, color: string) {
      if (j < 2) return;
      const center = sp[j];
      let a1 = (a1Deg * Math.PI) / 180;
      let a2 = (a2Deg * Math.PI) / 180;
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const ccw = diff < 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, arcR, a1, a2, ccw);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const segNames = getSegNamesForLeg(opts, refLeg);
    let cumCanvasDeg = 0;
    for (let s = 1; s < segNames.length; s++) {
      const segOpt = leg[segNames[s]] || {};
      const init3D = segOpt.init_angle ?? 0;
      const relCanvasDeg = -init3D;
      drawArc(s, cumCanvasDeg, cumCanvasDeg + relCanvasDeg, BASE_COLORS[s % BASE_COLORS.length]);
      cumCanvasDeg += relCanvasDeg;
    }
  }, [getOpts, checkedLegsCompatible]);

  const getJointAt = useCallback((cx: number, cy: number): number => {
    const opts = getOpts();
    if (!opts) return -1;
    const valid = checkedLegsCompatible();
    if (!valid.ok) return -1;
    // Match draw(): use actual 3D positions when not dragging
    const bot = botRef.current;
    const pts = (bot ? getActualJointPositions(bot, valid.refLeg) : null)
      || computeJointPositions(opts, valid.refLeg);
    const view = computeView(pts, sizeRef.current.w, sizeRef.current.h);
    for (let i = 1; i < pts.length; i++) {
      const s = toScreen(pts[i], view);
      if ((cx - s.x) ** 2 + (cy - s.y) ** 2 <= HIT_R * HIT_R) return i;
    }
    return -1;
  }, [getOpts, checkedLegsCompatible]);

  // Size canvas then draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const bot = botRef.current;
    if (!canvas || !bot) return;

    const dpr = window.devicePixelRatio || 1;
    const container = canvas.parentElement;
    const cw = container ? container.clientWidth : 400;
    const ch = Math.round(cw * 0.55);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    // Lock CSS size to match drawing buffer — prevents stretch/squash mismatches
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    sizeRef.current = { w: cw, h: ch };

    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

    draw();
  }, [draw, botVersion]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const j = getJointAt(cx, cy);
    if (j < 1) return;

    const opts = getOpts();
    if (!opts) return;
    const valid = checkedLegsCompatible();
    if (!valid.ok) return;

    // Push pre-drag state to undo history
    history.push(botRef.current.options);

    const pts = computeJointPositions(opts, valid.refLeg);
    const view = computeView(pts, sizeRef.current.w, sizeRef.current.h);
    const legPt = toLeg(cx, cy, view);

    dragRef.current = {
      joint: j,
      startLeg: { x: pts[j].x, y: pts[j].y },
      startScreen: { x: cx, y: cy },
      opts: JSON.parse(JSON.stringify(opts)),
      view,
      refLeg: valid.refLeg,
    };

    canvas.classList.add('grabbing');
    e.preventDefault();
  }, [getOpts, getJointAt, checkedLegsCompatible]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    const d = dragRef.current;
    if (d) {
      const bot = botRef.current;
      if (!bot) return;
      const opts = bot.options;
      const legPt = toLeg(cx, cy, d.view);

      const result = applyJointMove(opts, d.refLeg, d.joint, legPt);
      if (result) {
        const checked = getCheckedLegs();
        const globalKey = result.segmentName + '_length';
        (opts as any)[globalKey] = result.length;
        for (const i of checked) {
          if (!opts.leg_options[i][result.segmentName]) continue;
          opts.leg_options[i][result.segmentName].length = result.length;
          if (result.init_angle != null) {
            opts.leg_options[i][result.segmentName].init_angle = result.init_angle;
          }
        }
      }

      applyOpts(opts, false);
      draw();
    } else {
      const j = getJointAt(cx, cy);
      if (hoverRef.current !== j) {
        hoverRef.current = j;
        if (j >= 1) canvas.style.cursor = 'grab';
        else canvas.style.cursor = 'default';
        draw();
      }
    }
  }, [botRef, getJointAt, applyOpts, draw, getCheckedLegs]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.classList.remove('grabbing');

    const d = dragRef.current;
    if (d) {
      const bot = botRef.current;
      if (bot) {
        if (history.autoSave) {
          set_bot_options(bot.options);
          history.markSaved(bot.options);
        }
        applyOpts(bot.options, true);
      }
      dragRef.current = null;
      draw();
    }
  }, [botRef, applyOpts, draw]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = -1;
    const canvas = canvasRef.current;
    if (canvas) canvas.classList.remove('grabbing');
    if (dragRef.current) {
      const bot = botRef.current;
      if (bot) {
        if (history.autoSave) {
          set_bot_options(bot.options);
          history.markSaved(bot.options);
        }
        applyOpts(bot.options, true);
      }
      dragRef.current = null;
    }
    draw();
  }, [botRef, applyOpts, draw]);

  const toggleLeg = (i: number) => {
    setEditorLegs(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleApplyToAll = useCallback(() => {
    const bot = botRef.current;
    if (!bot) return;
    const valid = checkedLegsCompatible();
    if (!valid.ok) return;
    const refLeg = valid.refLeg;
    const refOpt = bot.options.leg_options[refLeg];
    const segNames = getSegNamesForLeg(bot.options, refLeg);
    history.push(bot.options);
    bot.options.dof = valid.dof;
    for (let i = 0; i < bot.options.leg_options.length; i++) {
      if (i === refLeg) continue;
      const legOpt = bot.options.leg_options[i];
      legOpt.dof = valid.dof;
      for (const seg of segNames) {
        if (!refOpt[seg]) continue;
        if (!legOpt[seg]) legOpt[seg] = {};
        legOpt[seg].length = refOpt[seg].length ?? 20;
        legOpt[seg].init_angle = refOpt[seg].init_angle ?? 0;
        legOpt[seg].radius = refOpt[seg].radius ?? 5;
      }
    }
    bot.apply_attributes(bot.options);
    if (history.autoSave) history.save(bot.options);
    bumpBotVersion();
  }, [botRef, checkedLegsCompatible, bumpBotVersion]);

  // Group legs by identical parameters
  const legGroups = useMemo(() => {
    const bot = botRef.current;
    if (!bot) return [];
    const n = bot.legs.length;
    const fingerprints: string[] = [];
    for (let i = 0; i < n; i++) {
      const leg = bot.options.leg_options[i];
      const dof = leg?.dof ?? bot.options.dof ?? 3;
      const segs = getSegNamesForLeg(bot.options, i);
      const parts = [`dof:${dof}`];
      for (const s of segs) {
        const len = leg[s]?.length ?? (bot.options as any)[s + '_length'] ?? 20;
        const ang = s === 'coxa' ? 0 : (leg[s]?.init_angle ?? 0);
        parts.push(`${s}:${len.toFixed(1)}:${ang.toFixed(1)}`);
      }
      fingerprints.push(parts.join('|'));
    }
    const seen: Record<string, number> = {};
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
      const fp = fingerprints[i];
      if (!(fp in seen)) seen[fp] = Object.keys(seen).length;
      result.push(seen[fp]);
    }
    return result;
  }, [botRef, botVersion]);

  const legRowRef = useRef<HTMLSpanElement>(null);
  const connectorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [groupBtnPositions, setGroupBtnPositions] = useState<{ g: number; x: number; allSelected: boolean; legIds: number[] }[]>([]);

  const selectGroup = (legIds: number[]) => {
    setEditorLegs(prev => {
      const next = new Set(prev);
      const allSel = legIds.every(id => next.has(id));
      if (allSel) { for (const id of legIds) next.delete(id); }
      else { for (const id of legIds) next.add(id); }
      return next;
    });
  };

  // Draw connector lines on a canvas overlay above the leg buttons
  useEffect(() => {
    const canvas = connectorCanvasRef.current;
    const row = legRowRef.current;
    if (!canvas || !row) return;
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const rowRect = row.getBoundingClientRect();
      const w = rowRect.width;
      const h = 20; // space above buttons
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;

      const round = (v: number) => Math.round(v) + 0.5;

      const buttons = Array.from(row.querySelectorAll('[data-leg]')) as HTMLElement[];
      const groupMap = new Map<number, HTMLElement[]>();
      for (const btn of buttons) {
        const g = parseInt(btn.getAttribute('data-group') || '0');
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g)!.push(btn);
      }

      const groupButtons: { g: number; x: number; allSelected: boolean; legIds: number[] }[] = [];

      const groups = Array.from(groupMap.entries()).sort((a, b) => a[0] - b[0]);
      groups.forEach(([g, members], gi) => {
        if (members.length < 2) return;
        const xs = members.map(el => {
          const r = el.getBoundingClientRect();
          return round(r.left - rowRect.left + r.width / 2);
        });
        const legIds = members.map(el => parseInt(el.getAttribute('data-leg') || '0'));
        const allSelected = legIds.every(id => editorLegs.has(id));
        const yLine = round(4 + gi * 5);
        const midX = Math.round((xs[0] + xs[xs.length - 1]) / 2);
        groupButtons.push({ g, x: midX, allSelected, legIds });

        ctx.beginPath();
        ctx.moveTo(xs[0], yLine);
        ctx.lineTo(xs[xs.length - 1], yLine);
        ctx.stroke();
        for (const x of xs) {
          ctx.beginPath();
          ctx.moveTo(x, yLine);
          ctx.lineTo(x, round(h));
          ctx.stroke();
        }
      });

      setGroupBtnPositions(groupButtons);
    };

    draw();
    // Re-draw after a tick in case DOM hasn't settled
    const id = setTimeout(draw, 50);
    return () => clearTimeout(id);
  }, [botVersion, editorLegs]);

  const legCount = botRef.current?.legs?.length || 6;
  const valid = checkedLegsCompatible();

  return (
    <div className="border border-border rounded-md p-3 mb-2.5 max-w-[560px]">
      <p className="text-[13px] font-bold text-foreground m-0 mb-1.5">Leg Editor — drag joints to adjust</p>
      <div className="relative">
        <canvas ref={connectorCanvasRef} className="block" style={{ height: 20, width: '100%' }} />
        {groupBtnPositions.map(b => (
          <span key={b.g}
            className="absolute inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold cursor-pointer select-none border border-border bg-background hover:bg-accent transition-colors"
            style={{ left: b.x - 8, top: -2 }}
            title={b.allSelected ? 'Deselect group' : 'Select group'}
            onClick={() => selectGroup(b.legIds)}
          >{b.allSelected ? '✓' : b.g}</span>
        ))}
      </div>
      <div className="flex gap-0.5 mb-2 flex-wrap items-center">
        <span className="flex gap-0.5" ref={legRowRef}>
          {Array.from({ length: legCount }, (_, i) => {
            const sel = editorLegs.has(i);
            return (
              <span key={i}
                className="inline-flex items-center justify-center w-7 h-6 rounded text-xs font-semibold cursor-pointer select-none transition-colors border"
                style={{
                  color: sel ? '#fff' : '#555',
                  backgroundColor: sel ? '#555' : '#fafafa',
                  borderColor: sel ? '#555' : '#ddd',
                }}
                data-leg={i}
                data-group={legGroups[i] ?? 0}
                onClick={() => toggleLeg(i)}
              >{i}</span>
            );
          })}
        </span>
        <span
          className="inline-flex items-center justify-center w-7 h-6 rounded text-xs cursor-pointer select-none transition-colors border"
          style={{
            color: '#555',
            backgroundColor: '#fafafa',
            borderColor: '#ddd',
          }}
          onClick={() => setEditorLegs(new Set())}
        ><X className="size-3" /></span>
      </div>
      <div className="flex gap-1 mb-1.5 flex-wrap">
        {valid.ok && (
          <>
            {[3,4,5,6].map(d => (
              <Button key={d}
                variant={valid.dof === d ? 'default' : 'outline'}
                size="sm"
                className="text-[11px]"
                onClick={() => {
                  const bot = botRef.current;
                  if (!bot) return;
                  const checked = getCheckedLegs();
                  history.push(bot.options);
                  bot.options.dof = d;
                  for (const i of checked) {
                    bot.options.leg_options[i].dof = d;
                  }
                  bot.apply_attributes(bot.options);
                  bumpBotVersion();
                }}
              >{d}D</Button>
            ))}
            <Button variant="outline" size="sm" className="text-[11px]"
              onClick={handleApplyToAll}
            ><CheckCheck data-icon="inline-start" />Apply to All</Button>
          </>
        )}
        <Button variant="outline" size="sm" className="text-[11px]"
          onClick={() => {
            const bot = botRef.current;
            if (!bot) return;
            const checked = getCheckedLegs();
            if (checked.length === 0) return;
            history.push(bot.options);
            bot.putdown_tips(checked);
            bot.save_body_home();
            bumpBotVersion();
          }}
        ><ArrowDownToLine data-icon="inline-start" />Put Tips Down</Button>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block bg-transparent rounded-sm"
          onMouseDown={valid.ok ? handleMouseDown : undefined}
          onMouseMove={valid.ok ? handleMouseMove : undefined}
          onMouseUp={valid.ok ? handleMouseUp : undefined}
          onMouseLeave={valid.ok ? handleMouseLeave : undefined}
          style={{ opacity: valid.ok ? 1 : 0.4, cursor: valid.ok ? undefined : 'not-allowed' }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        {valid.ok
          ? `Editing legs: [${getCheckedLegs().join(', ')}]  — DOF=${valid.dof}`
          : valid.reason
            ? `${valid.reason} — editor disabled`
            : 'Editor disabled'}
      </p>
    </div>
  );
}
