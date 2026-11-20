# create-ceru-plugin

**本地 v3 候选开发包（尚未发布）**：不要用 npm 的 latest 验收本分支。维护者在工具链运行 `npm run build`、`npm run pack:all`、`npm run pack:devkit`。将生成的目录交给开发者，照目录内 README 在一个空目录创建独立项目，不需要全局 CLI 或工作区软链接。首次安装第三方依赖需要可用的 npm 缓存或网络。

要做播放规则，选择 `--template playback-hook --lang ts`（也支持 js），安装后运行 `npm test`。可编辑 `tests/hooks.json` 新增场景。每个场景会在新 worker 中用真实 v3 契约执行，失败会报告场景名；不连接实际播放器。`npm run dev` 用于在桌面开发模式中复验。

0.3.12 插件网络请求支持宿主注入代理：`requestNetwork` 新增 `setNetworkProxyResolver`，宿主可让搜索、歌词等请求遵循应用自身的网络代理设置。

0.3.11 用户 Ctrl+C/Esc 取消时正常退出（不再返回 130 让 `npm create` 报错）。

0.3.10 修复交互向导结束后进程不退出：会话结束停掉挂起的 stdin 读取，CLI 正常返回。

0.3.9 修复 Windows 下方向键选择失灵：连续提问不再反复切换原始模式，避免输入被行编辑缓冲吞掉。

0.3.8 的脚手架支持方向键选择模板（每项带一行说明）与语言，目录非空会当场提示重填，创建后给出 `cd`／`npm` 步骤卡片；非交互终端仍输出纯文本。

0.3.5 的 `connected-library` 以 `playlistSections` 集成现有歌单页，并演示按 `sectionId` 导航定位。

0.3.3 的 `connected-library` 模板包含原生歌单网格、歌曲列表、账号摘要与 Host 播放／导入动作示例。

类似 create-vue 的 Ceru Music 插件脚手架。

```bash
npm create ceru-plugin@latest
```

也可以直接选择模板：

```bash
npm create ceru-plugin@latest my-plugin -- --template react --lang ts
cd my-plugin
npm install
npm run dev
npm run build
```

提供 11 种模板，每种都有 TS 和 JS 变体、VS Code 配置和离线模板快照。最终只分发 dist/plugin.js。

脚手架是可选的：不需要第三方包或编译语法时，可以直接编写 `exports.manifest / exports.activate / exports.surfaces` 单文件插件。CLI 项目中的第三方依赖会打入最终 JS，Host 模块不会重复打包。

模板：source、connected-library、importer、guest-adapter、web-surface、vue、vue-tsx、react、web-dist、page-extension、playback-hook。

[工具链指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme) · [模板和社区插件](https://github.com/CeruMusic/CeruMusic-Plugin-Template)
