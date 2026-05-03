import { useEffect, useRef } from 'react';

interface Props {
  width: number;
  length: number;
  shape: 'rectangle' | 'polygon';
  legCount: number;
  legLayout?: { x: number; z: number }[];
}

export default function BodyPreview({ width: bw, length: bl, shape, legCount, legLayout }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;

    const draw = () => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const dpr = window.devicePixelRatio || 1;
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width, H = rect.height;
      const cx = W / 2, cy = H / 2;
      const pad = 24;
      const scale = Math.min((W - pad * 2) / bl, (H - pad * 2) / bw);

      ctx.clearRect(0, 0, W, H);

      // Body
      ctx.fillStyle = '#e8e8e8';
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      if (shape === 'rectangle') {
        const rw = bl * scale, rh = bw * scale;
        ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh);
        ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, (bw / 2) * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Leg dots
      if (legLayout) {
        for (const pt of legLayout) {
          ctx.beginPath();
          ctx.arc(cx + pt.z * scale, cy - pt.x * scale, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#c0392b';
          ctx.fill();
        }
      }

      // Labels
      ctx.fillStyle = '#999';
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(pad - 14, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`W ${bw}`, 0, 0);
      ctx.restore();
      ctx.fillText(`L ${bl}`, cx, H - 5);
      ctx.fillStyle = '#666';
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.fillText(`${legCount} legs`, cx, 14);
    };

    draw();

    // Re-draw on resize (handles accordion open)
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [bw, bl, shape, legCount, legLayout]);

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%', height: 110,
        border: '1px solid #ddd', borderRadius: 4,
        background: '#fafafa', display: 'block',
      }}
    />
  );
}
