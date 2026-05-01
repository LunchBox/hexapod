import { useEffect, useRef, useCallback, useState } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import { LIMB_NAMES } from '../hexapod/defaults';
import './LegEditor.css';

interface Point { x: number; y: number }

const W = 400, H = 300;
const JOINT_R = 7, HIT_R = 16;
const BASE_COLORS = ['#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];
const JOINT_FILL = '#fff';

function deg(d: number) { return (d * 180) / Math.PI; }

function getSegNames(opts: any): string[] {
  const dof = opts.dof || 3;
  return LIMB_NAMES.slice(0, Math.min(6, Math.max(2, dof)));
}

function computeJoints(opts: any): Point[] {
  const segNames = getSegNames(opts);
  const leg = opts.leg_options[0];
  const pts: Point[] = [{ x: 0, y: 0 }];

  // Coxa is always horizontal
  const coxaOpt = leg[segNames[0]] || {};
  const coxaLen = coxaOpt.length || (opts as any)[segNames[0] + '_length'] || 32;
  pts.push({ x: coxaLen, y: 0 });

  // Subsequent segments bend from horizontal (canvas: negate 3D init_angle)
  let cumAngle = 0;
  for (let i = 1; i < segNames.length; i++) {
    const segOpt = leg[segNames[i]] || {};
    const len = segOpt.length || (opts as any)[segNames[i] + '_length'] || 20;
    const initAngle = segOpt.init_angle ?? 0;
    cumAngle -= initAngle; // negate: 3D positive = upward, canvas positive = downward
    const rad = (cumAngle * Math.PI) / 180;
    pts.push({
      x: pts[i].x + len * Math.cos(rad),
      y: pts[i].y + len * Math.sin(rad),
    });
  }
  return pts;
}

const OX = 50, OY = H / 2; // body attachment at left-center

function toScreen(p: Point, scale: number): Point {
  return { x: p.x * scale + OX, y: p.y * scale + OY };
}

function toLeg(sx: number, sy: number, scale: number): Point {
  return { x: (sx - OX) / scale, y: (sy - OY) / scale };
}

export default function LegEditor() {
  const { botRef, bumpBotVersion, botVersion } = useHexapod();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ joint: number; startLeg: Point; startScreen: Point; opts: any } | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef<number>(-1);
  const [viewScale, setViewScale] = useState(2);

  const getOpts = useCallback(() => {
    const bot = botRef.current;
    if (!bot) return null;
    return bot.options;
  }, [botRef]);

  // Only rebuild 3D on mouseup — 2D canvas preview is sufficient during drag
  const applyOpts = useCallback((opts: any, immediate: boolean) => {
    const bot = botRef.current;
    if (!bot) return;
    if (immediate) {
      if (throttleRef.current) { clearTimeout(throttleRef.current); throttleRef.current = null; }
      bot.apply_attributes(opts);
      bumpBotVersion();
    }
    // During drag: only update options in-place, no 3D rebuild (avoids flicker)
  }, [botRef, bumpBotVersion]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const opts = getOpts();
    if (!opts) return;

    const pts = computeJoints(opts);
    const sp = pts.map(p => toScreen(p, viewScale));

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    const gridStep = 20 * viewScale;
    for (let x = OX % gridStep; x < W; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = OY % gridStep; y < H; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
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

    // Angle arcs for femur, tibia, tarsus
    const leg = opts.leg_options[0];
    const fAng = leg.femur.init_angle || 30;
    const tAng = leg.tibia.init_angle || -105;
    const aAng = leg.tarsus.init_angle || -60;
    const dof = opts.dof || 3;
    const arcR = 25;

    // Helper: draw angle arc at joint index j, from angle a1 to a2
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

    // Angle arcs: for each non-first segment, show angle from parent direction
    const segNames = getSegNames(opts);
    let cumCanvasDeg = 0; // cumulative canvas angle from horizontal
    for (let s = 1; s < segNames.length; s++) {
      const segOpt = leg[segNames[s]] || {};
      const init3D = segOpt.init_angle ?? 0;
      const relCanvasDeg = -init3D; // negate: 3D positive = upward
      drawArc(s, cumCanvasDeg, cumCanvasDeg + relCanvasDeg, BASE_COLORS[s % BASE_COLORS.length]);
      cumCanvasDeg += relCanvasDeg;
    }
  }, [getOpts]);

  const getJointAt = useCallback((cx: number, cy: number): number => {
    const opts = getOpts();
    if (!opts) return -1;
    const pts = computeJoints(opts);
    for (let i = 1; i < pts.length; i++) {
      const s = toScreen(pts[i], viewScale);
      if ((cx - s.x) ** 2 + (cy - s.y) ** 2 <= HIT_R * HIT_R) return i;
    }
    return -1;
  }, [getOpts]);

  // Size canvas then draw — must be ONE effect because sizing clears the buffer
  useEffect(() => {
    const canvas = canvasRef.current;
    const bot = botRef.current;
    if (!canvas || !bot) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    console.time('LegEditor draw');
    draw();
    console.timeEnd('LegEditor draw');
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
    const pts = computeJoints(opts);
    const legPt = toLeg(cx, cy, viewScale);

    dragRef.current = {
      joint: j,
      startLeg: { x: pts[j].x, y: pts[j].y },
      startScreen: { x: cx, y: cy },
      opts: JSON.parse(JSON.stringify(opts)),
    };

    canvas.classList.add('grabbing');
    e.preventDefault();
  }, [getOpts, getJointAt]);

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
      const legPt = toLeg(cx, cy, viewScale);

      // Previous joint position (from start state)
      const prevPts = computeJoints(d.opts);
      const prevPt = prevPts[d.joint - 1];

      const dx = legPt.x - prevPt.x;
      const dy = legPt.y - prevPt.y;
      const newLen = Math.max(5, Math.sqrt(dx * dx + dy * dy));

      const segNames = getSegNames(opts);
      if (d.joint === 1) {
        // First segment (coxa) — horizontal only
        const firstName = segNames[0];
        const newCoxaLen = Math.max(5, legPt.x);
        (opts as any)[firstName + '_length'] = newCoxaLen;
        for (let i = 0; i < opts.leg_options.length; i++) {
          opts.leg_options[i][firstName].length = newCoxaLen;
        }
      } else {
        // Non-first segment tip
        const absAngleDeg = deg(Math.atan2(dy, dx));
        const part = segNames[d.joint - 1]; // segment being dragged

        // Compute new init_angle: sum of 3D angles from segments 1..joint gives canvas angle
        // canvas_angle = -(sum of 3D init_angles for segs 1..joint)
        // So: new_init_angle[J] = -absAngleDeg - sum(init_angles[1..J-1])
        let sumPrev = 0;
        for (let k = 1; k < d.joint; k++) {
          sumPrev += opts.leg_options[0][segNames[k]].init_angle || 0;
        }
        const newInitAngle = -absAngleDeg - sumPrev;

        // Update shared length and per-leg length + init_angle
        const lengthKey = part + '_length';
        (opts as any)[lengthKey] = newLen;
        for (let i = 0; i < opts.leg_options.length; i++) {
          opts.leg_options[i][part].length = newLen;
          opts.leg_options[i][part].init_angle = newInitAngle;
        }
      }

      applyOpts(opts, false);
      draw();
    } else {
      // Hover
      const j = getJointAt(cx, cy);
      if (hoverRef.current !== j) {
        hoverRef.current = j;
        if (j >= 1) canvas.style.cursor = 'grab';
        else canvas.style.cursor = 'default';
        draw();
      }
    }
  }, [botRef, getJointAt, applyOpts, draw]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.classList.remove('grabbing');

    const d = dragRef.current;
    if (d) {
      const bot = botRef.current;
      if (bot) {
        set_bot_options(bot.options);
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
        set_bot_options(bot.options);
        applyOpts(bot.options, true);
      }
      dragRef.current = null;
    }
    draw();
  }, [botRef, applyOpts, draw]);

  return (
    <div className="leg-editor">
      <p className="leg-editor__title">Leg Editor — drag joints to adjust</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <canvas
          ref={canvasRef}
          className="leg-editor__canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 10, color: '#888' }}>Zoom</span>
          <input type="range" min="0.5" max="6" step="0.1" value={viewScale}
            title="Zoom"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', height: H - 20, cursor: 'pointer' }}
            onChange={(e) => setViewScale(parseFloat((e.target as HTMLInputElement).value))}
          />
          <span style={{ fontSize: 9, color: '#666' }}>{viewScale.toFixed(1)}x</span>
        </div>
      </div>
      <p className="leg-editor__info">
        Drag joints to adjust lengths &amp; angles. Changes apply to all legs.
      </p>
    </div>
  );
}
