import { useRef, useState, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';

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
      <div className="btns">
        <a href="#" className="control_btn" onClick={(e) => { e.preventDefault(); handlePlay(); }}>
          {playing ? 'Stop' : 'Play'}
        </a>
      </div>
      <div id="status_history" style={{ maxHeight: 800, overflowY: 'scroll' }} />
    </div>
  );
}
