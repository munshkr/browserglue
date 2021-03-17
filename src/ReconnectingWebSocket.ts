import WebSocket from 'isomorphic-ws';
import { EventEmitter } from 'events';

interface Options {
  autoConnect?: boolean;
  reconnectTimeoutInterval?: number;
}

class ReconnectingWebSocket {
  url: string;
  reconnectTimeoutInterval: number;

  protected _ws: WebSocket;
  protected _emitter: EventEmitter;
  protected _started: boolean;
  protected _connected: boolean;
  protected _reconnectTimeout: NodeJS.Timeout;
  protected _isReconnecting: boolean;

  constructor(url: string, options?: Options) {
    const { autoConnect, reconnectTimeoutInterval }: Options = Object.assign({}, options, {
      autoConnect: true,
      reconnectTimeoutInterval: 5000
    });

    this.url = url;
    this.reconnectTimeoutInterval = reconnectTimeoutInterval;

    this._started = false;
    this._connected = false;
    this._emitter = new EventEmitter();

    if (autoConnect) this.connect();
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): ReconnectingWebSocket {
    if (this.connected) return this;
    this._started = true;
    this._connect();
    return this;
  }

  disconnect(): ReconnectingWebSocket {
    this._started = false;
    clearTimeout(this._reconnectTimeout);
    this._ws.close();
    return this;
  }

  on(event: string | symbol, listener: (...args: any[]) => void): ReconnectingWebSocket {
    this._emitter.on(event, listener);
    return this;
  }

  send(data: any): ReconnectingWebSocket {
    this._ws.send(data);
    return this;
  }

  protected _connect() {
    if (this._ws) this._ws.close();

    this._ws = new WebSocket(this.url);
    const ws = this._ws;

    clearTimeout(this._reconnectTimeout);

    ws.onopen = (event: WebSocket.OpenEvent) => {
      if (!this._connected) this._emitter.emit('connect');
      this._connected = true;
      this._isReconnecting = false;
      this._emitter.emit('open', event);
    };

    ws.onclose = (event: WebSocket.CloseEvent) => {
      if (this._connected) this._emitter.emit('disconnect');
      this._connected = false;
      this._isReconnecting = false;
      if (this._started) this._reconnect();
      this._emitter.emit('close', event);
    };

    ws.onerror = (event: WebSocket.ErrorEvent) => this._emitter.emit('error', event.error);
    ws.onmessage = (event: WebSocket.MessageEvent) => this._emitter.emit('message', event);
  }

  protected _reconnect() {
    // If is reconnecting so do nothing
    if (this._isReconnecting || this._connected || !this._started) {
      return;
    }
    // Set timeout
    this._isReconnecting = true;
    clearTimeout(this._reconnectTimeout);
    this._reconnectTimeout = setTimeout(() => {
      console.debug('[ws] Reconnecting to', this.url);
      this._connect();
    }, this.reconnectTimeoutInterval);
  }
}

export default ReconnectingWebSocket;
