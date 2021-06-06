import { io } from 'socket.io-client';
import { LogNotifierMatchCallback, LogNotifierState } from '../shared';

export class LogNotifierBrowserBridge {
  private readonly socket: any;

  constructor(private name: string, wsUrl: string) {
    this.socket = io(wsUrl);

    this.socket.on('error', (err: Error) => {
      console.error(`Web Bridge Error (${this.name})`, err);
    });
  }

  on(stateOrCustomEvent: LogNotifierState | string, callback: LogNotifierMatchCallback) {
    this.socket.on(`${this.name}_${stateOrCustomEvent}`, callback);
  }

  emit(stateOrCustomEvent: LogNotifierState | string, data: any) {
    console.log(stateOrCustomEvent, data);
  }
}
