import { useRef, useEffect } from 'react';
import { useHexapod } from '../context/HexapodContext';

export default function TimeChart() {
  const { timeIntervals } = useHexapod();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const maxNumber = 100;
    const scale = 0.5;
    const gap = Math.round((w - 60) / maxNumber);

    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Arial';

    // Reference grid lines
    ctx.beginPath();
    ctx.fillStyle = '#333';
    ctx.rect(0, 25, w, 0.5);
    ctx.fillText(String(25 / scale), 0, h - 25 + 4);
    ctx.rect(0, 50, w, 0.5);
    ctx.fillText(String(50 / scale), 0, h - 50 + 4);
    ctx.rect(0, 75, w, 0.5);
    ctx.fillText(String(75 / scale), 0, h - 75 + 4);
    ctx.fillStyle = '#ccc';
    ctx.fill();

    if (timeIntervals.length === 0) return;

    // Bars
    let total = 0;
    for (let i = 0; i < timeIntervals.length; i++) {
      const barH = timeIntervals[i] * scale;
      total += timeIntervals[i];
      ctx.beginPath();
      ctx.rect(i * gap + 30, h - barH, 0.5, barH);
      ctx.fillStyle = '#333';
      ctx.fill();
    }

    const avg = (total / timeIntervals.length).toFixed(2);
    ctx.fillText('average: ' + avg + 'ms', 2, 12);
  }, [timeIntervals]);

  return (
    <div>
      <h3 className="text-sm font-medium mb-1">Command Time Required (on sync mode)</h3>
      <canvas ref={canvasRef} className="border border-border" width="480" height="100" />
    </div>
  );
}
