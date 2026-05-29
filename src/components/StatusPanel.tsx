import { useSyncExternalStore, useRef, useEffect, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { recorder } from '../hexapod/recorder';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play, Pause, Square, SkipForward, SkipBack, Circle,
  Trash2, Download, Upload, Repeat, X, Clock, Gauge,
} from 'lucide-react';

function downloadJSON(text: string, filename: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function StatusPanel() {
  const { botRef, botVersion } = useHexapod();
  const snap = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
  const { entries, recording, playing, playIdx, loop, play_speed_mode } = snap;

  // Record + playback are supported only in `none` physics mode. Reading
  // botRef here is non-reactive, so we key on botVersion (bumped by the
  // physics-mode toggle) to re-evaluate after a mode change. servo_constraint
  // recording/playback was removed — it could not be replayed without drift.
  void botVersion;
  const servoMode = botRef.current?.options?.physics_mode === 'servo_constraint';

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll the playing row into view
  useEffect(() => {
    if (!listRef.current) return;
    const row = listRef.current.querySelector(`[data-idx="${playIdx}"]`);
    if (row) (row as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [playIdx, playing]);

  const handleRecord = useCallback(() => {
    if (servoMode) return; // recording disabled outside `none` mode
    if (recording) recorder.stop_record();
    else recorder.start();
  }, [recording, servoMode]);

  const handlePlay = useCallback(() => {
    const bot = botRef.current;
    if (!bot) return;
    if (playing) recorder.pause();
    else recorder.play(bot); // refuses in servo_constraint (backstop)
  }, [botRef, playing]);

  const handleStop = useCallback(() => recorder.stop_play(), []);

  const handleStep = useCallback((dir: 1 | -1) => {
    const bot = botRef.current;
    if (!bot) return;
    recorder.step(bot, dir);
  }, [botRef]);

  const handleRow = useCallback((idx: number) => {
    const bot = botRef.current;
    if (!bot) return;
    recorder.apply_at(bot, idx);
  }, [botRef]);

  const handleClear = useCallback(() => {
    if (entries.length === 0) return;
    if (confirm(`Clear ${entries.length} recorded ${entries.length === 1 ? 'entry' : 'entries'}?`)) {
      recorder.clear();
    }
  }, [entries.length]);

  const handleSave = useCallback(() => {
    if (entries.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJSON(recorder.save_json(), `hexapod-recording-${ts}.json`);
  }, [entries.length]);

  const handleLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChosen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (!recorder.load_json(text)) alert('Failed to load: not a valid recording file.');
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    recorder.remove(idx);
  }, []);

  const toggleLoop = useCallback(() => recorder.set_loop(!recorder.loop), []);

  const toggleSpeedMode = useCallback(
    () => recorder.set_play_speed_mode(
      recorder.play_speed_mode === 'recorded' ? 'current' : 'recorded',
    ),
    [],
  );

  // Format duration since first frame for entry display
  const t0 = entries[0]?.timestamp ?? 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Recording controls row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant={recording ? 'destructive' : 'outline'}
          size="sm"
          onClick={handleRecord}
          disabled={servoMode}
          title={servoMode
            ? "Recording is available only in 'none' physics mode"
            : recording ? 'Stop recording' : 'Start recording status snapshots'}
        >
          <Circle
            data-icon="inline-start"
            className={recording ? 'animate-pulse fill-current' : ''}
          />
          {recording ? 'Recording' : 'Record'}
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="outline" size="sm" onClick={handlePlay}
          disabled={entries.length === 0 || servoMode}
          title={servoMode
            ? "Playback is available only in 'none' physics mode"
            : playing ? 'Pause playback' : 'Play recorded sequence'}>
          {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {playing ? 'Pause' : 'Play'}
        </Button>

        <Button variant="outline" size="sm" onClick={handleStop}
          disabled={!playing && playIdx === 0}
          title="Stop and rewind">
          <Square data-icon="inline-start" />
        </Button>

        <Button variant="outline" size="sm" onClick={() => handleStep(-1)}
          disabled={entries.length === 0}
          title="Previous frame">
          <SkipBack data-icon="inline-start" />
        </Button>

        <Button variant="outline" size="sm" onClick={() => handleStep(1)}
          disabled={entries.length === 0}
          title="Next frame">
          <SkipForward data-icon="inline-start" />
        </Button>

        <Button
          variant={loop ? 'default' : 'outline'}
          size="sm"
          onClick={toggleLoop}
          title="Loop playback">
          <Repeat data-icon="inline-start" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleSpeedMode}
          title={
            play_speed_mode === 'recorded'
              ? 'Pacing: reproduce recorded timing (click for live servo_speed)'
              : 'Pacing: current servo_speed (click for recorded timing)'
          }>
          {play_speed_mode === 'recorded'
            ? <Clock data-icon="inline-start" />
            : <Gauge data-icon="inline-start" />}
          {play_speed_mode === 'recorded' ? 'Recorded' : 'Live'}
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="outline" size="sm" onClick={handleSave}
          disabled={entries.length === 0} title="Save recording as JSON">
          <Download data-icon="inline-start" />
        </Button>

        <Button variant="outline" size="sm" onClick={handleLoad} title="Load recording from JSON">
          <Upload data-icon="inline-start" />
        </Button>

        <Button variant="outline" size="sm" onClick={handleClear}
          disabled={entries.length === 0} title="Clear all entries">
          <Trash2 data-icon="inline-start" />
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFileChosen}
        />

        <Badge variant="secondary" className="ml-auto text-[10px]">
          {entries.length} {entries.length === 1 ? 'frame' : 'frames'}
          {playing && ` · @${playIdx + 1}`}
        </Badge>
      </div>

      {servoMode && (
        <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded px-2 py-1">
          Record &amp; playback are available only in <span className="font-medium">none</span> physics
          mode. Switch physics mode to <span className="font-medium">None</span> to use them.
        </div>
      )}

      {/* Entry list */}
      <div
        ref={listRef}
        className="border border-border rounded font-mono text-xs overflow-y-auto"
        style={{ maxHeight: 800 }}
      >
        {entries.length === 0 ? (
          <div className="p-3 text-muted-foreground text-center">
            {recording
              ? 'Recording… perform some movements to capture frames.'
              : 'No frames recorded. Click Record then move the bot.'}
          </div>
        ) : (
          entries.map((entry, i) => {
            const isCurrent = i === playIdx;
            const ms = entry.timestamp - t0;
            const tLabel = `+${(ms / 1000).toFixed(2)}s`;
            return (
              <div
                key={i}
                data-idx={i}
                onClick={() => handleRow(i)}
                className={
                  'group flex items-start gap-2 px-2 py-1 border-b border-border last:border-0 cursor-pointer ' +
                  (isCurrent
                    ? 'bg-primary/15 border-l-2 border-l-primary'
                    : 'hover:bg-accent')
                }
                title="Click to apply this frame"
              >
                <span className="text-muted-foreground tabular-nums shrink-0 w-10">
                  {String(i + 1).padStart(3, '0')}
                </span>
                <span className="text-muted-foreground tabular-nums shrink-0 w-16">
                  {tLabel}
                </span>
                <span className="flex-1 truncate">{entry.formatted}</span>
                <button
                  onClick={(e) => handleDelete(e, i)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                  title="Delete this frame"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
