# Ceru Plugin CLI

0.3.11 用户 Ctrl+C/Esc 取消时正常退出（不再返回 130 让 `npm create` 报错）。

0.3.10 修复交互向导结束后进程不退出：会话结束停掉挂起的 stdin 读取，CLI 正常返回。

0.3.9 修复 Windows 下方向键选择失灵：连续提问不再反复切换原始模式，避免输入被行编辑缓冲吞掉。

0.3.8 的 `init` 与 `npm create ceru-plugin` 改用方向键选择模板与语言，选项自带模板说明，目录非空就地提示重填，Ctrl+C 可取消，创建后打印 `cd`／`npm` 步骤卡片。非交互终端保持原来的纯文本输出。

0.3.5 的 `playlistSections` 把原生音乐库内容放入 Host 现有本地／云歌单页。开发工作台提供相同的区块预览与 `sectionId` 导航；CLI 的 `--version` 读取当前包版本。

0.3.3 支持原生 Surface、账号退出菜单、登录弹框关闭及浏览器公共播放服务。

构建、调试和发行单文件 Ceru v2 插件。支持 TS/JS、Vue SFC、Vue TSX、React 和已有网页产物。

```bash
npm create ceru-plugin@latest my-plugin -- --template vue --lang ts
cd my-plugin
npm install
npm run dev
npm run build
```

Dev 启动独立 Electron 工作台，实际执行插件并支持 TS 源码断点、日志、搜索/解析、页面预览、权限模拟和宿主资源。VS Code 配置由脚手架生成。

`connected-library` 模板包含原生歌单网格、歌曲列表、账号菜单、导入与播放动作示例。`kind: 'native'` 的 Surface 使用逻辑端 `defineNativeView` 返回标准内容数据，工作台在 Host DOM 中预览；澜音用现有组件渲染并接入原生详情页和播放器。Vue/React 仍可用于插件自己的账号或设置页面。详见[原生 Surface 教程](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/main/docs/NATIVE-SURFACES.md)。

0.3.1 的播放解析结果可返回 `requestHeaders`。适用于要求 `Referer`、`Origin`、`User-Agent` 或认证头的临时媒体 URL；这些值由 Host 按完整 URL 注入，不应写入页面状态、日志或分享数据。

0.3.0 的 `web-surface` 模板包含通用页面生命周期示例。`modules.surfaces[]` 可声明 `title`、`presentation: { kind: 'drawer', placement: 'right', size: 480 }` 和 `lifecycle: { openAction: 'page.open', closeAction: 'page.close' }`。生命周期动作须在 `contributes.commands` 声明；打开完成后执行 openAction，关闭时取消页面请求并执行 closeAction。扫码、轮询、账号表单和校验全部写在插件工程中，Vue/React 也打包进最终单文件。

预览的“关闭页面”可验证清理逻辑。`ctx.ui.setState(id, state)` 只发送给对应页面；`ctx.subscribe` 接收最新状态。开发存储保存在工程 `.ceru-dev/storage/`，重启保留且不打入产物；修改 `manifest.id` 会使用独立存储。生产宿主提供自己的隔离存储和通用播放器服务，开发无需启动澜音。

```text
ceru-plugin list-templates
ceru-plugin build --out dist/plugin.js
ceru-plugin validate dist/plugin.js --json
ceru-plugin keygen --out .keys/publisher
ceru-plugin sign dist/plugin.js --key .keys/publisher.private.pem
```

最终交付单个 `.js`。JSX/TSX/Vue 只作为开发源码；编译器、node_modules 和开发服务器不进入产物。

Vue/React 生产运行代码会直接打入发行文件，不依赖宿主提供框架。执行 `ceru-plugin preview dist/plugin.js` 可以只加载最终文件验证页面。0.2.0 起发行格式使用静态 `exports.manifest / exports.activate / exports.surfaces`，并支持手写单文件插件。

构建产物先用 `const` 定义具名入口（如 `LogicMain`、`UiStudioSurface`）及模块表，再在文件末尾集中写入 `exports.activate / exports.surfaces / exports.resources`，方便阅读单文件产物和定位错误堆栈。插件源码仍可按需要使用函数或 class；构建器不会强制某一种编程风格。

`ceru.plugin.json` 的顶层 `config` 可直接写 JSON 对象，也可写 `@./path/config.ts` 引用 JSON/JS/TS 配置模块。字符串 `@@value` 表示字面量 `@value`。构建器递归展开引用，校验为 JSON 兼容对象，并合并到单文件的 `exports.manifest.config` 中。dev/build 会生成不包含配置值的 `@ceru/plugin-config` 类型声明。

在多根/父目录工作区中，请打开生成的 ceru-plugin.code-workspace 或把插件工程本身加入工作区。已经运行 dev 时选择 Attach to Ceru plugin；Launch 会启动或复用当前项目的 Host。

当前 v1 Host 不能直接安装 v2 产物。开发工作台不代替生产凭据保险箱、完整音乐业务或 Guest 安装。

源码 MIT；复用的预览图标/图片保留原项目 AGPL-3.0-only，见 ASSET_LICENSE 和 NOTICE。

[完整指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
