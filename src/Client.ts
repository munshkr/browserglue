import { JSONRPCClient } from 'json-rpc-2.0';
import WebSocket from 'isomorphic-ws';
import { EventEmitter } from 'events';
import Channel from './Channel';

interface ClientOptions {
  connect?: boolean;
  autoReconnect?: boolean;
}

interface ServerChannel {
  path: string;
  port: number;
  subscribedPorts: number[];
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
  autoReconnect: boolean;

  protected _started: boolean;
  protected _connected: boolean;
  protected _emitter: EventEmitter;
  protected _rpcClient: JSONRPCClient;
  protected _ws: WebSocket;
  protected _reconnectTimeout: NodeJS.Timeout;
  protected _isReconnecting: boolean;

  constructor(url: string = 'ws://localhost:8000', { autoReconnect }: ClientOptions = { autoReconnect: true }) {
    this.url = url;
    this.autoReconnect = autoReconnect;

    this._started = false;
    this._connected = false;
    this._emitter = new EventEmitter();

    this._rpcClient = buildRPCClient(url);
  }

  get connected(): boolean {
    return this._connected;
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

  async addChannel(path: string, port?: number, sendPort?: number): Promise<Channel> {
    const c: ServerChannel = await this._call("addChannel", { path, port, sendPort });
    return new Channel(this, c.path, c.subscribedPorts, c.port);
  }

  removeChannel(path: string): PromiseLike<void> {
    return this._call("removeChannel", { path });
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

  publish(path: string, message: any): Client {
    // TODO
    return this;
  }

  on(type: string, cb: (message: Object) => void): Client {
    // TODO: Use emitter to emit events on 'add', 'remove', 'change', 'connect', 'disconnect'
    this._emitter.on(type, cb);
    return this;
  }

  _call(cmd: string, params?: { [name: string]: any }): PromiseLike<any> {
    // The request() function returns a promise of the result.
    return this._rpcClient.request(cmd, params);
  }

  _connect() {
    this._ws = new WebSocket(this.url);
    const ws = this._ws;

    // Clear timeout of reconnect
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }

    ws.onopen = () => {
      this._connected = true;
      this._isReconnecting = false;
    };

    // ws.onmessage = (event) => {
    //   const { data } = event;
    //   // TODO ...
    // }

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
