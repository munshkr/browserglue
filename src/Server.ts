import WebSocket from 'ws';
import dgram from 'dgram';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { JSONRPCServer } from 'json-rpc-2.0';
import { EventEmitter } from 'events';
import { DEFAULT_PORT } from './defaults';
import Debug from "debug";

const debug = Debug("browserglue").extend("server");

interface ServerChannel {
  path: string;
  port?: number;
  subscribedPorts: number[];
}

interface ServerOptions {
  host?: string;
  port?: number;
}

type AddChannelParams = { path: string, port?: number, sendPort?: number };
type RemoveChannelParams = { path: string };
type BindPortParams = { path: string, port: number };
type UnbindPortParams = { path: string };
type SubscribePortParams = { path: string, port: number };
type UnsubscribePortParams = { path: string, port: number };
type UnsubscribeAllPortsParams = { path: string };

const buildRPCServer = (server: Server) => {
  // Create JSON-RPC server
  const rpcServer = new JSONRPCServer();

  // Define RPC methods
  rpcServer.addMethod("getVersion", () => {
    return __VERSION__;
  })

  rpcServer.addMethod("addChannel", ({ path, port, sendPort }: AddChannelParams) => {
    return server.addChannel(path, port, sendPort);
  })

  rpcServer.addMethod("removeChannel", ({ path }: RemoveChannelParams) => {
    return server.removeChannel(path);
  })

  rpcServer.addMethod("removeAllChannels", () => {
    server.removeAllChannels();
  })

  rpcServer.addMethod("bindPort", ({ path, port }: BindPortParams) => {
    return server.bindPort(path, port);
  })

  rpcServer.addMethod("unbindPort", ({ path }: UnbindPortParams) => {
    return server.unbindPort(path);
  })

  rpcServer.addMethod("subscribePort", ({ path, port }: SubscribePortParams) => {
    return server.subscribePort(path, port);
  });

  rpcServer.addMethod("unsubscribePort", ({ path, port }: UnsubscribePortParams) => {
    return server.unsubscribePort(path, port);
  });

  rpcServer.addMethod("unsubscribeAllPorts", ({ path }: UnsubscribeAllPortsParams) => {
    return server.unsubscribeAllPorts(path);
  })

  return rpcServer;
}

const eventsToBroadcast = [
  'changed',
  'add-channel',
  'remove-channel',
  'bind-port',
  'unbind-port',
  'subscribe-port',
  'unsubscribe-port'
];

class Server {
  readonly host: string;
  readonly port: number;

  protected _emitter: EventEmitter;
  protected _wss: WebSocket.Server;
  protected _channels: { [path: string]: ServerChannel };
  protected _sockets: { [path: string]: dgram.Socket };
  protected _wsClients: { [path: string]: Set<WebSocket> };
  protected _wsEventClients: Set<WebSocket>;
  protected _server: string;

  constructor({ host, port }: ServerOptions = { host: 'localhost', port: DEFAULT_PORT }) {
    this.host = host;
    this.port = port;

    this._emitter = new EventEmitter();
    this._channels = {};
    this._sockets = {};
    this._wsClients = {};
    this._wsEventClients = new Set();
  }

  start() {
    // Create WebSockets servers for both RPC interface and data
    const wss = new WebSocket.Server({ noServer: true });
    this._wss = wss;

    const wsDebug = debug.extend('ws');

    wss.on('connection', (ws, req) => {
      wsDebug('connection: %o', req.url);

      // TODO: Check if url is any of the valid paths (/events, /data/*), and throw error otherwise
      if (req.url.startsWith('/data')) {
        const path = req.url.split('/data')[1];
        if (!this._wsClients[path]) {
          this._wsClients[path] = new Set();
        }
        this._wsClients[path].add(ws);

        ws.on('message', (data) => {
          wsDebug('%s received: %s', path, data);
          this._broadcast(path, data);
        });

      } else if (req.url.startsWith('/events')) {
        this._wsEventClients.add(ws);

        // Send a "change" payload so that client has the latest server state
        debug("Send first 'change' event to have latest state");
        const payload = { event: "change", message: this._channels };
        ws.send(JSON.stringify(payload));
      }

      ws.on('error', (err) => {
        wsDebug('client error: %o', err)
      });

      ws.on('close', () => {
        wsDebug('client closed');
      });
    });

    const app = express();

    app.use(bodyParser.json());

    // Allow RPC requests from anywhere
    // TODO: Maybe allow CORS only on some trusted hosts specified by the user?
    app.use(cors());

    // Create and setup JSON-RPC server
    const rpcServer = buildRPCServer(this);

    // Setup HTTP endpoint for JSON-RPC server
    app.post("/json-rpc", (req, res) => {
      const jsonRPCRequest = req.body;
      // server.receive takes a JSON-RPC request and returns a promise of a JSON-RPC response.
      rpcServer.receive(jsonRPCRequest).then((jsonRPCResponse) => {
        if (jsonRPCResponse) {
          res.json(jsonRPCResponse);
        } else {
          // If response is absent, it was a JSON-RPC notification method.
          // Respond with no content status (204).
          res.sendStatus(204);
        }
      });
    });

    // Create HTTP server and start listening
    const server = app.listen(this.port, this.host);
    this._server = server;

    // Handle upgrade requests to WebSockets
    server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    const debugServer = debug.extend('http');

    server.on('listening', () => {
      debugServer('listening');
      this._emitter.emit('listening');
    });

    server.on('close', () => {
      debugServer('closed');
      this._emitter.emit('close');
    });

    server.on('error', (err) => {
      debugServer('error: %o', err);
      this._emitter.emit('error', err);
    });

    // For every event to broadcast, send to all WS clients subscribed to /events
    eventsToBroadcast.forEach(event => {
      this._emitter.on(event, (message => {
        this._emitServerEvent(event, message);
        // Also send a "change" event with the Server state (channels object)
        this._emitServerChangeEvent();
      }));
    });
  }

  on(event: string, cb: (...args: any[]) => void) {
    return this._emitter.on(event, cb);
  }

  addChannel(path: string, port?: number, sendPort?: number): ServerChannel {
    // If channel already exists, return it
    if (Object.keys(this._channels).includes(path)) {
      debug("Channel already exists");
      return this._channels[path];
    }

    debug(`Add channel ${path}`)
    const newChannel: ServerChannel = {
      path,
      port,
      subscribedPorts: []
    };
    this._channels[path] = newChannel;
    this._emitter.emit("add-channel", { path });

    const socket = dgram.createSocket('udp4');
    this._sockets[path] = socket;

    // If port argument is present, bind it
    if (port) {
      this.bindPort(path, port);
    }

    // If sendPort is present, subscribe it
    if (sendPort) {
      this.subscribePort(path, sendPort);
    }

    return newChannel;
  }

  removeChannel(path: string): boolean {
    const socket = this._sockets[path];
    if (socket) {
      debug(`Remove channel %s`, path);
      try {
        socket.close();
      } catch (err) {
        debug("Socket is already closed: %o", err);
      }
    }
    // Clean up
    delete this._channels[path];
    delete this._sockets[path];
    delete this._wsClients[path];
    if (!socket) return false;
    this._emitter.emit("remove-channel", { path });
    return true;
  }

  removeAllChannels(): void {
    debug("Remove all channels");
    Object.keys(this._channels).forEach((path) => {
      this.removeChannel(path);
    });
  }

  bindPort(path: string, port: number): boolean {
    const channel = this._channels[path];
    if (!channel) return false;

    if (channel.port) {
      if (channel.port === port) {
        debug(`Channel %s socket already binded to %d`, path, port);
        return false;
      }

      debug(
        `Channel %s already has a binded port at %d. ` +
        `Will re-create socket.`, path, channel.port);
      try {
        this._sockets[path].close();
      } catch (err) {
        debug("Socket is already closed: %o", err);
      }
      this._sockets[path] = dgram.createSocket('udp4');
    }

    const socket = this._sockets[path];
    const udpDebug = debug.extend('udp');

    socket.on('listening', () => {
      const address = socket.address();
      udpDebug(`Socket binded at port %d`, address.port);
    })

    socket.on('error', (err) => {
      udpDebug(`socket error:\n%o`, err.stack);
      socket.close();
      // TODO: Reject promise with error?
    });

    socket.on('message', (buffer, rinfo) => {
      udpDebug(`socket got: %s from %s:%d`, port, rinfo.address, rinfo.port);

      // Broadcast message to all subscribed clients on /data/{path}
      const wsClients = this._wsClients[path] || [];
      wsClients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(buffer);
        }
      })
    });

    debug(`Bind socket of channel %s to port %d`, path, port);
    socket.bind({ address: '0.0.0.0', port });
    channel.port = port;

    this._emitter.emit("bind-port", { path, port });

    return true;
  }

  unbindPort(path: string): boolean {
    const channel = this._channels[path];
    if (!channel) return false;

    debug(`Unbind port of socket channel %s`, path);

    // Try to close socket
    const oldSocket = this._sockets[path];
    try {
      oldSocket.close();
    } catch (err) {
      debug("Socket is already closed: %o", err);
    }
    channel.port = null;

    // Create new socket
    const socket = dgram.createSocket('udp4');
    this._sockets[path] = socket;

    this._emitter.emit("unbind-port", { path });
    return true;
  }

  subscribePort(path: string, port: number): boolean {
    if (!this._channels[path]) return false;
    debug(`Subscribe port %d on channel %s`, port, path);
    if (!this._channels[path].subscribedPorts.includes(port)) {
      this._channels[path].subscribedPorts.push(port);
    }
    this._emitter.emit("subscribe-port", { path, port });
    return true;
  }

  unsubscribePort(path: string, port: number): boolean {
    if (!this._channels[path]) return false;
    debug(`Unsubscribe port %d from channel %s`, port, path);
    const newPorts = this._channels[path].subscribedPorts.filter(p => p != port);
    if (newPorts == this._channels[path].subscribedPorts) return false;
    this._channels[path].subscribedPorts = newPorts;
    this._emitter.emit("unsubscribe-port", { path, port });
    return true;
  }

  unsubscribeAllPorts(path: string): boolean {
    if (!this._channels[path]) return false;
    debug(`Unsubscribe all ports from channel %s`, path);
    const oldSubscribedPorts = this._channels[path].subscribedPorts;
    this._channels[path].subscribedPorts = [];
    oldSubscribedPorts.forEach(port => {
      this._emitter.emit("unsubscribe-port", { path, port });
    });
    return true;
  }

  protected _broadcast(path: string, data: any): void {
    const channel = this._channels[path];
    const socket = this._sockets[path];
    if (!socket || !channel) return;

    const subscribedPorts = channel.subscribedPorts;
    if (socket && subscribedPorts) {
      subscribedPorts.forEach(port => {
        socket.send(data, port);
      });
    }
  }

  protected _emitServerChangeEvent() {
    this._emitServerEvent("change", this._channels);
  }

  protected _emitServerEvent(event: string | symbol, message?: Object) {
    const payload = { event, message };
    this._wsEventClients.forEach(ws => {
      ws.send(JSON.stringify(payload));
    });
  }
}

export default Server;
