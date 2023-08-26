const { isCN, hasCN } = require("./util");
const fse = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const { declare } = require("@babel/helper-plugin-utils");
const babelGenerator = require("@babel/generator").default;
const babelTreverse = require("@babel/traverse").default;
const { parse: babelParser } = require("@babel/parser");
const { parse: vueParser } = require("@vue/compiler-sfc");
const template = require("@babel/template");
const path = require("path");
const {
  FileType: supportedFileType,
  NodeTypes,
  selfClosingTags,
} = require("./constants");
const prettier = require("prettier");

const intl = "i18n";
const intlPath = "./index.js";

exports.transfrom = function (
  code,
  locales,
  importName,
  importPath,
  filename,
  outputDir
) {
  let result = "";
  const fileType = path.extname(filename);

  if (!supportedFileType[fileType]) {
    console.warn("unsupported filedtype:" + fileType);
    return;
  }

  if (!hasCN(code)) {
    console.warn("no chinese character in" + filename);
    return;
  }

  if (fileType === supportedFileType.JS) {
    const jsAst = transformJS(code, locales, false, false);
    result = babelGenerator(jsAst);
  } else {
    const vueDescriptor = vueParser(code).descriptor;
    const templateAst = vueDescriptor.template.ast;
    const scriptSetup = vueDescriptor.scriptSetup?.content;
    const script = vueDescriptor.script?.content;
    vueDescriptor.template.content = generateTemplate({
      ...transformTemplate(vueDescriptor?.template?.ast),
      tag: "",
    });
    vueDescriptor.script.content = babelGenerator(
      transformJS(vueDescriptor.script.content)
    ).code();
  }
};

const transformTemplate = (ast) => {
  if (ast.props.length) {
    ast.props = ast.props.map((prop) => {
      // 指令
      if (prop.type === NodeTypes.DIRECTIVE && prop?.exp?.content) {
        const jsCode = generateDirectiveCode(
          transformJS(prop.exp.content, locales, true, false)
        );
        prop.exp.content = jsCode;
        const splitPoint = prop.loc.source.indexOf("=");
        const attr = prop.loc.source.subString(0, splitPoint);
        prop.loc.source = attr + `="${jsCode}"`;
        return prop;
      }

      // 普通属性 替换为v-bind
      if (prop.type === NodeTypes.ATTRIBUTE && prop?.loc?.source) {
        const localeKey = saveLocaleAndGetkey(prop.loc.source);
        return {
          name: "bind",
          type: NodeTypes.DIRECTIVE,
          loc: {
            source: `:${prop.name}="$t('${localeKey}')"`,
          },
        };
      }
    });
  }

  if (ast.children.length) {
    ast.children = ast.children.map((child) => {
      if (child.type === NodeTypes.TEXT && hasCN(child.content)) {
        const localeKey = saveLocaleAndGetkey(prop.loc.source);
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
        const jsCode = generateDirectiveCode(
          // child.content?.content是js表达式
          transformJS(child.content?.content, locales, true, false)
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
        return this.transformTemplate(child);
      }

      return child;
    });
  }

  return ast;
};

const transformJS = (code, locales, isInTemplate = false, isSetup = false) => {
  const ast = babelParser(code, {
    sourceType: "module",
  });
  let shouldImport = false;
  const visitor = {
    Program: {
      enter(path) {
        path.traverse({
          "StringLiteral|TemplateLiteral"(path) {
            if (path.node.leadingComments) {
              // 过滤掉i18n-disable的注释
              path.node.leadingComments = path.node.leadingComments.filter(
                (comment, index) => {
                  if (comment.value.includes("i18n-disable")) {
                    path.node.skipTransform = true;
                    return false;
                  }
                  return true;
                }
              );
              //   导入导出的路径不变
              if (path.findParent((p) => p.isImportDeclaration())) {
                path.node.skipTransform = true;
              }
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
            if (source === intl) {
              shouldImport = false;
            }
          },
        });
        if (shouldImport) {
          // 导入intl
          const importAst = api.template.ast(
            `import ${intl} from '${intlPath}'`
          );
          path.node.body.unshift(importAst);
        }
      },
    },
    StringLiteral(path) {
      //
      if (path.node.skipTransform || !isCN(path.node.value)) {
        return;
      }

      shouldImport = true;

      let replaceExpression = getReplaceExpressionAndSaveLocale(
        path,
        isInTemplate,
        isSetup,
        locales
      );

      path.replaceWith(replaceExpression);
      path.skip();
    },
    TemplateLiteral(path) {
      //
      if (path.node.skipTransform) {
        return;
      }
      const qua = path.get("quasis");
      const hasCN = qua.some((v) => {
        const a = isCN(v.node.value.raw);
        return a;
      });
      if (!hasCN) return;
      if (path.node.skipTransform) {
        return;
      }

      shouldImport = true;

      let replaceExpression;

      replaceExpression = getReplaceExpressionAndSaveLocale(
        path,
        isInTemplate,
        isSetup,
        locales
      );

      path.replaceWith(replaceExpression);
      path.skip();
    },
  };

  babelTreverse(ast, visitor);
  return ast;
};

// 去掉;
function generateDirectiveCode(ast) {
  return babelGenerator(ast, {
    compact: false,
    jsescOption: {
      quotes: "single",
    },
  }).code.replace(/;/gm, "");
}

function getReplaceExpressionAndSaveLocale(
  path,
  isInTemplate,
  isSetup,
  locales
) {
  const expressionParams = path.isTemplateLiteral()
    ? path.node.expressions.map((item) => generate(item).code)
    : null;

  const value = expressionParams?.length
    ? path
        .get("quasis")
        .map((item) => item.node.value.raw)
        .reduce((prev, cur, index) => {
          // 创建placeholder
          return prev + `{${index - 1}}` + cur;
        })
    : path.node.value;

  const key = uuidv4();

  locales[key] = value;

  // this.$t
  if (!isSetup && !isInTemplate) {
    replacement = template.ast(
      `this.$t('${key}'${
        // 传递expressionParams
        expressionParams?.length
          ? "," + "[" + expressionParams.join(",") + "]"
          : ""
      })`
    ).expression;
  } else {
    // 模版或者js
    let replacement = template.ast(
      `${isInTemplate ? "$t" : intl + ".t"}('${key}'${
        // 传递expressionParams
        expressionParams?.length
          ? "," + "[" + expressionParams.join(",") + "]"
          : ""
      })`
    ).expression;
  }

  return replacement;
}

function saveLocaleAndGetkey(str, locales) {
  const locale = char.trim();
  const key = uuidv4();
  locales[key] = locale;
  return key;
}

function generateElementAttr(attrs) {
  return attrs.map((attr) => attr.loc.source).join(" ");
}

function generateElement(node, children) {
  let attributes = "";

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

function generateTemplate(templateAst, children = "") {
  if (templateAst?.children?.length) {
    children = templateAst.children.reduce(
      (result, child) => result + generateTemplate(child),
      ""
    );
  }

  // 元素节点
  if (templateAst.type === 1) {
    return generateElement(templateAst, children);
  }
  // 文本或者插值
  return templateAst.loc.source;
}

function generateSfc(descriptor) {
  let result = "";
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
          " "
        )}>${block.content}</${block.type}>`;
      }
    }
  );

  return prettier.format(result, {
    parser: "vue",
    semi: true,
    singleQuote: true,
  });
}
