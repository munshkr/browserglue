import WebSocket from 'ws';
import dgram from 'dgram';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { JSONRPCServer } from 'json-rpc-2.0';
import { EventEmitter } from 'events';

type ServerOptions = {
  host?: string,
  port?: number
}

type EchoParams = { text: string };
type LogParams = { message: any };
type AddParams = { port: number };
type RemoveParams = { port: number };

const buildRPCServer = (server: Server) => {
  // Create JSON-RPC server
  const rpcServer = new JSONRPCServer();

  // Define RPC methods
  rpcServer.addMethod("echo", ({ text }: EchoParams) => text);
  rpcServer.addMethod("log", ({ message }: LogParams) => console.log(message));

  rpcServer.addMethod("addSocket", ({ port }: AddParams) => {
    server.addSocket(port);
  })

  rpcServer.addMethod("removeSocket", ({ port }: RemoveParams) => {
    server.removeSocket(port);
  })

  rpcServer.addMethod("removeAllSockets", () => {
    server.removeAllSockets();
  })

  rpcServer.addMethod("listSockets", () => {
    return server.listSockets();
  })

  return rpcServer;
}

class Server {
  host: string;
  port: number;
  emitter: EventEmitter;
  wss: WebSocket.Server;
  sockets: { [id: string]: dgram.Socket };
  server: string;

  constructor({ host, port }: ServerOptions = { host: 'localhost', port: 8000 }) {
    this.host = host;
    this.port = port;

    this.emitter = new EventEmitter();
    this.sockets = {};
  }

  start() {
    // Create WebSockets servers for both RPC interface and data
    const wss = new WebSocket.Server({ noServer: true });
    this.wss = wss;

    wss.on('connection', (ws, _req) => {
      console.debug('[data] connection')

      // messages from client ignored for now...
      // ws.on('message', (message) => {
      //   console.log('[ws] received: %s', message);
      // });

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

  addSocket(port: number) {
    console.debug(`Add socket ${port}`)
    const socket = dgram.createSocket('udp4');
    const id = `udp:${port}`

    socket.on('listening', () => {
      const address = socket.address();
      console.debug(`[udp] socket binded at port ${address.port}`);
      this.sockets[id] = socket;
    })

    socket.on('error', (err) => {
      console.debug(`[udp] socket error:\n${err.stack}`);
      socket.close();
      // TODO: Reject promise with error
    });

    socket.on('message', (msg, rinfo) => {
      console.debug(`[udp] socket got: ${msg} from ${rinfo.address}:${rinfo.port}`);

      // Broadcast message to all subscribed clients
      const payload = JSON.stringify({ id, data: msg });
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      })
    })

    socket.bind({
      address: '0.0.0.0',
      port
    });
  }

  removeSocket(port: number) {
    const id = `udp:${port}`;
    console.debug(`Remove mapping '${id}'`)
    const socket = this.sockets[id];
    if (socket) {
      socket.close();
      delete this.sockets[id];
    }
  }

  removeAllSockets(): void {
    Object.values(this.sockets).forEach(socket => socket.close());
    this.sockets = {};
  }

  listSockets(): string[] {
    return Object.keys(this.sockets);
  }
}

export default Server;
