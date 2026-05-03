import { useRef, useState, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';

export default function StatusPanel() {
  const { botRef } = useHexapod();
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const playIdxRef = useRef(0);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playStatus = useCallback(() => {
    if (!playingRef.current) return;

    const rows = document.querySelectorAll('#status_history .sv_row');
    if (rows.length === 0) return;

    const idx = playIdxRef.current % rows.length;
    const row = rows[idx] as any;
    const status = row.data_value;
    if (status) botRef.current?.apply_status(status);

    playIdxRef.current = (idx + 1) % rows.length;

    const nextIdx = playIdxRef.current % rows.length;
    const nextRow = rows[nextIdx] as any;
    const nextStatus = nextRow?.data_value;
    const interval = nextStatus
      ? botRef.current?.get_min_interval(nextStatus.servo_values, status?.servo_values || [])
      : 500;

    playTimeoutRef.current = setTimeout(playStatus, interval);
  }, [botRef]);

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
      <div className="mb-3">
        <Button variant="outline" size="sm" onClick={handlePlay}>
          {playing ? <><Square data-icon="inline-start" />Stop</> : <><Play data-icon="inline-start" />Play</>}
        </Button>
      </div>
      <div id="status_history" style={{ maxHeight: 800, overflowY: 'scroll' }} />
    </div>
  );
}
