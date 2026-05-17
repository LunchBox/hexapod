import { useRef, useState, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';

export default function StatusPanel() {
  const { botRef, statusEntries } = useHexapod();
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const playIdxRef = useRef(0);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const playStatus = useCallback(() => {
    if (!playingRef.current) return;
    if (statusEntries.length === 0) return;

    const idx = playIdxRef.current % statusEntries.length;
    const entry = statusEntries[idx];
    if (entry.status) botRef.current?.apply_status(entry.status);

    playIdxRef.current = (idx + 1) % statusEntries.length;

    const nextIdx = playIdxRef.current % statusEntries.length;
    const nextEntry = statusEntries[nextIdx];
    const interval = nextEntry
      ? botRef.current?.get_min_interval(nextEntry.status.servo_values, entry.status?.servo_values || [])
      : 500;

    playTimeoutRef.current = setTimeout(playStatus, interval);
  }, [botRef, statusEntries]);

  const handlePlay = useCallback(() => {
    if (playing) {
      playingRef.current = false;
      setPlaying(false);
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    } else {
      playingRef.current = true;
      setPlaying(true);
      playIdxRef.current = 0;
      playStatus();
    }
  }, [playing, playStatus]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handlePlay}>
          {playing ? <><Square data-icon="inline-start" />Stop</> : <><Play data-icon="inline-start" />Play</>}
        </Button>
        <Button variant="outline" size="sm"
          onClick={() => {
            const entry = statusEntries[statusEntries.length - 1];
            if (entry) botRef.current?.apply_status(entry.status);
          }}
        >Apply Latest</Button>
      </div>
      <div ref={listRef} style={{ maxHeight: 800, overflowY: 'scroll' }}
        className="border border-border rounded font-mono text-xs">
        {statusEntries.length === 0 ? (
          <div className="p-2 text-muted-foreground">No status entries yet. Start a gait to record.</div>
        ) : (
          statusEntries.map((entry, i) => (
            <div key={i}
              className="sv_row p-1 border-b border-border last:border-0 cursor-pointer hover:bg-accent"
              onDoubleClick={() => botRef.current?.apply_status(entry.status)}
            >{entry.formatted}</div>
          ))
        )}
      </div>
    </div>
  );
}
