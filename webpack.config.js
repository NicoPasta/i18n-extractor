import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  mode: 'development',
  entry: './src/parser.js',
  output: {
    filename: 'index.cjs',
    path: path.resolve(__dirname, 'lib'),
    // library: {
    //   type: "umd",
    // },
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  // resolve: {
  //   fallback: {
  //     path: false,
  //   },
  // },
  target: 'node',
  devtool: 'source-map',
  // optimization: {
  //   minimize: true,
  // },
};
