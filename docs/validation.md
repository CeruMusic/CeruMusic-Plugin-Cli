# v0.1.0 验证记录

本地环境：Windows、Node.js 22.23.1、Electron 44.4.2。

- 37 项自动测试通过：覆盖 9 类模板的 TS/JS 变体、类型错误、二进制资源、路径边界、静态校验、签名/篡改、个性化范围、流式发放和开发服务器。
- Vue、Vue TSX、React 和 web-dist 均通过真实 Electron 运行检查，验证按钮交互、共享图标/资源、Lodash、搜索/解析、源码映射和调试断点。
- 在独立目录中安装实际 npm tarball 后，成功使用脚手架创建并构建 Vue 工程；静态校验通过，示例发行文件为 7.5 KB。
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
~~~
