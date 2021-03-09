import Client from "./Client";

class Channel {
  readonly path: string;
  readonly port: number;
  readonly subscribedPorts: number[];

  protected _client: Client;
  protected _open: boolean;

  constructor(client: Client, path: string, port: number, subscribedPorts: number[]) {
    this.path = path;
    this.port = port;
    this.subscribedPorts = subscribedPorts;

    this._client = client;
    this._open = true;
  }

  on(cb: (message: any) => void): boolean {
    if (!this._open) return false;
    // TODO ...
    return true;
  }

  send(message: any): boolean {
    if (!this._open) return false;
    this._client.send(this.path, message);
    return true;
  }

  subscribePort(port: number): boolean {
    if (!this._open) return false;
    this._client.subscribePort(this.path, port);
    return true;
  }

  close(): boolean {
    if (!this._open) return false;
    this._open = false;
    this._client.removeChannel(this.path);
    return true;
  }
}

export default Channel;