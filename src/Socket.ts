import Client from "./Client";

class Socket {
  protected _client: Client;
  protected _port: number;

  contructor(client: Client, port: number) {
    this._client = client;
    this._port = port;
  }

  get port(): number {
    return this._port;
  }
}

export default Socket;