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
  autoReconnect: boolean;

  protected _url: string;
  protected _started: boolean;
  protected _connected: boolean;
  protected _ws: WebSocket;
  protected _queue: QueueItem[];
  protected _reconnectTimeout: NodeJS.Timeout;
  protected _isReconnecting: boolean;
  protected _emitter: EventEmitter;
  protected _rpcClient: JSONRPCClient;

  constructor(url: string = 'ws://localhost:8000', { autoReconnect }: ClientOptions = { autoReconnect: true }) {
    this.autoReconnect = autoReconnect;

    this._url = url;
    this._started = false;
    this._connected = false;
    this._emitter = new EventEmitter();

    this._rpcClient = buildRPCClient(url);
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

  async addSocket(port: number): Promise<Socket> {
    await this._call("addSocket", { port });
    return new Socket(this, port);
  }

  removeSocket(port: number): PromiseLike<void> {
    return this._call("removeSocket", { port });
  }

  removeAllSockets(): PromiseLike<void> {
    return this._call("removeAllSockets");
  }

  send(port: number, message: any): Client {
    this._call("send", { port, message });
    return this;
  }

  broadcast(message: any): Client {
    this._call("broadcast", { message });
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

  _runQueue() {
    if (this._queue.length) {
      this._queue.forEach((msg, index) => {
        const { cmd, args, resolve, reject } = msg;

        // TODO: Handle queue items
        // switch (msg.cmd) {
        //   case 'send':
        //     const payload = { ... }
        //     this.ws.send(JSON.stringify(payload));
        //     break;
        //   default:
        //     // TODO: Raise error?
        //     break;
        // }

        // Remove queue item
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