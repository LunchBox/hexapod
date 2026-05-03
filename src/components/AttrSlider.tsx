import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

export default function AttrSlider({ label, value, min, max, step, onChange, displayValue, title }: Props) {
  const [effectiveMax, setEffectiveMax] = useState(max);
  const atMax = value >= effectiveMax;

  return (
    <div className="flex items-center gap-1 py-[3px] text-xs">
      <span className="w-[100px] text-right font-semibold shrink-0 mr-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
        title={title || label}>{label}</span>
      <Button variant="outline" size="sm"
        className="w-[22px] h-[22px] p-0 shrink-0"
        onMouseDown={(e) => { e.preventDefault(); onChange(Math.max(min, value - step)); }}
      ><ChevronLeft className="size-3.5" /></Button>
      <input type="range"
        className="flex-1 min-w-[60px] mx-0.5 h-1"
        min={min} max={effectiveMax} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <Button variant="outline" size="sm"
        className="w-[22px] h-[22px] p-0 shrink-0"
        onMouseDown={(e) => { e.preventDefault(); onChange(Math.min(effectiveMax, value + step)); }}
      ><ChevronRight className="size-3.5" /></Button>
      {atMax && (
        <Button variant="outline" size="sm"
          className="w-[18px] h-[18px] p-0 text-sm shrink-0 bg-amber-50 border-orange-400 text-orange-600 hover:bg-amber-100"
          title="Extend max +20%"
          onMouseDown={(e) => { e.preventDefault(); setEffectiveMax(m => Math.round(m * 1.2)); }}
        >+</Button>
      )}
      <span className="w-[52px] text-right text-[11px] font-mono shrink-0">
        {displayValue ?? (Number.isInteger(value) ? value : value.toFixed(2))}
      </span>
    </div>
  );
}
