import { JSONRPCClient } from 'json-rpc-2.0';
import WebSocket from 'isomorphic-ws';

type ClientOptions = {
  connect?: boolean;
  autoReconnect?: boolean;
}

type QueueItem = {
  type: string;
  payload: any;
}

class Client {
  _url: string;
  _autoReconnect: boolean;

  _started: boolean;
  _connected: boolean;
  _ws: WebSocket;
  _reconnectTimeout: NodeJS.Timeout;
  _queue: QueueItem[];
  _isReconnecting: boolean;

  constructor(url: string = 'ws://localhost:8000', { autoReconnect }: ClientOptions = { autoReconnect: true }) {
    this._url = url;
    this._autoReconnect = autoReconnect;

    this._started = false;
    this._connected = false;
  }

  get url(): string {
    return this._url;
  }

  get connected(): boolean {
    return this._connected;
  }

  get autoReconnect(): boolean {
    return this._autoReconnect;
  }

  set autoReconnect(newValue: boolean) {
    this._autoReconnect = newValue;
  }

  connect(): void {
    this._started = true;
    return this._connect();
  }

  disconnect(): void {
    this._started = false;
    if (this._connected) {
      this._ws.close();
    }
  }

  addMapping(id: string, port: number) {

  }

  removeMapping(id: string) {

  }

  listMappings() {

  }

  send(id: string, message: Object) {

  }

  broadcast(message: Object) {

  }

  on(id: string, cb: (message: Object) => void) {

  }

  _runQueue() {
    if (this._queue.length) {
      this._queue.forEach((q, index) => {
        // switch (q.type) {
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