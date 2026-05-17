// Type declarations for DOM element extensions and legacy globals

// DOM element extensions — code attaches custom properties to DOM elements
interface HTMLInputElement {
  controller?: any;
  leg?: any;
  leg_idx?: number;
  limb_idx?: number;
  range_control?: HTMLInputElement;
  current_control?: HTMLInputElement;
  end_x_control?: HTMLInputElement;
  end_y_control?: HTMLInputElement;
  end_z_control?: HTMLInputElement;
  range_input?: HTMLInputElement;
}

interface HTMLDivElement {
  data_value?: any;
}

interface Document {
  selection?: {
    empty(): void;
  };
}

// Stats.js (loaded via <script> from public/libs/)
declare class Stats {
  domElement: HTMLDivElement;
  update(): void;
}

// Socket.IO client
declare module 'socket.io-client' {
  interface Socket {
    on(event: string, cb: (...args: any[]) => void): void;
    emit(event: string, data: any): void;
    connected: boolean;
  }
  function io(url: string, opts?: any): Socket;
  export default io;
}
