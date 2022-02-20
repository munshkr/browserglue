/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { JSONRPCClient } from "json-rpc-2.0";
import { EventEmitter } from "events";
import WebSocket from "isomorphic-ws";
import ReconnectingWebSocket from "./ReconnectingWebSocket";
import Channel, { ServerChannel } from "./Channel";
import { DEFAULT_PORT } from "./defaults";
import Debug from "debug";
import OSC from "osc-js";

const debug = Debug("browserglue").extend("client");

type ServerEventWSPayload = {
  event: string;
  message: any;
};

type AddChannelEventPayload = {
  path: string;
};

type RemoveChannelEventPayload = {
  path: string;
};

const buildRPCClient = (wsUrl: string): JSONRPCClient => {
  const [scheme, hostnamePort] = wsUrl.split("://");
  const secure = scheme === "wss";
  const httpScheme = secure ? "https" : "http";
  const url = `${httpScheme}://${hostnamePort}/json-rpc`;

  // JSONRPCClient needs to know how to send a JSON-RPC request.
  // Tell it by passing a function to its constructor. The function must take a JSON-RPC request and send it.
  const client = new JSONRPCClient((jsonRPCRequest) =>
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(jsonRPCRequest),
    }).then((response) => {
      if (response.status === 200) {
        // Use client.receive when you received a JSON-RPC response.
        return response
          .json()
          .then((jsonRPCResponse) => client.receive(jsonRPCResponse));
      } else if (jsonRPCRequest.id) {
        return Promise.reject(new Error(response.statusText));
      }
    })
  );

  return client;
};

class Client {
  readonly url: string;

  protected _channels: { [path: string]: Channel };
  protected _emitter: EventEmitter;
  protected _rpcClient: JSONRPCClient;
  protected _ws: ReconnectingWebSocket;
  protected _channelWss: { [path: string]: ReconnectingWebSocket };

  constructor(url = `ws://localhost:${DEFAULT_PORT}`) {
    this.url = url;

    this._emitter = new EventEmitter();
    this._channels = {};
    this._channelWss = {};

    this._rpcClient = buildRPCClient(url);
    this._ws = this._createEventsWebSocket();

    // Subscribe a no-op listener for `error` events, to avoid the unhandled exception behaviour
    // (see https://nodejs.org/dist/v11.13.0/docs/api/events.html#events_error_events)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this._emitter.on("error", () => {});

    void this._checkVersion();
  }

  get connected(): boolean {
    return this._ws.connected;
  }

  get channels(): { [path: string]: Channel } {
    return { ...this._channels };
  }

  connect(): Client {
    if (this.connected) return this;
    this._ws.connect();
    Object.values(this._channelWss).forEach((ws) => ws.connect());
    return this;
  }

  disconnect(): Client {
    this._ws.disconnect();
    Object.values(this._channelWss).forEach((ws) => ws.disconnect());
    return this;
  }

  async getServerVersion(): Promise<string> {
    return this._call("getVersion");
  }

  async addChannel(
    path: string,
    port?: number,
    sendPort?: number
  ): Promise<Channel> {
    const c: ServerChannel = await this._call("addChannel", {
      path,
      port,
      sendPort,
    });
    return this.channels[path] || this._createChannel(c);
  }

  async removeChannel(path: string): Promise<void> {
    await this._call("removeChannel", { path });
    this._deleteChannel(path);
  }

  removeAllChannels(): PromiseLike<void> {
    return this._call("removeAllChannels");
  }

  bindPort(path: string, port: number): PromiseLike<boolean> {
    return this._call("bindPort", { path, port });
  }

  unbindPort(path: string): PromiseLike<boolean> {
    return this._call("unbindPort", { path });
  }

  subscribePort(path: string, port: number): PromiseLike<boolean> {
    return this._call("subscribePort", { path, port });
  }

  unsubscribePort(path: string, port: number): PromiseLike<boolean> {
    return this._call("unsubscribePort", { path, port });
  }

  unsubscribeAllPorts(path: string): PromiseLike<boolean> {
    return this._call("unsubscribeAllPorts", { path });
  }

  on(type: string, cb: (message: any) => void): Client {
    this._emitter.on(type, cb);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  publish(path: string, msg: OSC.Message | OSC.Bundle): boolean {
    const dataWs = this._channelWss[path];
    if (!dataWs || !dataWs.connected) {
      debug(
        "Tried to publish to %s but socket is closed or not connected",
        path
      );
      return false;
    }
    debug("Publish data to %s", path);
    const binary = msg.pack();
    dataWs.send(binary);
    return true;
  }

  protected _call(
    cmd: string,
    params?: { [name: string]: any }
  ): PromiseLike<any> {
    // The request() function returns a promise of the result.
    // TODO: Return false if not connected
    debug("Call RPC method '%s' with params %O", cmd, params);
    return this._rpcClient.request(cmd, params);
  }

  protected _createEventsWebSocket(): ReconnectingWebSocket {
    const ws = new ReconnectingWebSocket(`${this.url}/events`);

    ws.on("message", (ev: WebSocket.MessageEvent) => {
      const payload = JSON.parse(ev.data as string) as ServerEventWSPayload;
      const { event, message } = payload;

      // Emit `change:${path}` events so that each Channel instance gets updated
      switch (event) {
        case "change": {
          const channels = message as { [path: string]: ServerChannel };
          // Update existing channels, or create new channels
          Object.entries(channels).forEach(
            ([path, c]: [string, ServerChannel]) => {
              // Make sure Channel instance exists and is stored
              if (!this.channels[path]) this._createChannel(c);
              this._emitter.emit(`change:${path}`, c);
            }
          );
          // Delete removed channels
          const removedChannels = Object.keys(this.channels).filter(
            (path) => !Object.keys(channels).includes(path)
          );
          removedChannels.forEach((path) => this._deleteChannel(path));
          break;
        }
        case "add-channel": {
          const { path } = message as AddChannelEventPayload;
          const c: ServerChannel = { path, port: null, subscribedPorts: [] };
          this._createChannel(c);
          break;
        }
        case "remove-channel": {
          const { path } = message as RemoveChannelEventPayload;
          this._deleteChannel(path);
          break;
        }
      }

      // Finally, emit this as a client event
      this._emitter.emit(event, message);
    });

    // Delegate `connect`, `disconnect` and `error` events
    ws.on("connect", () => this._emitter.emit("connect"));
    ws.on("disconnect", () => this._emitter.emit("disconnect"));
    ws.on("error", (error: Error) => this._emitter.emit("error", error));

    return ws;
  }

  protected _createDataWebSocket(path: string): ReconnectingWebSocket {
    const ws = new ReconnectingWebSocket(`${this.url}/data${path}`, {
      binaryType: "arraybuffer",
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    void ws.on("message", (event: WebSocket.MessageEvent) => {
      debug("Received message on %s", path);
      try {
        const msg = new OSC.Message();
        const binary = new DataView(event.data as ArrayBuffer);
        msg.unpack(binary);
        this._emitter.emit("message", { path, msg });
        this._emitter.emit(`message:${path}`, msg);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to parse OSC message:", err);
      }
    });
    // Do nothing on /data errors (we already emit an error event on /events)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    ws.on("error", () => {});

    return ws;
  }

  protected _createChannel(attrs: ServerChannel): Channel {
    const { path, subscribedPorts, port } = attrs;
    const channel = new Channel(this, path, subscribedPorts, port);
    if (!this._channelWss[path]) {
      this._channelWss[path] = this._createDataWebSocket(path);
    }
    this._channels[path] = channel;
    return channel;
  }

  protected _deleteChannel(path: string): void {
    const dataWs = this._channelWss[path];
    if (dataWs) dataWs.disconnect();
    this._emitter.emit(`remove-channel:${path}`);
    this._emitter.removeAllListeners(`change:${path}`);
    this._emitter.removeAllListeners(`remove-channel:${path}`);
    // TODO: Remove all listeners from `*:${path}`
    // ...is it possible without storing myself all handled events?
    delete this._channelWss[path];
    delete this._channels[path];
  }

  protected _checkVersion(): void {
    void this.getServerVersion().then((serverVersion) => {
      if (serverVersion !== __VERSION__) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [serverMajor, serverMinor, _serverPatch] = serverVersion.split(
          "."
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [major, minor, _patch] = __VERSION__.split(".");

        let text = `Browserglue server version is ${serverVersion}, but the client expects ${__VERSION__}.\n`;
        if (serverMajor !== major) {
          text += `API might have changed completely, so please make sure you are using the same version.\n`;
        } else if (serverMinor !== minor) {
          text += `API should not have changed, but it is still recommended to use the same version.\n`;
        }
        text += `You can download the right one at https://github.com/munshkr/browserglue/releases`;
        // eslint-disable-next-line no-console
        console.warn(text);
      }
    });
  }
}

export default Client;
