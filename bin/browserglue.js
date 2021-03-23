#!/usr/bin/env node
const program = require("commander");
const packageInfo = require("../package.json");
const { Server, defaults } = require("../dist/browserglue.node");
const debug = require("debug")("browserglue");

const { DEFAULT_PORT } = defaults;

program
  .version(packageInfo.version)
  .option("-H, --host <name>", "WebSockets binding host", "localhost")
  .option("-P, --port <number>", "WebSockets port number", DEFAULT_PORT)
  .parse(process.argv);

const options = program.opts();

debug("Create server and connect to %s:%d", options.host, options.port);
const server = new Server({
  host: options.host,
  port: options.port,
});

server.on("listening", () => {
  process.stderr.write(`Server listening on ${server.host}:${server.port}\n`);
});

debug("Start server");
server.start();
