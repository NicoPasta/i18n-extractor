import { hasCN } from './util.js';
import generator from '@babel/generator';
import babelTraverse from '@babel/traverse';
import { createHash } from 'node:crypto';

import { parse as babelParser } from '@babel/parser';
import { parse as vueParser } from '@vue/compiler-sfc';

// import { compile } from 'vue-template-compiler';
import babeltemplate from '@babel/template';
import path from 'path';
import {
  FileType as supportedFileType,
  NodeTypes,
  selfClosingTags,
} from './constants.js';
import prettier from 'prettier';
import glob from 'glob';

let _importName, _importPath, _locales;
const babelGenerator = generator.default;
const template = babeltemplate.default;

let stop;
//入口函数
export const parse = async (
  code,
  locales,
  // i18n名字
  importName,
  // i18n路径
  importPath,
  filename
) => {
  // 初始化内部变量
  _importName = importName;
  _importPath = importPath;
  _locales = locales;

  let result = '';
  const fileType = path.extname(filename);

  if (!Object.values(supportedFileType).includes(fileType)) {
    console.warn('unsupported filedtype: ' + fileType);
    return;
  }

  if (!hasCN(code)) {
    console.warn('no chinese character in ' + filename);
    return;
  }

  if (fileType === supportedFileType.JS) {
    const jsAst = transformJS(code, false, true);
    result = babelGenerator(jsAst).code;
    if (stop) {
      return { result, skip: true };
    }
    return { result, skip: false };
  } else {
    let vueDescriptor;

    vueDescriptor = vueParser(code).descriptor;

    const templateAst = vueDescriptor.template.ast;
    const scriptSetup = vueDescriptor.scriptSetup?.content;
    const script = vueDescriptor.script?.content;
    vueDescriptor.template.content = generateTemplate({
      ...transformTemplate(templateAst),
      tag: '',
    });
    if (script)
      vueDescriptor.script.content = babelGenerator(
        transformJS(script, false, false)
      ).code;
    if (scriptSetup)
      vueDescriptor.scriptSetup.content = babelGenerator(
        transformJS(scriptSetup, false, true)
      ).code;
    // 生成sfc
    result = await generateSfc(vueDescriptor);

    return { result, skip: false };
  }
};

function transformTemplate(ast) {
  if (ast.props.length) {
    ast.props = ast.props.map((prop) => {
      // 指令
      if (prop.type === NodeTypes.DIRECTIVE && prop?.exp?.content) {
        const l = prop.exp.content.length;
        // 指令内容为单引号字符串导致无法读取ast
        if (prop.exp.content[0] === "'" && prop.exp.content[l - 1] === "'") {
          prop.exp.content = `\`${prop.exp.content.slice(1, l - 1)}\``;
        }

        let jsCode;
        // 去掉空格和换行
        let c = prop.exp.content.replace(/[\n]/g, '');

        //  babel会把{}识别为块作用域,所以要处理一下
        if (/^\{.*\}$/.test(c)) {
          c = `(${c})`;
        }
        jsCode = generateDirectiveCode(transformJS(c, true, false));

        prop.exp.content = jsCode;
        const splitPoint = prop.loc.source.indexOf('=');
        const attr = prop.loc.source.substring(0, splitPoint);
        // 把指令拼回去
        prop.loc.source = attr + `="${jsCode}"`;
        return prop;
      }

      // 普通属性 替换为v-bind
      if (prop.type === NodeTypes.ATTRIBUTE && prop?.loc?.source) {
        if (hasCN(prop?.loc?.source)) {
          const localeKey = saveLocaleAndGetkey(prop.value.content);
          return {
            name: 'bind',
            type: NodeTypes.DIRECTIVE,
            loc: {
              source: `:${prop.name}="$t('${localeKey}')"`,
            },
          };
        } else {
          // 原样返回
          return prop;
        }
      }
    });
  }

  if (ast.children.length) {
    ast.children = ast.children.map((child) => {
      if (child.type === NodeTypes.TEXT && hasCN(child.content)) {
        const localeKey = saveLocaleAndGetkey(child.content);
        return {
          type: NodeTypes.INTERPOLATION,
          loc: {
            source: `{{ $t('${localeKey}') }}`,
          },
        };
      }

      // 插值语法，插值语法的内容包含在child.content内部，如果匹配到中文字符，则进行JS表达式解析并替换
      if (
        child.type === NodeTypes.INTERPOLATION &&
        hasCN(child.content?.content)
      ) {
        // 去掉空格和换行
        const c = child.content?.content.replace(/[\n]/g, '');
        const jsCode = generateDirectiveCode(
          // child.content?.content是js表达式
          transformJS(c, true, false)
        );
        return {
          type: NodeTypes.INTERPOLATION,
          loc: {
            source: `{{ ${jsCode} }}`,
          },
        };
      }

      // 元素
      // 递归处理
      if (child.type === NodeTypes.ELEMENT) {
        return transformTemplate(child);
      }

      return child;
    });
  }

  return ast;
}

const transformJS = (code, isInTemplate = false, isSetup = false) => {
  const ast = babelParser(code, {
    sourceType: 'unambiguous',
  });
  let shouldImport = false;
  const visitor = {
    // File: {
    //   //i18n-disable的不做替换
    //   enter(path) {
    //     let stop;
    //     path.traverse({
    //       CommentBlock(path) {
    //         if (path.node.value.includes('i18n-disable')) {
    //           stop = true;
    //         }
    //       },
    //     });
    //     if (stop) {
    //       path.stop();
    //     }
    //   },
    // },
    Program: {
      enter(path) {
        path.container.comments.forEach((v) => {
          if (v.value.includes('i18n-disable')) {
            stop = true;
          }
        });
        if (stop) {
          path.stop();
        }
        path.traverse({
          'StringLiteral|TemplateLiteral'(path) {
            // if (path.node.leadingComments) {
            //   // 过滤掉i18n-disable的注释
            //   path.node.leadingComments = path.node.leadingComments.filter(
            //     (comment, index) => {
            //       if (comment.value.includes('i18n-disable')) {
            //         path.node.skipTransform = true;
            //         return false;
            //       }
            //       return true;
            //     }
            //   );
            // }
            //   导入导出的路径不变
            if (path.findParent((p) => p.isImportDeclaration())) {
              path.node.skipTransform = true;
            }
          },
        });
      },
      exit(path) {
        // 模版js不需要导入i8n
        if (isInTemplate) return;
        path.traverse({
          ImportDeclaration(p) {
            const source = p.node.source.value;
            // 说明已经有导入声明了
            if (source === _importName) {
              shouldImport = false;
            }
          },
        });
        if (shouldImport) {
          // 导入_importName
          const importAst = template.ast(
            `import ${_importName} from '${_importPath}'`
          );
          path.node.body.unshift(importAst);
        }
      },
    },
    StringLiteral(path) {
      //
      if (path.node.skipTransform || !hasCN(path.node.value)) {
        return;
      }

      shouldImport = true;

      let replaceExpression = getReplaceExpressionAndSaveLocale(
        path,
        isInTemplate,
        isSetup
      );

      path.replaceWith(replaceExpression);
      path.skip();
    },
    TemplateLiteral(path) {
      //
      if (path.node.skipTransform) {
        return;
      }
      const qua = path.get('quasis');
      const includeCNCharacter = qua.some((v) => {
        const a = hasCN(v.node.value.raw);
        return a;
      });
      if (!includeCNCharacter) return;
      if (path.node.skipTransform) {
        return;
      }

      shouldImport = true;

      let replaceExpression;

      replaceExpression = getReplaceExpressionAndSaveLocale(
        path,
        isInTemplate,
        isSetup
      );

      path.replaceWith(replaceExpression);
      path.skip();
    },
  };

  babelTraverse.default(ast, visitor);
  return ast;
};

// 去掉;
function generateDirectiveCode(ast) {
  return babelGenerator(ast, {
    compact: false,
    jsescOption: {
      quotes: 'single',
    },
  }).code.replace(/;/gm, '');
}

function getReplaceExpressionAndSaveLocale(path, isInTemplate, isSetup) {
  let value, expressionParams;
  if (path.isTemplateLiteral()) {
    expressionParams = path.node.expressions.map(
      (item) => babelGenerator(item).code
    );
    value = path
      .get('quasis')
      .map((item) => item.node.value.raw)
      .reduce((prev, cur, index) => {
        // 创建placeholder
        return prev + `{${index - 1}}` + cur;
      });
  } else {
    value = path.node.value;
  }

  const key = generateHash(value);

  _locales[key] = value;

  let replacement;
  // this.$t
  if (!isSetup && !isInTemplate) {
    replacement = template.ast(
      `this.$t('${key}'${
        // 传递expressionParams
        expressionParams?.length
          ? ',' + '[' + expressionParams.join(',') + ']'
          : ''
      })`
    ).expression;
  } else {
    // 模版或者js
    replacement = template.ast(
      `${isInTemplate ? '$t' : _importName + '.global.t'}('${key}'${
        // 传递expressionParams
        expressionParams?.length
          ? ',' + '[' + expressionParams.join(',') + ']'
          : ''
      })`
    ).expression;
  }

  return replacement;
}

function saveLocaleAndGetkey(str) {
  const locale = str.trim();
  const key = generateHash(str);
  _locales[key] = locale;
  return key;
}

function generateElementAttr(attrs) {
  return attrs.map((attr) => attr?.loc?.source).join(' ');
}

function generateElement(node, children) {
  let attributes = '';
  if (node.props.length) {
    attributes = ` ${generateElementAttr(node.props)}`;
  }
  if (node.tag) {
    if (node.isSelfClosing || selfClosingTags.includes(node.tag)) {
      return `<${node.tag}${attributes} />`;
    }

    return `<${node.tag}${attributes}>${children}</${node.tag}>`;
  }

  return children;
}

function generateTemplate(templateAst, children = '') {
  if (templateAst?.children?.length) {
    children = templateAst.children.reduce(
      (result, child) => result + generateTemplate(child),
      ''
    );
  }

  // 元素节点
  if (templateAst.type === 1) {
    return generateElement(templateAst, children);
  }
  // 文本或者插值
  return templateAst.loc.source;
}

async function generateSfc(descriptor) {
  let result = '';
  const { template, script, scriptSetup, styles, customBlocks } = descriptor;
  [template, script, scriptSetup, ...styles, ...customBlocks].forEach(
    (block) => {
      if (block?.type) {
        result += `<${block.type}${Object.entries(block.attrs).reduce(
          (attrCode, [attrName, attrValue]) => {
            // 没有值的attr
            if (attrValue === true) {
              attrCode += ` ${attrName}`;
            } else {
              attrCode += ` ${attrName}="${attrValue}"`;
            }

            return attrCode;
          },
          // 初始值为空格，与type隔开
          ' '
        )}>${block.content}</${block.type}>`;
      }
    }
  );

  const file = glob.sync('**/.prettierrc.*');
  if (file.length) {
    let prettierConfigpath = path.resolve(process.cwd(), file[0]);
    const options = await prettier.resolveConfig(prettierConfigpath);
    options.parser = 'vue';
    return prettier.format(result, options);
  } else {
    return prettier.format(result, {
      parser: 'vue',
      semi: true,
      singleQuote: true,
    });
  }
}

export function generateHash(str) {
  // 文字内容去重
  const hash = createHash('md5');
  hash.update(str);
  return hash.digest('hex').slice();
}
