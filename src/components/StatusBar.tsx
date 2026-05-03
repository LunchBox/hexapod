import { useHexapod } from '../context/HexapodContext';

export default function StatusBar() {
  const { botRef } = useHexapod();

  const bot = botRef.current;
  if (!bot) return null;

  const opt = bot.options;
  const gait = opt.gait || 'tripod';
  const mode = opt.move_mode || 'move';
  const physics = opt.physics_mode || 'none';
  const legCount = opt.leg_count || bot.legs.length;
  const dof = opt.dof || 3;

  return (
    <div className="flex items-center gap-0 text-xs text-muted-foreground select-none py-1">
      <span className="inline-flex items-baseline gap-1 px-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">gait</span>
        <span className="font-semibold text-foreground">{gait}</span>
      </span>
      <span className="h-3 border-l border-border" />
      <span className="inline-flex items-baseline gap-1 px-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">mode</span>
        <span className="font-semibold text-foreground">{mode}</span>
      </span>
      <span className="h-3 border-l border-border" />
      <span className="inline-flex items-baseline gap-1 px-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">physics</span>
        <span className="font-semibold text-foreground">{physics === 'servo_constraint' ? 'servo' : 'none'}</span>
      </span>
      <span className="h-3 border-l border-border" />
      <span className="inline-flex items-baseline gap-1 px-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">legs</span>
        <span className="font-semibold text-foreground">{legCount}×{dof}DOF</span>
      </span>

    </div>
  );
}
