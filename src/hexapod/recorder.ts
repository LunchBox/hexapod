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

export type RecorderEntry = {
  status: any;
  formatted: string;
  timestamp: number;
};

type Listener = () => void;

const MIN_PLAY_INTERVAL_MS = 30;
const FALLBACK_PLAY_INTERVAL_MS = 500;

class Recorder {
  entries: RecorderEntry[] = [];
  recording: boolean = false;
  playing: boolean = false;
  playIdx: number = 0;
  loop: boolean = true;

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
  } = {
    entries: [],
    recording: false,
    playing: false,
    playIdx: 0,
    loop: true,
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

  push(status: any, formatted: string) {
    if (!this.recording) return;
    this.entries.push({ status, formatted, timestamp: performance.now() });
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

    // Branch on physics_mode. In servo_constraint we drive each segment
    // through the animator (Path A mesh + Path B body_mesh + per-leg
    // AnimatedOutput keyframes) so the bot actually shows smooth motion
    // limited by servo_speed. In `none` mode DirectOutput doesn't animate,
    // so we fall back to snap-then-wait at recorded timestamp gaps.
    if (bot.options?.physics_mode === 'servo_constraint') {
      this.play_segment_animated(bot, this.playIdx);
    } else {
      this.schedule_next(bot);
    }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    // Stop the animator if we were driving an animated segment.
    if (this.activeBot && this.activeBot.animator) {
      this.activeBot.animator.onBodyAnimComplete = null;
      this.activeBot.animator.stop();
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
      });
    }
    if (this.playing) this.stop_play();
    this.entries = next;
    this.playIdx = 0;
    this.notify();
    return true;
  }

  /** servo_constraint playback: drive each transition through the animator
   *  so the body actually slides and per-leg servos interpolate at
   *  servo_speed — same visual model as walking gait. Apply_status is
   *  called at segment end for exact restore (it correctly derives rotation
   *  from servo_value as of the latest fix, so no pre-IK desync). */
  private play_segment_animated(bot: any, fromIdx: number) {
    if (!this.playing) return;
    if (this.entries.length === 0) { this.stop_play(); return; }

    const a = this.entries[fromIdx];
    if (!a) { this.stop_play(); return; }

    let toIdx = fromIdx + 1;
    if (toIdx >= this.entries.length) {
      if (!this.loop) {
        this.playIdx = this.entries.length - 1;
        this.playing = false;
        this.activeBot = null;
        this.notify();
        return;
      }
      toIdx = 0;
    }
    const b = this.entries[toIdx];
    if (!b) { this.stop_play(); return; }

    // Segment duration: derive from current servo_speed × max servo delta.
    // The recorded gap reflects the recording's servo_speed; using current
    // values means "what would real servos take, NOW, to traverse this
    // delta" — which is the literal definition of "follow servo
    // constraint".
    const speed = Math.max(1, bot.servo_speed || 1);
    const aServos = a.status?.servo_values || [];
    const bServos = b.status?.servo_values || [];
    const maxDelta = computeMaxDelta(aServos, bServos);
    let duration = computeServoSpeedHoldTime(maxDelta, speed);
    if (!isFinite(duration) || duration < MIN_PLAY_INTERVAL_MS) duration = MIN_PLAY_INTERVAL_MS;

    // Fields the animator doesn't interpolate (mesh.y / rot.x,z /
    // center_offset). Snap at segment start so the visual is consistent
    // with the keyframes Path A is about to drive.
    if (typeof a.status.mesh?.position?.y === 'number') bot.mesh.position.y = a.status.mesh.position.y;
    if (typeof a.status.mesh?.rotation?.x === 'number') bot.mesh.rotation.x = a.status.mesh.rotation.x;
    if (typeof a.status.mesh?.rotation?.z === 'number') bot.mesh.rotation.z = a.status.mesh.rotation.z;
    if (typeof a.status.center_offset === 'number') bot.center_offset = a.status.center_offset;

    const meshKfs = [
      { pos: { x: a.status.mesh.position.x, z: a.status.mesh.position.z }, rotY: a.status.mesh.rotation.y },
      { pos: { x: b.status.mesh.position.x, z: b.status.mesh.position.z }, rotY: b.status.mesh.rotation.y },
    ];

    const bodyKfs = [
      {
        pos: { x: a.status.body_mesh.position.x, y: a.status.body_mesh.position.y, z: a.status.body_mesh.position.z },
        rot: { x: a.status.body_mesh.rotation.x, y: a.status.body_mesh.rotation.y, z: a.status.body_mesh.rotation.z },
      },
      {
        pos: { x: b.status.body_mesh.position.x, y: b.status.body_mesh.position.y, z: b.status.body_mesh.position.z },
        rot: { x: b.status.body_mesh.rotation.x, y: b.status.body_mesh.rotation.y, z: b.status.body_mesh.rotation.z },
      },
    ];

    const LIMB_NAMES_FULL = ['coxa', 'femur', 'tibia', 'tarsus', 'segment5', 'segment6'];
    const servoKfs: number[][][] = [];
    for (let i = 0; i < bot.legs.length; i++) {
      const leg = bot.legs[i];
      const names: string[] = leg._limbNames || LIMB_NAMES_FULL.slice(0, leg.joint_count);
      const legA = a.status.legs?.[i] || {};
      const legB = b.status.legs?.[i] || {};
      const from: number[] = [];
      const to: number[] = [];
      for (let j = 0; j < names.length; j++) {
        from.push(legA[names[j]]?.servo_value ?? leg.limbs[j].servo_value);
        to.push(legB[names[j]]?.servo_value ?? leg.limbs[j].servo_value);
      }
      servoKfs.push([from, to]);
    }

    bot._servo_anim_disabled = false;
    const startTime = performance.now();
    bot.animator.applyMeshKeyframes(bot, meshKfs, [duration], servoKfs);
    bot.animator.applyBodyKeyframes(bodyKfs, [duration], startTime);

    bot.animator.onBodyAnimComplete = () => {
      // Exact restore. apply_status now derives rotation from servo_value
      // (the fix that made playback correct in the first place), so this
      // does NOT snap legs back to pre-IK pose — the visual stays put.
      bot.apply_status(b.status);
      this.playIdx = toIdx;
      this.notify();
      if (!this.playing) return;
      this.play_segment_animated(bot, toIdx);
    };
  }

  private schedule_next(bot: any) {
    if (!this.playing) return;
    if (this.entries.length === 0) { this.stop_play(); return; }

    const idx = this.playIdx;
    const entry = this.entries[idx];
    if (entry) bot.apply_status(entry.status);

    // Advance index; loop or stop at end
    let nextIdx = idx + 1;
    if (nextIdx >= this.entries.length) {
      if (this.loop) {
        nextIdx = 0;
      } else {
        this.playIdx = this.entries.length - 1;
        this.playing = false;
        this.notify();
        return;
      }
    }
    this.playIdx = nextIdx;
    this.notify();

    // Inter-frame interval: use the actual wall-clock gap between the
    // recorded entries — that's the real timing the user saw during
    // capture, including servo_speed effects, mode-specific hold times,
    // and natural pauses between actions. Fall back to servo-speed-derived
    // timing only when timestamps are unavailable (loaded JSON without
    // them) or when we're wrapping from the last entry back to the first.
    const nextEntry = this.entries[nextIdx];
    let interval = FALLBACK_PLAY_INTERVAL_MS;
    const wrapping = nextIdx <= idx;
    if (nextEntry && entry && !wrapping
        && typeof entry.timestamp === 'number'
        && typeof nextEntry.timestamp === 'number'
        && nextEntry.timestamp > 0 && entry.timestamp > 0) {
      const gap = nextEntry.timestamp - entry.timestamp;
      if (gap > 0 && gap < MAX_PLAY_INTERVAL_MS) {
        interval = gap;
      }
    }
    // No recorded timing usable — derive from servo_speed and max delta.
    if (interval === FALLBACK_PLAY_INTERVAL_MS) {
      const a = entry?.status?.servo_values || [];
      const b = nextEntry?.status?.servo_values || [];
      if (a.length && b.length && bot.servo_speed) {
        const delta = computeMaxDelta(a, b);
        interval = computeServoSpeedHoldTime(delta, bot.servo_speed);
      }
    }
    if (interval < MIN_PLAY_INTERVAL_MS) interval = MIN_PLAY_INTERVAL_MS;

    this.playTimer = setTimeout(() => {
      this.playTimer = null;
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
    };
    this.listeners.forEach(l => l());
  }
}

export const recorder = new Recorder();
