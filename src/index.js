import path from 'path';
import fse from 'fs-extra';
import glob from 'glob';
import { Command } from 'commander';
import pleaseUpgradeNode from 'please-upgrade-node';
// import packageJson from "../package.json" assert { type: `json` };;
import { parse } from './parser.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(() => {
  let options = {
    pattern: '**/*.{vue.js}',
    // pattern: path.resolve(__dirname, './vuetest/*.{vue,js}'),
    ignore: ['node_modules/**'],
    importPath: '',
    importName: '',
    outputPath: '',
  };

  try {
    const localPackageJson = fse.readFileSync(
      path.resolve(process.cwd(), 'package.json'),
      'utf8'
    );
    const packageParse = JSON.parse(localPackageJson);

    if (packageParse.config?.vue3TransformOptions) {
      options = {
        ...options,
        ...packageParse.config.vue3TransformOptions,
      };
    }
  } catch (err) {
    console.error(err);
    return;
  }
  const command = new Command();

  command
    .name('i18n-vue3-transformer')
    .command('vue3transform')
    .option('-p --importPath', "imported variable's filepath")
    .option('-n --importName', "imported variable's name")
    .option('-o --outputPath', 'output filepath')
    .action((name, inputOptions, command) => {
      if (inputOptions.outputPath) {
        options.outputPath = inputOptions.outputPath;
      }

      if (inputOptions.importPath) {
        options.importPath = inputOptions.importPath;
      }

      if (inputOptions.importName) {
        options.importName = inputOptions.importName;
      }
    })
    .parse(process.argv);

  if (!options.importPath || !options.importName || !options.importPath) {
    console.error('Please set import name, filepath and output filepath');
    return;
  }

  let locales = {};
  const files = glob.sync(options.pattern, { ignore: options.ignore });
  const outputPath = path.resolve(
    process.cwd(),
    options.output + '/zh_CN.json'
  );
  if (fse.existsSync(outputPath)) {
    const content = fse.readFileSync(outputPath, 'utf8');
    if (content) {
      locales = JSON.parse(content);
    }
  }

  files.forEach(async (filename) => {
    const filePath = path.resolve(process.cwd(), filename);
    console.info(`detecting file: ${filePath}`);
    const sourceCode = fse.readFileSync(filePath, 'utf8');
    try {
      const res = await parse(
        sourceCode,
        locales,
        options.importName,
        options.importPath,
        filename
      );

      if (!res) {
        return;
      } else {
        const { result = '', skip = false } = res;
        // const { result, skip } = res;
        if (skip) {
          console.info(`skiped: ${filePath}`);
          return;
        }

        if (result) {
          fse.writeFileSync(filePath, result, 'utf8');
        }
      }
    } catch (err) {
      console.log(err);
    }
  });

  if (Object.keys(locales).length) {
    fse.ensureDirSync(options.output);
    fse.writeFileSync(
      path.join(options.output, 'zh_CN.json'),
      JSON.stringify(locales, null, '\t'),
      'utf8'
    );
    console.log('extract success');
  } else {
    console.warn('no chinese characters found');
  }
})();
