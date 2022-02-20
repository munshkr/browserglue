import Client from "./Client";
// import WebSocket from 'isomorphic-ws';

test("constructor", () => {
  const client = new Client();
  expect(client.url).toBe("ws://localhost:8000");
  // const ws = new WebSocket('ws://localhost:8000');
});
