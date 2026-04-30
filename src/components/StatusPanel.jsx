import { useEffect, useRef, useState, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import appState from '../hexapod/appState';
import { add_class, remove_class, clearSelection } from '../hexapod/utils';

export default function StatusPanel() {
  const { botRef } = useHexapod();
  const containerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const playIdxRef = useRef(0);
  const playTimeoutRef = useRef(null);
  const intervalRef = useRef(null);

  // Override display_status to also update React state
  useEffect(() => {
    const origDisplayStatus = botRef.current?.display_status;
    if (!botRef.current) return;

    botRef.current.display_status = function (container) {
      if (!container) container = containerRef.current;
      if (!container) return;
      origDisplayStatus.call(this, container);
    };

    // Poll for new history rows and apply event listeners
    intervalRef.current = setInterval(() => {
      const container = containerRef.current;
      if (!container) return;
      const rows = container.querySelectorAll('.sv_row:not(.bound)');
      rows.forEach((row) => {
        row.classList.add('bound');
        row.addEventListener('dblclick', function () {
          appState.current_bot.apply_status(this.data_value);
          container.querySelectorAll('.sv_row.active').forEach((el) => remove_class(el, 'active'));
          add_class(this, 'active');
          clearSelection();
        });
      });
      container.scrollTop = container.scrollHeight;
    }, 500);

    return () => clearInterval(intervalRef.current);
  }, [botRef]);

  const playStatus = useCallback(() => {
    if (!playingRef.current) return;

    const container = containerRef.current;
    if (!container) return;
    const rows = container.querySelectorAll('.sv_row');
    if (rows.length === 0) return;

    const idx = playIdxRef.current % rows.length;
    const status = rows[idx].data_value;
    if (status) appState.current_bot.apply_status(status);

    playIdxRef.current = (idx + 1) % rows.length;

    const nextIdx = playIdxRef.current % rows.length;
    const nextStatus = rows[nextIdx]?.data_value;
    const interval = nextStatus
      ? appState.current_bot.get_min_interval(nextStatus.servo_values, status?.servo_values || [])
      : 500;

    playTimeoutRef.current = setTimeout(playStatus, interval);
  }, []);

  const handlePlay = useCallback(() => {
    if (playing) {
      playingRef.current = false;
      setPlaying(false);
      clearTimeout(playTimeoutRef.current);
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
      <div id="status_history" ref={containerRef} style={{ maxHeight: 800, overflowY: 'scroll' }}></div>
    </div>
  );
}
