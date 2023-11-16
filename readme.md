### vue3-i18n-extractor

基于 babel 和@vue/compiler-sfc，将当前工作目录（cwd）内的汉语字符串提取为 JSON 到指定输出目录，同时将原有内容替换为 i18n 的占位符（如$t()或 i8n.global.t()），以实现自动国际化。

### 安装

```
$ npm i -D vue3-i18n-extractor
```

### 使用方法

cli命令

```
$ extract
```

### 选项

| 选项                           |                                                                          |
| ------------------------------ | ------------------------------------------------------------------------ |
| --importPath <path>            | i18n 的导出路径                                                          |
| --importName <name>            | i18n 的导出变量名                                                        |
| --outputPath <outputPath>      | 提取的 JSON 文件导出路径                                                 |
| --outputFileName <outputname> | 提取的 JSON 文件名,默认值为 zh-CN.json                                   |
| --pattern <pattern>           | 文件匹配模式，遵循 glob 语法，默认值为'\*_/_.{vue.js}                  |
| --ignore <ignore>             | 忽略文件，遵循 glob 语法，也可以是一个数组,默认值为'['node_modules/**'] |

可以使用 cli 命令指定，也可以在 package.json 中指定 i18nExtractOptions 指定选项参数,最终会与 cli 选项合并

```
type i18nExtractOptions ={
  pattern: string[]｜string;
  ignore: string[]|string;
  importPath?: string;
  importName?: string;
  outputPath?: string;
  outputFileName: string;
};

```

### 已知问题

受限于babel，vue模版语法中，绑定对象时，不可以有尾逗号

```
<!-- x -->
:style={color: 'red',}
<!-- ✔ -->
:style={color: 'red'}
```
