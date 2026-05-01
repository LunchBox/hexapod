import { set_bot_options } from './hexapod';

// Module-level singleton — used by both React and imperative code
const MAX_SIZE = 50;

export const history = {
  undoStack: [] as string[],
  redoStack: [] as string[],
  autoSave: true,
  _lastSaved: null as string | null,

  push(options: any) {
    this.undoStack.push(JSON.stringify(options));
    if (this.undoStack.length > MAX_SIZE) this.undoStack.shift();
    this.redoStack = [];
  },

  canUndo(): boolean {
    return this.undoStack.length > 0;
  },

  canRedo(): boolean {
    return this.redoStack.length > 0;
  },

  undo(bot: any): any | null {
    if (!this.canUndo()) return null;
    // Push current state to redo stack
    this.redoStack.push(JSON.stringify(bot.options));
    const prev = JSON.parse(this.undoStack.pop()!);
    return prev;
  },

  redo(bot: any): any | null {
    if (!this.canRedo()) return null;
    // Push current state to undo stack
    this.undoStack.push(JSON.stringify(bot.options));
    const next = JSON.parse(this.redoStack.pop()!);
    return next;
  },

  save(options: any) {
    set_bot_options(options);
    this._lastSaved = JSON.stringify(options);
  },

  markSaved(options: any) {
    this._lastSaved = JSON.stringify(options);
  },

  isDirty(options: any): boolean {
    if (this.autoSave) return false;
    if (this._lastSaved == null) return false;
    return JSON.stringify(options) !== this._lastSaved;
  },

  /** Apply options to bot: rebuild 3D + optionally persist */
  apply(bot: any, options: any, persist: boolean) {
    bot.apply_attributes(options);
    if (persist || this.autoSave) {
      this._lastSaved = JSON.stringify(options);
    }
  },
};

/** Undo the last change. Returns true if successful. */
export function performUndo(bot: any, bumpVersion: () => void): boolean {
  const prev = history.undo(bot);
  if (!prev) return false;
  history.apply(bot, prev, false);
  bumpVersion();
  return true;
}

/** Redo the last undone change. Returns true if successful. */
export function performRedo(bot: any, bumpVersion: () => void): boolean {
  const next = history.redo(bot);
  if (!next) return false;
  history.apply(bot, next, false);
  bumpVersion();
  return true;
}

/** Save current state to localStorage. Returns true. */
export function performSave(bot: any, bumpVersion: () => void): boolean {
  history.save(bot.options);
  bumpVersion();
  return true;
}
