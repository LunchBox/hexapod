import { describe, it, expect } from 'vitest';
import { GaitAction } from '../gaits';

function makeController(overrides: Record<string, any> = {}) {
  return {
    bot: { options: {} },
    active_legs: () => [],
    legs_up: () => {},
    legs_down: () => {},
    move_tips: () => {},
    move_body: () => {},
    next_leg_group: () => {},
    stop: () => {},
    ...overrides,
  };
}

describe('GaitAction.run() — safety guards', () => {
  it('handles empty steps array gracefully', () => {
    const action = new GaitAction(makeController());
    action.steps = [];
    // Should not throw — returns false with no crash
    expect(() => action.run()).not.toThrow();
    expect(action.run()).toBe(false);
  });

  it('handles null/undefined step in array', () => {
    const action = new GaitAction(makeController());
    action.steps = [null as any];
    expect(() => action.run()).not.toThrow();
    expect(action.run()).toBe(false);
  });

  it('handles step with non-existent method name', () => {
    const action = new GaitAction(makeController());
    action.steps = ['nonexistent_method'];
    // Should not throw TypeError — guards against missing method
    expect(() => action.run()).not.toThrow();
    // send_cmd defaults to true for string steps (legacy behavior)
    expect(action.run()).toBe(true);
  });

  it('dispatches valid string steps to controller methods', () => {
    let called = false;
    const ctrl = makeController({
      legs_up: () => { called = true; },
    });
    const action = new GaitAction(ctrl);
    action.steps = ['legs_up'];
    action.run();
    expect(called).toBe(true);
  });

  it('handles object steps with func and send_cmd', () => {
    let called = false;
    const ctrl = makeController({
      legs_up: () => { called = true; },
    });
    const action = new GaitAction(ctrl);
    action.steps = [{ func: 'legs_up', send_cmd: false }];
    const sendCmd = action.run();
    expect(called).toBe(true);
    expect(sendCmd).toBe(false);
  });

  it('object step send_cmd defaults to false when absent', () => {
    let called = false;
    const ctrl = makeController({
      legs_down: () => { called = true; },
    });
    const action = new GaitAction(ctrl);
    action.steps = [{ func: 'legs_down' }];
    const sendCmd = action.run();
    expect(called).toBe(true);
    expect(sendCmd).toBe(false);
  });

  it('advances acting_idx after each step', () => {
    const action = new GaitAction(makeController());
    action.steps = ['legs_up', 'legs_down'];
    expect(action.acting_idx).toBe(0);
    action.run();
    expect(action.acting_idx).toBe(1);
    action.run();
    expect(action.acting_idx).toBe(0); // wraps around
  });
});
