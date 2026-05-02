import { useEffect, useRef, useCallback, useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { getSegNamesForLeg, computeJointPositions, applyJointMove } from '../hexapod/hexapod';
import { history } from '../hexapod/history';
import './LegEditor.css';

interface Point { x: number; y: number }

const JOINT_R = 7, HIT_R = 16;
const BASE_COLORS = ['#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];
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
    // Always use geometry-based positions — LegEditor edits segment lengths
    // and init_angles, not runtime servo positions affected by IK.
    // During drag, use current opts (being mutated by handleMouseMove).
    const pts = computeJointPositions(opts, refLeg);
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
    const pts = computeJointPositions(opts, valid.refLeg);
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
    const valid = checkedLegsSameDof();
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
