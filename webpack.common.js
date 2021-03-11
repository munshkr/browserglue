const path = require("path");
const nodeExternals = require('webpack-node-externals');

const nodeConfig = {
  target: "node",
  entry: "./src/index.ts",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  externals: [nodeExternals()],
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "browserglue.node.js",
    library: "browserglue",
    libraryTarget: "umd",
    publicPath: "/"
  },
};

const browserConfig = {
  target: "web",
  mode: "production",
  entry: "./src/browser.ts",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "browserglue.js",
    library: "browserglue",
    libraryTarget: "umd",
    publicPath: "/",
  },
};

module.exports = [nodeConfig, browserConfig];
