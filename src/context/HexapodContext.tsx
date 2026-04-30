import { createContext, useContext, useRef, useState, useCallback } from 'react';

const HexapodContext = createContext(null);

export function HexapodProvider({ children }) {
  const [servoValues, setServoValues] = useState('');
  const [lastServoValues, setLastServoValues] = useState('');
  const [statusHistory, setStatusHistory] = useState([]);
  const botRef = useRef(null);
  const sceneRef = useRef(null);

  const updateServoDisplay = useCallback(() => {
    const bot = botRef.current;
    if (!bot) return;
    setServoValues(bot.build_cmd(bot.get_servo_values()));
    if (bot.on_servo_values) {
      setLastServoValues(bot.format_servo_values(bot.on_servo_values));
    }
  }, []);

  const addStatusHistory = useCallback((status) => {
    setStatusHistory(prev => [...prev, status]);
  }, []);

  const value = {
    botRef,
    sceneRef,
    servoValues,
    setServoValues,
    lastServoValues,
    setLastServoValues,
    statusHistory,
    setStatusHistory,
    updateServoDisplay,
    addStatusHistory,
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
