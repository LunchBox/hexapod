import { useEffect, useRef, useCallback, useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { history } from '../hexapod/history';
import { LIMB_NAMES } from '../hexapod/defaults';
import './LegEditor.css';

interface Point { x: number; y: number }

const JOINT_R = 7, HIT_R = 16;
const BASE_COLORS = ['#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];
const JOINT_FILL = '#fff';

function deg(d: number) { return (d * 180) / Math.PI; }

function getSegNamesForLeg(opts: any, legIdx: number): string[] {
  const leg = opts.leg_options[legIdx];
  const dof = leg?.dof ?? opts.dof ?? 3;
  return LIMB_NAMES.slice(0, Math.min(6, Math.max(2, dof)));
}

function computeJointsForLeg(opts: any, legIdx: number): Point[] {
  const segNames = getSegNamesForLeg(opts, legIdx);
  const leg = opts.leg_options[legIdx];
  const pts: Point[] = [{ x: 0, y: 0 }];

  const coxaOpt = leg[segNames[0]] || {};
  const coxaLen = coxaOpt.length || (opts as any)[segNames[0] + '_length'] || 32;
  pts.push({ x: coxaLen, y: 0 });

  let cumAngle = 0;
  for (let i = 1; i < segNames.length; i++) {
    const segOpt = leg[segNames[i]] || {};
    const len = segOpt.length || (opts as any)[segNames[i] + '_length'] || 20;
    const initAngle = segOpt.init_angle ?? 0;
    cumAngle -= initAngle;
    const rad = (cumAngle * Math.PI) / 180;
    pts.push({
      x: pts[i].x + len * Math.cos(rad),
      y: pts[i].y + len * Math.sin(rad),
    });
  }
  return pts;
}

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

  // Sync editorLegs when leg count changes
  useEffect(() => {
    const bot = botRef.current;
    if (!bot) return;
    const count = bot.legs.length;
    setEditorLegs(prev => {
      const next = new Set<number>();
      for (let i = 0; i < count; i++) next.add(i);
      // Preserve previously unchecked legs that still exist
      for (const i of prev) { if (i < count) next.add(i); }
      return next;
    });
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

  const checkedLegsSameDof = useCallback((): { ok: boolean; dof: number; refLeg: number } => {
    const bot = botRef.current;
    if (!bot) return { ok: false, dof: 0, refLeg: -1 };
    const checked = getCheckedLegs();
    if (checked.length === 0) return { ok: false, dof: 0, refLeg: -1 };
    const refLeg = checked[0];
    const refDof = bot.options.leg_options[refLeg]?.dof ?? bot.options.dof ?? 3;
    for (const i of checked) {
      const legDof = bot.options.leg_options[i]?.dof ?? bot.options.dof ?? 3;
      if (legDof !== refDof) return { ok: false, dof: 0, refLeg: -1 };
    }
    return { ok: true, dof: refDof, refLeg };
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

    const valid = checkedLegsSameDof();
    const cw = sizeRef.current.w, ch = sizeRef.current.h;

    // If no valid reference leg, show disabled state
    if (!valid.ok) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#999';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Selected legs have different DOFs', cw / 2, ch / 2 - 8);
      ctx.fillText('— editor disabled —', cw / 2, ch / 2 + 12);
      ctx.textAlign = 'start';
      return;
    }

    const refLeg = valid.refLeg;
    const pts = computeJointsForLeg(opts, refLeg);
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
  }, [getOpts, checkedLegsSameDof]);

  const getJointAt = useCallback((cx: number, cy: number): number => {
    const opts = getOpts();
    if (!opts) return -1;
    const valid = checkedLegsSameDof();
    if (!valid.ok) return -1;
    const pts = computeJointsForLeg(opts, valid.refLeg);
    const view = computeView(pts, sizeRef.current.w, sizeRef.current.h);
    for (let i = 1; i < pts.length; i++) {
      const s = toScreen(pts[i], view);
      if ((cx - s.x) ** 2 + (cy - s.y) ** 2 <= HIT_R * HIT_R) return i;
    }
    return -1;
  }, [getOpts, checkedLegsSameDof]);

  // Size canvas then draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const bot = botRef.current;
    if (!canvas || !bot) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth || 400;
    const ch = Math.round(cw * 0.55);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    sizeRef.current = { w: cw, h: ch };

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

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
    const valid = checkedLegsSameDof();
    if (!valid.ok) return;

    // Push pre-drag state to undo history
    history.push(botRef.current.options);

    const pts = computeJointsForLeg(opts, valid.refLeg);
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
  }, [getOpts, getJointAt, checkedLegsSameDof]);

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

      const prevPts = computeJointsForLeg(d.opts, d.refLeg);
      const prevPt = prevPts[d.joint - 1];

      const dx = legPt.x - prevPt.x;
      const dy = legPt.y - prevPt.y;
      const newLen = Math.max(5, Math.sqrt(dx * dx + dy * dy));

      const checked = getCheckedLegs();
      const segNames = getSegNamesForLeg(opts, d.refLeg);

      if (d.joint === 1) {
        // First segment (coxa) — horizontal only
        const firstName = segNames[0];
        const newCoxaLen = Math.max(5, legPt.x);
        (opts as any)[firstName + '_length'] = newCoxaLen;
        for (const i of checked) {
          if (!opts.leg_options[i][firstName]) continue;
          opts.leg_options[i][firstName].length = newCoxaLen;
        }
      } else {
        // Non-first segment
        const absAngleDeg = deg(Math.atan2(dy, dx));
        const part = segNames[d.joint - 1];

        let sumPrev = 0;
        for (let k = 1; k < d.joint - 1; k++) {
          sumPrev += opts.leg_options[d.refLeg][segNames[k]].init_angle || 0;
        }
        const newInitAngle = -absAngleDeg - sumPrev;

        const lengthKey = part + '_length';
        (opts as any)[lengthKey] = newLen;
        for (const i of checked) {
          if (!opts.leg_options[i][part]) continue;
          opts.leg_options[i][part].length = newLen;
          opts.leg_options[i][part].init_angle = newInitAngle;
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

  const legCount = botRef.current?.legs?.length || 6;
  const valid = checkedLegsSameDof();

  return (
    <div className="leg-editor">
      <p className="leg-editor__title">Leg Editor — drag joints to adjust</p>
      <div style={{ marginBottom: 4 }}>
        {Array.from({ length: legCount }, (_, i) => (
          <label key={i} style={{ marginRight: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={editorLegs.has(i)}
              onChange={() => toggleLeg(i)}
              style={{ verticalAlign: 'middle' }}
            />
            {i}
          </label>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          className="leg-editor__canvas"
          onMouseDown={valid.ok ? handleMouseDown : undefined}
          onMouseMove={valid.ok ? handleMouseMove : undefined}
          onMouseUp={valid.ok ? handleMouseUp : undefined}
          onMouseLeave={valid.ok ? handleMouseLeave : undefined}
          style={{ opacity: valid.ok ? 1 : 0.4, cursor: valid.ok ? undefined : 'not-allowed' }}
        />
      </div>
      <p className="leg-editor__info">
        {valid.ok
          ? `Editing legs: [${getCheckedLegs().join(', ')}]  — DOF=${valid.dof}`
          : getCheckedLegs().length === 0
            ? 'No legs selected — editor disabled'
            : 'Selected legs have different DOFs — editor disabled'}
      </p>
    </div>
  );
}
