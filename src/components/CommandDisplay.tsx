import { useHexapod } from '../context/HexapodContext';

export default function CommandDisplay() {
  const { servoValues, lastServoValues } = useHexapod();

  return (
    <>
      <h3>Command</h3>
      <div id="servo_values" style={{ margin: '4px 0', border: '1px solid #ccc', padding: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {servoValues}
      </div>
      <h3>Last Servo Values</h3>
      <div id="on_servo_values" style={{ margin: '4px 0', border: '1px solid #ccc', padding: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {lastServoValues}
      </div>
    </>
  );
}
