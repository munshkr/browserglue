import Client from "./Client";
import EventEmitter from "events";
import Debug from "debug";

const debug = Debug("browserglue").extend("channel");

interface ServerChannel {
  path: string;
  port?: number;
  subscribedPorts: number[];
}

class Channel {
  readonly path: string;

  protected _client: Client;
  protected _subscribedPorts: number[];
  protected _port: number;
  protected _open: boolean;
  protected _emitter: EventEmitter;

  constructor(client: Client, path: string, subscribedPorts: number[], port?: number) {
    this.path = path;

    this._client = client;
    this._subscribedPorts = subscribedPorts;
    this._port = port;
    this._open = true;

    // Update attributes from server state (change event)
    client.on(`change:${path}`, (state: ServerChannel) => {
      const { subscribedPorts, port } = state;
      debug("Received change from server. Update channel %s state: %o %o", path, subscribedPorts, port);
      this._subscribedPorts = subscribedPorts;
      this._port = port;
    });

    // Make sure to close this channel if it was removed on server
    client.on(`remove-channel:${path}`, () => {
      this._open = false;
    });
  }

  get port(): number {
    return this._port;
  }

  get subscribedPorts(): number[] {
    return this._subscribedPorts;
  }

  on(event: string, listener: (...args: any[]) => void): Channel {
    this._client.on(`${event}:${this.path}`, listener);
    return this;
  }

  publish(data: any): boolean {
    if (!this._open) return false;
    return this._client.publish(this.path, data);
  }

  async bindPort(port: number): Promise<boolean> {
    if (!this._open) return false;
    return this._client.bindPort(this.path, port);
  }

  async subscribePort(port: number): Promise<boolean> {
    if (!this._open) return false;
    return await this._client.subscribePort(this.path, port);
  }

  async unsubscribePort(port: number): Promise<boolean> {
    if (!this._open) return false;
    return this._client.unsubscribePort(this.path, port);
  }

  async unsubscribeAllPorts(): Promise<boolean> {
    if (!this._open) return false;
    return this._client.unsubscribeAllPorts(this.path);
  }

  async remove(): Promise<boolean> {
    if (!this._open) return false;
    await this._client.removeChannel(this.path);
    this._open = false;
    return true;
  }
}

export default Channel;
export { Channel, ServerChannel };