#!/usr/bin/env node
const program = require("commander");
const packageInfo = require("../package.json");
const { Server } = require("../dist/browserglue.node");

program
  .version(packageInfo.version)
  .option("-H, --host <name>", "WebSockets binding host", "localhost")
  .option("-P, --port <number>", "WebSockets port number", 8000)
  .parse(process.argv);

const options = program.opts();

const server = new Server({
  host: options.host,
  port: options.port,
});

server.on("listening", () => {
  console.log(`Server listening on ${server.host}:${server.port}`);

  // hardcoded for now...
  // server.addSocket(4567);
});

server.start();
