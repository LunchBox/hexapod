import { useEffect, useRef, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { set_bot_options } from '../hexapod/hexapod';
import './LegEditor.css';

interface Point { x: number; y: number }

const W = 400, H = 300;
const JOINT_R = 7, HIT_R = 16;
const COLORS = ['#e74c3c', '#2ecc71', '#3498db', '#f39c12']; // coxa, femur, tibia, tarsus
const JOINT_FILL = '#fff';

function deg(d: number) { return (d * 180) / Math.PI; }

function computeJoints(opts: any): Point[] {
  const coxaLen = opts.coxa_length || 32;
  const femurLen = opts.femur_length || 45;
  const tibiaLen = opts.tibia_length || 62;
  const tarsusLen = opts.tarsus_length || 30;
  const leg = opts.leg_options[0];
  // 3D rotation.z = mirror * init_angle. For right-leg view: positive = CCW = upward.
  // Canvas Y is down, so negate to map 3D upward → canvas negative Y.
  const fAng = -((leg.femur.init_angle || 30) * Math.PI) / 180;
  const tAng = fAng - ((leg.tibia.init_angle || -105) * Math.PI) / 180;
  const aAng = tAng - ((leg.tarsus.init_angle || -60) * Math.PI) / 180;

  const pts: Point[] = [{ x: 0, y: 0 }];
  pts.push({ x: coxaLen, y: 0 });
  pts.push({ x: pts[1].x + femurLen * Math.cos(fAng), y: pts[1].y + femurLen * Math.sin(fAng) });
  pts.push({ x: pts[2].x + tibiaLen * Math.cos(tAng), y: pts[2].y + tibiaLen * Math.sin(tAng) });
  const dof = opts.dof || 3;
  if (dof >= 4) {
    pts.push({ x: pts[3].x + tarsusLen * Math.cos(aAng), y: pts[3].y + tarsusLen * Math.sin(aAng) });
  }
  return pts;
}

function computeView(pts: Point[]) {
  const pad = 40;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(0, ...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys);
  const legW = maxX - minX || 1, legH = maxY - minY || 1;
  const scale = Math.min((W - pad * 2) / legW, (H - pad * 2) / legH);
  const ox = pad - minX * scale + (W - pad * 2 - legW * scale) / 2;
  const oy = pad - minY * scale + (H - pad * 2 - legH * scale) / 2;
  return { scale, ox, oy };
}

function toScreen(p: Point, scale: number, ox: number, oy: number): Point {
  return { x: p.x * scale + ox, y: p.y * scale + oy };
}

function toLeg(sx: number, sy: number, scale: number, ox: number, oy: number): Point {
  return { x: (sx - ox) / scale, y: (sy - oy) / scale };
}

export default function LegEditor() {
  const { botRef, bumpBotVersion, botVersion } = useHexapod();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ joint: number; startLeg: Point; startScreen: Point; opts: any } | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef<number>(-1);

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
    } else {
      if (throttleRef.current) clearTimeout(throttleRef.current);
      throttleRef.current = setTimeout(() => {
        bot.apply_attributes(opts);
        throttleRef.current = null;
      }, 80);
    }
  }, [botRef, bumpBotVersion]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const opts = getOpts();
    if (!opts) return;

    const pts = computeJoints(opts);
    const { scale, ox, oy } = computeView(pts);
    const sp = pts.map(p => toScreen(p, scale, ox, oy));

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    for (let x = ox % (20 * scale); x < W; x += 20 * scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = oy % (20 * scale); y < H; y += 20 * scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Segments
    for (let i = 0; i < sp.length - 1; i++) {
      ctx.strokeStyle = COLORS[i];
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

    // Femur arc at joint 1 (coxa tip): from horizontal (0) to femur angle
    const fAngDeg = -(leg.femur.init_angle || 30); // canvas-space femur angle
    drawArc(1, 0, fAngDeg, COLORS[1]);
    // Tibia arc at joint 2 (femur tip): from femur direction
    const tAngDeg = -(leg.tibia.init_angle || -105); // canvas-space relative tibia angle (negate 3D)
    const tStartDeg = fAngDeg;
    const tEndDeg = fAngDeg + tAngDeg;
    drawArc(2, tStartDeg, tEndDeg, COLORS[2]);
    // Tarsus arc at joint 3 (tibia tip)
    if (dof >= 4) {
      const aAngDeg = -(leg.tarsus.init_angle || -60);
      drawArc(3, tEndDeg, tEndDeg + aAngDeg, COLORS[3]);
    }
  }, [getOpts]);

  const getJointAt = useCallback((cx: number, cy: number): number => {
    const opts = getOpts();
    if (!opts) return -1;
    const pts = computeJoints(opts);
    const { scale, ox, oy } = computeView(pts);
    for (let i = 1; i < pts.length; i++) {
      const s = toScreen(pts[i], scale, ox, oy);
      if ((cx - s.x) ** 2 + (cy - s.y) ** 2 <= HIT_R * HIT_R) return i;
    }
    return -1;
  }, [getOpts]);

  // Redraw when bot or options change externally
  useEffect(() => {
    const canvas = canvasRef.current;
    const bot = botRef.current;
    console.log('LegEditor effect: canvas=%s bot=%s botVersion=%d',
      !!canvas, !!bot, botVersion);
    if (!canvas || !bot) {
      // Bot may not be ready on initial mount — retry next frame
      const id = requestAnimationFrame(() => draw());
      return () => cancelAnimationFrame(id);
    }
    console.time('LegEditor draw');
    draw();
    console.timeEnd('LegEditor draw');
  }, [draw, botVersion]);

  // Canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

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
    const { scale, ox, oy } = computeView(pts);
    const legPt = toLeg(cx, cy, scale, ox, oy);

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
      const { scale, ox, oy } = computeView(computeJoints(d.opts));
      const legPt = toLeg(cx, cy, scale, ox, oy);

      // Previous joint position (from start state)
      const prevPts = computeJoints(d.opts);
      const { scale: s2, ox: o2, oy: y2 } = computeView(prevPts);
      const prevPt = prevPts[d.joint - 1];

      const dx = legPt.x - prevPt.x;
      const dy = legPt.y - prevPt.y;
      const newLen = Math.max(5, Math.sqrt(dx * dx + dy * dy));

      if (d.joint === 1) {
        // Coxa tip — horizontal only
        const newCoxaLen = Math.max(5, legPt.x);
        opts.coxa_length = newCoxaLen;
        for (let i = 0; i < opts.leg_options.length; i++) {
          opts.leg_options[i].coxa.length = newCoxaLen;
        }
      } else {
        // Femur/tibia/tarsus tip
        const absAngleDeg = deg(Math.atan2(dy, dx));
        const fAng = opts.leg_options[0].femur.init_angle || 30;

        const partNames = ['coxa', 'femur', 'tibia', 'tarsus'];
        const partIdx = d.joint - 1; // 1=femur, 2=tibia, 3=tarsus
        const part = partNames[partIdx];

        // Convert absolute canvas angle back to 3D init_angle (negated)
        let newInitAngle: number;
        if (d.joint === 2) {
          newInitAngle = -absAngleDeg; // femur: canvas down = positive init_angle (3D up)
        } else if (d.joint === 3) {
          const fAng3D = opts.leg_options[0].femur.init_angle || 30;
          newInitAngle = -absAngleDeg - fAng3D; // tibia relative to femur
        } else {
          const fAng3D = opts.leg_options[0].femur.init_angle || 30;
          const tAng3D = opts.leg_options[0].tibia.init_angle || -105;
          newInitAngle = -absAngleDeg - fAng3D - tAng3D; // tarsus relative to tibia
        }

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
      <canvas
        ref={canvasRef}
        className="leg-editor__canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      <p className="leg-editor__info">
        Drag joints to adjust lengths &amp; angles. Changes apply to all legs.
      </p>
    </div>
  );
}
