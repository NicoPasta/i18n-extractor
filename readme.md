
### 基于babel和@vue/compiler-sfc，将项目内的汉语提取为JSON到指定输出目录，同时将原有内容替换为i18n的占位符（如$t()或i8n.global.t()），以实现自动国际化。

### 安装

```
    npm i -D vue-i18n-transformer
```   

### 使用方法
    cli命令 
```
  $ trans
```
## 选项
| 选项 |    |
|---------|---------|
| --importPath <path> | i18n的导出路径 | 
| --importName <name> | i18n的导出变量名 | 
| --outputPath <outputPath> | 提取的JSON文件导出路径 | 
| --outputFileName <outputname>' | 提取的JSON文件名,默认值为zh-CN.json |
| --pattern <pattern>' | 文件匹配模式，遵循glob语法，默认值为'**/*.{vue.js}' |
| --ignore <ignore>' | 忽略文件，遵循glob语法，也可以是一个数组,默认值为'['node_modules/**']' |

可以使用cli命令指定，也可以在package.json中指定i18nExtractOptions指定选项参数,最终会与cli选项合并


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

vue模版语法中，绑定对象时，对面不可以有尾逗号

```
<!-- x -->
:style={color: 'red',}
<!-- ✔ -->
:style={color: 'red'}
```




