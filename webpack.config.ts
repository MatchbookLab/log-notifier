import * as path from 'path';
import type { Configuration } from 'webpack';

const config: Configuration = {
  entry: './src/browser/index.ts',
  mode: 'development',
  // mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  devtool: 'cheap-module-source-map',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'browser.js',
    path: path.resolve(__dirname, './dist/'),
  },
};

export default config;
