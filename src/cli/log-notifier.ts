import chalk from 'chalk';
import EventEmitter from 'events';
import { createServer } from 'http';
import NodeNotifier from 'node-notifier';
import { relative } from 'path';
import { Server as SocketIO } from 'socket.io';
import { Tail } from 'tail';
import { promisify } from 'util';
import { LogNotifierMatchCallback, LogNotifierMatcher, LogNotifierState } from '../shared';

export interface LogNotifierOptions {
  noSound?: boolean; // this overrides all the others
  noErrorSound?: boolean;
  noRunningSound?: boolean;
  noStartSound?: boolean;
  noRestartSound?: boolean;
  noStoppedSound?: boolean;

  noAutoStart?: boolean;

  socketIO?: SocketIO; // use shared server
  port?: number;
}

const notifier = new NodeNotifier.NotificationCenter().notify;
const notify: (notification?: any | string) => Promise<string | undefined> = promisify(notifier.bind(notifier));

export class LogNotifier extends EventEmitter {
  static createSharedSocketIO(port: number): SocketIO {
    const server = createServer();
    server.listen(port);
    this.log(`SocketIO server listening on port ${port}`);

    process.on('exit', () => {
      server.close();
    });

    return new SocketIO({
      serveClient: false,
    }).attach(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
  }

  static log(...args: any[]) {
    const timestamp = new Date().toTimeString().replace(/^([\d:]+) .*/, '$1');
    console.log(`${chalk.grey(timestamp)} [${chalk.green(LogNotifier.name)}]`, ...args);
  }

  static isStateEvent(event: any): event is LogNotifierState {
    return Object.values(LogNotifierState as any).includes(event);
  }

  private readonly relativeLogFilePath: string = chalk.blue(relative(process.cwd(), this.logFile));
  private readonly tail: Tail = new Tail(this.logFile);
  private readonly ws: SocketIO;
  private currentState: LogNotifierState | null = null;
  private matchers: LogNotifierMatcher[] = [];

  constructor(
    private readonly name: string,
    private readonly logFile: string,
    private readonly options: LogNotifierOptions = {},
  ) {
    super();

    if (this.options.socketIO) {
      this.ws = this.options.socketIO;
    } else {
      if (!this.options.port) {
        throw new Error('You must provide a socket IO instance or a port');
      }

      this.ws = LogNotifier.createSharedSocketIO(this.options.port);
    }

    this.ws.on('connection', (socket) => {
      this.emitToWsId(socket.id, 'DEBUG_EVENT', this.currentState);
      if (this.currentState) {
        this.emitToWsId(socket.id, this.currentState, '');
      }
    });

    this.ws.on('error', (err) => {
      this.log('ws error', err);
    });

    this.tail.on('line', (line: string) => {
      this.matchers.forEach(async ({ id, match, callback, event }) => {
        if (match.test(line)) {
          try {
            this.emit(event, line);
            this.emit('DEBUG_EVENT', event);
            if (LogNotifier.isStateEvent(event)) {
              if (event !== this.currentState) {
                this.emit('stateChange', event);
              }
              this.currentState = event;
            }
            await callback(line);
          } catch (err) {
            this.log(`There was an error trying to handle the callback for ${match} match (ID: ${id}) on line ${line} for ${event} event`);
          }
        }
      });
    });

    this.tail.on('error', (err: Error) => {
      this.log(`Error while watching the ${this.relativeLogFilePath} log:`, err);
    });

    if (!this.options.noAutoStart) {
      this.watch();
    }
  }

  on(stateOrCustomEvent: LogNotifierState | string, callback: LogNotifierMatchCallback) {
    return super.on(stateOrCustomEvent, callback);
  }

  emit(stateOrCustomEvent: LogNotifierState | string, data: any) {
    this.ws.emit(this.namespaceEvent(stateOrCustomEvent), data);
    return super.emit(stateOrCustomEvent, data);
  }

  emitToWsId(id: string, stateOrCustomEvent: LogNotifierState | string, data: any) {
    return this.ws.to(id).emit(this.namespaceEvent(stateOrCustomEvent), data);
  }

  watch() {
    this.log(`Started watching ${this.relativeLogFilePath}`);
    this.tail.watch();
  }

  unwatch() {
    this.log(`Stopped watching ${this.relativeLogFilePath}`);
    this.tail.unwatch();
  }

  registerErrorMatch(match: string | RegExp): number {
    return this.registerMatcher(LogNotifierState.Error, match, async () => {
      await notify({
        title: this.name,
        message: `There was an error 💥`,
        sound: this.options.noSound || this.options.noErrorSound ? undefined : 'Basso',
      });
    });
  }

  registerRunningMatch(match: string | RegExp): number {
    return this.registerMatcher(LogNotifierState.Running, match, async () => {
      await notify({
        title: this.name,
        message: `You are ready to go! ⚡`,
        sound: this.options.noSound || this.options.noRunningSound ? undefined : 'Glass',
      });
    });
  }

  registerRestartingMatch(match: string | RegExp): number {
    return this.registerMatcher(LogNotifierState.Restarting, match, async () => {
      await notify({
        title: this.name,
        message: `Restarting, be back soon 🔄`,
        sound: this.options.noSound || this.options.noRestartSound ? undefined : 'Pebble',
      });
    });
  }

  registerStoppedMatch(match: string | RegExp): number {
    return this.registerMatcher(LogNotifierState.Stopped, match, async () => {
      await notify({
        title: this.name,
        message: `We're going down! 🔻`,
        sound: this.options.noSound || this.options.noStoppedSound ? undefined : 'Pong',
      });
    });
  }

  registerCustomMatch(customEventName: string, match: string | RegExp, callback: LogNotifierMatchCallback): number {
    return this.registerMatcher(customEventName, match, callback);
  }

  unregister(ids: number | number[]): void {
    const idsToRemove = Array.isArray(ids) ? ids : [ids];
    this.matchers = this.matchers.filter(matcher => !idsToRemove.includes(matcher.id));
  }

  private namespaceEvent(event: string): string {
    return `${this.name}_${event}`;
  }

  private registerMatcher(
    event: LogNotifierState | string,
    matchInput: string | RegExp,
    callback: LogNotifierMatchCallback,
  ): number {
    const id = Math.round(Math.random() * 9999999);

    // we always use a regex when looking for matches, but if they pass in a string, we escape it so it only matches exact matches
    const match = typeof matchInput === 'string' ? new RegExp(this.escapeStringRegExp(matchInput)) : matchInput;

    this.matchers = [
      ...this.matchers,
      {
        id,
        match,
        callback,
        event,
      },
    ];

    return id;
  }

  // from https://github.com/sindresorhus/escape-string-regexp/blob/ba9a4473850cb367936417e97f1f2191b7cc67dd/index.js#L1 (didn't want to mess with mjs)
  private escapeStringRegExp(str: string): string {
    return str
      .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
      .replace(/-/g, '\\x2d');
  }

  private log(...args: any[]) {
    const timestamp = new Date().toTimeString().replace(/^([\d:]+) .*/, '$1');
    console.log(`${chalk.grey(timestamp)} [${chalk.green(this.constructor.name)}] (${chalk.yellow(this.name)})`, ...args);
  }
}
