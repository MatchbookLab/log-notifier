import { LogNotifierBrowserBridge } from './browser-bridge';

export interface LogNotifierBrowserNotificationOptions {
  bgColor: string;
  textColor: string;
}

export const LogNotifierType: Record<'Info' | 'Error' | 'Warn', LogNotifierBrowserNotificationOptions> = {
  Info: { bgColor: '#3973e2', textColor: '#e2e2e2' },
  Error: { bgColor: '#e9543d', textColor: '#e2e2e2' },
  Warn: { bgColor: '#fdf062', textColor: '#222222' },
};

export class LogNotifierBrowserNotifications {
  private readonly wsUrl: string;
  private initialized: boolean = false;
  private notificationElem: HTMLElement | null = null;

  constructor(private name: string, wsUrlInput: string | number) {
    if (/^\d{4,5}$/.test(('' + wsUrlInput).trim())) {
      this.wsUrl = `http://localhost:${wsUrlInput}`;
    } else {
      this.wsUrl = '' + wsUrlInput;
    }
  }

  simpleNotifications() {
    const notifier = new LogNotifierBrowserBridge(this.name, this.wsUrl);

    notifier.on('restarting', () => {
      this.notify('Server is restarting.');
    });

    // notifier.on('DEBUG_EVENT', (eventName) => {
    //   console.log('eventName', eventName);
    // });

    notifier.on('error', () => {
      this.notify('Server has an error.', LogNotifierType.Error);
    });

    notifier.on('running', () => {
      // if the website reloaded when the server was down, it won't reload without help
      if (!this.initialized && !!this.notificationElem) {
        window.location.reload();
      }

      this.clearNotification();

      this.initialized = true;
    });
  }

  clearNotification() {
    if (this.notificationElem) {
      this.notificationElem.remove();
      this.notificationElem = null;
    }
  }

  notify(message: string, options: LogNotifierBrowserNotificationOptions = LogNotifierType.Info) {
    this.clearNotification();

    this.notificationElem = document.createElement('div');

    this.notificationElem.classList.add('log-notifier-notification');

    const styles: Partial<CSSStyleDeclaration> = {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      padding: '12px 16px',
      backgroundColor: options.bgColor,
      boxShadow: '0 2px 8px 0 rgba(75, 75, 75, 0.4)',
      borderRadius: '3px',
      zIndex: '10000',
      color: options.textColor,
    };

    Object.entries(styles).forEach(([style, val]) => {
      (<any>this.notificationElem).style[style] = val;
    });

    this.notificationElem.innerHTML = `<div style="font-weight: bold" class="log-notifier-notification-title">${this.name}</div><div class="log-notifier-notification-message">${message}</div>`;

    document.body.appendChild(this.notificationElem);
  }

  info(message: string) {
    this.notify(message, LogNotifierType.Info);
  }

  error(message: string) {
    this.notify(message, LogNotifierType.Error);
  }

  warn(message: string) {
    this.notify(message, LogNotifierType.Warn);
  }
}

(<any>globalThis).LogNotifierBrowserNotifications = LogNotifierBrowserNotifications;
