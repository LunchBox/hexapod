import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const drawTypes = [
  { value: 'mesh', label: 'Mesh' },
  { value: 'bone', label: 'Bone' },
  { value: 'points', label: 'Points' },
];

interface Props {
  physicsMode: string;
  drawType: string;
  microSteps: number;
  onPhysicsMode: (mode: 'none' | 'servo_constraint') => void;
  onMicroSteps: (v: number) => void;
  onAction: (action: string, value?: string) => void;
}

export default function PhysicsCard({ physicsMode, drawType, microSteps, onPhysicsMode, onMicroSteps, onAction }: Props) {
  return (
    <Card className="mb-4">
      <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Physics &amp; Render</CardTitle></CardHeader>
      <CardContent className="py-1 px-3 space-y-3">
        <div>
          <div className="text-[11px] text-muted-foreground mb-1.5">Physics</div>
          <div className="flex flex-wrap gap-0.5">
            <Button variant={physicsMode === 'none' ? 'default' : 'outline'} size="sm" onClick={() => onPhysicsMode('none')}>None</Button>
            <Button variant={physicsMode === 'servo_constraint' ? 'default' : 'outline'} size="sm" onClick={() => onPhysicsMode('servo_constraint')}>Servo Constraint</Button>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span>Micro Steps:</span>
            <Slider value={[microSteps]} min={1} max={20} step={1}
              className="w-20"
              onValueChange={(v) => onMicroSteps(Array.isArray(v) ? v[0] : v)} />
            <span className="font-mono w-5">{microSteps}</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1.5">Draw Type</div>
          <div className="flex flex-wrap gap-0.5">
            {drawTypes.map(d => (
              <Button key={d.value}
                variant={drawType === d.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => onAction('act_draw_type_switch', d.value)}
              >{d.label}</Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
