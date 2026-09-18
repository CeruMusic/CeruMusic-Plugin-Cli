# v0.1.2 验证记录

本地环境：Windows、Node.js 22.23.1、Electron 44.4.2。

- 38 项自动测试通过：覆盖 9 类模板的 TS/JS 变体、旧共享框架配置迁移、工作区调试配置、类型错误、二进制资源、路径边界、静态校验、签名/篡改、个性化范围、流式发放和开发服务器。
- Vue、Vue TSX、React 和 web-dist 均通过真实 Electron 运行检查，验证按钮交互、共享图标/资源、Lodash、搜索/解析、源码映射和调试断点。
- Vue、Vue TSX、React 另行通过仅加载发行 JS 的测试：预览目录无源码或依赖包，Host 无框架加载接口；按钮交互、解析和普通 CSS 副作用导入通过。
- 开发调试等待真实 Electron 页面就绪；重复启动同一项目的 --ensure-running 会复用 Host。
- 初版 npm tarball 安装测试和公开 npm 创建/构建测试通过。0.1.2 的框架产物包含生产运行代码，体积会大于旧版依赖宿主的文件。
- 发行库的 TypeScript 接口通过仅启用 ES2022/Node 类型库的后端编译检查。
- npm audit 当前报告 0 项已知漏洞。

上述检查不代表不存在未知缺陷。当前是工具链首个版本；生产 Host 的凭据保险箱、完整播放/下载/分享服务以及 Guest 安装仍需按协议接入。

可复现命令：

~~~bash
npm ci
npm test
npm run pack:all
node -e "require('electron')"
node test/electron-smoke.mjs /path/to/electron vue
node test/electron-smoke.mjs /path/to/electron vue-tsx
node test/electron-smoke.mjs /path/to/electron react
node test/electron-smoke.mjs /path/to/electron web-dist
node test/electron-smoke.mjs /path/to/electron vue release
node test/electron-smoke.mjs /path/to/electron react release
node test/electron-smoke.mjs /path/to/electron vue-tsx release
~~~
