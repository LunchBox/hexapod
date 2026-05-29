// Status recorder + playback engine.
//
// Lives outside React state so gait steps don't trigger context-wide
// re-renders. UI subscribes via useSyncExternalStore.
//
// Lifecycle:
//   recorder.start()        → bot.onStatusEntry calls recorder.push()
//   recorder.stop()         → pushes become no-ops
//   recorder.play(bot)      → walks through entries applying each, paced by
//                             servo_speed × max_servo_delta
//   recorder.pause()        → halts playback; resume picks up at current idx
//   recorder.stop_play()    → halts and rewinds to idx 0
//   recorder.step(bot, ±1)  → apply single neighbor frame
//   recorder.clear()        → wipe entries
//   recorder.save_json()    → returns JSON blob string
//   recorder.load_json(s)   → replaces entries (returns false on parse error)

import { computeMaxDelta, computeServoSpeedHoldTime } from './servo_utils';

// Max gap used when the recorded timestamp delta is missing or absurd
// (loaded JSON without timestamps, or first entry of a new wrap-around).
const MAX_PLAY_INTERVAL_MS = 5000;

export type PlaySpeedMode = 'recorded' | 'current';

export type RecorderEntry = {
  status: any;
  formatted: string;
  timestamp: number;
  // Mode + servo_speed in effect when this frame was captured. Used for
  // display and fidelity; snap-based playback (see play() / schedule_next)
  // is mode-independent and doesn't branch on the current UI physics_mode.
  physics_mode?: string;
  servo_speed?: number;
};

type Listener = () => void;

const MIN_PLAY_INTERVAL_MS = 30;

class Recorder {
  entries: RecorderEntry[] = [];
  recording: boolean = false;
  playing: boolean = false;
  playIdx: number = 0;
  loop: boolean = true;
  // Playback pacing:
  //   'recorded' — reproduce the original timing (per-segment timestamp gap).
  //   'current'  — recompute each segment from the bot's current servo_speed.
  play_speed_mode: PlaySpeedMode = 'recorded';

  private listeners = new Set<Listener>();
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  // Bot reference held during playback so pause() / non-loop end can null
  // the animator callback and stop in-flight interpolation.
  private activeBot: any = null;
  // Cached snapshot reference for useSyncExternalStore. Updated on every
  // notify() so React sees a new array identity and re-renders.
  private snapshot: {
    entries: RecorderEntry[];
    recording: boolean;
    playing: boolean;
    playIdx: number;
    loop: boolean;
    play_speed_mode: PlaySpeedMode;
  } = {
    entries: [],
    recording: false,
    playing: false,
    playIdx: 0,
    loop: true,
    play_speed_mode: 'recorded',
  };

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.snapshot;

  start() {
    if (this.recording) return;
    this.recording = true;
    this.notify();
  }

  stop_record() {
    if (!this.recording) return;
    this.recording = false;
    this.notify();
  }

  push(status: any, formatted: string, physics_mode?: string, servo_speed?: number) {
    if (!this.recording) return;
    // Recording is supported ONLY in `none` physics mode. servo_constraint
    // capture + playback was removed: a recording samples only sparse gait
    // endpoints, and there is no drift-free way to replay servo_constraint
    // motion from them. Drop any frame captured outside `none`.
    if (physics_mode && physics_mode !== 'none') return;
    this.entries.push({ status, formatted, timestamp: performance.now(), physics_mode, servo_speed });
    this.notify();
  }

  clear() {
    if (this.playing) this.stop_play();
    this.entries = [];
    this.playIdx = 0;
    this.notify();
  }

  remove(idx: number) {
    if (idx < 0 || idx >= this.entries.length) return;
    this.entries.splice(idx, 1);
    if (this.playIdx >= this.entries.length) this.playIdx = 0;
    this.notify();
  }

  set_idx(idx: number) {
    if (idx < 0) idx = 0;
    if (idx >= this.entries.length) idx = Math.max(0, this.entries.length - 1);
    this.playIdx = idx;
    this.notify();
  }

  apply_at(bot: any, idx: number) {
    if (!bot) return;
    const entry = this.entries[idx];
    if (!entry) return;
    bot.apply_status(entry.status);
    this.playIdx = idx;
    this.notify();
  }

  step(bot: any, dir: 1 | -1) {
    if (this.playing) this.pause();
    if (this.entries.length === 0) return;
    let next = this.playIdx + dir;
    if (next < 0) next = this.loop ? this.entries.length - 1 : 0;
    if (next >= this.entries.length) next = this.loop ? 0 : this.entries.length - 1;
    this.apply_at(bot, next);
  }

  play(bot: any) {
    if (this.playing) return;
    if (this.entries.length === 0) return;
    // Playback is supported ONLY in `none` physics mode (see push()). Refuse
    // to play while the bot is in servo_constraint — the UI also disables the
    // Play button there, this is the defensive backstop.
    if (bot?.options?.physics_mode && bot.options.physics_mode !== 'none') return;

    // Quiesce all other motion sources before playback. Otherwise the rAF
    // loop's body_target chase, walking step scheduler, and in-flight
    // per-leg animations all keep running and fight the playback.
    bot.body_target = null;
    bot._body_tracking_release_pending = false;
    if (bot.gait_controller && typeof bot.gait_controller.stop === 'function') {
      bot.gait_controller.stop();
    }
    if (bot.animator && typeof bot.animator.stop === 'function') {
      bot.animator.stop();
    }
    for (const leg of bot.legs) {
      if (leg._output && typeof leg._output.reset === 'function') {
        leg._output.reset();
      }
    }

    this.playing = true;
    this.activeBot = bot;
    this.notify();

    // Snap-based playback. Each recorded frame is a valid IK solution (locked
    // tips at exactly the right world positions), so applying it with
    // apply_status() reproduces the pose with ZERO drift. We deliberately do
    // NOT interpolate between frames: a recording samples only the endpoints
    // of each gait sub-step / a ~11Hz body-tracking tick, and linearly
    // blending mesh + body_mesh + servo values between two endpoints does not
    // preserve tip lock (the FK map is non-linear), so the whole bot visibly
    // slides. Snapping is mode-independent — apply_status works the same under
    // `none` and `servo_constraint`. The only thing playback controls is the
    // dwell time between snaps (see _segment_duration / play_speed_mode).
    this.schedule_next(bot);
  }

  /** Recorded wall-clock gap for the forward segment fromIdx → toIdx, or null
   *  if it can't be used (loop wrap, missing/absurd timestamps). The gap
   *  between consecutive entries ≈ the original step's duration: entry N is
   *  stamped when step N's keyframes are built (animation start) and entry
   *  N+1 when the next step starts (≈ step N's end). */
  private _recorded_gap(fromIdx: number, toIdx: number): number | null {
    if (toIdx <= fromIdx) return null; // wrap-around seam — no meaningful gap
    const a = this.entries[fromIdx];
    const b = this.entries[toIdx];
    if (!a || !b) return null;
    if (typeof a.timestamp !== 'number' || typeof b.timestamp !== 'number') return null;
    if (a.timestamp <= 0 || b.timestamp <= 0) return null;
    const gap = b.timestamp - a.timestamp;
    if (gap <= 0 || gap > MAX_PLAY_INTERVAL_MS) return null;
    return gap;
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    this.activeBot = null;
    this.notify();
  }

  stop_play() {
    this.pause();
    this.playIdx = 0;
    this.notify();
  }

  set_loop(v: boolean) {
    this.loop = v;
    this.notify();
  }

  set_play_speed_mode(v: PlaySpeedMode) {
    this.play_speed_mode = v;
    this.notify();
  }

  save_json(): string {
    // THREE.Euler stores its components as `_x` / `_y` / `_z` (the `.x` etc.
    // are getters). JSON.stringify on a raw Euler emits the underscored keys,
    // and after JSON.parse there are no getters — `apply_xyz` would read
    // undefined and produce NaN rotations. Flatten Euler instances to plain
    // {x, y, z} so loaded recordings restore correctly.
    return JSON.stringify(
      this.entries.map(e => ({
        status: e.status,
        formatted: e.formatted,
        timestamp: e.timestamp,
        physics_mode: e.physics_mode,
        servo_speed: e.servo_speed,
      })),
      (_key, value) => {
        if (value && value._isEuler) {
          return { x: value._x, y: value._y, z: value._z };
        }
        return value;
      },
      2
    );
  }

  load_json(text: string): boolean {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return false; }
    if (!Array.isArray(parsed)) return false;
    const next: RecorderEntry[] = [];
    for (const p of parsed) {
      if (!p || typeof p !== 'object' || !p.status) return false;
      next.push({
        status: p.status,
        formatted: typeof p.formatted === 'string' ? p.formatted : '',
        timestamp: typeof p.timestamp === 'number' ? p.timestamp : 0,
        physics_mode: typeof p.physics_mode === 'string' ? p.physics_mode : undefined,
        servo_speed: typeof p.servo_speed === 'number' ? p.servo_speed : undefined,
      });
    }
    if (this.playing) this.stop_play();
    this.entries = next;
    this.playIdx = 0;
    this.notify();
    return true;
  }

  /** Per-segment dwell time (ms) between two recorded frames:
   *  - 'recorded': the original wall-clock gap (falls back to servo-speed
   *    timing at the loop seam / when timestamps are unusable).
   *  - 'current': recomputed from the bot's live servo_speed × max servo
   *    delta, so scrubbing servo_speed rescales the whole playback. */
  private _segment_duration(bot: any, fromIdx: number, toIdx: number): number {
    const a = this.entries[fromIdx];
    const b = this.entries[toIdx];
    const speed = Math.max(1, bot.servo_speed || 1);
    const maxDelta = computeMaxDelta(a?.status?.servo_values || [], b?.status?.servo_values || []);
    const servoSpeedDuration = computeServoSpeedHoldTime(maxDelta, speed);

    let duration: number;
    if (this.play_speed_mode === 'recorded') {
      const gap = this._recorded_gap(fromIdx, toIdx);
      duration = gap != null ? gap : servoSpeedDuration;
    } else {
      duration = servoSpeedDuration;
    }
    if (!isFinite(duration) || duration < MIN_PLAY_INTERVAL_MS) duration = MIN_PLAY_INTERVAL_MS;
    return duration;
  }

  /** Snap-based playback step: apply the current frame exactly, then schedule
   *  the next after the segment dwell time. apply_status restores a recorded
   *  (and therefore valid, drift-free) pose — no interpolation between frames,
   *  so the bot never slides. Works identically under `none` and
   *  `servo_constraint`. */
  private schedule_next(bot: any) {
    if (!this.playing) return;
    if (this.entries.length === 0) { this.stop_play(); return; }

    const idx = this.playIdx;
    const entry = this.entries[idx];
    if (entry) {
      bot.apply_status(entry.status);
      this.notify();
    }

    let nextIdx = idx + 1;
    if (nextIdx >= this.entries.length) {
      if (!this.loop) {
        this.playing = false;
        this.activeBot = null;
        this.notify();
        return;
      }
      nextIdx = 0;
    }

    const interval = this._segment_duration(bot, idx, nextIdx);
    this.playTimer = setTimeout(() => {
      this.playTimer = null;
      this.playIdx = nextIdx;
      this.schedule_next(bot);
    }, interval);
  }

  private notify() {
    // Slice entries so the snapshot can't tear under React's concurrent
    // rendering or strict-mode double-checks if another push/splice runs
    // between getSnapshot() reads and listener firing.
    this.snapshot = {
      entries: this.entries.slice(),
      recording: this.recording,
      playing: this.playing,
      playIdx: this.playIdx,
      loop: this.loop,
      play_speed_mode: this.play_speed_mode,
    };
    this.listeners.forEach(l => l());
  }
}

export const recorder = new Recorder();
