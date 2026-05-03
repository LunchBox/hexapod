import { useHexapod } from '../context/HexapodContext';

export default function CommandDisplay() {
  const { servoValues, lastServoValues } = useHexapod();

  return (
    <>
      <h3 className="text-sm font-medium mb-1">Command</h3>
      <div className="my-1 border border-border rounded p-1 font-mono text-xs break-all min-h-[1.5em]">
        {servoValues}
      </div>
      <h3 className="text-sm font-medium mb-1 mt-3">Last Servo Values</h3>
      <div className="my-1 border border-border rounded p-1 font-mono text-xs break-all min-h-[1.5em]">
        {lastServoValues}
      </div>
    </>
  );
}
