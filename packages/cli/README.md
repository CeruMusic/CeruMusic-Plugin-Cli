# Ceru Plugin CLI

v3 新增 `ceru-plugin check-compat`（新工程也可 `npm run check:compat`），检查宿主 API、组件库范围与区域版本。可用 `--host profile.json` 指定目标宿主；未指定时仅与工具包参考版本比较。命令支持 `--json`，冲突返回非零退出码。它不代替类型检查或实际桌面验收，详见 [兼容性检查](../../docs/COMPATIBILITY.md)。

**v3.0.0 工具链已发布**：使用 `npx create-ceru-plugin@3.0.0` 创建工程。v3 插件需要支持 v3 的 2.5.0 宿主；桌面软件正式 Release 按用户要求暂缓，当前使用本地测试版。旧版宿主的作者可用 `npx create-ceru-plugin@0.3.16` 或 `@legacy-v2`。离线作者套件见 [v3.0.0 Release](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/releases/tag/v3.0.0)，源码构建和本地验收记录仍保留。

要做播放规则，选择 `--template playback-hook --lang ts`（也支持 js），安装后运行 `npm test`。可编辑 `tests/hooks.json` 新增场景。每个场景会在新 worker 中用真实 v3 契约执行，失败会报告场景名；不连接实际播放器。`npm run dev` 用于在桌面开发模式中复验。

0.3.12 插件网络请求支持宿主注入代理：`requestNetwork` 新增 `setNetworkProxyResolver`，宿主可让搜索、歌词等请求遵循应用自身的网络代理设置。

0.3.11 用户 Ctrl+C/Esc 取消时正常退出（不再返回 130 让 `npm create` 报错）。

0.3.10 修复交互向导结束后进程不退出：会话结束停掉挂起的 stdin 读取，CLI 正常返回。

0.3.9 修复 Windows 下方向键选择失灵：连续提问不再反复切换原始模式，避免输入被行编辑缓冲吞掉。

0.3.8 的 `init` 与 `npm create ceru-plugin` 改用方向键选择模板与语言，选项自带模板说明，目录非空就地提示重填，Ctrl+C 可取消，创建后打印 `cd`／`npm` 步骤卡片。非交互终端保持原来的纯文本输出。

0.3.5 的 `playlistSections` 把原生音乐库内容放入 Host 现有本地／云歌单页。开发工作台提供相同的区块预览与 `sectionId` 导航；CLI 的 `--version` 读取当前包版本。

0.3.3 支持原生 Surface、账号退出菜单、登录弹框关闭及浏览器公共播放服务。

构建、调试和发行单文件 Ceru v3 插件。支持 TS/JS、Vue SFC、Vue TSX、React 和已有网页产物。

```bash
ceru-plugin init my-plugin --template vue --lang ts
cd my-plugin
npm install
npm run dev
npm run build
```

dev 只监听并构建。在澜音「设置 → 插件 → 插件开发者模式」添加终端打印的文件；保存源码后由真实宿主重载。F5 的 Watch Ceru plugin 启动相同监听器。

用 `ceru-plugin init my-page --template page-extension --lang ts` 可生成带侧栏、设置页和歌单按钮的 Vue 示例。`dev` 会复用已通过的检查结果；若脚本、模板表达式或模板结构无效，终端会报错，桌面保持上次可用的产物。修正后无需重启监听。安装或更换依赖后请重启监听；交付前仍应运行 `ceru-plugin build` 做完整检查。

`connected-library` 模板包含原生歌单网格、歌曲列表、账号菜单、导入与播放动作示例。`kind: 'native'` 的 Surface 使用逻辑端 `defineNativeView` 返回标准内容数据，工作台在 Host DOM 中预览；澜音用现有组件渲染并接入原生详情页和播放器。Vue/React 仍可用于插件自己的账号或设置页面。详见[原生 Surface 教程](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/main/docs/NATIVE-SURFACES.md)。

0.3.1 的播放解析结果可返回 `requestHeaders`。适用于要求 `Referer`、`Origin`、`User-Agent` 或认证头的临时媒体 URL；这些值由 Host 按完整 URL 注入，不应写入页面状态、日志或分享数据。

`web-surface` 模板包含通用页面生命周期示例。`entry.views[]` 可声明 `title`、`presentation: { kind: 'drawer', placement: 'right', size: 480 }` 和 `lifecycle: { openAction: 'page.open', closeAction: 'page.close' }`。生命周期动作须在 `provides.actions` 声明；打开完成后执行 openAction，关闭时取消页面请求并执行 closeAction。扫码、轮询、账号表单和校验全部写在插件工程中，Vue/React 也打包进最终单文件。

预览的“关闭页面”可验证清理逻辑。`ctx.ui.setState(id, state)` 只发送给对应页面；`ctx.subscribe` 接收最新状态。开发存储保存在工程 `.ceru-dev/storage/`，重启保留且不打入产物；修改 `manifest.id` 会使用独立存储。生产宿主提供自己的隔离存储和通用播放器服务，开发无需启动澜音。

```text
ceru-plugin list-templates
ceru-plugin migrate --project path/to/v2-project
ceru-plugin build --out dist/plugin.js
ceru-plugin validate dist/plugin.js --json
ceru-plugin keygen --out .keys/publisher
ceru-plugin sign dist/plugin.js --key .keys/publisher.private.pem
```

最终交付单个 `.js`。JSX/TSX/Vue 只作为开发源码；编译器、node_modules 和开发服务器不进入产物。

`component` 视图引用宿主提供的 Vue、TDesign 与 SDK 组件，不把这些运行库或软件业务组件复制进插件；`web` 视图中的 Vue/React 页面可将自己的运行库打入发行文件。执行 `ceru-plugin preview dist/plugin.js` 只校验最终文件并显示桌面预览路径，不再启动独立窗口。发行格式使用静态 `exports.manifest / exports.activate / exports.surfaces`，并支持手写单文件插件。

构建产物先用 `const` 定义具名入口（如 `LogicMain`、`UiStudioSurface`）及模块表，再在文件末尾集中写入 `exports.activate / exports.surfaces / exports.resources`，方便阅读单文件产物和定位错误堆栈。插件源码仍可按需要使用函数或 class；构建器不会强制某一种编程风格。

`ceru.plugin.json` 的顶层 `config` 可直接写 JSON 对象，也可写 `@./path/config.ts` 引用 JSON/JS/TS 配置模块。字符串 `@@value` 表示字面量 `@value`。构建器递归展开引用，校验为 JSON 兼容对象，并合并到单文件的 `exports.manifest.config` 中。dev/build 会生成不包含配置值的 `@ceru/plugin-config` 类型声明。

在多根/父目录工作区中，请打开生成的 ceru-plugin.code-workspace 或把插件工程本身加入工作区。已在终端运行 dev 时不需要再启动监听器。

v2 Host 不能直接安装 v3 产物。开发工作台不代替生产凭据保险箱、完整音乐业务或 Guest 安装。

源码 MIT；复用的预览图标/图片保留原项目 AGPL-3.0-only，见 ASSET_LICENSE 和 NOTICE。

[完整指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)

## 调试跨插件服务

在桌面开发者模式分别添加两个插件的构建产物，可验证真实权限、依赖、暂停与恢复。若用 CLI 的旧产物预览做离线联调，可在工程根目录的 `ceru.config.json` 设置固定 JSON 响应，例如：

```json
{"mockServices":[{"pluginId":"example.provider","service":"echo","version":"1.2.0","returns":{"reply":{"text":"模拟响应"}}}]}
```

模拟服务仍检查清单依赖、版本和 `services.consume` 授权，不执行脚本，不被打进正式产物，也不改变真实桌面插件。
