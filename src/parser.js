import { hasCN } from './util.js';
import generator from '@babel/generator';
import babelTraverse from '@babel/traverse';
import { createHash } from 'node:crypto';
import { parse as babelParser } from '@babel/parser';
import { parse as vueParser } from '@vue/compiler-sfc';
import babeltemplate from '@babel/template';
import path from 'path';
import {
  FileType as supportedFileType,
  NodeTypes,
  selfClosingTags,
} from './constants.js';
import prettier from 'prettier';
import { glob } from 'glob';

let _importName, _importPath, _locales, _fileType;
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
  _fileType = path.extname(filename);

  if (!Object.values(supportedFileType).includes(_fileType)) {
    console.warn('unsupported filedtype: ' + _fileType);
    return {};
  }

  // 检测代码字符串中没有中文字符
  if (!hasCN(code)) {
    console.warn('no chinese character in ' + filename);
    return {};
  }

  // JS类型，直接交给babel
  if (_fileType === supportedFileType.JS) {
    const jsAst = transformJS(code, false, true);
    // 如果使用了魔法注释，那么跳过提取
    if (stop) {
      stop = false;
      return { result, skip: true };
    }
    // 使用修改后的AST生成code
    result = babelGenerator(jsAst).code;

    return { result, skip: false };
  } else {
    let sfcDescriptor;
    sfcDescriptor = vueParser(code).descriptor;
    const templateAst = sfcDescriptor.template.ast;
    const scriptSetup = sfcDescriptor.scriptSetup?.content;
    const script = sfcDescriptor.script?.content;
    sfcDescriptor.template.content = generateTemplate({
      ...transformTemplate(templateAst),
      // 生成template内部的字符串，因此不要带template标签
      tag: '',
    });
    // script和scriptSetup的部分交给babel处理
    if (script)
      sfcDescriptor.script.content = babelGenerator(
        transformJS(script, false, false)
      ).code;
    if (scriptSetup)
      sfcDescriptor.scriptSetup.content = babelGenerator(
        transformJS(scriptSetup, false, true)
      ).code;
    // 生成sfc
    result = await generateSfc(sfcDescriptor);

    return { result, skip: false };
  }
};

function transformTemplate(ast) {
  if (ast.props.length) {
    // props中有两种有中文字符的可能，指令绑定中的experssion和普通属性绑定中的字符串
    ast.props = ast.props.map((prop) => {
      // 指令
      if (prop.type === NodeTypes.DIRECTIVE && prop?.exp?.content) {
        const l = prop.exp.content.length;
        // 指令内容为单引号字符串导致无法读取ast，将单引号替换为模版字符串引号
        if (prop.exp.content[0] === "'" && prop.exp.content[l - 1] === "'") {
          prop.exp.content = `\`${prop.exp.content.slice(1, l - 1)}\``;
        }

        let jsCode;
        // 去掉空格和换行
        let c = prop.exp.content.replace(/[\n]/g, '');

        //  babel会把{}识别为块作用域,所以要处理一下，拼接一个括号，让babel认为是一个表达式
        if (/^\{.*\}$/.test(c)) {
          c = `(${c})`;
        }
        jsCode = generateDirectiveCode(transformJS(c, true, false));
        // 去掉括号
        if (jsCode.startsWith('(') && jsCode.endsWith(')')) {
          jsCode = jsCode.replace(/^\(|\)$/g, '');
        }

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
          const localeKey = saveLocale(prop.value.content);
          return {
            name: 'bind',
            type: NodeTypes.DIRECTIVE,
            loc: {
              source: `:${prop.name}="$t('${localeKey}')"`,
            },
          };
        }
      }

      return prop;
    });
  }

  if (ast.children.length) {
    ast.children = ast.children.map((child) => {
      if (child.type === NodeTypes.TEXT && hasCN(child.content)) {
        const localeKey = saveLocale(child.content);
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
    Program: {
      enter(path) {
        path.container.comments.forEach((v) => {
          // 使用了魔法注释
          if (v.value.includes('i18n-disable')) {
            stop = true;
          }
        });
        if (stop) {
          // 停止遍历AST
          path.stop();
        }
        path.traverse({
          'StringLiteral|TemplateLiteral'(path) {
            //   导入导出的路径对应的字符串不变
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
          // 如果应该新增加对i18n的导入，那么在body中加入一条import语句
          path.node.body.unshift(importAst);
        }
      },
    },
    StringLiteral(path) {
      if (path.node.skipTransform || !hasCN(path.node.value)) {
        return;
      }
      shouldImport = true;
      let replaceExpression = getReplaceExpression(path, isInTemplate, isSetup);

      path.replaceWith(replaceExpression);
      path.skip();
    },
    TemplateLiteral(path) {
      if (path.node.skipTransform) {
        return;
      }
      const qua = path.get('quasis');
      const includeCNCharacter = qua.some((v) => {
        const a = hasCN(v.node.value.raw);
        return a;
      });
      if (!includeCNCharacter) return;

      shouldImport = true;

      let replaceExpression;

      replaceExpression = getReplaceExpression(path, isInTemplate, isSetup);

      path.replaceWith(replaceExpression);
      path.skip();
    },
  };

  babelTraverse.default(ast, visitor);
  return ast;
};

// 去掉babel附带的”;“
function generateDirectiveCode(ast) {
  return babelGenerator(ast, {
    compact: false,
    jsescOption: {
      quotes: 'single',
    },
  }).code.replace(/;/gm, '');
}

function getReplaceExpression(path, isInTemplate, isSetup) {
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

  const key = saveLocale(value);

  let replacement;
  // this.$t，对应组件选项对象
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
    // 模版或者js，也包括setup
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

// 保存提取出的中文字符，用md5做key
function saveLocale(str) {
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
    // 注意要留出来一个空格
    attributes = ` ${generateElementAttr(node.props)}`;
  }
  // 自闭合标签
  if (node.tag) {
    if (node.isSelfClosing || selfClosingTags.includes(node.tag)) {
      return `<${node.tag}${attributes} />`;
    }

    return `<${node.tag}${attributes}>${children}</${node.tag}>`;
  }

  return children;
}

function generateTemplate(templateAst, children = '') {
  // 先处理children
  if (templateAst?.children?.length) {
    children = templateAst.children.reduce(
      (result, child) => result + generateTemplate(child),
      ''
    );
  }

  // 根据children拼成模版
  if (templateAst.type === 1) {
    return generateElement(templateAst, children);
  }
  // 递归的结束条件，文本或者插值，不再有children
  return templateAst.loc.source;
}
// function generateElement(node, childStr) {
//   // 非元素
//   if (node.type !== NodeTypes.ELEMENT) {
//     return node.loc.source;
//   }

//   let attr = ' ';
//   if (node.props?.length) {
//     attr += generateElementAttr(node.props);
//   }

//   if (node.tag) {
//     if (node.isSelfClosing || selfClosingTags.includes(node.tag)) {
//       return `<${node.tag}${attr} />`;
//     }
//     return `<${node.tag}${attr}>${childStr}</${node.tag}>`;
//   }
//   // 最外层节点
//   return childStr;
// }
// function generateTemplate(ast) {
//   let childStr = '';
//   if (ast.children?.length) {
//     childStr = ast.children.map((v) => generateTemplate(v)).join('');
//   }

//   return generateElement(ast, childStr);
// }

// 用每个模块的tag，attr，content， 拼接出整个.vue文件
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

  // 读取本地的prettier文件，对代码进行格式化
  const file = glob.sync('**/.prettierrc.*');
  if (file.length) {
    let prettierConfigpath = path.resolve(process.cwd(), file[0]);
    const options = await prettier.resolveConfig(prettierConfigpath);
    // 根据fileType确定如何格式化
    options.parser = _fileType.slice(1);
    return prettier.format(result, options);
  } else {
    return prettier.format(result, {
      parser: _fileType.slice(1),
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
