import { useState, useEffect } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  title?: string;
  displayValue?: string;
  onChange: (v: number) => boolean; // return false to revert slider
}

const SLIDER_H = 100;
const btnH: React.CSSProperties = {
  background: 'none', border: '1px solid #555', color: '#aaa',
  cursor: 'pointer', fontSize: 10, padding: '0 3px', lineHeight: 1,
  height: 16,
};
const col: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  height: SLIDER_H + 50,
};
const sl: React.CSSProperties = {
  writingMode: 'vertical-lr', direction: 'rtl',
  height: SLIDER_H, cursor: 'pointer',
};
const lab: React.CSSProperties = { fontSize: 10, color: '#888', height: 16, lineHeight: '16px' };
const val: React.CSSProperties = { fontSize: 9, color: '#666', height: 14, lineHeight: '14px' };

export default function SliderColumn({ value, min, max, step, label, title, displayValue, onChange }: Props) {
  const [cur, setCur] = useState(value);
  const [ver, setVer] = useState(0);

  // Sync from external value when not being dragged
  useEffect(() => { setCur(value); }, [value, ver]);

  const apply = (v: number) => {
    const clamped = Math.min(max, Math.max(min, v));
    setCur(clamped);
    if (!onChange(clamped)) {
      setCur(value); // revert
      setVer(v => v + 1); // force re-sync
    }
  };

  return (
    <div style={col}>
      <button style={btnH} onClick={() => apply(cur + (step || 1))}>▲</button>
      <input type="range" min={min} max={max} step={step || 1}
        value={cur}
        title={title || label}
        style={sl}
        onChange={(e) => apply(parseFloat((e.target as HTMLInputElement).value))}
      />
      <button style={btnH} onClick={() => apply(cur - (step || 1))}>▼</button>
      <span style={lab}>{label}</span>
      <span style={val}>{displayValue ?? String(cur)}</span>
    </div>
  );
}
