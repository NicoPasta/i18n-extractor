import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
// import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  entry: './src/index.js',
  output: {
    filename: 'index.cjs',
    path: path.resolve(__dirname, 'lib'),
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },

  externalsType: 'commonjs',
  externals: {
    '@babel/core': '@babel/core',

    '@babel/generator': {
      commonjs: '@babel/generator',
    },
    '@babel/helper-plugin-utils': {
      commonjs: '@babel/helper-plugin-utils',
    },
    '@babel/parser': {
      commonjs: '@babel/parser',
    },
    '@babel/template': {
      commonjs: '@babel/template',
    },

    '@babel/traverse': {
      commonjs: '@babel/traverse',
    },
    '@babel/types': { commonjs: '@babel/types' },
    '@vue/compiler-core': {
      commonjs: '@vue/compiler-core',
    },
    '@vue/compiler-sfc': {
      commonjs: '@vue/compiler-sfc',
    },
    commander: {
      commonjs: 'commander',
    },
    eslint: 'eslint',
    'fs-extra': {
      commonjs: 'fs-extra',
    },
    glob: {
      commonjs: 'glob',
    },
    prettier: {
      commonjs: 'prettier',
    },
  }, // 外部依赖的列表

  target: 'node',
  devtool: 'source-map',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        minify: TerserPlugin.uglifyJsMinify,
        extractComments: false,
      }),
    ],
  },
};
