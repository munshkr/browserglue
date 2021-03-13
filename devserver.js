const { spawn } = require('child_process');
const express = require('express');
const webpack = require('webpack');
const middleware = require('webpack-dev-middleware');

const app = express();
const [nodeConfig, browserConfig] = require('./webpack.prod.js');

/**
 * Node
 */
const nodeCompiler = webpack(nodeConfig);

// Start middleware. Use writeToDisk because bin/browserglue.js requires the bundle on dist/
middleware(nodeCompiler, { writeToDisk: true });

const spawnBrowserglueBinary = () => {
  console.log('* Spawn Browserglue child process')
  const bin = spawn('./bin/browserglue.js');

  bin.stdout.on('data', (data) => {
    process.stdout.write(data.toString());
  });

  bin.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  bin.on('close', (code) => {
    console.log(`* Browserglue child process exited with code ${code}`);
  });

  return bin;
}

let serverProcess;

// Whenever compilation finishes, (re)spawn browserglue child process
nodeCompiler.hooks.done.tap('RestartBrowserGlue', (stats) => {
  // return true to emit the output, otherwise false
  // console.log(stats);
  console.log('* Restart Browserglue server');
  if (serverProcess) {
    serverProcess.kill();
  }
  serverProcess = spawnBrowserglueBinary();
  return true;
});

/**
 * Browser
 */
const browserCompiler = webpack(browserConfig);
const browserMiddleware = middleware(browserCompiler, {
  publicPath: browserConfig.output.publicPath,
});

// Tell express to use the webpack-dev-middleware and use the webpack dev
// configuration file as a base.
app.use(browserMiddleware);
app.use(express.static('dist'));

// Serve the files on port 3000.
app.listen(3000, () => {
  console.log('Serving files at dist/ on http://localhost:3000');
});