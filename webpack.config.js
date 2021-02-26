const path = require("path");

const nodeConfig = {
  target: "node",
  mode: "development",
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
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "browserglue.node.js",
    library: "browserglue",
    libraryTarget: "umd",
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
  },
};

module.exports = [nodeConfig, browserConfig];
