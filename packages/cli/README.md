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

在多根/父目录工作区中，请打开生成的 ceru-plugin.code-workspace 或把插件工程本身加入工作区。已经运行 dev 时选择 Attach to Ceru plugin；Launch 会启动或复用当前项目的 Host。

当前 v1 Host 不能直接安装 v2 产物。开发工作台不代替生产凭据保险箱、完整音乐业务或 Guest 安装。

源码 MIT；复用的预览图标/图片保留原项目 AGPL-3.0-only，见 ASSET_LICENSE 和 NOTICE。

[完整指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
