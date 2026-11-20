# Ceru Music Plugin Tooling

新工程提供 `npm run check:compat`，可在构建前检查目标宿主的 API、组件库版本与播放器区域契约。检查范围与 `--host` 用法见[兼容性检查](docs/COMPATIBILITY.md)。

**本地 v3 候选开发包（尚未发布）**：不要用 npm 的 latest 验收本分支。维护者在工具链运行 `npm run build`、`npm run pack:all`、`npm run pack:devkit`。将生成的目录交给开发者，照目录内 README 在一个空目录创建独立项目，不需要全局 CLI 或工作区软链接。首次安装第三方依赖需要可用的 npm 缓存或网络。

要做播放规则，选择 `--template playback-hook --lang ts`（也支持 js），安装后运行 `npm test`。可编辑 `tests/hooks.json` 新增场景。每个场景会在新 worker 中用真实 v3 契约执行，失败会报告场景名；不连接实际播放器。`npm run dev` 用于在桌面开发模式中复验。 详见[播放与队列拦截指南](docs/OPERATIONS.md)。

澜音插件开发工具链：TypeScript、Vue、React、单文件构建、桌面开发者模式和动态发放。

这是 v3 协议的本地开发工具链。旧插件仍由冻结的 v2 环境运行，v3 的安装包容器版本仍为 2。

v3 尚未发布。联调请在本地工具链仓库运行 `npm ci`、`npm run build`、`npm run pack:all`。不要从 npm 的 `latest` 安装来验证此候选版本；本地包安装验收见 `docs/v3-local-qa.md`。

v2 项目可使用冻结的 CLI `0.3.16`，或按 [v3 清单与迁移指南](docs/MANIFEST-V3.md) 在副本中执行 `ceru-plugin migrate`。

以下为历史版本记录。

0.3.5 新增 `playlistSections` 和 `sectionId` 导航，将插件个人歌单直接放入 Host 现有本地／云歌单页。`connected-library` 模板和独立工作台包含对应示例。

0.3.15 同步内嵌模板快照：脚手架生成的项目把 SDK/CLI 依赖指向 `^0.3.15`（0.3.14 发版时漏掉这一步）。模板内容与 [CeruMusic-Plugin-Template](https://github.com/CeruMusic/CeruMusic-Plugin-Template) 保持一致。

0.3.14 曲目新增可选的高清封面协议 `tracks.artworkHires`，插件可在保留低清 `artwork` 的同时声明更大尺寸封面。

0.3.13 `ctx.library.playlists` 补齐删除能力：`removeTracks({ target, items, permissionKey, operation })` 返回 `{ removed, notFound }`，`clearPlaylist({ target, permissionKey, operation })` 清空歌单但保留歌单本体。两者都要求 `library.delete`，宿主侧通过 `createHostLibraryBridge` 的 `remove` / `clear` 接入现有歌单服务，并在持久化成功后发送 `library.changed`。

0.3.12 插件网络请求支持宿主注入代理：`requestNetwork` 新增 `setNetworkProxyResolver`，宿主可让搜索、歌词等请求遵循应用自身的网络代理设置。

0.3.11 用户 Ctrl+C/Esc 取消时正常退出（不再返回 130 让 `npm create` 报错）。

0.3.10 修复交互向导结束后进程不退出：会话结束会停掉挂起的 stdin 读取，让 CLI 正常返回。

0.3.9 修复 Windows 下方向键选择失灵：连续提问不再反复切换终端原始模式，避免下一次输入被控制台行编辑缓冲吞掉。

0.3.8 的交互脚手架改用方向键选择模板与语言，选项自带一行说明，目录非空会就地提示重填，创建后打印后续步骤卡片。非交互终端仍输出原来的纯文本结果，脚本调用不变。

也可以从源码运行：npm ci、npm run build，再使用 node packages/create/dist/bin.js 创建工程。

## 快速开始

需要 Node.js 22.12+。

```bash
node packages/cli/dist/bin.js init my-plugin --template vue --lang ts
cd my-plugin
npm install
npm run dev
```

在澜音「设置 → 插件管理 → 管理设置 → 插件开发者模式」添加终端打印的本地 JS 路径。保存后重新构建，在真实宿主预览；编译失败不会覆盖上一个可用产物。

```bash
npm run build
npm run validate
```

最终只交付 `dist/plugin.js`。`.jsx/.tsx/.vue` 只是开发源码，安装时不再编译。

CLI 是可选工具，不是插件运行标准。无需 npm 的手写插件见 [examples/handwritten/plugin.js](examples/handwritten/plugin.js)：

```javascript
exports.manifest = {
  manifestVersion: 3,
  id: 'example.hello',
  name: '问候插件',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: { logic: { module: 'logic.main' } },
}

exports.activate = async function (core) {
  const ui = require('@ceru/ui')
  core.log.info('插件已启动', { hasUi: Boolean(ui) })
}
```

安装器静态读取 `exports.manifest`，不会执行插件来获取名称或权限。`exports.activate` 是不可见逻辑，`exports.surfaces` 是可见界面，两者可以同时存在。

## 模板

| 模板              | 内容                                         |
| ----------------- | -------------------------------------------- |
| source            | 本地搜索 demo、标准 Provider、结构化解析结果 |
| connected-library | 连接表单与状态更新 demo                      |
| account-qrcode    | 扫码登录默认模板、宿主组件或纯 HTML/CSS 自定义内容 |
| page-extension    | 复用宿主 Vue、TDesign 和音乐列表，接入页面与歌单动作槽 |
| player-skin       | 复用桌面歌词、封面与背景，扩展播放器区域     |
| encrypted-source  | 内置解密、WASM 变换和本机服务三个可运行音源 |
| playback-hook     | 播放与队列拦截，附带可离线执行的测试场景     |
| importer          | 曲目去重与导入计划预览                       |
| guest-adapter     | 父插件与 Guest bootstrap 的边界              |
| web-surface       | 普通 DOM 页面                                |
| vue               | Vue 单文件组件、scoped CSS                   |
| vue-tsx           | Vue TSX 组件                                 |
| react             | React TSX/JSX、Hooks                         |
| web-dist          | 封装已构建的本地 index.html、脚本和样式      |

每种模板提供 TS 与 JS 变体。使用本地开发包的 `npm run templates` 查看清单，`npm run create -- ../my-plugin` 交互选择模板与语言。

模板源码与社区成品插件在独立仓库维护：[CeruMusic-Plugin-Template](https://github.com/CeruMusic/CeruMusic-Plugin-Template)。CLI 内包含有摘要记录的模板快照，创建项目不临时执行远端模板脚本。

## Vue / React 如何进入一个文件

.vue、TSX/JSX 在开发机编译为 JavaScript。CSS、声明式界面与静态资源一起封装；安装时在独立 Surface 中挂载，不把第三方组件插入可信的主界面组件树。

清单的 `entry.views[].kind` 决定组件从哪里来。`component` 视图由宿主向隔离视图注入 Vue、TDesign 和 SDK；从 `useHostComponents()` 取得音乐组件，发行文件只携带作者的视图代码、样式、资源及作者引入的其他依赖。要跟随桌面外观，请使用 [组件视图指南](docs/COMPONENT-VIEWS.md)，不要复制桌面源码。`web` 视图则自带它使用的 Vue/React 等运行库；`native` 视图只返回宿主认识的描述，由桌面绘制，不需要作者打包前端框架。

发行文件不会把 node_modules、TypeScript 编译器、Vue SFC 编译器、开发服务器或 npm 工程交给插件用户。

## require 与依赖

手写文件可直接 `require('@ceru/http')`、`require('@ceru/ui')`、`require('@ceru/socket')`、`require('@ceru/library')`、`require('@ceru/account')`、`require('@ceru/player')`、`require('@ceru/tools')`、`require('@ceru/crypto')`、`require('@ceru/compression')`、`require('@ceru/encoding')` 或 `require('lodash')`。这些模块由 Host 提供，不增加插件包体。

CLI 项目中的其他 npm 包、本地模块、ESM import 和字面量 CommonJS require 均由 esbuild 打入最终文件。动态 require、未知 `@ceru/*` 模块、残留 import 和无法在浏览器运行的 Node 原生模块会在构建时失败。离开 CLI 时可以使用任意 bundler；Core 不读取 `node_modules`。

## Provider 与首页

Provider 按业务域组织，减少含糊的通用方法：

```typescript
core.providers.register('tx', {
  tracks: { search, resolve, lyrics },
  playlists: { search, categories, list, get },
  charts: { list, getTracks },
  sharing: { describe },
})
```

首页页签由 `ui.homeSections` 提供。没有启用插件贡献 `playlists` 或 `charts` 时，正式 Host 不显示对应首页页签；安装音源插件后复用软件现有歌单和排行榜界面。`ui.slots` 可以在稳定 Slot 中追加、前置、包裹或替换隔离 Surface。CSS 通过 `ui.styles` 贡献，Surface/Slot CSS 自动限定作用域；全局 CSS 需要 `ui.styles.global` 权限。插件 JavaScript始终留在沙箱中，不直接获得 Electron renderer DOM。

标准歌曲、歌词、歌单、排行榜、分享和权限说明见 [宿主服务与数据契约](docs/HOST-SERVICES.md)。
播放器皮肤模板、逐字歌词组件和全屏调试条见 [播放器区域与皮肤](docs/REGIONS-AND-SKINS.md)。

运行 `npm run build` 后，可用 `ceru-plugin preview dist/plugin.js` 校验产物并打印桌面添加路径。命令不启动服务器或窗口；最终界面、授权和播放以真实桌面为准。

已有网页产物可使用 web-dist 模板。当前支持本地静态 HTML、模块脚本、CSS 和普通图片/字体；远端脚本、HTML 内联事件、srcset 与依赖独立运行服务器的页面不属于该模式。

## 编辑器与共享能力

- VS Code 自带启动/附加调试配置、后台任务、JSON Schema 关联和代码片段。
- 按 F5 选择 Watch Ceru plugin。已经在终端运行 npm run dev 则无需再启动。
- 如果 VS Code 打开的是父目录或多个仓库，打开生成的 ceru-plugin.code-workspace 才能直接看到该子工程的配置；F5 始终执行“运行和调试”下拉框当前选中的配置。
- 监听器输出 `CERU_BUILD_READY <产物路径>`。在澜音的开发者面板可以查看运行环境、重载错误和移除预览。
- Vue 模板推荐 Vue - Official 扩展；所有模板提供 Prettier 配置。
- SDK 提供参数、返回值、资源引用、错误码、权限名和图标名提示。

```typescript
import { definePlugin, hostIcon } from '@shiqianjiang/ceru-plugin-sdk'

const qqIcon = hostIcon('platform.tx')

export default definePlugin((ctx) => {
  ctx.actions.register('hello', async () => {
    const names = ctx.utils.lodash.uniq(['Morning', 'Night', 'Morning'])
    const icon = await ctx.icons.url('platform.tx')
    const cover = await ctx.assets.url('placeholder.cover')
    ctx.log.info('Shared utilities ready', { count: names.length })
  })
})
```

提供 25 个图标名称、3 个静态资源名称与 64 个类型化 Lodash 方法。图标包括 QQ、酷狗、酷我、网易云、咪咕及通用图标。声明里使用宿主资源引用，不会将这些图片或 Lodash 打进每一个插件。

## 命令

```text
ceru-plugin init <directory> --template source --lang ts
ceru-plugin list-templates
ceru-plugin build
ceru-plugin dev
ceru-plugin dev --project path/to/my-plugin
ceru-plugin preview dist/plugin.js
ceru-plugin validate dist/plugin.js --json
ceru-plugin keygen --out .keys/publisher
ceru-plugin sign dist/plugin.js --key .keys/publisher.private.pem
```

dev 只监听本地工程，不启动窗口或 HTTP 服务。preview 只校验文件并打印添加指引。`network.request` 授权任意公网 HTTP(S)，`network.socket` 授权公网实时连接；局域网和 localhost 另需 `network.private`，不维护域名白名单。

开发 Host 提供真实模块执行、隔离页面、HTTP 代理和有限媒体预览。生产安装授权、系统凭据保险箱、完整音乐业务、Guest 安装与分享服务不由此工作台代替。未实现的能力会明确报错。

## 动态发放

核心编译一次，为不同用户生成小型个性化数据和发放签名。

```bash
ceru-plugin keygen --out .keys/publisher
ceru-plugin keygen --out .keys/issuer
ceru-plugin template dist/plugin.js --key .keys/publisher.private.pem --issuer-key .keys/issuer.public.pem --out dist/template.js
ceru-plugin issue dist/template.js --key .keys/issuer.private.pem --config delivery.json --out dist/customer.js
```

delivery.json 的基础示例：

```json
{
  "display": { "name": "我的音源" },
  "activation": { "mode": "one-time-code", "code": "YOUR_REDEMPTION_CODE" }
}
```

默认个性化规则不允许任意配置键；额外字段需要在生成模板时通过 --policy 声明。权限、模块入口与核心代码不能通过个性化数据改写。

高并发服务直接使用发行库，而不是每次启动 CLI：

```typescript
import { readFile } from 'node:fs/promises'
import { PreparedIssuer } from '@shiqianjiang/ceru-plugin-issuer'

const issuer = new PreparedIssuer(await readFile('template.js'), {
  issuerPrivateKey: await readFile('issuer.private.pem', 'utf8'),
  trustedPublicKeys: [await readFile('publisher.public.pem', 'utf8')],
})

// 在业务接口中先验证订单/账号，再调用：
const file = issuer.issue(
  { display: { name: '用户的音源' } },
  { deliveryId: 'your-idempotency-id' },
)
```

writeTo(writable, data) 可流式写入固定主体，调用者负责结束流及 HTTP 鉴权/缓存策略。长期 Key 放入任何 JS 文件都可被复制；优先交付一次性激活信息，由服务端验证权益。

## 包

| npm 包                           | 用途                         |
| -------------------------------- | ---------------------------- |
| create-ceru-plugin               | 交互脚手架                   |
| @shiqianjiang/ceru-plugin-cli    | 构建、调试、校验与签名命令   |
| @shiqianjiang/ceru-plugin-sdk    | 插件作者的类型与小型辅助函数 |
| @shiqianjiang/ceru-plugin-issuer | 静态校验、签名、缓存模板发放 |

## 开发本工具链

```bash
npm ci
npm test
node scripts/sync-templates.mjs ../CeruMusic-Plugin-Template/templates
npm run pack:all
```

真实桌面集成检查（需同版本桌面源码、已构建的 Windows app.asar，以及桌面项目本地 Electron 依赖）：

```bash
node test/electron-smoke.mjs /path/to/CeruMusic /path/to/win-unpacked/resources/app.asar
```

使用临时资料验证桌面插件启停、侧栏、搜索播放、入队、热重载和运行隔离，不安装到个人资料。

## 安全与许可

静态验证不是恶意代码沙箱。签名有效只说明内容对应某个密钥；没有可信公钥时，验证结果为 verified-untrusted。生产 Host 必须独立执行权限与资源边界。

工具源码为 MIT。调试预览中复用的 CeruMusic 图标/图片保留 AGPL-3.0-only 与原始署名，见 CLI 的 ASSET_LICENSE 和 NOTICE；第三方运行时保留各自许可证。模板引用宿主资源，不自动把这些预览资产复制到插件发行文件。

设计背景见 [设计文档](docs/design.md)，具体已实现接口以当前包和测试为准。
