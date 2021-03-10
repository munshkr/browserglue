const { merge } = require('webpack-merge');
const [commonNodeConfig, commonBrowserConfig] = require('./webpack.common.js');

const productionConfig = {
  mode: 'production',
  devtool: 'source-map',
}

const nodeConfig = merge(commonNodeConfig, productionConfig);
const browserConfig = merge(commonBrowserConfig, productionConfig);

module.exports = [nodeConfig, browserConfig];
