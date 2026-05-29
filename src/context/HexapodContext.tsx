import { createContext, useContext, useMemo, useRef, useState, useCallback } from 'react';

const HexapodContext = createContext(null);

export function HexapodProvider({ children }) {
  const [servoValues, setServoValues] = useState('');
  const [lastServoValues, setLastServoValues] = useState('');
  const [timeIntervals, setTimeIntervals] = useState<number[]>([]);
  const [botVersion, setBotVersion] = useState(0);
  const botRef = useRef(null);

  const updateServoDisplay = useCallback(() => {
    const bot = botRef.current;
    if (!bot) return;
    setServoValues(bot.build_cmd(bot.get_servo_values()));
    if (bot.on_servo_values) {
      setLastServoValues(bot.format_servo_values(bot.on_servo_values));
    }
  }, []);

  const pushTimeInterval = useCallback((interval: number) => {
    setTimeIntervals(prev => {
      const next = [...prev, interval];
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  const bumpBotVersion = useCallback(() => {
    setBotVersion(v => v + 1);
  }, []);

  // Memoize the context value so consumers don't re-render on every state
  // update when nothing they care about changed. botRef is mutable and
  // doesn't need to be in deps. Status recording lives in the external
  // `recorder` store (src/hexapod/recorder.ts), NOT here — pushing to it
  // doesn't churn this context.
  const value = useMemo(() => ({
    botRef,
    servoValues,
    lastServoValues,
    timeIntervals,
    updateServoDisplay,
    botVersion,
    bumpBotVersion,
    pushTimeInterval,
  }), [servoValues, lastServoValues, timeIntervals,
       updateServoDisplay, botVersion, bumpBotVersion, pushTimeInterval]);

  return (
    <HexapodContext.Provider value={value}>
      {children}
    </HexapodContext.Provider>
  );
}

export function useHexapod() {
  const ctx = useContext(HexapodContext);
  if (!ctx) throw new Error('useHexapod must be used within HexapodProvider');
  return ctx;
}
