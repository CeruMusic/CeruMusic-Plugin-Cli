# v0.2.0 验证记录

本地环境：Windows、Node.js 22.23.1、Electron 44.4.2。

- 自动测试覆盖 9 类模板的 TS/JS 变体、手写单文件、第三方 CommonJS 打包、Host 模块外置、首页贡献、全局样式权限、标准歌曲/歌词校验、旧共享框架配置迁移、工作区调试配置、类型错误、路径边界、签名/篡改、个性化范围、流式发放和开发服务器。
- Vue、Vue TSX、React 和 web-dist 均通过真实 Electron 运行检查，验证按钮交互、共享图标/资源、Lodash、搜索/解析、源码映射和调试断点。
- Vue、Vue TSX、React 另行通过仅加载发行 JS 的测试：预览目录无源码或依赖包，Host 无框架加载接口；按钮交互、解析和普通 CSS 副作用导入通过。
- 开发调试等待真实 Electron 页面就绪；重复启动同一项目的 --ensure-running 会复用 Host。
- Vue/React 生产运行代码包含在插件文件；Axios、Socket.IO、WebSocket、Lodash 和明确的 `@ceru/*` 模块由 Host 提供。
- 0.2.0 产物使用静态 `exports.manifest / exports.activate / exports.surfaces`。旧 `CeruPlugin.define()` v2 文件仍可验证并给出迁移提示。
- 发行库的 TypeScript 接口通过仅启用 ES2022/Node 类型库的后端编译检查。
- npm audit 当前报告 0 项已知漏洞。

上述检查不代表不存在未知缺陷。生产 Host 的凭据保险箱、完整账号/歌单/播放/下载/分享服务、首页 Slot 和 Guest 安装仍需按协议接入。本轮不会修改 CeruMusic 正式 Core。

可复现命令：

```bash
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
```
