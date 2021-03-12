import Client from "./Client";

class Channel {
  readonly path: string;

  protected _client: Client;
  protected _subscribedPorts: number[];
  protected _port: number;
  protected _open: boolean;

  constructor(client: Client, path: string, subscribedPorts: number[], port?: number) {
    this.path = path;

    this._client = client;
    this._subscribedPorts = subscribedPorts;
    this._port = port;
    this._open = true;
  }

  on(cb: (message: any) => void): boolean {
    if (!this._open) return false;
    // TODO ...
    return true;
  }

  publish(message: any): boolean {
    if (!this._open) return false;
    this._client.publish(this.path, message);
    return true;
  }

  bindPort(port: number): boolean {
    if (!this._open) return false;
    const result = this._client.bindPort(this.path, port);
    if (result) this._port = port;
    return true;
  }

  subscribePort(port: number): boolean {
    if (!this._open) return false;
    const result = this._client.subscribePort(this.path, port);
    // TODO: subscribedPorts should be updated automatically with events from client
    if (result) this._subscribedPorts.push(port);
    return true;
  }

  unsubscribePort(port: number): boolean {
    if (!this._open) return false;
    const result = this._client.unsubscribePort(this.path, port);
    // TODO: subscribedPorts should be updated automatically with events from client
    if (result) {
      const newPorts = this._subscribedPorts.filter(p => p != port);
      this._subscribedPorts = newPorts;
    }
    return true;
  }

  unsubscribeAllPorts(): boolean {
    if (!this._open) return false;
    const result = this._client.unsubscribeAllPorts(this.path);
    // TODO: subscribedPorts should be updated automatically with events from client
    if (result) this._subscribedPorts = [];
    return true;
  }

  remove(): boolean {
    if (!this._open) return false;
    this._open = false;
    this._client.removeChannel(this.path);
    return true;
  }
}

export default Channel;
