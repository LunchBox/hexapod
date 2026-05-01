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

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, padding: 0, lineHeight: '20px',
  textAlign: 'center', cursor: 'pointer',
  border: '1px solid #ccc', borderRadius: 2, background: '#fff',
  fontSize: 12, userSelect: 'none',
};

const col: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  height: 160,
};

const sl: React.CSSProperties = {
  writingMode: 'vertical-lr', direction: 'rtl',
  flex: 1, cursor: 'pointer', minHeight: 60, margin: '2px 0',
};

const lab: React.CSSProperties = {
  fontSize: 10, color: '#888', marginTop: 2,
};

const valStyle: React.CSSProperties = {
  fontSize: 10, fontFamily: 'monospace', color: '#444',
};

export default function SliderColumn({ value, min, max, step, label, title, displayValue, onChange }: Props) {
  const [cur, setCur] = useState(value);
  const [ver, setVer] = useState(0);

  useEffect(() => { setCur(value); }, [value, ver]);

  const apply = (v: number) => {
    const clamped = Math.min(max, Math.max(min, v));
    setCur(clamped);
    if (!onChange(clamped)) {
      setCur(value);
      setVer(v => v + 1);
    }
  };

  return (
    <div style={col}>
      <button style={btnStyle} title={title || label}
        onMouseDown={(e) => { e.preventDefault(); apply(cur + (step || 1)); }}>
        ▲
      </button>
      <input type="range" min={min} max={max} step={step || 1}
        value={cur}
        title={title || label}
        style={sl}
        onChange={(e) => apply(parseFloat((e.target as HTMLInputElement).value))}
      />
      <button style={btnStyle} title={title || label}
        onMouseDown={(e) => { e.preventDefault(); apply(cur - (step || 1)); }}>
        ▼
      </button>
      <span style={lab}>{label}</span>
      <span style={valStyle}>{displayValue ?? (Number.isInteger(cur) ? String(cur) : cur.toFixed(2))}</span>
    </div>
  );
}
