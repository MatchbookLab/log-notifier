export enum LogNotifierState {
  Error = 'error',
  Running = 'running',
  Restarting = 'restarting',
  Stopped = 'stopped',
}

export type LogNotifierMatchCallback = (str: string) => void | Promise<void>;

export interface LogNotifierMatcher {
  id: number;
  match: RegExp;
  callback: LogNotifierMatchCallback;
  event: LogNotifierState | string;
}
