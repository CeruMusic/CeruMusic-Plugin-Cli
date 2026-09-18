# Ceru Plugin CLI

构建、调试和发行单文件 Ceru v2 插件。支持 TS/JS、Vue SFC、Vue TSX、React 和已有网页产物。

```bash
npm create ceru-plugin@latest my-plugin -- --template vue --lang ts
cd my-plugin
npm install
npm run dev
npm run build
```

Dev 启动独立 Electron 工作台，实际执行插件并支持 TS 源码断点、日志、搜索/解析、页面预览、权限模拟和宿主资源。VS Code 配置由脚手架生成。

```text
ceru-plugin list-templates
ceru-plugin build --out dist/plugin.js
ceru-plugin validate dist/plugin.js --json
ceru-plugin keygen --out .keys/publisher
ceru-plugin sign dist/plugin.js --key .keys/publisher.private.pem
```

最终交付单个 `.js`。JSX/TSX/Vue 只作为开发源码；编译器、node_modules 和开发服务器不进入产物。

Vue/React 生产运行代码会直接打入发行文件，不依赖宿主提供框架。执行 `ceru-plugin preview dist/plugin.js` 可以只加载最终文件验证页面。0.2.0 起发行格式使用静态 `exports.manifest / exports.activate / exports.surfaces`，并支持手写单文件插件。

构建产物保留可读的入口名称（如 `LogicMain`、`UiStudioSurface`），并使用 `const` 声明每个 esbuild 入口容器，方便在单文件产物和错误堆栈中定位逻辑。插件源码仍可按需要使用函数或 class；构建器不会强制某一种编程风格。

`ceru.plugin.json` 的顶层 `config` 可直接写 JSON 对象，也可写 `@./path/config.ts` 引用 JSON/JS/TS 配置模块。字符串 `@@value` 表示字面量 `@value`。构建器递归展开引用，校验为 JSON 兼容对象，并合并到单文件的 `exports.manifest.config` 中。dev/build 会生成不包含配置值的 `@ceru/plugin-config` 类型声明。

在多根/父目录工作区中，请打开生成的 ceru-plugin.code-workspace 或把插件工程本身加入工作区。已经运行 dev 时选择 Attach to Ceru plugin；Launch 会启动或复用当前项目的 Host。

当前 v1 Host 不能直接安装 v2 产物。开发工作台不代替生产凭据保险箱、完整音乐业务或 Guest 安装。

源码 MIT；复用的预览图标/图片保留原项目 AGPL-3.0-only，见 ASSET_LICENSE 和 NOTICE。

[完整指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
