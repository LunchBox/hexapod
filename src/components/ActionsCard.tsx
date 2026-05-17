import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleStop, Wand2, Footprints, Terminal } from 'lucide-react';

interface Props {
  onAction: (action: string, value?: string) => void;
}

const KEY_BINDINGS = [
  ['W', 'forward'], ['S', 'backward'], ['A', 'rotate L'], ['D', 'rotate R'],
  ['Z', 'move L'], ['C', 'move R'], ['R', 'raise'], ['F', 'fall'],
];

const KEY_CODES: Record<string, [string, string]> = {
  W: ['act_step', '87'], S: ['act_step', '83'], A: ['act_step', '65'],
  D: ['act_step', '68'], Z: ['act_step', '90'], C: ['act_step', '67'],
  R: ['act_motion2', '82'], F: ['act_motion2', '70'],
};

export default function ActionsCard({ onAction }: Props) {
  return (
    <Card className="mb-4">
      <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Actions</CardTitle></CardHeader>
      <CardContent className="py-1 px-3 space-y-3">
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" onClick={() => onAction('act_stop_motion')}><CircleStop data-icon="inline-start" />Stop</Button>
          <Button variant="outline" size="sm" onClick={() => onAction('act_action', 'act_standby')}><Wand2 data-icon="inline-start" />Standby</Button>
          <Button variant="outline" size="sm" onClick={() => onAction('act_action', 'act_putdown_tips')}><Footprints data-icon="inline-start" />Putdown Tips</Button>
          <Button variant="outline" size="sm" onClick={() => onAction('act_disable_console')}><Terminal data-icon="inline-start" />Disable Console</Button>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1.5">Keyboard</div>
          <div className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-[11px]">
            {KEY_BINDINGS.map(([key, label]) => (
              <span key={key}>
                <Button variant="outline" size="sm"
                  className="text-[10px] font-mono px-1 py-0.5 h-auto min-w-[20px]"
                  onClick={() => onAction(KEY_CODES[key][0], KEY_CODES[key][1])}
                >{key}</Button>{' '}{label}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
