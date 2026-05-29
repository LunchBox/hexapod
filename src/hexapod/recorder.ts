// Status recorder + playback engine.
//
// Lives outside React state so gait steps don't trigger context-wide
// re-renders. UI subscribes via useSyncExternalStore.
//
// Lifecycle:
//   recorder.start()        → bot.onStatusEntry calls recorder.push()
//   recorder.stop_record()  → pushes become no-ops
//   recorder.play(bot)      → walks through entries. In servo_constraint
//                             mode each segment animates at servo_speed
//                             via bot.animator (mesh + body_mesh) +
//                             AnimatedOutput (per-leg servos). In `none`
//                             mode each frame snaps and waits `interval`.
//   recorder.pause()        → halts at current entry
//   recorder.stop_play()    → halts and rewinds to idx 0
//   recorder.step(bot, ±1)  → apply single neighbor frame (snap)
//   recorder.clear()        → wipe entries
//   recorder.save_json()    → returns JSON blob string
//   recorder.load_json(s)   → replaces entries (returns false on parse error)

import { computeMaxDelta, computeServoSpeedHoldTime } from './servo_utils';

const LIMB_NAMES_FULL = ['coxa', 'femur', 'tibia', 'tarsus', 'segment5', 'segment6'];

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
  private activeBot: any = null;
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
    this.playing = true;
    this.activeBot = bot;
    // Snap to playIdx first so the segment animates from the right pose.
    bot.apply_status(this.entries[this.playIdx].status);
    if (bot.gait_controller) bot.gait_controller.expected_action = null;
    bot.body_target = null;
    this.notify();

    if (bot.options?.physics_mode === 'servo_constraint') {
      this.play_segment_animated(bot, this.playIdx);
    } else {
      this.schedule_next_snap(bot);
    }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
    // Stop the keyframe animation if one is in flight.
    if (this.activeBot) {
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
    return JSON.stringify(
      this.entries.map(e => ({
        status: e.status,
        formatted: e.formatted,
        timestamp: e.timestamp,
      })),
      null, 2
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

  // ── playback: servo_constraint (animated through bot.animator) ──

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

    const speed = Math.max(1, bot.servo_speed || 1);
    const aServos = a.status?.servo_values || [];
    const bServos = b.status?.servo_values || [];
    const maxDelta = computeMaxDelta(aServos, bServos);
    let duration = computeServoSpeedHoldTime(maxDelta, speed);
    if (!isFinite(duration) || duration < MIN_PLAY_INTERVAL_MS) duration = MIN_PLAY_INTERVAL_MS;

    // Snap fields the animator doesn't interpolate (mesh.y / rot.x,z / center_offset)
    // so the segment doesn't visually jump at its end.
    if (typeof a.status.mesh?.position?.y === 'number') bot.mesh.position.y = a.status.mesh.position.y;
    if (typeof a.status.mesh?.rotation?.x === 'number') bot.mesh.rotation.x = a.status.mesh.rotation.x;
    if (typeof a.status.mesh?.rotation?.z === 'number') bot.mesh.rotation.z = a.status.mesh.rotation.z;
    if (typeof a.status.center_offset === 'number') bot.center_offset = a.status.center_offset;

    // Mesh keyframes (Path A interpolates pos.x/z + rotation.y)
    const meshKfs = [
      { pos: { x: a.status.mesh.position.x, z: a.status.mesh.position.z }, rotY: a.status.mesh.rotation.y },
      { pos: { x: b.status.mesh.position.x, z: b.status.mesh.position.z }, rotY: b.status.mesh.rotation.y },
    ];

    // body_mesh keyframes (Path B interpolates full pos + rot)
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

    // Per-leg servo keyframes
    const servoKfs: number[][][] = [];
    for (let i = 0; i < bot.legs.length; i++) {
      const leg = bot.legs[i];
      const names: string[] = leg._limbNames || LIMB_NAMES_FULL.slice(0, leg.joint_count);
      const legA = a.status.legs?.[i] || {};
      const legB = b.status.legs?.[i] || {};
      const from: number[] = [];
      const to: number[] = [];
      for (let j = 0; j < names.length; j++) {
        const name = names[j];
        from.push(legA[name]?.servo_value ?? leg.limbs[j].servo_value);
        to.push(legB[name]?.servo_value ?? leg.limbs[j].servo_value);
      }
      servoKfs.push([from, to]);
    }

    // Enable animation pipeline (leg AnimatedOutput.setTargets is gated by this
    // flag in some code paths, but applyMeshKeyframes itself loads keyframes
    // unconditionally — clearing it matches the walking-gait setup).
    bot._servo_anim_disabled = false;

    // Hand off to the animator. Both paths run concurrently with matching
    // duration; onBodyAnimComplete fires when Path B finishes — Path A finishes
    // at the same time since duration is identical.
    const startTime = performance.now();
    bot.animator.applyMeshKeyframes(bot, meshKfs, [duration], servoKfs);
    bot.animator.applyBodyKeyframes(bodyKfs, [duration], startTime);

    bot.animator.onBodyAnimComplete = () => {
      // Snap to the exact target state in case interpolation left any drift,
      // so the next segment starts from a known-clean pose.
      bot.apply_status(b.status);
      this.playIdx = toIdx;
      this.notify();
      if (!this.playing) return;
      // Recursive call's own top guard handles non-looping end.
      this.play_segment_animated(bot, toIdx);
    };
  }

  // ── playback: none mode (snap-per-frame at servo_speed-paced interval) ──

  private schedule_next_snap(bot: any) {
    if (!this.playing) return;
    if (this.entries.length === 0) { this.stop_play(); return; }

    const idx = this.playIdx;
    const entry = this.entries[idx];
    if (entry) bot.apply_status(entry.status);

    let nextIdx = idx + 1;
    if (nextIdx >= this.entries.length) {
      if (this.loop) {
        nextIdx = 0;
      } else {
        this.playIdx = this.entries.length - 1;
        this.playing = false;
        this.activeBot = null;
        this.notify();
        return;
      }
    }
    this.playIdx = nextIdx;
    this.notify();

    const nextEntry = this.entries[nextIdx];
    let interval = FALLBACK_PLAY_INTERVAL_MS;
    if (nextEntry && entry) {
      const a = entry.status?.servo_values || [];
      const b = nextEntry.status?.servo_values || [];
      if (a.length && b.length && bot.servo_speed) {
        const delta = computeMaxDelta(a, b);
        interval = computeServoSpeedHoldTime(delta, bot.servo_speed);
      }
    }
    if (interval < MIN_PLAY_INTERVAL_MS) interval = MIN_PLAY_INTERVAL_MS;

    this.playTimer = setTimeout(() => {
      this.playTimer = null;
      this.schedule_next_snap(bot);
    }, interval);
  }

  private notify() {
    this.snapshot = {
      entries: this.entries,
      recording: this.recording,
      playing: this.playing,
      playIdx: this.playIdx,
      loop: this.loop,
    };
    this.listeners.forEach(l => l());
  }
}

export const recorder = new Recorder();
