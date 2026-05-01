import { useState, useEffect, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { history, performUndo, performRedo, performSave } from '../hexapod/history';

export default function Toolbar() {
  const { botRef, bumpBotVersion } = useHexapod();
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const bot = botRef.current;
      if (!bot) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (performUndo(bot, bumpBotVersion)) refresh();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        if (performRedo(bot, bumpBotVersion)) refresh();
      } else if (e.key === 's' || e.key === 'S') {
        if (!history.autoSave) {
          e.preventDefault();
          performSave(bot, bumpBotVersion);
          refresh();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [botRef, bumpBotVersion, refresh]);

  const bot = botRef.current;
  const canUndo = history.canUndo();
  const canRedo = history.canRedo();
  const dirty = bot ? history.isDirty(bot.options) : false;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '2px 10px',
    fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    border: '1px solid #888',
    borderRadius: 3,
    background: '#eee',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      <button
        style={btnStyle(!canUndo)}
        disabled={!canUndo}
        onClick={() => { const b = botRef.current; if (b && performUndo(b, bumpBotVersion)) refresh(); }}
        title="Undo (Ctrl+Z)"
      >↩ Undo</button>

      <button
        style={btnStyle(!canRedo)}
        disabled={!canRedo}
        onClick={() => { const b = botRef.current; if (b && performRedo(b, bumpBotVersion)) refresh(); }}
        title="Redo (Ctrl+Y)"
      >↪ Redo</button>

      <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 8 }}>
        <input
          type="checkbox"
          checked={history.autoSave}
          onChange={(e) => {
            history.autoSave = e.currentTarget.checked;
            const b = botRef.current;
            if (history.autoSave && b && history.isDirty(b.options)) {
              history.save(b.options);
            }
            refresh();
          }}
        />
        Auto Save
      </label>

      {!history.autoSave && (
        <button
          style={{
            ...btnStyle(false),
            background: dirty ? '#e67e22' : '#eee',
            color: dirty ? '#fff' : '#333',
            fontWeight: dirty ? 'bold' : 'normal',
          }}
          onClick={() => { const b = botRef.current; if (b) { performSave(b, bumpBotVersion); refresh(); } }}
          title="Save (Ctrl+S)"
        >💾 Save</button>
      )}

      {dirty && (
        <span style={{ color: '#e67e22', fontSize: 12, fontWeight: 'bold' }}>⬤ unsaved</span>
      )}
    </div>
  );
}
