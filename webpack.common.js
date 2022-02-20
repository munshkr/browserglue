const path = require("path");
const webpack = require("webpack");
const nodeExternals = require('webpack-node-externals');

const plugins = [
  new webpack.DefinePlugin({
    __VERSION__: JSON.stringify(require("./package.json").version)
  })
]

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
  plugins,
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "browserglue.node.js",
    library: "browserglue",
    libraryTarget: "umd",
    publicPath: "/",
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
    fallback: {
      dgram: false, // do not include a polyfill for dgram
    },
  },
  plugins,
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "browserglue.js",
    library: "browserglue",
    libraryTarget: "umd",
    publicPath: "/",
  },
};

module.exports = [nodeConfig, browserConfig];
