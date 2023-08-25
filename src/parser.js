const { isCN } = require("./util");
const fse = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const { declare } = require("@babel/helper-plugin-utils");
const babelGenerator = require("@babel/generator").default;
const babelTreverse = require("@babel/traverse").default;
const { parse: babelParser } = require("@babel/parser");
const { parse: vueParser } = require("@vue/compiler-sfc");
const template = require("@babel/template");
const path = require("path");
const { FileType: supportedFileType, NodeTypes } = require("./constants");

const locales = {};

const intl = "i18n";
const intlPath = "./index.js";

function startTransfrom() {}

function transfromTemplate() {}

exports.transfrom = function (
  code,
  locales,
  importName,
  importPath,
  filename,
  outputDir
) {
  let result = "";
  const locals = {};
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
    const jsAst = transformJS(code, false, false);
    result = babelGenerator(jsAst);
  } else {
    const vueDescriptor = vueParser(code).descriptor;
    const templateAst = vueDescriptor.template.ast;
    const scriptSetup = vueDescriptor.scriptSetup?.content;
    const script = vueDescriptor.script?.content;
  }
};

const transformTemplate = (ast) => {
  if (ast.props.length) {
    ast.props = ast.props.map((prop) => {
      if (prop.type === NodeTypes.DIRECTIVE) {
        const jsCode = generateDirectiveCode(
          transformJS(prop.exp.content, true)
        );
      }
    });
  }
};

const transformJS =
  // declare(
  (code, isInTemplate = false, isSetup = false) => {
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
          isSetup
        );

        path.replaceWith(replaceExpression);
        path.skip();
      },
    };

    babelTreverse(ast, visitor);
    return ast;
  };

// );

function getReplaceExpressionAndSaveLocale(path, isInTemplate, isSetup) {
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
