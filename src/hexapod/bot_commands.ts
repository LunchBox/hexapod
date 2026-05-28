import io from 'socket.io-client';
import { computeMaxDelta, computeServoSpeedHoldTime } from './servo_utils.js';
import type { HexapodLeg } from './hexapod_leg.js';

/** Socket-backed command sender. One instance per Hexapod. */
export class CommandSocket {
  socket: any;

  constructor(url: string = 'http://localhost:8888') {
    this.socket = io(url, { reconnection: false });
    this.socket.on('message', (data: any) => {
      console.log(data.message);
    });
    this.socket.on('connect_error', () => {
      // Expected when no physical bot is connected — app works standalone
    });
    this.socket.on('disconnect', () => {
      console.log("-- lost socket connect.");
    });
  }

  send(cmd: string) {
    console.log("-- send_cmd fired.");
    if (this.socket.connected) {
      this.socket.emit('client_data', { str: cmd });
    }
  }

  get connected(): boolean {
    return !!this.socket?.connected;
  }
}

/** Format servo values as "#N PXXXX #N+1 PYYYY ..." */
export function formatServoValues(legs: HexapodLeg[], servo_values: number[]): string {
  const formatted: string[] = [];
  let offset = 0;
  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx];
    const n = leg.joint_count;
    for (let j = 0; j < n; j++) {
      formatted.push("#" + leg.limbs[j].servo_idx + " P" + servo_values[offset + j]);
    }
    offset += n;
  }
  return formatted.join(" ");
}

/** Build a servo command with timing suffix appended ("T<interval>"). */
export function buildCmd(
  legs: HexapodLeg[],
  servo_values: number[],
  on_servo_values: number[] | null,
  servo_speed: number,
): string {
  let cmd = formatServoValues(legs, servo_values);
  if (on_servo_values) {
    const maxDelta = computeMaxDelta(servo_values, on_servo_values);
    const interval = computeServoSpeedHoldTime(maxDelta, servo_speed);
    cmd += " T" + interval;
  } else {
    cmd += " T500";
  }
  return cmd;
}
