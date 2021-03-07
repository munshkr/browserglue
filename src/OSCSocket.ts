import * as dgram from 'dgram';
import { EventEmitter } from 'events';

type ServerOptions = {
  host?: string,
  port?: number
}

class OSCSocket {
  host: string;
  port: number;
  emitter: EventEmitter;
  socket: dgram.Socket;

  constructor({ host, port }: ServerOptions = { host: '0.0.0.0', port: 4567 }) {
    this.host = host;
    this.port = port;
    this.emitter = new EventEmitter();
  }

  start() {
    const socket = dgram.createSocket('udp4');
    this.socket = socket;

    socket.on('error', (err) => {
      console.log(`[udp] server error:\n${err.stack}`);
      this.emitter.emit('error', err);
      socket.close();
    });

    socket.on('message', (msg, rinfo) => {
      console.log(`[udp] server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
      this.emitter.emit('message', msg, rinfo);
    });

    socket.on('listening', () => {
      const address = socket.address();
      console.log(`[udp] server listening ${address.address}:${address.port}`);
      this.emitter.emit('listening');
    });

    socket.bind({
      address: this.host,
      port: this.port
    });
  }

  stop() {
    this.socket.close();
  }

  on(event: string, cb: (...args: any[]) => void) {
    return this.emitter.on(event, cb);
  }
}

export default OSCSocket;