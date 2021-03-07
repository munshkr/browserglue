import Client from "./Client";

class Socket {
  protected _client: Client;
  protected _port: number;
  protected _open: boolean;

  constructor(client: Client, port: number) {
    this._client = client;
    this._port = port;
    this._open = true;
  }

  get port(): number {
    return this._port;
  }

  send(message: any): boolean {
    if (!this._open) return false;
    this._client.send(this.port, message);
    return true;
  }

  on(cb: (message: any) => void): boolean {
    if (!this._open) return false;
    // TODO ...
    return true;
  }

  close(): boolean {
    if (!this._open) return false;
    this._open = false;
    this._client.removeSocket(this._port);
    return true;
  }
}

export default Socket;