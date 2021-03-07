import * as WebSocket from 'ws';
import * as http from 'http';
import OSCSocket from './OSCSocket';
import { JSONRPCRequest, JSONRPCServer, isJSONRPCRequest } from 'json-rpc-2.0';
import { EventEmitter } from 'events';

type ServerOptions = {
  host?: string,
  port?: number
}

type EchoParams = { text: string };
type LogParams = { message: any };
type AddMappingParams = { id: string, port: number };
type RemoveMappingParams = { id: string };

const buildRPCServer = (server: Server) => {
  // Create JSON-RPC server
  const rpcServer = new JSONRPCServer();

  // Define RPC methods
  rpcServer.addMethod("echo", ({ text }: EchoParams) => text);
  rpcServer.addMethod("log", ({ message }: LogParams) => console.log(message));

  rpcServer.addMethod("addMapping", ({ id, port }: AddMappingParams) => {
    server.addMapping(id, port);
  })

  rpcServer.addMethod("removeMapping", ({ id }: RemoveMappingParams) => {
    server.removeMapping(id);
  })

  rpcServer.addMethod("listMappings", () => {
    return server.listMappings();
  })

  return rpcServer;
}

class Server {
  host: string;
  port: number;
  emitter: EventEmitter;
  dataWss: WebSocket.Server;
  oscSockets: { [id: string]: OSCSocket };

  constructor({ host, port }: ServerOptions = { host: 'localhost', port: 8000 }) {
    this.host = host;
    this.port = port;

    this.emitter = new EventEmitter();
    this.oscSockets = {};
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
      })
      ws.on('close', () => {
        console.debug('[data] client closed');
      })
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
        const res = await rpcServer.receive(req)
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

  addMapping(id: string, port: number) {
    console.debug(`Add mapping '${id}' to port ${port}`)
    const oscSocket = new OSCSocket({ port });

    oscSocket.on("listening", () => {
      this.oscSockets[id] = oscSocket;
    })

    // oscSocket.on("quit", () => {
    //     this.removeMapping(id);
    // })

    oscSocket.on("message", (data) => {
      // Broadcast message to all subscribed clients
      const payload = JSON.stringify({ id, data });
      this.dataWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      })
    })

    oscSocket.start();
  }

  removeMapping(id: string) {
    console.debug(`Remove mapping '${id}'`)
    const oscSocket = this.oscSockets[id];
    if (oscSocket) {
      oscSocket.stop();
      delete this.oscSockets[id];
    }
  }

  listMappings() {
    return Object.entries(this.oscSockets).map(([id, socket]) => (
      [id, socket.port]
    ));
  }
}

export default Server;
