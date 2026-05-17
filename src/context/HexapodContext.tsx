import { createContext, useContext, useRef, useState, useCallback } from 'react';

const HexapodContext = createContext(null);

export function HexapodProvider({ children }) {
  const [servoValues, setServoValues] = useState('');
  const [lastServoValues, setLastServoValues] = useState('');
  const [statusEntries, setStatusEntries] = useState<Array<{ status: any; formatted: string }>>([]);
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

  const value = {
    botRef,
    servoValues,
    lastServoValues,
    statusEntries,
    setStatusEntries,
    timeIntervals,
    updateServoDisplay,
    botVersion,
    bumpBotVersion,
    pushTimeInterval,
  };

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
