import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  title?: string;
  displayValue?: string;
  onChange: (v: number) => boolean;
  springBack?: boolean;
  homeValue?: number;
  horizontal?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function SliderColumn({ value, min, max, step, label, title, displayValue, onChange, springBack, homeValue, horizontal, onDragStart, onDragEnd }: Props) {
  const home = homeValue ?? 0;
  const [cur, setCur] = useState(springBack ? home : value);
  const [ver, setVer] = useState(0);
  const dragging = useRef(false);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;

  useEffect(() => {
    if (!springBack && !dragging.current) setCur(value);
  }, [value, ver, springBack]);

  const lastV = useRef(home);
  useEffect(() => {
    if (!springBack) return;
    let running = false;
    const tick = () => {
      const v = pendingRef.current;
      if (v !== null) {
        pendingRef.current = null;
        const delta = v - lastV.current;
        lastV.current = v;
        if (Math.abs(delta) > 0.001) {
          if (!onChangeRef.current(delta)) {
            setCur(home);
            setVer(x => x + 1);
            lastV.current = home;
          }
        }
      }
      if (dragging.current || pendingRef.current !== null) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };
    const onDown = () => {
      if (!running) { running = true; rafRef.current = requestAnimationFrame(tick); }
    };
    window.addEventListener('pointerdown', onDown);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('pointerdown', onDown); };
  }, [springBack, home]);

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

  useEffect(() => {
    if (!springBack) return;
    const up = () => {
      dragging.current = false;
      pendingRef.current = null;
      setCur(home);
      lastV.current = home;
      onDragEndRef.current?.();
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [springBack, home]);

  const onPointerDown = () => {
    if (!springBack) return;
    dragging.current = true;
    lastV.current = home;
    pendingRef.current = null;
    onDragStartRef.current?.();
  };

  if (horizontal) {
    return (
      <div className="flex items-center gap-1 py-[3px] text-xs">
        <span className="w-[100px] text-right font-semibold shrink-0 mr-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs"
          title={title || label}>{label}</span>
        <Button variant="outline" size="sm" className="w-[22px] h-[22px] p-0 shrink-0"
          onMouseDown={(e) => { e.preventDefault();
            if (springBack) { onChange(-(step || 1)); }
            else apply(cur - (step || 1));
          }}><ChevronLeft className="size-3.5" /></Button>
        <input type="range" min={min} max={max} step={step || 1}
          value={cur} title={title || label}
          className="flex-1 min-w-[60px] mx-0.5 h-1"
          onPointerDown={onPointerDown}
          onChange={onInput}
        />
        <Button variant="outline" size="sm" className="w-[22px] h-[22px] p-0 shrink-0"
          onMouseDown={(e) => { e.preventDefault();
            if (springBack) { onChange(step || 1); }
            else apply(cur + (step || 1));
          }}><ChevronRight className="size-3.5" /></Button>
        <span className="w-[52px] text-right text-[11px] font-mono shrink-0">
          {displayValue ?? (Number.isInteger(cur) ? String(cur) : cur.toFixed(2))}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center h-[160px]">
      <Button variant="outline" size="sm" className="w-[22px] h-[22px] p-0 shrink-0" title={title || label}
        onMouseDown={(e) => { e.preventDefault();
          if (springBack) { onChange(step || 1); }
          else apply(cur + (step || 1));
        }}><ChevronUp className="size-3.5" /></Button>
      <input type="range" min={min} max={max} step={step || 1}
        value={cur} title={title || label}
        className="flex-1 cursor-pointer min-h-[60px] my-0.5"
        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        onPointerDown={onPointerDown}
        onChange={onInput}
      />
      <Button variant="outline" size="sm" className="w-[22px] h-[22px] p-0 shrink-0" title={title || label}
        onMouseDown={(e) => { e.preventDefault();
          if (springBack) { onChange(-(step || 1)); }
          else apply(cur - (step || 1));
        }}><ChevronDown className="size-3.5" /></Button>
      <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
      <span className="text-[10px] font-mono text-foreground">
        {displayValue ?? (Number.isInteger(cur) ? String(cur) : cur.toFixed(2))}
      </span>
    </div>
  );
}
