import { useState, useEffect, useCallback } from 'react';
import { useHexapod } from '../context/HexapodContext';
import { history, performUndo, performRedo, performSave } from '../hexapod/history';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Undo2, Redo2, Save } from 'lucide-react';

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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        disabled={!canUndo}
        onClick={() => { const b = botRef.current; if (b && performUndo(b, bumpBotVersion)) refresh(); }}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 data-icon="inline-start" />
        Undo
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!canRedo}
        onClick={() => { const b = botRef.current; if (b && performRedo(b, bumpBotVersion)) refresh(); }}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 data-icon="inline-start" />
        Redo
      </Button>

      <label className="flex items-center gap-1.5 text-sm cursor-pointer ml-2">
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
        <Button
          variant={dirty ? 'default' : 'outline'}
          size="sm"
          onClick={() => { const b = botRef.current; if (b) { performSave(b, bumpBotVersion); refresh(); } }}
          title="Save (Ctrl+S)"
        >
          <Save data-icon="inline-start" />
          Save
        </Button>
      )}

      {dirty && (
        <Badge variant="destructive" className="text-xs">unsaved</Badge>
      )}
    </div>
  );
}
