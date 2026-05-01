import React, { useState } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  displayValue?: string;
  title?: string;
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 0', fontSize: 12,
};

const labelStyle: React.CSSProperties = {
  width: 100, textAlign: 'right', fontWeight: 'bold',
  flexShrink: 0, marginRight: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, padding: 0, lineHeight: '20px',
  textAlign: 'center', cursor: 'pointer',
  border: '1px solid #ccc', borderRadius: 2, background: '#fff',
  fontSize: 12, flexShrink: 0, userSelect: 'none',
};

const sliderStyle: React.CSSProperties = {
  flex: 1, minWidth: 60, margin: '0 2px',
};

const valStyle: React.CSSProperties = {
  width: 52, textAlign: 'right', fontSize: 11,
  fontFamily: 'monospace', flexShrink: 0,
};

const plusStyle: React.CSSProperties = {
  ...btnStyle, width: 18, height: 18, fontSize: 14, lineHeight: '16px',
  background: '#fffbe6', borderColor: 'orange', color: '#e67e00',
};

export default function AttrSlider({ label, value, min, max, step, onChange, displayValue, title }: Props) {
  const [effectiveMax, setEffectiveMax] = useState(max);

  const atMax = value >= effectiveMax;

  return (
    <div style={rowStyle}>
      <span style={labelStyle} title={title || label}>{label}</span>
      <button style={btnStyle}
        onMouseDown={(e) => { e.preventDefault(); onChange(Math.max(min, value - step)); }}>
        ◀
      </button>
      <input type="range" style={sliderStyle}
        min={min} max={effectiveMax} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <button style={btnStyle}
        onMouseDown={(e) => { e.preventDefault(); onChange(Math.min(effectiveMax, value + step)); }}>
        ▶
      </button>
      {atMax && (
        <button style={plusStyle} title="Extend max +20%"
          onMouseDown={(e) => { e.preventDefault(); setEffectiveMax(m => Math.round(m * 1.2)); }}>
          +
        </button>
      )}
      <span style={valStyle}>{displayValue ?? (Number.isInteger(value) ? value : value.toFixed(2))}</span>
    </div>
  );
}
