import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const actionTypes = [
  { value: 'power', label: 'power' },
  { value: 'efficient', label: 'efficient' },
  { value: 'body_first', label: 'body first' },
  { value: 'fast', label: 'fast' },
];

const targetModes = [
  { value: 'translate', label: 'translate' },
  { value: 'target', label: 'target' },
];

interface Props {
  actionType: string;
  targetMode: string;
  onAction: (action: string, value?: string) => void;
}

export default function StepCard({ actionType, targetMode, onAction }: Props) {
  return (
    <Card className="mb-4">
      <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Step</CardTitle></CardHeader>
      <CardContent className="py-1 px-3 space-y-3">
        <div>
          <div className="text-[11px] text-muted-foreground mb-1.5">Action Type</div>
          <div className="flex flex-wrap gap-0.5">
            {actionTypes.map(a => (
              <Button key={a.value}
                variant={actionType === a.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => onAction('action_switch', a.value)}
              >{a.value === 'fast' ? <>{a.label}<sub className="text-[9px]">beta</sub></> : a.label}</Button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1.5">Target</div>
          <div className="flex flex-wrap gap-0.5">
            {targetModes.map(t => (
              <Button key={t.value}
                variant={targetMode === t.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => onAction('target_mode_switch', t.value)}
              >{t.label}</Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
