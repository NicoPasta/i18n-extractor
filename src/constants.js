/**
 * 配置项类型
 */
exports.ConfigOptions = {
  pattern: "**/*.{vue,js}",
  ignore: ["node_modules/**"],
  output: "./zh-CN-extracted.js",
  importPath: "",
};

/**
 * 文件类型
 */
exports.FileType = {
  JS: ".js",
  VUE: ".vue",
};

/**
 * vue Template ast节点类型
 */
exports.NodeTypes = {
  ROOT: 0,
  ELEMENT: 1,
  TEXT: 2,
  COMMENT: 3,
  SIMPLE_EXPRESSION: 4,
  INTERPOLATION: 5,
  ATTRIBUTE: 6,
  DIRECTIVE: 7,
  COMPOUND_EXPRESSION: 8,
  IF: 9,
  IF_BRANCH: 10,
  FOR: 11,
  TEXT_CALL: 12,
  VNODE_CALL: 13,
};

exports.selfClosingTags = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];
