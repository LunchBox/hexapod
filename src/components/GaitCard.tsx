import { useHexapod } from '../context/HexapodContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import GaitDiagram from './GaitDiagram';

interface GaitGroup {
  prefix: string;
  label: string;
  gaits: { value: string; label: string }[];
}

interface Props {
  gaitGroups: GaitGroup[];
  activePrefix: string;
  activeGroup: GaitGroup | undefined;
  gait: string;
  onSwitchK: (prefix: string) => void;
  onAction: (action: string, value?: string) => void;
}

export default function GaitCard({ gaitGroups, activePrefix, activeGroup, gait, onSwitchK, onAction }: Props) {
  const { botRef } = useHexapod();

  return (
    <Card className="mb-4">
      <CardHeader className="py-2 px-3"><CardTitle className="text-xs">Gaits</CardTitle></CardHeader>
      <CardContent className="py-1 px-3 space-y-3">
        <div>
          <div className="flex flex-wrap gap-0.5 mb-1">
            {gaitGroups.map(g => (
              <Button key={g.prefix}
                variant={activePrefix === g.prefix ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSwitchK(g.prefix)}
              >{g.label}</Button>
            ))}
          </div>
          {activeGroup && (
            <div className="flex flex-wrap gap-0.5 max-h-[180px] overflow-y-auto mt-1">
              {activeGroup.gaits.map(item => (
                <Button key={item.value}
                  variant={gait === item.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onAction('gait_switch', item.value)}
                >{item.label}</Button>
              ))}
            </div>
          )}
        </div>

        <GaitDiagram
          groups={botRef.current?.gait_controller?.gaits[gait] ?? null}
          legLayout={botRef.current?.leg_layout?.map((l: any) => ({ x: l.x, z: l.z })) ?? null}
        />
      </CardContent>
    </Card>
  );
}
