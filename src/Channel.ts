import Client from "./Client";
import WebSocket from "isomorphic-ws";
import EventEmitter from "events";
import ReconnectingWebSocket from "./ReconnectingWebSocket";

class Channel {
  readonly path: string;

  protected _client: Client;
  protected _subscribedPorts: number[];
  protected _port: number;
  protected _open: boolean;
  protected _ws: ReconnectingWebSocket;
  protected _emitter: EventEmitter;

  constructor(client: Client, path: string, subscribedPorts: number[], port?: number) {
    this.path = path;

    this._client = client;
    this._subscribedPorts = subscribedPorts;
    this._port = port;
    this._open = true;

    this._emitter = new EventEmitter();
    this._ws = this._createDataWebSocket();
  }

  get port(): number {
    return this._port;
  }

  get subscribedPorts(): number[] {
    return this._subscribedPorts;
  }

  on(listener: (...args: any[]) => void): boolean {
    if (!this._open) return false;
    this._emitter.on('message', listener);
    return true;
  }

  publish(message: any): boolean {
    if (!this._open) return false;
    this._client.publish(this.path, message);
    return true;
  }

  bindPort(port: number): boolean {
    if (!this._open) return false;
    const result = this._client.bindPort(this.path, port);
    if (result) this._port = port;
    return true;
  }

  subscribePort(port: number): boolean {
    if (!this._open) return false;
    const result = this._client.subscribePort(this.path, port);
    // TODO: subscribedPorts should be updated automatically with events from client
    if (result) {
      if (!this._subscribedPorts.includes(port)) this._subscribedPorts.push(port);
    }
    return true;
  }

  unsubscribePort(port: number): boolean {
    if (!this._open) return false;
    const result = this._client.unsubscribePort(this.path, port);
    // TODO: subscribedPorts should be updated automatically with events from client
    if (result) {
      const newPorts = this._subscribedPorts.filter(p => p != port);
      this._subscribedPorts = newPorts;
    }
    return true;
  }

  unsubscribeAllPorts(): boolean {
    if (!this._open) return false;
    const result = this._client.unsubscribeAllPorts(this.path);
    // TODO: subscribedPorts should be updated automatically with events from client
    if (result) {
      this._subscribedPorts = [];
    }
    return true;
  }

  remove(): boolean {
    if (!this._open) return false;
    this._open = false;
    this._client.removeChannel(this.path);
    return true;
  }

  protected _createDataWebSocket() {
    const ws = new ReconnectingWebSocket(`${this._client.url}/data${this.path}`);

    ws.on('message', (event: WebSocket.MessageEvent) => {
      this._emitter.emit('message', event);
    });

    return ws;
  }
}

export default Channel;
