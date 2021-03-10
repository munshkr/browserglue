const { merge } = require('webpack-merge');
const [commonNodeConfig, commonBrowserConfig] = require('./webpack.common.js');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const productionConfig = {
  mode: 'production',
  devtool: 'source-map',
  plugins: [
    new BundleAnalyzerPlugin(),
  ],
}

const nodeConfig = merge(commonNodeConfig, productionConfig);
const browserConfig = merge(commonBrowserConfig, productionConfig);

module.exports = [nodeConfig, browserConfig];
