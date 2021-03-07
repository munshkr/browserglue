import { JSONRPCClient } from 'json-rpc-2.0';
import WebSocket from 'isomorphic-ws';
import { EventEmitter } from 'events';
import Socket from './Socket';

type ClientOptions = {
  connect?: boolean;
  autoReconnect?: boolean;
}

type QueueItem = {
  cmd: string;
  args: { [name: string]: any };
  resolve: Function;
  reject: Function;
}

class Client {
  autoReconnect: boolean;

  protected _url: string;
  protected _started: boolean;
  protected _connected: boolean;
  protected _ws: WebSocket;
  protected _queue: QueueItem[];
  protected _reconnectTimeout: NodeJS.Timeout;
  protected _isReconnecting: boolean;
  protected _emitter: EventEmitter;

  constructor(url: string = 'ws://localhost:8000', { autoReconnect }: ClientOptions = { autoReconnect: true }) {
    this.autoReconnect = autoReconnect;

    this._url = url;
    this._started = false;
    this._connected = false;
    this._emitter = new EventEmitter();
  }

  get url(): string {
    return this._url;
  }

  get connected(): boolean {
    return this._connected;
  }

  get sockets(): string[] {
    return [];
  }

  connect(): Client {
    this._started = true;
    this._connect();
    return this;
  }

  disconnect(): Client {
    this._started = false;
    if (this._connected) {
      this._ws.close();
    }
    return this;
  }

  addSocket(port: number): Promise<Socket> {
    return this._call("addSocket", { port });
  }

  removeSocket(port: number): Promise<boolean> {
    return this._call("removeSocket", { port });
  }

  removeAllSockets(): Promise<boolean> {
    return this._call("removeAll");
  }

  send(port: number, message: any): Promise<void> {
    return this._call("send", { port, message });
  }

  broadcast(message: any): Promise<void> {
    return this._call("broadcast", { message });
  }

  on(type: string, cb: (message: Object) => void): Client {
    // TODO: Use emitter to emit events on 'add', 'remove', 'change', 'connect', 'disconnect'
    this._emitter.on(type, cb);
    return this;
  }

  _call(cmd: string, args?: { [name: string]: any }): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this._queue.push({ cmd, args, resolve, reject });
      if (this._connected) this._runQueue();
    });
  }

  _runQueue() {
    if (this._queue.length) {
      this._queue.forEach((msg, index) => {
        const { cmd, args, resolve, reject } = msg;


        // switch (msg.cmd) {
        //   case 'message':
        //     this.send(q.payload);

        //     break;

        //   default:
        //     break;
        // }

        // remove queue
        delete this._queue[index];
      });
    }
  }

  _connect() {
    this._ws = new WebSocket(this._url);
    const ws = this._ws;

    // Clear timeout of reconnect
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }

    ws.onopen = () => {
      this._connected = true;
      this._isReconnecting = false;

      this._runQueue();
    };

    ws.onerror = err => {
      console.error('Unable connect to the server:', err.error);

      this._connected = false;
      this._isReconnecting = false;
      if (this._started) {
        this._reconnect();
      }
    };

    ws.onclose = () => {
      console.log('Connection is closed');

      this._connected = false;
      this._isReconnecting = false;
      if (this._started) {
        this._reconnect();
      }
    };
  }

  _reconnect() {
    // If is reconnecting so do nothing
    if (this._isReconnecting || this._connected) {
      return;
    }
    // Set timeout
    this._isReconnecting = true;
    this._reconnectTimeout = setTimeout(() => {
      console.debug('Reconnecting....');
      this._connect();
    }, 2000);
  }
}

export default Client;