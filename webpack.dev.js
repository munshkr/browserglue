const { merge } = require('webpack-merge');
const [commonNodeConfig, commonBrowserConfig] = require('./webpack.common.js');

const developmentConfig = {
  mode: 'development',
  devtool: 'inline-source-map',
}

const nodeConfig = merge(commonNodeConfig, developmentConfig);
const browserConfig = merge(commonBrowserConfig, developmentConfig);

module.exports = [nodeConfig, browserConfig];
