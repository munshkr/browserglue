import WebSocket from 'ws';
import dgram from 'dgram';
import http from 'http';
import { JSONRPCRequest, JSONRPCServer, isJSONRPCRequest } from 'json-rpc-2.0';
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
  dataWss: WebSocket.Server;
  sockets: { [id: string]: dgram.Socket };

  constructor({ host, port }: ServerOptions = { host: 'localhost', port: 8000 }) {
    this.host = host;
    this.port = port;

    this.emitter = new EventEmitter();
    this.sockets = {};
  }

  start() {
    // Create WebSockets servers for both RPC interface and data
    const rpcWss = new WebSocket.Server({ noServer: true });
    const dataWss = new WebSocket.Server({ noServer: true });
    this.dataWss = dataWss;

    const server = http.createServer();

    dataWss.on('connection', (ws, _req) => {
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

    // Create and setup JSON-RPC server
    const rpcServer = buildRPCServer(this);
    rpcWss.on('connection', (ws, _req) => {
      console.debug('[rpc] connection')

      ws.on('message', async (message) => {
        // console.log('[rpc] received:', JSON.stringify(message));

        let parsedMessage;
        try {
          parsedMessage = JSON.parse(message.toString());
        } catch (err) {
          ws.send(JSON.stringify({ 'code': -32700, 'message': 'Parse error', 'data': JSON.stringify(err) }));
          return;
        }

        if (!isJSONRPCRequest(parsedMessage)) {
          ws.send(JSON.stringify({ 'code': -32700, 'message': 'Parse error', 'data': 'Invalid request' }))
        }

        const req: JSONRPCRequest = parsedMessage;
        const res = await rpcServer.receive(req);
        ws.send(JSON.stringify(res));
      });

      ws.on('error', (err) => {
        console.debug('[rpc] client error:', err)
      })

      ws.on('close', () => {
        console.debug('[rpc] client closed');
      })

      this.emitter.emit('rpc-connection');
    });

    rpcWss.on('listening', () => {
      console.debug('[rpc] listening')
      this.emitter.emit('rpc-listening');
    });

    rpcWss.on('close', () => {
      console.log('[rpc] closed');
      this.emitter.emit('rpc-close');
    });

    rpcWss.on('error', () => {
      console.log('[rpc] error');
      this.emitter.emit('rpc-error');
    });

    // Handle upgrade requests to /data or /rpc and redirect to each WS server
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url;

      if (pathname === '/data/') {
        dataWss.handleUpgrade(request, socket, head, function done(ws) {
          dataWss.emit('connection', ws, request);
        });
      } else if (pathname === '/rpc/') {
        rpcWss.handleUpgrade(request, socket, head, function done(ws) {
          rpcWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    server.on('listening', () => {
      console.debug('[server] listening')
      this.emitter.emit('listening');
    });

    server.on('close', () => {
      console.log('[server] closed');
      this.emitter.emit('close');
    });

    server.on('error', () => {
      console.log('[server] error');
      this.emitter.emit('error');
    });

    console.log(`Server listening on ${this.host}:${this.port}`);
    server.listen(this.port, this.host);
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
      console.log(`[udp] server listening ${address.address}:${address.port}`);
      this.sockets[id] = socket;
    })

    socket.on('error', (err) => {
      console.log(`[udp] server error:\n${err.stack}`);
      socket.close();
      // TODO: Reject promise with error
    });

    socket.on('message', (msg, rinfo) => {
      console.log(`[udp] server got: ${msg} from ${rinfo.address}:${rinfo.port}`);

      // Broadcast message to all subscribed clients
      const payload = JSON.stringify({ id, data: msg });
      this.dataWss.clients.forEach((client) => {
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
