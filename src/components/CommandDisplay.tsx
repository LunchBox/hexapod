import { useHexapod } from '../context/HexapodContext';
import { useState, useEffect } from 'react';

export default function CommandDisplay() {
  const { botRef } = useHexapod();
  const [cmd, setCmd] = useState('');
  const [lastCmd, setLastCmd] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const bot = botRef.current;
      if (!bot) return;

      const el = document.querySelector('#servo_values');
      if (el) setCmd(el.innerHTML);

      const el2 = document.querySelector('#on_servo_values');
      if (el2) setLastCmd(el2.innerHTML);
    }, 100);
    return () => clearInterval(interval);
  }, [botRef]);

  return (
    <>
      <h3>Command</h3>
      <div id="servo_values" style={{ margin: '4px 0', border: '1px solid #ccc', padding: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {cmd}
      </div>
      <h3>Last Servo Values</h3>
      <div id="on_servo_values" style={{ margin: '4px 0', border: '1px solid #ccc', padding: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {lastCmd}
      </div>
    </>
  );
}
