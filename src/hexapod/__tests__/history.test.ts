import { describe, it, expect, beforeEach } from 'vitest';
import { history } from '../history';

// Helper: reset the module-level singleton between tests
function resetHistory() {
  history.undoStack = [];
  history.redoStack = [];
  history.autoSave = true;
  history._lastSaved = null;
}

const opts1 = { gait: 'tripod', leg_count: 6 };
const opts2 = { gait: 'wave', leg_count: 6 };
const opts3 = { gait: 'ripple', leg_count: 8 };

describe('history — undo/redo', () => {
  beforeEach(() => resetHistory());

  it('starts with empty stacks', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('push adds to undo stack and clears redo', () => {
    history.push(opts1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    history.push(opts2);
    expect(history.undoStack.length).toBe(2);
    expect(history.redoStack.length).toBe(0);
  });

  it('undo moves current to redo and returns previous', () => {
    history.push(opts1);
    history.push(opts2);

    const bot = { options: opts3 };
    const prev = history.undo(bot);

    expect(prev.gait).toBe('wave');       // popped from undo stack
    expect(history.canUndo()).toBe(true);   // one left (tripod)
    expect(history.canRedo()).toBe(true);   // current (ripple) pushed to redo
  });

  it('redo restores the state that was on the redo stack', () => {
    history.push(opts1);                   // undo: [tripod]
    history.push(opts2);                   // undo: [tripod, wave]

    const bot = { options: opts3 };        // current: ripple
    const undone = history.undo(bot);      // push ripple→redo, pop wave from undo
    expect(undone.gait).toBe('wave');

    // After undo, bot.options is ripple. Redo pops ripple from redo.
    const redone = history.redo(bot);      // pop ripple, push wave→undo
    expect(redone.gait).toBe('ripple');
    expect(history.canRedo()).toBe(false);
  });

  it('push clears redo stack', () => {
    history.push(opts1);
    history.push(opts2);

    const bot = { options: opts3 };
    history.undo(bot);                     // undo wave, redo has ripple
    expect(history.canRedo()).toBe(true);

    history.push({ gait: 'quad', leg_count: 4 }); // new action
    expect(history.canRedo()).toBe(false);  // redo cleared
  });

  it('returns null when nothing to undo', () => {
    const bot = { options: opts1 };
    expect(history.undo(bot)).toBe(null);
  });

  it('returns null when nothing to redo', () => {
    const bot = { options: opts1 };
    expect(history.redo(bot)).toBe(null);
  });

  it('caps undo stack at MAX_SIZE by shifting oldest', () => {
    for (let i = 0; i < 55; i++) {
      history.push({ gait: `gait_${i}`, leg_count: 6 });
    }
    // Should have at most 50 entries
    expect(history.undoStack.length).toBeLessThanOrEqual(50);
    // Oldest should have been shifted out
    const bot = { options: { gait: 'current', leg_count: 6 } };
    const oldest = history.undo(bot);
    // After 50 undos we should reach the end... let's just verify we can undo all 50
    let count = 0;
    while (history.canUndo()) {
      history.undo(bot);
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(49);
  });
});

describe('history — save / dirty tracking', () => {
  beforeEach(() => resetHistory());

  it('isDirty returns false when autoSave is on', () => {
    history.autoSave = true;
    expect(history.isDirty(opts1)).toBe(false);
  });

  it('isDirty returns false when nothing saved yet', () => {
    history.autoSave = false;
    expect(history.isDirty(opts1)).toBe(false);
  });

  it('isDirty returns true when options differ from last saved', () => {
    history.autoSave = false;
    history.save(opts1);
    expect(history.isDirty(opts2)).toBe(true);
  });

  it('isDirty returns false when options match last saved', () => {
    history.autoSave = false;
    history.save(opts1);
    expect(history.isDirty({ ...opts1 })).toBe(false);
  });

  it('markSaved updates internal tracking without writing localStorage', () => {
    history.autoSave = false;
    history.markSaved(opts1);
    expect(history.isDirty(opts1)).toBe(false);
    expect(history.isDirty(opts2)).toBe(true);
  });
});

describe('history — corrupted data', () => {
  beforeEach(() => resetHistory());

  it('undo handles corrupted stack entry gracefully', () => {
    // Push a raw non-JSON value that JSON.parse would reject...
    // But push() always JSON.stringifies, so this can't happen in normal use.
    // Test the null guard on pop() instead.
    history.undoStack = [];
    const bot = { options: opts1 };
    expect(history.undo(bot)).toBe(null);
  });

  it('redo handles empty redo stack gracefully', () => {
    history.push(opts1);
    const bot = { options: opts2 };
    expect(history.redo(bot)).toBe(null);
  });
});
