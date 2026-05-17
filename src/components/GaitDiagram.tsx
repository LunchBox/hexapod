import { useRef, useEffect } from 'react';

interface LegDot { x: number; z: number; }

export default function GaitDiagram({ groups, legLayout }: { groups: number[][] | null; legLayout: LegDot[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !groups || groups.length === 0 || !legLayout || legLayout.length === 0) return;

    const steps = groups.length;
    const n = legLayout.length;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of legLayout) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    const framePad = 2;
    const frameW = 28;
    const frameH = 36;
    const frameGap = 24;
    const labelGap = 4;
    const labelH = 8;

    const padX = 4;
    const padY = 2;
    const totalW = padX * 2 + steps * frameW + (steps - 1) * frameGap;
    const totalH = padY * 2 + frameH + labelGap + labelH;

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, totalW, totalH);

    const scale = Math.min(
      (frameW - framePad * 2) / rangeX,
      (frameH - framePad * 2) / rangeZ,
    );
    const cx = frameW / 2;
    const cz = frameH / 2;
    const dotR = 2.5;

    for (let s = 0; s < steps; s++) {
      const lifted = new Set(groups[s]);
      const fx = padX + s * (frameW + frameGap);
      for (let l = 0; l < n; l++) {
        const p = legLayout[l];
        const dx = fx + cx + (p.x - (minX + maxX) / 2) * scale;
        const dy = padY + cz + (p.z - (minZ + maxZ) / 2) * scale;
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = lifted.has(l) ? '#444' : '#ccc';
        ctx.fill();
      }
      ctx.fillStyle = '#666';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(s), fx + cx, padY + frameH + labelGap + labelH);
    }
  }, [groups, legLayout]);

  if (!groups || groups.length === 0 || !legLayout || legLayout.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', margin: '6px 0 0', imageRendering: 'pixelated' }}
    />
  );
}
