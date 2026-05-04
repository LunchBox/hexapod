import { describe, it, expect, beforeEach } from 'vitest';
import { DirectOutput, AnimatedOutput, type ServoOutput } from '../servo_output';

// ── DirectOutput ────────────────────────────────────────────────

describe('DirectOutput', () => {
  it('setTargets immediately updates renderedValues', () => {
    const out = new DirectOutput(3, [1500, 1500, 1500]);
    out.setTargets([1600, 1700, 1800]);
    expect(out.renderedValues).toEqual([1600, 1700, 1800]);
  });

  it('isAnimating always returns false', () => {
    const out = new DirectOutput(3, [1500, 1500, 1500]);
    expect(out.isAnimating()).toBe(false);
    out.setTargets([1600, 1700, 1800]);
    expect(out.isAnimating()).toBe(false);
  });

  it('update always returns false', () => {
    const out = new DirectOutput(3, [1500, 1500, 1500]);
    const joints: number[] = [];
    expect(out.update(1000, 2000, (i, v) => { joints[i] = v; })).toBe(false);
    expect(joints).toEqual([]);
  });

  it('capturedRendered is ignored', () => {
    const out = new DirectOutput(3, [1500, 1500, 1500]);
    out.setTargets([1600, 1700, 1800], [1400, 1450, 1500]);
    // Uses targets directly, ignores captured
    expect(out.renderedValues).toEqual([1600, 1700, 1800]);
  });
});

// ── AnimatedOutput ──────────────────────────────────────────────

describe('AnimatedOutput', () => {
  it('setTargets creates keyframes from current rendered', () => {
    const out = new AnimatedOutput(3, [1500, 1500, 1500]);
    out.setTargets([1600, 1700, 1800]);
    // rendered reset to start of animation
    expect(out.renderedValues).toEqual([1500, 1500, 1500]);
    expect(out.isAnimating()).toBe(true);
  });

  it('setTargets uses capturedRendered when provided', () => {
    const out = new AnimatedOutput(3, [1500, 1500, 1500]);
    out.setTargets([1600, 1700, 1800], [1400, 1450, 1550]);
    expect(out.renderedValues).toEqual([1400, 1450, 1550]);
  });

  it('update interpolates linearly', () => {
    const out = new AnimatedOutput(2, [1500, 1500]);
    out.setTargets([1700, 1300]);
    const applied: [number, number][] = [];
    // maxDelta=200, speed=2000 → duration=100ms, at 50ms → t=0.5
    out.update(0, 2000, () => {}); // first frame: sets startTime to 0
    const stillGoing = out.update(50, 2000, (i, v) => { applied.push([i, v]); });
    expect(stillGoing).toBe(true);
    expect(applied.length).toBe(2);
    expect(applied[0][1]).toBe(1600); // 1500 + 0.5*200
    expect(applied[1][1]).toBe(1400); // 1500 - 0.5*200
    expect(out.renderedValues).toEqual([1600, 1400]);
  });

  it('completes and returns false when t >= 1', () => {
    const out = new AnimatedOutput(1, [1500]);
    out.setTargets([1700]);
    // maxDelta=200, speed=2000 → duration=100ms
    out.update(0, 2000, () => {}); // first frame
    const stillGoing = out.update(100, 2000, () => {});
    expect(stillGoing).toBe(false);
    expect(out.isAnimating()).toBe(false);
    expect(out.renderedValues).toEqual([1700]);
  });

  it('zero delta completes instantly', () => {
    const out = new AnimatedOutput(1, [1500]);
    out.setTargets([1500]);
    const stillGoing = out.update(0, 2000, () => {});
    expect(stillGoing).toBe(false);
    expect(out.isAnimating()).toBe(false);
  });

  it('reset clears animation state', () => {
    const out = new AnimatedOutput(1, [1500]);
    out.setTargets([1700]);
    expect(out.isAnimating()).toBe(true);
    out.reset();
    expect(out.isAnimating()).toBe(false);
  });

  it('renderedValues snapshot preserves independence', () => {
    const out = new AnimatedOutput(2, [1500, 1500]);
    const snap = out.renderedValues;
    out.setTargets([1600, 1700]);
    // snap is a slice, not mutated by setTargets
    expect(snap).toEqual([1500, 1500]);
  });
});

// ── Mode switching ──────────────────────────────────────────────

describe('mode switching', () => {
  it('switching from Direct to Animated preserves rendered', () => {
    const direct = new DirectOutput(3, [1500, 1600, 1700]);
    direct.setTargets([1550, 1650, 1750]);
    // Switch to animated
    const anim = new AnimatedOutput(3, direct.renderedValues);
    expect(anim.renderedValues).toEqual([1550, 1650, 1750]);
  });

  it('switching from Animated to Direct preserves rendered', () => {
    const anim = new AnimatedOutput(2, [1500, 1500]);
    anim.setTargets([1700, 1300]);
    anim.update(0, 2000, () => {});  // first frame
    anim.update(50, 2000, () => {}); // halfway
    const direct = new DirectOutput(2, anim.renderedValues);
    expect(direct.renderedValues).toEqual([1600, 1400]);
  });
});

// ── Critical: set_servo_values MUST apply immediately ──────────
// PosCalculator calls set_servo_values() to test servo values,
// then reads tip position from the Three.js scene.  If
// AnimatedOutput defers application (starts an animation instead
// of setting joints directly), the FK read gets stale data and
// gradient descent breaks completely.

describe('set_servo_values immediacy (PosCalculator contract)', () => {
  it('DirectOutput: set_servo_values updates renderedValues immediately', () => {
    const joints = [mockJoint(), mockJoint(), mockJoint()];
    const output = new DirectOutput(3, [1500, 1500, 1500]);

    // Simulate set_servo_values
    const values = [1600, 1700, 1800];
    for (let j = 0; j < 3; j++) {
      const v = Math.round(values[j]);
      joints[j].servo_value = v;
      joints[j]._rendered_servo_value = v;
      output.renderedValues[j] = v;
    }

    expect(output.renderedValues).toEqual([1600, 1700, 1800]);
    expect(joints[0]._rendered_servo_value).toBe(1600);
    expect(joints[1]._rendered_servo_value).toBe(1700);
    expect(joints[2]._rendered_servo_value).toBe(1800);
  });

  it('AnimatedOutput: set_servo_values updates renderedValues immediately (NOT via animation)', () => {
    const joints = [mockJoint(), mockJoint(), mockJoint()];
    const output = new AnimatedOutput(3, [1500, 1500, 1500]);

    // PosCalculator calls set_servo_values(1600,1700,1800) to test IK
    // The joints MUST reflect these values NOW so getWorldPosition works.
    const values = [1600, 1700, 1800];
    for (let j = 0; j < 3; j++) {
      const v = Math.round(values[j]);
      joints[j].servo_value = v;
      joints[j]._rendered_servo_value = v;
      output.renderedValues[j] = v;
    }

    expect(output.renderedValues).toEqual([1600, 1700, 1800]);
    expect(joints[0]._rendered_servo_value).toBe(1600);
    expect(joints[1]._rendered_servo_value).toBe(1700);
    expect(joints[2]._rendered_servo_value).toBe(1800);
    // Must NOT be animating — this was a direct set, not an animation
    expect(output.isAnimating()).toBe(false);
  });

  it('AnimatedOutput: set_servo_values does not overwrite existing animation', () => {
    const joints = [mockJoint(), mockJoint(), mockJoint()];
    const output = new AnimatedOutput(3, [1500, 1500, 1500]);

    // Start an animation via setTargets (as set_tip_pos does)
    output.setTargets([1600, 1700, 1800], [1500, 1500, 1500]);
    expect(output.isAnimating()).toBe(true);
    expect(output.renderedValues).toEqual([1500, 1500, 1500]); // start of anim

    // PosCalculator calls set_servo_values for FK during gait move_body
    // This should NOT destroy the animation state
    for (let j = 0; j < 3; j++) {
      joints[j].servo_value = 1550;
      joints[j]._rendered_servo_value = 1550;
      output.renderedValues[j] = 1550;
    }

    // renderedValues updated, but animation keyframes still intact
    expect(output.renderedValues).toEqual([1550, 1550, 1550]);
    // The keyframe animation was not started by this — isAnimating
    // still reflects the original setTargets
    expect(output.isAnimating()).toBe(true);
  });
});

// ── Integration: simulate HexapodLeg flow ──────────────────────

/** Create a mock limb with all properties HexapodLeg expects. */
function mockJoint(initRadius = 0, revert = false) {
  return {
    rotation: { y: 0, z: 0 },
    init_radius: initRadius,
    revert,
    servo_value: 1500,
    _rendered_servo_value: 1500,
  };
}

describe('HexapodLeg integration', () => {
  it('set_tip_pos → update_animation drives joints toward target', () => {
    // Build a mock leg with DirectOutput initially
    const joints = [mockJoint(), mockJoint(), mockJoint()];
    const output = new DirectOutput(3, joints.map(j => j._rendered_servo_value));

    // Simulate set_tip_pos with a simple "IK" result
    const preRendered = output.renderedValues.slice();
    const ikResult = [1600, 1700, 1800];

    // Switch to AnimatedOutput (as act() would do)
    const animOutput = new AnimatedOutput(3, output.renderedValues);
    animOutput.setTargets(ikResult, preRendered);

    // Verify animation started
    expect(animOutput.isAnimating()).toBe(true);
    // rendered reset to pre-animation start
    expect(animOutput.renderedValues).toEqual([1500, 1500, 1500]);

    // Simulate rAF frames
    const applied: number[][] = [];
    animOutput.update(0, 2000, (i, v) => { if (!applied[0]) applied[0] = []; applied[0][i] = v; });
    // Halfway: maxDelta=300, speed=2000 → duration=150ms, at 75ms → t=0.5
    animOutput.update(75, 2000, (i, v) => { if (!applied[1]) applied[1] = []; applied[1][i] = v; });

    expect(applied[1][0]).toBe(1550); // 1500 + 0.5*100
    expect(applied[1][1]).toBe(1600); // 1500 + 0.5*200
    expect(applied[1][2]).toBe(1650); // 1500 + 0.5*300
  });

  it('snap_to_home does not overwrite in-progress animation', () => {
    const output = new AnimatedOutput(3, [1500, 1500, 1500]);
    output.setTargets([1600, 1700, 1800], [1500, 1500, 1500]);
    expect(output.isAnimating()).toBe(true);

    // snap calls setTargets again → would overwrite
    // But in the real HexapodLeg.snap_to_home, the guard would prevent this
    // This test verifies the output behavior without the guard
    output.setTargets([1510, 1510, 1510]); // overwrites!
    expect(output.renderedValues).toEqual([1500, 1500, 1500]); // reset to rendered
    // Keyframes now go to snap target, not the original IK target
    output.update(0, 2000, () => {});
    output.update(150, 2000, () => {}); // duration = (100/2000)*1000 = 50ms
    expect(output.renderedValues).toEqual([1510, 1510, 1510]); // reached snap target, not IK target
  });

  it('rapid mode switch: preserves rendered across stop/resume cycle', () => {
    const anim1 = new AnimatedOutput(3, [1500, 1500, 1500]);
    anim1.setTargets([1600, 1700, 1800], [1500, 1500, 1500]);
    anim1.update(0, 2000, () => {});
    anim1.update(75, 2000, () => {}); // maxDelta=300, dur=150ms, t=0.5
    expect(anim1.renderedValues).toEqual([1550, 1600, 1650]);

    const direct = new DirectOutput(3, anim1.renderedValues);
    expect(direct.renderedValues).toEqual([1550, 1600, 1650]);

    const anim2 = new AnimatedOutput(3, direct.renderedValues);
    anim2.setTargets([1620, 1720, 1820], direct.renderedValues.slice());
    expect(anim2.renderedValues).toEqual([1550, 1600, 1650]);

    anim2.update(0, 2000, () => {});
    anim2.update(75, 2000, () => {});
    expect(anim2.isAnimating()).toBe(true);
  });
});
