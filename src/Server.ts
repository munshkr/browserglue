import WebSocket from 'ws';
import dgram from 'dgram';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { JSONRPCServer } from 'json-rpc-2.0';
import { EventEmitter } from 'events';

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
type SubscribePortParams = { path: string, port: number };
type UnsubscribePortParams = { path: string, port: number };
type UnsubscribeAllPortsParams = { path: string };

const buildRPCServer = (server: Server) => {
  // Create JSON-RPC server
  const rpcServer = new JSONRPCServer();

  // Define RPC methods
  rpcServer.addMethod("addChannel", ({ path, port, sendPort }: AddChannelParams) => {
    return server.addChannel(path, port, sendPort);
  })

  rpcServer.addMethod("removeChannel", ({ path }: RemoveChannelParams) => {
    return server.removeChannel(path);
  })

  rpcServer.addMethod("removeAllChannels", () => {
    server.removeAllChannels();
  })

  rpcServer.addMethod("getChannels", () => {
    return server.getChannels();
  })

  rpcServer.addMethod("bindPort", ({ path, port }: BindPortParams) => {
    server.bindPort(path, port);
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

class Server {
  host: string;
  port: number;
  emitter: EventEmitter;
  wss: WebSocket.Server;
  channels: { [path: string]: ServerChannel };
  sockets: { [path: string]: dgram.Socket };
  wsClients: { [path: string]: Set<WebSocket> };
  wsEventClients: Set<WebSocket>;
  server: string;

  constructor({ host, port }: ServerOptions = { host: 'localhost', port: 8000 }) {
    this.host = host;
    this.port = port;

    this.emitter = new EventEmitter();
    this.channels = {};
    this.sockets = {};
    this.wsClients = {};
    this.wsEventClients = new Set();
  }

  start() {
    // Create WebSockets servers for both RPC interface and data
    const wss = new WebSocket.Server({ noServer: true });
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      console.debug('[ws] connection:', req.url);

      // TODO: Check if url is any of the valid paths (/events, /data/*), and throw error otherwise
      if (req.url.startsWith('/data')) {
        const path = req.url.split('/data')[1];
        if (!this.wsClients[path]) {
          this.wsClients[path] = new Set();
        }
        this.wsClients[path].add(ws);

        ws.on('message', (data) => {
          console.log('[ws] %s received: %s', path, data);
          this._broadcast(path, data);
        });

      } else if (req.url.startsWith('/events')) {
        this.wsEventClients.add(ws);
      }

      ws.on('error', (err) => {
        console.debug('[ws] client error:', err)
      });

      ws.on('close', () => {
        console.debug('[ws] client closed');
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
    this.server = server;

    // Handle upgrade requests to WebSockets
    server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    server.on('listening', () => {
      console.debug('[server] listening');
      this.emitter.emit('listening');
    });

    server.on('close', () => {
      console.debug('[server] closed');
      this.emitter.emit('close');
    });

    server.on('error', (err) => {
      console.debug('[server]', err);
      this.emitter.emit('error', err);
    });
  }

  on(event: string, cb: (...args: any[]) => void) {
    return this.emitter.on(event, cb);
  }

  addChannel(path: string, port?: number, sendPort?: number): ServerChannel {
    // If channel already exists, throw exception
    if (Object.keys(this.channels).includes(path)) {
      console.error("Channel already exists");
      throw 'Channel already exists';
    }

    console.debug(`Add channel ${path}`)
    const newChannel: ServerChannel = {
      path,
      port,
      subscribedPorts: []
    };
    this.channels[path] = newChannel;
    this._emitServerEvent("add-channel", { path });

    const socket = dgram.createSocket('udp4');
    this.sockets[path] = socket;

    socket.on('listening', () => {
      const address = socket.address();
      console.debug(`[udp] Socket binded at port ${address.port}`);
    })

    socket.on('error', (err) => {
      console.debug(`[udp] socket error:\n${err.stack}`);
      socket.close();
      // TODO: Reject promise with error?
    });

    socket.on('message', (buffer, rinfo) => {
      console.debug(`[udp] socket got: ${buffer} from ${rinfo.address}:${rinfo.port}`);

      // Broadcast message to all subscribed clients on /data/{path}
      const wsClients = this.wsClients[path] || [];
      wsClients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(buffer);
        }
      })
    })

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
    const socket = this.sockets[path];
    if (socket) {
      console.debug(`Remove channel ${path}`);
      try {
        socket.close();
      } catch (err) {
        console.warn("Socket is already closed?", err);
      }
    }
    // Clean up
    delete this.channels[path];
    delete this.sockets[path];
    delete this.wsClients[path];
    if (!socket) return false;
    this._emitServerEvent("remove-channel", { path });
    return true;
  }

  removeAllChannels(): void {
    console.debug("Remove all channels");
    Object.keys(this.channels).forEach((path) => {
      this.removeChannel(path);
    });
  }

  // deprecated
  getChannels(): ServerChannel[] {
    console.debug("Get channels:", Object.entries(this.channels));
    return Object.values(this.channels);
  }

  bindPort(path: string, port: number): boolean {
    if (!this.channels[path]) return false;
    const socket = this.sockets[path];
    if (!socket) return false;
    console.log(`Bind socket of channel ${path} to port ${port}`);
    socket.bind({
      address: '0.0.0.0',
      port
    });
    this._emitServerEvent("bind-port", { path, port });
    return true;
  }

  subscribePort(path: string, port: number): boolean {
    if (!this.channels[path]) return false;
    console.log(`Subscribe port ${port} on channel ${path}`);
    if (!this.channels[path].subscribedPorts.includes(port)) {
      this.channels[path].subscribedPorts.push(port);
    }
    this._emitServerEvent("subscribe-port", { path, port });
    return true;
  }

  unsubscribePort(path: string, port: number): boolean {
    if (!this.channels[path]) return false;
    console.log(`Unsubscribe port ${port} from channel ${path}`);
    const newPorts = this.channels[path].subscribedPorts.filter(p => p != port);
    if (newPorts == this.channels[path].subscribedPorts) return false;
    this.channels[path].subscribedPorts = newPorts;
    this._emitServerEvent("unsubscribe-port", { path, port });
    return true;
  }

  unsubscribeAllPorts(path: string): boolean {
    if (!this.channels[path]) return false;
    console.log(`Unsubscribe all ports from channel ${path}`);
    const oldSubscribedPorts = this.channels[path].subscribedPorts;
    this.channels[path].subscribedPorts = [];
    oldSubscribedPorts.forEach(port => {
      this._emitServerEvent("unsubscribe-port", { path, port });
    });
    return true;
  }

  protected _broadcast(path: string, data: any): void {
    const channel = this.channels[path];
    const socket = this.sockets[path];
    if (!socket || !channel) return;

    const subscribedPorts = channel.subscribedPorts;
    if (socket && subscribedPorts) {
      subscribedPorts.forEach(port => {
        socket.send(data, port);
      });
    }
  }

  protected _emitServerChangeEvent() {
    this._emitServerEvent("change", this.channels);
  }

  protected _emitServerEvent(event: string | symbol, message: any) {
    const payload = { event, message };
    this.wsEventClients.forEach(ws => {
      ws.send(JSON.stringify(payload));
    });
    this._emitServerChangeEvent();
  }
}

export default Server;
