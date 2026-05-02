import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  title?: string;
  displayValue?: string;
  onChange: (v: number) => boolean;
  springBack?: boolean;   // snap back to homeValue on mouseup
  homeValue?: number;      // center position when springBack=true (default 0)
  horizontal?: boolean;    // horizontal layout (no ▲/▼ buttons)
  onDragStart?: () => void; // called on pointerdown (springBack mode only)
  onDragEnd?: () => void;  // called on pointerup (springBack mode only)
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

export default function SliderColumn({ value, min, max, step, label, title, displayValue, onChange, springBack, homeValue, horizontal, onDragStart, onDragEnd }: Props) {
  const home = homeValue ?? 0;
  const [cur, setCur] = useState(springBack ? home : value);
  const [ver, setVer] = useState(0);
  const dragging = useRef(false);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!springBack && !dragging.current) setCur(value);
  }, [value, ver, springBack]);

  // rAF loop: apply delta from last value once per frame (springBack only)
  const lastV = useRef(home);
  useEffect(() => {
    if (!springBack) return;
    const tick = () => {
      const v = pendingRef.current;
      if (v !== null) {
        pendingRef.current = null;
        const delta = v - lastV.current;
        lastV.current = v;
        if (Math.abs(delta) > 0.001) {
          if (!onChange(delta)) {
            setCur(home);
            setVer(x => x + 1);
            lastV.current = home;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [springBack, onChange, home]);

  const apply = useCallback((v: number) => {
    const clamped = Math.min(max, Math.max(min, v));
    setCur(clamped);
    if (!onChange(clamped)) {
      setCur(value);
      setVer(x => x + 1);
    }
  }, [onChange, value, min, max]);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    const clamped = Math.min(max, Math.max(min, v));
    setCur(clamped);
    if (springBack) {
      pendingRef.current = clamped;
    } else {
      if (!onChange(clamped)) {
        setCur(value);
        setVer(x => x + 1);
      }
    }
  };

  // Global pointerup: snap back to home, reset tracking, flush pending
  useEffect(() => {
    if (!springBack) return;
    const up = () => {
      dragging.current = false;
      pendingRef.current = null;
      setCur(home);
      lastV.current = home;
      onDragEnd?.();
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [springBack, home, onDragEnd]);

  const onPointerDown = () => {
    if (!springBack) return;
    dragging.current = true;
    lastV.current = home;
    pendingRef.current = null;
    onDragStart?.();
  };

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '3px 0', fontSize: 12,
  };

  const hLabel: React.CSSProperties = {
    width: 100, textAlign: 'right', fontWeight: 'bold',
    flexShrink: 0, marginRight: 2, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12,
  };

  const hSl: React.CSSProperties = {
    flex: 1, minWidth: 60, margin: '0 2px',
  };

  const hVal: React.CSSProperties = {
    width: 52, textAlign: 'right', fontSize: 11,
    fontFamily: 'monospace', flexShrink: 0,
  };

  if (horizontal) {
    return (
      <div style={row}>
        <span style={hLabel} title={title || label}>{label}</span>
        <button style={btnStyle}
          onMouseDown={(e) => { e.preventDefault();
            if (springBack) { const v = Math.min(max, Math.max(min, home - (step || 1))); onChange(v); }
            else apply(cur - (step || 1));
          }}>◀</button>
        <input type="range" min={min} max={max} step={step || 1}
          value={cur}
          title={title || label}
          style={hSl}
          onPointerDown={onPointerDown}
          onChange={onInput}
        />
        <button style={btnStyle}
          onMouseDown={(e) => { e.preventDefault();
            if (springBack) { const v = Math.min(max, Math.max(min, home + (step || 1))); onChange(v); }
            else apply(cur + (step || 1));
          }}>▶</button>
        <span style={hVal}>{displayValue ?? (Number.isInteger(cur) ? String(cur) : cur.toFixed(2))}</span>
      </div>
    );
  }

  return (
    <div style={col}>
      <button style={btnStyle} title={title || label}
        onMouseDown={(e) => { e.preventDefault();
          if (springBack) { const v = Math.min(max, Math.max(min, home + (step || 1))); onChange(v); }
          else apply(cur + (step || 1));
        }}>
        ▲
      </button>
      <input type="range" min={min} max={max} step={step || 1}
        value={cur}
        title={title || label}
        style={sl}
        onPointerDown={onPointerDown}
        onChange={onInput}
      />
      <button style={btnStyle} title={title || label}
        onMouseDown={(e) => { e.preventDefault();
          if (springBack) { const v = Math.min(max, Math.max(min, home - (step || 1))); onChange(v); }
          else apply(cur - (step || 1));
        }}>
        ▼
      </button>
      <span style={lab}>{label}</span>
      <span style={valStyle}>{displayValue ?? (Number.isInteger(cur) ? String(cur) : cur.toFixed(2))}</span>
    </div>
  );
}
