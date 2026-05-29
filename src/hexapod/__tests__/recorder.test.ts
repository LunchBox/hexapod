import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recorder } from '../recorder';

// The recorder is a module-level singleton. Reset its observable state
// between tests so they don't leak into each other.
function resetRecorder() {
  recorder.stop_play();
  recorder.clear();
  recorder.recording = false;
  recorder.loop = true;
  recorder.play_speed_mode = 'recorded';
}

// ── Minimal status snapshot ────────────────────────────────────────────────
// Only the fields apply_status / get_status consumers actually read.
function makeStatus(servoValues: number[], opts: Partial<{ rotY: number; bx: number }> = {}) {
  const [c, f, t] = servoValues;
  return {
    mesh: { position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: opts.rotY ?? 0, z: 0 } },
    body_mesh: { position: { x: opts.bx ?? 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    center_offset: 0,
    servo_values: servoValues,
    legs: {
      0: {
        on_floor: true,
        coxa: { servo_value: c, servo_idx: 0 },
        femur: { servo_value: f, servo_idx: 1 },
        tibia: { servo_value: t, servo_idx: 2 },
      },
    },
  };
}

// ── Fake bot ────────────────────────────────────────────────────────────────
// Captures the calls playback makes. Snap playback should ONLY call
// apply_status — never switch leg output strategy or load animator keyframes
// (doing so re-introduces the drift this design avoids).
function makeBot(physics_mode: 'none' | 'servo_constraint' = 'none', servo_speed = 2000) {
  const setOutputs: string[] = [];
  const applied: any[] = [];

  const leg = {
    joint_count: 3,
    _limbNames: ['coxa', 'femur', 'tibia'],
    limbs: [{ servo_value: 1500 }, { servo_value: 1500 }, { servo_value: 1500 }],
    _output: { reset: () => {} },
  };

  const bot: any = {
    options: { physics_mode },
    servo_speed,
    body_target: null,
    _body_tracking_release_pending: false,
    _servo_anim_disabled: physics_mode !== 'servo_constraint',
    mesh: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    center_offset: 0,
    legs: [leg],
    gait_controller: { stop: () => {} },
    animator: { stop: () => {} },
    _setLegOutputs: (m: string) => setOutputs.push(m),
    apply_status: (s: any) => applied.push(s),
    _setOutputs: setOutputs,
    _applied: applied,
  };
  return bot;
}

describe('recorder — record gating + metadata', () => {
  beforeEach(resetRecorder);

  it('push is a no-op unless recording', () => {
    recorder.push(makeStatus([1500, 1500, 1500]), 'x', 'none', 2000);
    expect(recorder.entries.length).toBe(0);
    recorder.start();
    recorder.push(makeStatus([1500, 1500, 1500]), 'x', 'none', 2000);
    expect(recorder.entries.length).toBe(1);
  });

  it('captures servo_speed and none physics_mode on each entry', () => {
    recorder.start();
    recorder.push(makeStatus([1500, 1500, 1500]), 'a', 'none', 1200);
    const e = recorder.entries[0];
    expect(e.physics_mode).toBe('none');
    expect(e.servo_speed).toBe(1200);
  });

  it('drops frames captured outside none mode (servo_constraint removed)', () => {
    recorder.start();
    recorder.push(makeStatus([1500, 1500, 1500]), 'a', 'servo_constraint', 2000);
    expect(recorder.entries.length).toBe(0);
    recorder.push(makeStatus([1500, 1500, 1500]), 'b', 'none', 2000);
    expect(recorder.entries.length).toBe(1);
  });
});

describe('recorder — JSON roundtrip', () => {
  beforeEach(resetRecorder);

  it('preserves physics_mode + servo_speed through save/load', () => {
    // Seed via load_json (which doesn't gate on mode, unlike push) so the
    // serialization roundtrip is tested independently of the record gate.
    const seed = JSON.stringify([
      { status: makeStatus([1500, 1600, 1500]), formatted: 'a', timestamp: 1000, physics_mode: 'none', servo_speed: 2000 },
      { status: makeStatus([1500, 1700, 1500]), formatted: 'b', timestamp: 1300, physics_mode: 'none', servo_speed: 800 },
    ]);
    expect(recorder.load_json(seed)).toBe(true);

    const json = recorder.save_json();
    resetRecorder();
    expect(recorder.load_json(json)).toBe(true);
    expect(recorder.entries.length).toBe(2);
    expect(recorder.entries[0].physics_mode).toBe('none');
    expect(recorder.entries[1].servo_speed).toBe(800);
  });

  it('loads legacy recordings without mode fields (backward compat)', () => {
    const legacy = JSON.stringify([
      { status: makeStatus([1500, 1500, 1500]), formatted: 'a', timestamp: 1000 },
    ]);
    expect(recorder.load_json(legacy)).toBe(true);
    expect(recorder.entries[0].physics_mode).toBeUndefined();
    expect(recorder.entries[0].servo_speed).toBeUndefined();
  });
});

describe('recorder — play_speed_mode setter', () => {
  beforeEach(resetRecorder);

  it('updates the snapshot', () => {
    expect(recorder.getSnapshot().play_speed_mode).toBe('recorded');
    recorder.set_play_speed_mode('current');
    expect(recorder.getSnapshot().play_speed_mode).toBe('current');
  });
});

describe('recorder — snap-based playback', () => {
  beforeEach(() => {
    resetRecorder();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Two frames 250ms apart, servo delta 200 (femur 1500→1700).
  function load2Frames() {
    const json = JSON.stringify([
      { status: makeStatus([1500, 1500, 1500]), formatted: 'a', timestamp: 1000, physics_mode: 'none', servo_speed: 2000 },
      { status: makeStatus([1500, 1700, 1500]), formatted: 'b', timestamp: 1250, physics_mode: 'none', servo_speed: 2000 },
    ]);
    expect(recorder.load_json(json)).toBe(true);
  }

  it('refuses to play while the bot is in servo_constraint mode', () => {
    load2Frames();
    const bot = makeBot('servo_constraint');
    recorder.loop = false;
    recorder.play(bot);
    expect(recorder.playing).toBe(false);
    expect(bot._applied.length).toBe(0);
  });

  it('applies the first frame exactly on play (drift-free snap)', () => {
    load2Frames();
    const bot = makeBot('none');
    recorder.loop = false;
    recorder.play(bot);
    expect(bot._applied.length).toBe(1);
    expect(bot._applied[0]).toBe(recorder.entries[0].status);
  });

  it('NEVER switches leg output strategy during playback (would cause drift)', () => {
    load2Frames();
    const bot = makeBot('none');
    recorder.loop = false;
    recorder.play(bot);
    vi.advanceTimersByTime(500);
    expect(bot._setOutputs.length).toBe(0);
    expect(bot._servo_anim_disabled).toBe(true); // untouched from its 'none' default
  });

  it('recorded pacing waits the wall-clock gap between frames', () => {
    load2Frames();
    recorder.set_play_speed_mode('recorded');
    const bot = makeBot('none', 2000);
    recorder.loop = false;
    recorder.play(bot);
    expect(bot._applied.length).toBe(1);   // frame 0
    vi.advanceTimersByTime(249);
    expect(bot._applied.length).toBe(1);   // not yet — gap is 250ms
    vi.advanceTimersByTime(1);
    expect(bot._applied.length).toBe(2);   // frame 1 at exactly 250ms
    expect(recorder.playing).toBe(false);  // non-loop end after last frame
  });

  it('current pacing waits servo_speed × delta', () => {
    load2Frames();
    recorder.set_play_speed_mode('current');
    // maxDelta 200 / 2000 units/sec * 1000 = 100ms
    const bot = makeBot('none', 2000);
    recorder.loop = false;
    recorder.play(bot);
    vi.advanceTimersByTime(99);
    expect(bot._applied.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(bot._applied.length).toBe(2);
  });

  it('advances playIdx as frames are applied', () => {
    load2Frames();
    const bot = makeBot('none');
    recorder.loop = false;
    recorder.play(bot);
    expect(recorder.playIdx).toBe(0);
    vi.advanceTimersByTime(250);
    expect(recorder.playIdx).toBe(1);
  });

  it('loops back to frame 0 using fallback pacing at the seam', () => {
    load2Frames();
    recorder.set_play_speed_mode('recorded');
    recorder.loop = true;
    const bot = makeBot('none', 2000);
    recorder.play(bot);
    expect(bot._applied.length).toBe(1);   // frame 0
    vi.advanceTimersByTime(250);
    expect(bot._applied.length).toBe(2);   // frame 1
    expect(recorder.playIdx).toBe(1);
    // seam: gap(1→0) is a wrap → fallback servo-speed = 200/2000*1000 = 100ms
    vi.advanceTimersByTime(100);
    expect(bot._applied.length).toBe(3);   // wrapped back to frame 0
    expect(recorder.playIdx).toBe(0);
    recorder.pause();
  });
});
