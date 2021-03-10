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
  subscribedPorts: Set<number>;
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
    server.addChannel(path, port, sendPort);
  })

  rpcServer.addMethod("removeChannel", ({ path }: RemoveChannelParams) => {
    server.removeChannel(path);
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
  server: string;

  constructor({ host, port }: ServerOptions = { host: 'localhost', port: 8000 }) {
    this.host = host;
    this.port = port;

    this.emitter = new EventEmitter();
    this.channels = {};
    this.sockets = {};
  }

  start() {
    // Create WebSockets servers for both RPC interface and data
    const wss = new WebSocket.Server({ noServer: true });
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      console.debug('[data] connection')

      // messages from client ignored for now...
      ws.on('message', (message) => {
        console.log('[ws] received: %s', message);
        this._broadcast({ req, message });
      });

      ws.on('error', (err) => {
        console.debug('[data] client error:', err)
      });

      ws.on('close', () => {
        console.debug('[data] client closed');
      });

      this.emitter.emit('data-connection');
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
      console.debug('[server] listening')
      this.emitter.emit('listening');
    });

    server.on('close', () => {
      console.debug('[server] closed');
      this.emitter.emit('close');
    });

    server.on('error', () => {
      console.debug('[server] error');
      this.emitter.emit('error');
    });
  }

  on(event: string, cb: (...args: any[]) => void) {
    return this.emitter.on(event, cb);
  }

  addChannel(path: string, port?: number, sendPort?: number): boolean {
    // If socket already exists, return false
    if (Object.keys(this.channels).includes(path)) return false;

    console.debug(`Add channel ${path} (receive port: ${port || "none"}, send port: ${sendPort || "none"}`)
    const newChannel: ServerChannel = {
      path,
      port,
      subscribedPorts: new Set
    };
    this.channels[path] = newChannel;

    const socket = dgram.createSocket('udp4');

    socket.on('listening', () => {
      const address = socket.address();
      console.debug(`[udp] Socket binded at port ${address.port}`);
      this.sockets[path] = socket;
    })

    socket.on('error', (err) => {
      console.debug(`[udp] socket error:\n${err.stack}`);
      socket.close();
      // TODO: Reject promise with error?
    });

    socket.on('message', (msg, rinfo) => {
      console.debug(`[udp] socket got: ${msg} from ${rinfo.address}:${rinfo.port}`);

      // Broadcast message to all subscribed clients
      const payload = JSON.stringify({ path, data: msg });
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      })
    })

    // Only bind socket if port argument is present
    if (port) {
      this.bindPort(path, port);
    }

    return true;
  }

  removeChannel(path: string): boolean {
    const socket = this.sockets[path];
    if (socket) {
      console.debug(`Remove channel ${path}`);
      try {
        socket.close();
      } catch (err) {
        console.warn("Socket is already closed? Clean up", err, JSON.stringify(socket));
      }
      delete this.channels[path];
      return true;
    }
    return false;
  }

  removeAllChannels(): void {
    console.debug("Remove all channels");
    Object.keys(this.channels).forEach((path) => {
      this.removeChannel(path);
    });
  }

  getChannels(): ServerChannel[] {
    console.debug("Get channels");
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
    return true;
  }

  subscribePort(path: string, port: number): boolean {
    if (!this.channels[path]) return false;
    console.log(`Subscribe port ${port} on channel ${path}`);
    this.channels[path].subscribedPorts.add(port);
    return true;
  }

  unsubscribePort(path: string, port: number): boolean {
    if (!this.channels[path]) return false;
    console.log(`Unsubscribe port ${port} from channel ${path}`);
    this.channels[path].subscribedPorts.delete(port);
    return true;
  }

  unsubscribeAllPorts(path: string): boolean {
    if (!this.channels[path]) return false;
    console.log(`Unsubscribe all ports from channel ${path}`);
    this.channels[path].subscribedPorts.clear();
    return true;
  }

  _broadcast(obj) {
    // TODO: get channel path from request), then send message to all subscribed ports of that channel (if exists)
    console.log(obj);
  }
}

export default Server;
