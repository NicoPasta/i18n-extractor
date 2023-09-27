import path from 'path';
import fse from 'fs-extra';
import glob from 'glob';
import { Command } from 'commander';
import { parse } from './parser.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(() => {
  let options = {
    // pattern: '**/*.{vue.js}',
    pattern: path.resolve(__dirname, './vuetest/*.{vue,js}'),
    ignore: ['node_modules/**'],
    importPath: '',
    importName: '',
    outputPath: '',
    outputFileName: 'zh-CN.json',
  };

  try {
    const localPackageJson = fse.readFileSync(
      path.resolve(process.cwd(), 'package.json'),
      'utf8'
    );
    // 读取package.json中的配置
    const packageParse = JSON.parse(localPackageJson);
    if (packageParse?.vueTransformOptions) {
      Object.assign(options, packageParse.vueTransformOptions);
    }
  } catch (err) {
    console.error(err);
    return;
  }
  const command = new Command();

  // 通过命令配置
  command
    .name('i18n-vue-transformer')
    .option('-p --importPath <path>', "imported variable's filepath")
    .option('-n --importName <name>', "imported variable's name")
    .option('-o --outputPath <outputPath>', 'output file path')
    .option('-o --outputFileName <outputname>', 'output file name')

    .action((name, inputOptions, command) => {
      if (inputOptions._optionValues.outputPath) {
        options.outputPath = inputOptions._optionValues.outputPath;
      }

      if (inputOptions._optionValues.importPath) {
        options.importPath = inputOptions._optionValues.importPath;
      }

      if (inputOptions._optionValues.importName) {
        options.importName = inputOptions._optionValues.importName;
      }
      if (inputOptions._optionValues.outputFileName) {
        options.outputFileName = inputOptions._optionValues.outputFileName;
      }
    })
    .parse(process.argv);

  if (!options.importPath || !options.importName || !options.importPath) {
    console.error(
      'Please set importName, importPath and outputPath, all of them are required'
    );
    return;
  }

  let locales = {};
  const files = glob.sync(options.pattern, { ignore: options.ignore });
  const outputPath = path.resolve(process.cwd(), options.outputPath);
  // 去掉文件类型
  const filename = options.outputFileName.split(/\.(?=[^.]+$)/)[0] + '.json';
  if (fse.existsSync(outputPath)) {
    // 读取文件
    try {
      const content = fse.readFileSync(outputPath + '/' + filename, 'utf8');
      if (content) {
        locales = JSON.parse(content);
      }
    } catch (e) {}
  } else {
    console.error("outputPath doesn't exists");
    return;
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
      console.error(`error in ${filename}:`);
      console.log(err);
    }
  });

  if (Object.keys(locales).length) {
    fse.ensureDirSync(options.outputPath);
    fse.writeFileSync(
      path.join(options.outputPath, 'zh_CN.json'),
      JSON.stringify(locales, null, '\t'),
      'utf8'
    );
    console.log('extract success');
  } else {
    console.warn('no chinese characters found');
  }
})();
