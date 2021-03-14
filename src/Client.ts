import { JSONRPCClient } from 'json-rpc-2.0';
import { EventEmitter } from 'events';
import WebSocket from 'isomorphic-ws';
import ReconnectingWebSocket from './ReconnectingWebSocket';
import Channel, { ServerChannel } from './Channel';

type ServerEventWSPayload = {
  event: string,
  message: Object,
}

const buildRPCClient = (wsUrl: string): JSONRPCClient => {
  const [scheme, hostnamePort] = wsUrl.split('://');
  const secure = scheme == 'wss';
  const httpScheme = secure ? 'https' : 'http';
  const url = `${httpScheme}://${hostnamePort}/json-rpc`;

  // JSONRPCClient needs to know how to send a JSON-RPC request.
  // Tell it by passing a function to its constructor. The function must take a JSON-RPC request and send it.
  const client = new JSONRPCClient((jsonRPCRequest) =>
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(jsonRPCRequest),
    }).then((response) => {
      if (response.status == 200) {
        // Use client.receive when you received a JSON-RPC response.
        return response
          .json()
          .then((jsonRPCResponse) => client.receive(jsonRPCResponse));
      } else if (jsonRPCRequest.id) {
        return Promise.reject(new Error(response.statusText));
      }
    })
  );

  return client;
}

class Client {
  readonly url: string;

  protected _channels: { [path: string]: Channel };
  protected _emitter: EventEmitter;
  protected _rpcClient: JSONRPCClient;
  protected _ws: ReconnectingWebSocket;
  protected _channelWss: { [path: string]: ReconnectingWebSocket };

  constructor(url: string = 'ws://localhost:8000') {
    this.url = url;

    this._emitter = new EventEmitter();
    this._channelWss = {};

    this._rpcClient = buildRPCClient(url);
    this._ws = this._createEventsWebSocket();
  }

  get connected(): boolean {
    return this._ws.connected;
  }

  get channels(): { [path: string]: Channel } {
    return { ...this._channels };
  }

  connect(): void {
    if (this.connected) return;
    this._ws.connect();
  }

  disconnect(): void {
    this._ws.disconnect();
  }

  async addChannel(path: string, port?: number, sendPort?: number): Promise<Channel> {
    const c: ServerChannel = await this._call("addChannel", { path, port, sendPort });
    const dataWs = this._createDataWebSocket(path);
    this._channelWss[path] = dataWs;
    return new Channel(this, c.path, c.subscribedPorts, c.port);
  }

  async removeChannel(path: string): Promise<void> {
    await this._call("removeChannel", { path });
    const dataWs = this._channelWss[path];
    if (dataWs) dataWs.disconnect();
    delete this._channelWss[path];
  }

  removeAllChannels(): PromiseLike<void> {
    return this._call("removeAllChannels");
  }

  async getChannels(): Promise<Channel[]> {
    const channels: ServerChannel[] = await this._call("getChannels");
    return channels.map((c: ServerChannel) => {
      return new Channel(this,
        c.path,
        c.subscribedPorts,
        c.port);
    });
  }

  bindPort(path: string, port: number): PromiseLike<boolean> {
    return this._call("bindPort", { path, port });
  }

  subscribePort(path: string, port: number): PromiseLike<boolean> {
    return this._call("subscribePort", { path, port });
  }

  unsubscribePort(path: string, port: number): PromiseLike<boolean> {
    return this._call("unsubscribePort", { path, port });
  }

  unsubscribeAllPorts(path: string): PromiseLike<boolean> {
    return this._call("unsubscribeAllPorts", { path });
  }

  on(type: string, cb: (message: Object) => void): Client {
    this._emitter.on(type, cb);
    return this;
  }

  publish(path: string, data: any): boolean {
    const dataWs = this._channelWss[path];
    if (!dataWs) return false;
    dataWs.send(data);
    return true;
  }

  protected _call(cmd: string, params?: { [name: string]: any }): PromiseLike<any> {
    // The request() function returns a promise of the result.
    return this._rpcClient.request(cmd, params);
  }

  protected _createEventsWebSocket(): ReconnectingWebSocket {
    const ws = new ReconnectingWebSocket(`${this.url}/events`);

    ws.on('message', (ev: WebSocket.MessageEvent) => {
      const payload = JSON.parse(ev.data as string) as ServerEventWSPayload;
      const { event, message } = payload;
      this._emitter.emit(event, message);

      // Emit `change:${path}` events so that each Channel instance gets updated
      if (event == 'change') {
        const channels = message as { [path: string]: ServerChannel };
        Object.entries(channels).forEach(([path, channel]: [string, ServerChannel]) => {
          this._emitter.emit(`change:${path}`, channel);
        });
      }
    });

    return ws;
  }

  protected _createDataWebSocket(path: string) {
    const ws = new ReconnectingWebSocket(`${this.url}/data${path}`);

    ws.on('message', (event: WebSocket.MessageEvent) => {
      this._emitter.emit('message', { path, data: event.data });
      this._emitter.emit(`message:${path}`, event.data);
    });

    return ws;
  }
}

export default Client;
