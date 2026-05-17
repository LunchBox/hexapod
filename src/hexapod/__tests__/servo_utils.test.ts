import { describe, it, expect } from 'vitest';
import { computeMaxDelta, computeServoSpeedHoldTime, computeFixedUnitHoldTime } from '../servo_utils';
import { DEFAULT_FRAMES_INTERVAL } from '../defaults';

describe('computeMaxDelta', () => {
  it('returns 0 for identical arrays', () => {
    expect(computeMaxDelta([1500, 1500, 1500], [1500, 1500, 1500])).toBe(0);
  });

  it('returns the max absolute difference', () => {
    expect(computeMaxDelta([1500, 1600, 1400], [1500, 1500, 1500])).toBe(100);
  });

  it('handles arrays of different lengths', () => {
    expect(computeMaxDelta([1500, 2000], [1500])).toBe(0);
    expect(computeMaxDelta([1500], [1500, 2000])).toBe(0);
  });

  it('returns correct delta for single-element arrays', () => {
    expect(computeMaxDelta([500], [2500])).toBe(2000);
  });

  it('handles empty arrays', () => {
    expect(computeMaxDelta([], [])).toBe(0);
  });
});

describe('computeServoSpeedHoldTime', () => {
  it('returns DEFAULT_FRAMES_INTERVAL when delta is 0', () => {
    expect(computeServoSpeedHoldTime(0, 2000)).toBe(DEFAULT_FRAMES_INTERVAL);
  });

  it('scales linearly with delta', () => {
    const t1 = computeServoSpeedHoldTime(100, 2000);
    const t2 = computeServoSpeedHoldTime(200, 2000);
    expect(t2).toBeGreaterThan(t1);
  });

  it('2000 delta at 2000 units/sec = 1000ms', () => {
    expect(computeServoSpeedHoldTime(2000, 2000)).toBe(1000);
  });

  it('floors to DEFAULT_FRAMES_INTERVAL', () => {
    expect(computeServoSpeedHoldTime(1, 40000)).toBe(DEFAULT_FRAMES_INTERVAL);
  });
});

describe('computeFixedUnitHoldTime', () => {
  it('returns DEFAULT_FRAMES_INTERVAL when delta is 0', () => {
    expect(computeFixedUnitHoldTime(0)).toBe(DEFAULT_FRAMES_INTERVAL);
  });

  it('scales linearly with delta', () => {
    const t1 = computeFixedUnitHoldTime(100);
    const t2 = computeFixedUnitHoldTime(200);
    expect(t2).toBeGreaterThan(t1);
  });
});

describe('computeMaxDelta — edge cases', () => {
  it('returns correct delta for extreme boundary values', () => {
    // servo range is 500-2500
    expect(computeMaxDelta([500], [2500])).toBe(2000);
    expect(computeMaxDelta([2500], [500])).toBe(2000);
  });

  it('handles single-element boundary arrays', () => {
    expect(computeMaxDelta([500], [510])).toBe(10);
    expect(computeMaxDelta([2490], [2500])).toBe(10);
  });

  it('handles large arrays efficiently', () => {
    const a = Array.from({ length: 100 }, (_, i) => 1500 + i);
    const b = Array.from({ length: 100 }, () => 1500);
    // max delta is at index 99: 1500+99 - 1500 = 99
    expect(computeMaxDelta(a, b)).toBe(99);
  });
});
