# Ceru Music 插件环境 v3 任务书

> 状态：已定稿的执行方案，按本文实施。
>
> 日期：2026-10-26 初稿；2026-11-18 定稿为 v3 双运行环境方案，含操作管线、界面区域、账号、HTTP 服务与加密播放。
>
> 读者：执行本次升级的工程师或 agent。本文是任务书，不是提案。第 2 节的决策不再讨论，第 7 节的步骤按顺序执行。但"按顺序执行"不等于获得了对外操作的授权：推送、发布、打标签等动作必须先征得用户同意，见 0.5。
>
> 一句话说明：**澜音同时内置 v2 和 v3 两套插件运行环境。** 安装或加载插件时自动识别版本，v2 插件进入冻结的 v2 环境，原样运行；v3 插件进入新的 v3 环境，享受全部新能力。用户从旧版澜音升级后，已安装的 v2 插件、启用状态、授权、配置和数据全部保留，并且可以开始安装 v3 插件。

**v3 新增的能力一览：**

| 能力 | 一句话 | 规范 | 实施 |
| --- | --- | --- | --- |
| 双运行环境 | v2 冻结原样运行，v3 另起一套，安装时自动识别 | 3、5、6 | 零、一、二 |
| manifest v3 | 按 `entry`、`provides`、`uses`、`ui` 分组声明 | 4.1 | 二 |
| 跨音源音乐能力 | 插件可以搜索、播放任何已安装音源的内容 | 4.2.1 | 三 |
| 组件页面 | 用 Vue 与宿主组件写页面，挂到侧边栏、设置页、首页、歌单页 | 4.3 | 四 |
| 开发者模式 | 在真实软件中加载本地插件并热重载 | 4.7 | 四 |
| 操作管线 | 软件的动作都能被插件调用、拦截、改写，并派发事件 | 4.8 | 五 |
| 生命周期与路由守卫 | 插件注入软件与自身生命周期，守卫页面跳转 | 4.9、4.10 | 五 |
| 界面区域与皮肤 | 替换歌词、唱片、背景等区域，组成播放器皮肤 | 4.13 | 六 |
| 账号能力 | 插件提供平台登录，界面与凭据由软件统一处理 | 4.11 | 七 |
| 插件服务与依赖 | 插件之间互相调用 | 4.6 | 八 |
| HTTP 服务与加密播放 | 本机服务、流式解密播放、WebAssembly、完全信任档 | 4.14 | 九 |

**阅读路线：** 执行前完整阅读第 0 至 3 节。执行某个阶段时，阅读第 7 节中该阶段的步骤，以及上表"规范"列对应的小节。第 5、6 节是所有阶段都要遵守的兼容底线。术语见附录 A，v2 与 v3 的对比见附录 B。

---

## 0. 执行须知

### 0.1 涉及的仓库

| 仓库 | 路径 | 角色 |
| --- | --- | --- |
| 插件工具链 | `G:\code\CeruMusic-Plugin-Cli` | npm workspace，含 `packages/{sdk,issuer,core,cli,create}` |
| 宿主应用 | `D:\code\CeruMusic` | Electron 应用。主进程在 `src/main`，渲染进程在 `src/renderer`，共享代码在 `src/common` |
| 插件模板 | `G:\code\CeruMusic-Plugin-Template` | 脚手架模板的源头。工具链中的 `packages/cli/templates` 与 `packages/create/src` 是由 `scripts/sync-templates.mjs` 从这里复制的快照，**修改模板必须改这个仓库，再同步**，不能直接改快照 |

### 0.2 验证命令

| 仓库 | 命令 | 作用 |
| --- | --- | --- |
| 工具链 | `npm run build` | 编译五个包并打包 sandbox 运行时资产 |
| 工具链 | `npm test` | 构建后运行 `test/*.test.mjs` |
| 宿主 | `yarn typecheck` | 主进程与渲染进程类型检查 |
| 宿主 | `yarn test` | Jest 单元测试 |
| 宿主 | `npx eslint --cache <本次改动的文件>` | 只检查改动过的文件。**不要运行 `yarn lint`**，它带 `--fix`，会改写全仓库的文件，违反 0.3 第 8 条 |
| 宿主 | `yarn build:unpack` | 构建并生成未打包的安装目录。在产物的 `resources` 下确认两套运行时的 `assets/` 都存在：v2 别名包与 `@shiqianjiang/ceru-plugin-core` 各一份 |

每个阶段结束时以上命令必须全部通过，才能进入下一阶段。

### 0.3 不可违反的约束

1. **升级不丢插件。** 从任何已发布的澜音版本升级后，`plugins/` 目录下已安装的 v2 插件全部出现在列表中，启用状态、授权、配置、存储、LX 子插件不变。验收方式见 6.5。
2. **v2 运行环境冻结。** v2 插件只在 v2 环境中运行，v2 环境的代码来自工具链的最后一个 v2 版本，之后只做安全修复，见 5.1。
3. **两个环境共享一套宿主服务。** 播放器、歌单、文件、下载等能力只实现一次，两个环境的 RPC 层都调用它，见 3.3。不允许为 v3 复制一份宿主服务实现。
4. **`plugins/` 下的现有文件布局不改。** 不重命名、不移动、不改写已有文件的格式。v3 新增的数据放到新路径。
5. **插件 logic 代码不进主进程，也不进渲染进程。** 沙箱档在 worker 沙箱中运行，完全信任档在独立的 `utilityProcess` 中运行，见 4.14.1。
6. **渲染进程中的 `component` 视图只拿到 `ViewBridge`。** 拿不到 IPC 桥，也拿不到 `ctx`。区域视图额外拿到区域契约中声明的只读数据与动作，见 4.13.5，除此之外没有任何宿主能力。
7. **v3 的每个 RPC 方法只在契约表里出现一次。** 不允许在 v3 sandbox 运行时、宿主、dev 工具里手写方法名字符串。
8. **遵守两个仓库各自的 `CLAUDE.md` 与 `AGENTS.md`。** 不顺手重构与本任务无关的代码。
9. 文档中标注"确认后删除"的文件，删除前先 `grep` 全仓库，确认没有引用。

### 0.4 每阶段的完成定义

- 该阶段的改动清单全部完成。
- 该阶段的验收条目逐条验证通过，并在提交说明中写明验证方式。
- 0.2 的命令全部通过。
- 6.5 的升级保留测试通过。
- 第 8 节中与该阶段相关的文档已同步更新。

### 0.5 必须先征得用户同意的动作

以下动作不可撤回或会影响他人。执行到这里时停下，向用户说明要做什么、为什么，等明确同意后再做。

| 动作 | 说明 |
| --- | --- |
| `git push`，包括推送分支与标签 | 工具链仓库推送任何 `v*` 标签都会触发 `.github/workflows/release.yml`，自动发布全部五个包到 npm |
| `npm publish` 或任何发布到 npm 的操作 | npm 上的版本发布后不能重新使用同一版本号 |
| 合并到 `main` 分支 | |
| 删除用户未提交的改动 | 包括 `git checkout -- <file>`、`git reset --hard`、`git stash drop` |
| 修改 CI 配置 | `.github/workflows/` 下的文件 |

可以直接做的动作：在功能分支上本地提交、本地创建分支、删除本文"确认后删除"所列的文件（先按 0.3 第 9 条确认）、运行测试与构建。

建议的工作方式：每个阶段在独立分支上完成，分支名为 `v3/phase-<编号>`，例如 `v3/phase-1`。阶段完成后停下，汇报验收结果，由用户决定合并。

### 0.6 开工前检查

1. **工作区必须干净。** 运行 `git status`。如果存在不属于本任务的未提交改动，停下并询问用户如何处理，不要擅自提交、暂存或丢弃。
   - 本文定稿时（2026-11-18）两个仓库都有未提交改动。工具链仓库：`packages/core/src/network.ts`、`packages/sdk/src/legacy-http.ts` 两处短链修复，以及由此重新构建的 `packages/{cli,core}/assets/sandbox.js`，这些按阶段零第 2 步处理。宿主仓库：`package.json`、`yarn.lock` 把两个插件包从 `0.3.14` 升到 `^0.3.15` 并删除了 resolutions，`PluginHost.ts` 改为从 sdk 导入 `assertRemovableTracks`。宿主这三处属于用户正在进行的工作，开工前请用户先提交。
2. **确认 npm 发布方式。** 工具链按 `docs/release.md` 通过推送标签由 CI 发布，使用 npm Trusted Publishing，不需要本地 token。不要在本地运行 `npm publish`。
3. **确认是否只执行指定阶段。** 用户通常一次只交代一个阶段。只做被交代的阶段，完成后停下。

### 0.7 只能由人完成的验收

以下验收条目需要人工操作。执行到这里时，准备好所需的构建产物与步骤清单，交给用户，在汇报中标明"待人工验收"，不要声称已通过：

- 从已发布的澜音安装包覆盖安装新版本，见 6.5 末尾。
- 用开发者工具的性能面板测量耗时与帧率，见阶段五、六的验收。
- 在真实 DLNA 设备上播放，见阶段九的验收。
- 在真实平台上完成扫码或网页登录，见阶段七的验收。

---

## 1. 背景与问题

v2 的协议设计是正确的：插件不进主进程，所有能力经 RPC 调用宿主，权限静态声明、使用时授权。问题在于实现没有按设计分层，manifest 结构也没有随能力增长而整理，可视部分从未真正落地。在 v2 上原地修改，每一步都可能误伤已发布的插件。因此 v3 另起一套运行环境，v2 原样冻结。

### 1.1 工具链分层失效

| 问题 | 位置 | 后果 |
| --- | --- | --- |
| `PluginCore.context()` 构造完整的 `PluginContext`，但生产环境只用到其中的注册表 | `packages/core/src/index.ts:173-298` | 近两百行死代码 |
| 插件运行时源码在 cli 包，构建后复制进 core | `packages/cli/runtime/sandbox.ts` 复制到 `packages/core/assets/sandbox.js`，见 `scripts/build-runtime.mjs:25` | 依赖方向倒置 |
| 宿主侧 RPC 分发有两份实现，互不复用 | `CeruMusic/src/main/services/plugin/manager/PluginHost.ts:788-1169` 与 `packages/cli/src/dev.ts` | 方法名、权限名、参数位置在三处手写 |
| sdk 中有宿主侧代码，而且无人使用 | `packages/sdk/src/host-library.ts` | `PluginHost.ts` 第 904-935 行重写了相同校验 |
| 逐字节相同的文件 | `packages/cli/src/socket-broker.ts` 与 `packages/core/src/socket-broker.ts` | 两份维护 |
| 无人引用的沙箱实现 | `packages/core/src/electron.ts` 与 `packages/core/assets/preload.cjs` | 增加理解成本 |
| 单类过大 | `PluginHost.ts` 共 1758 行 | 服务实现、权限状态机、Surface 会话、Guest 管理、RPC 分发混在一起 |

### 1.2 manifest 结构与读取分散

v2 的 `contributes` 平铺了十几个数组，提供能力、使用能力、界面扩展混在一起。宿主有 16 个文件直接读取 manifest 字段：

- 主进程：`events/localMusic.ts`、`events/plugins.ts`、`services/musicSdk/service.ts`、`services/plugin/{externalInstall,index,shareResolver}.ts`、`services/plugin/manager/PluginHost.ts`
- 渲染进程：`components/layout/HomeLayout.vue`、`components/Settings/{PluginRoutingPanel,plugins}.vue`、`services/{pluginAccounts,pluginState}.ts`、`utils/{pluginCapabilityLabels,pluginContributionCatalog,pluginQuality}.ts`、`views/music/LocalTagEditorPage.vue`

### 1.3 可视部分没有落地

manifest 声明了 `sidebarItems`、`settingsPages`、`homeSections`、`playlistSections`、`uiExtensions` 五种入口，渲染层各自零散读取。web surface 以 iframe `srcdoc` 渲染，弹窗、快捷键、拖拽都被 iframe 边界切断，每行一个按钮的槽位也无法实现。

### 1.4 宿主基建未向插件开放

`musicSdk/service.ts` 已经把所有插件 provider 聚合起来供应用使用，但插件没有入口。`PluginHost.ts:977-986` 的 `ownedRef` 限制插件只能操作自己声明的资源，点歌、推荐、统计类插件因此无法实现。

### 1.5 加载失败的插件会从列表消失

`src/main/services/plugin/index.ts` 的 `loadInstalledPlugins` 在 `readPluginArtifact` 抛错时只打印日志并跳过，插件不出现在列表中，用户无从得知。双环境引入后，版本识别出错会以同样方式让插件"消失"，必须先修复，见 6.3。

---

## 2. 已确定的决策

以下决策已与产品负责人确认，实施时不再讨论。

| 编号 | 决策 |
| --- | --- |
| D1 | **升级为 v3，澜音同时内置 v2 与 v3 两套运行环境。** 安装与加载时识别插件版本，分发到对应环境 |
| D2 | **v2 环境冻结。** v2 运行时固定为工具链最后一个 v2 版本 `0.3.16`，之后只做安全修复。v2 插件不获得 v3 新能力，想用新能力就升级到 v3 |
| D3 | **两个环境共享一套宿主服务、一个音乐聚合层、一条操作管线、一条媒体管线、一套界面渲染组件。** 两者只在"插件运行时"与"RPC 协议层"上分开 |
| D4 | **升级不丢插件。** `plugins/` 目录布局与已有文件格式不变。加载失败的插件以"无法加载"状态留在列表中，文件永不自动删除 |
| D5 | v3 manifest 按"插件做什么"分为 `entry`、`provides`、`uses`、`ui` 四节，见 4.1。v3 环境不读 v2 字段，v2 环境不读 v3 字段 |
| D6 | v3 可视部分支持三种 view：`component`（渲染进程 Shadow DOM，共享宿主 Vue、宿主业务组件与整个 `tdesign-vue-next`）、`web`（iframe）、`native`（JSON）。v2 的 `schema` 类型只在 v2 环境中保留 |
| D7 | v3 logic 侧在保留 v2 分组路径的基础上新增：`ctx.music`、`ctx.plugins`、`ctx.services`、`ctx.hooks`、`ctx.events`、`ctx.lifecycle`、`ctx.router`、`ctx.accounts`、`ctx.server`、`ctx.streams`、`ctx.crypto`、`ctx.wasm`、`ctx.app.call`、`ctx.ui.pages`、`ctx.ui.views`，完整列表见 4.2。v2 时代的 provider 顶层旧方法别名等兼容逻辑不进入 v3 运行时 |
| D8 | 整页挂载位置共四种：侧边栏整页、设置页一节、首页 tab、歌单页内嵌区域。v3 统一通过 `ui.pages[]` 声明 |
| D9 | 插件间调用只需 `services.consume` 权限，不按插件对单独弹授权。默认硬依赖，`optional: true` 为软依赖，调用深度固定为 1。只有 v3 插件能提供或依赖服务 |
| D10 | `ctx.music` 聚合**所有已安装插件**的 provider，包括 v2 插件的，再加上宿主本地音乐源 `providerId: 'local'`。v3 插件可以搜索和播放 v2 音源插件提供的平台 |
| D11 | 开发预览在真实 CeruMusic 中进行：正式版设置页内置"插件开发者模式"开关，同时接受 v2 与 v3 插件。v3 的 `ceru-plugin dev` 只负责 watch 构建 |
| D12 | 信任分级：logic 受权限约束，在 worker 中运行。`component` 视图在渲染进程中运行，但只有 `ViewBridge`。渲染进程做加固，issuer 对 `component` 入口做静态拒签 |
| D13 | 洛雪和澜音 v1 的注释头格式 `/*! @name ... */` 维持现状：不能直接安装，洛雪脚本经 LX 兼容插件的 guest 机制运行 |
| D14 | 工具链 v3 各包版本号从 `3.0.0` 开始，与插件环境版本对齐。v2 代码保留在 `release/v2` 分支 |
| D15 | **软件的每个动作都是一个"操作"**，所有入口走同一条管线：前置事件、hook 链、内置实现、完成事件。操作表是契约表的扩展，同时提供 API、hook、事件、工具目录，见 4.8 |
| D16 | hook 是高阶函数 `(op, next)`：不 return 即观察，return 新 input 即改参数，`preventDefault` 即拦截，调用 `next` 即包裹内置实现。hook 超时或出错时视为不 return，管线继续 |
| D17 | 插件可以注入软件生命周期与插件自身生命周期，支持选项式与组合式两种写法，见 4.9。路由守卫见 4.10 |
| D18 | 软件不内置任何平台的登录。账号作为插件能力提供，登录界面、凭据保管、接入"我喜欢"与歌单页由宿主统一完成，见 4.11 |
| D19 | 插件可以替换软件的界面区域，组合成播放器皮肤。高频数据以只读响应式引用直接交给视图，不经过 worker，见 4.13 |
| D20 | 退出软件、安装与卸载插件、修改插件权限不进入操作目录，不允许被插件拦截 |
| D21 | v3 logic 分两档：沙箱档（默认，worker）与完全信任档（`utilityProcess` 中的真实 Node）。HTTP 服务、流式加解密、WebAssembly 在沙箱档提供；express、koa、`.node` 只在完全信任档提供，见 4.14 |
| D22 | 加密音频的播放经宿主媒体管线 `ceru-media://` 完成，支持内置算法与插件自定义变换，支持拖动进度，下载与缓存保存解密后的文件 |
| D23 | 完全信任档在安装时征得同意，不在运行时申请。确认框由宿主固定文字加开发者填写的说明组成，必须带有效签名，更新时新增此能力或更换发布者需要重新同意，见 4.14.6 |
| D24 | v2 插件调用软件操作时同样进入操作管线，`source` 为 `{ kind: 'plugin', pluginId, runtime: 2 }`，v3 插件的 hook 对其生效。v2 插件自身不能注册 hook、监听前置事件或替换区域。没有 v3 插件拦截时，v2 插件的行为与现在完全相同 |

---

## 3. 架构

### 3.1 总览

```text
                          安装 / 启动加载
                                │
                     sniffManifestVersion(code)
                    ┌───────────┴───────────┐
                  v2 ▼                       ▼ v3
      ┌─────────────────────────┐   ┌──────────────────────────────┐
      │ v2 环境（冻结）          │   │ v3 环境                       │
      │ ceru-plugin-core-v2     │   │ @shiqianjiang/ceru-plugin-core@3│
      │   = core@0.3.16         │   │ V3PluginHost                  │
      │ V2PluginHost            │   │   契约表 + 分发器              │
      │   v2 RPC 协议层          │   │ 沙箱档：worker                │
      │ v2 manifest 读取器       │   │ 完全信任档：utilityProcess     │
      │ 运行于 worker            │   │ v3 manifest 读取器             │
      └────────────┬────────────┘   └───────────────┬──────────────┘
                   │                                │
                   └───────────────┬────────────────┘
                                   ▼
             ┌───────────────────────────────────────────┐
             │ 共享层（澜音应用内）                         │
             │ OperationBus   操作管线：hook、事件          │
             │ hostServices   宿主服务实现                  │
             │ MusicRegistry  音乐聚合层                    │
             │ ceru-media     媒体管线：流式解密播放          │
             │ 账号凭据库、权限、配置、插件存储、状态          │
             │ 界面：PluginPage、区域与皮肤、各类视图         │
             └───────────────────────────────────────────┘
```

### 3.2 分开的部分

| 部分 | v2 环境 | v3 环境 |
| --- | --- | --- |
| 插件运行时 | `ceru-plugin-core-v2`，即 npm 别名指向 `@shiqianjiang/ceru-plugin-core@0.3.16`，含其 sandbox、issuer、GuestStore | `@shiqianjiang/ceru-plugin-core@^3`，sandbox 运行时位于 core 内 |
| 宿主适配 | `src/main/services/plugin/v2/V2PluginHost.ts`，即现有 `PluginHost.ts` 移入，RPC 分支的实现体改为调用共享 `hostServices` | `src/main/services/plugin/v3/V3PluginHost.ts`，用 core 的 `createDispatcher` 与契约表 |
| manifest 读取 | `src/main/services/plugin/v2/manifest.ts`，读 `contributes`、`modules` | `src/main/services/plugin/v3/manifest.ts`，读 `entry`、`provides`、`uses`、`ui` |
| 报告的 API 版本 | 保持现状，不得"修正"：`ctx.host.apiVersion` 为 `'2.0.0'`，`services.app.getInfo().hostApi` 为 `'1.0.0'`。两者不一致是历史遗留，v2 插件可能依赖这两个值 | `ctx.host.apiVersion` 与 `services.app.getInfo().hostApi` 均为 `'3.0.0'` |
| 运行位置 | worker | 沙箱档在 worker，完全信任档在 `utilityProcess`，见 4.14.1 |
| 能否拦截软件操作 | 不能，只能作为操作的发起方，见 D24 | 能，见 4.8 |

### 3.3 共享的部分

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| 宿主服务实现 | `src/main/services/plugin/hostServices.ts` | 播放器、队列、歌单、收藏、下载、文件、剪贴板、窗口、热键、设置、分享、房间、设备、AI、定时任务。每项只实现一次，参数已由上层校验过 |
| 音乐聚合层 | `src/main/services/plugin/musicRegistry.ts` 实例，类由 v3 core 提供 | 两个环境的 provider 与 importer 都注册进来。应用自身的搜索页、歌单页、播放器也只认它 |
| 操作管线 | `src/main/services/plugin/operations/`，`OperationBus` 类由 v3 core 提供；渲染进程入口 `src/renderer/src/plugin/operations.ts` | 软件界面、v2 插件、v3 插件发起的操作都经过它。只有 v3 插件能注册 hook，见 4.8 |
| 媒体管线 | `src/main/services/plugin/media/mediaProtocol.ts` | `ceru-media://` 协议，处理带 `stream` 的播放结果，见 4.14.4 |
| 账号凭据库 | `src/main/services/plugin/accounts/` | 插件账号的凭据加密保存与登录窗口，见 4.11 |
| 区域与皮肤 | `src/renderer/src/plugin/regions.ts`、`PluginRegion.vue` | 可替换的界面区域与皮肤选择，见 4.13 |
| 插件描述模型 | `src/common/pluginDescriptor.ts` | 两个 manifest 读取器的共同输出，见 3.4 |
| 持久化 | `pluginConfig.ts`、`storage.ts`、`plugins/state.json` | 两个环境共用，路径与格式不变 |
| 界面渲染 | `src/renderer/src/components/Plugin*.vue` | `web`、`native` 渲染组件两个环境共用；`schema` 只服务 v2；`component` 只服务 v3 |

### 3.4 插件描述模型

宿主除了两个 `PluginHost` 之外，不再直接读取 manifest。两个 manifest 读取器都输出同一个描述对象：

```ts
// src/common/pluginDescriptor.ts
export interface PluginDescriptor {
  runtime: 2 | 3
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  providers: ProviderInfo[]            // id、name、protocols、qualities、icon
  importers: ImporterInfo[]
  lyricConverters: LyricConverterInfo[]
  accounts: AccountInfo[]
  actions: ActionInfo[]                // id、title、description、view
  permissions: PermissionInfo[]
  views: ViewInfo[]                    // id、kind、title、presentation
  pages: PageInfo[]                    // id、title、mount、view、icon、group、order
  homeSections: HomeSectionInfo[]      // 宿主内置的歌单与榜单区块
  slots: SlotInfo[]
  menus: MenuInfo[]
  styles: StyleInfo[]
  services: ServiceInfo[]              // v2 恒为空
  dependencies: DependencyInfo[]       // v2 恒为空
  guestAdapters: GuestAdapterInfo[]
  regions: RegionInfo[]                // v2 恒为空，见 4.13
  skins: SkinInfo[]                    // v2 恒为空，见 4.13
  server?: ServerInfo                  // v2 恒为空，见 4.14
  nativeModules: NativeModuleInfo[]    // v2 恒为空，见 4.14.5
  trusted?: { optional: boolean; reason: string }  // uses.permissions 中 name 为 runtime.trusted 的声明；没有则为空，v2 恒为空
}
```

它是**界面与宿主逻辑使用的只读视图**，不是 manifest 的转换结果，不回写到插件文件，也不传给插件。1.2 列出的 16 个文件全部改为读 `PluginDescriptor`。

**`*Info` 类型的定义规则。** 为避免不同实现者各自设计形状，统一按以下规则定义，放在同一个文件中：

- 每个 `XxxInfo` 的字段与 4.1.1 中对应的 v3 声明类型完全相同，再加一个 `pluginId: string`。例如 `ProviderInfo = ProviderDeclaration & { pluginId: string }`，`PageInfo = PageDeclaration & { pluginId: string }`。对应关系：`ProviderInfo`↔`ProviderDeclaration`、`ImporterInfo`↔`ImporterDeclaration`、`LyricConverterInfo`↔`LyricConverterDeclaration`、`AccountInfo`↔`AccountDeclaration`、`ActionInfo`↔`ActionDeclaration`、`PermissionInfo`↔`PermissionDeclaration`、`ViewInfo`↔`ViewDeclaration`、`PageInfo`↔`PageDeclaration`、`HomeSectionInfo`↔`HomeSectionDeclaration`、`SlotInfo`↔`SlotDeclaration`、`MenuInfo`↔`MenuContribution`、`StyleInfo`↔`StyleContribution`、`ServiceInfo`↔`ServiceDeclaration`、`DependencyInfo`↔`PluginDependency`、`GuestAdapterInfo`↔`GuestAdapterDeclaration`、`RegionInfo`↔`RegionDeclaration`、`SkinInfo`↔`SkinDeclaration`。
- `ServerInfo` 与 `NativeModuleInfo` 分别对应 4.1.1 中 `entry.server` 与 `entry.native[]` 的元素类型。
- v2 字段没有对应值时留空或用 v3 的缺省值，不编造。例外是 `AccountInfo` 与 `ViewInfo`：
  - `AccountInfo` 增加可选字段 `legacy?: { view: string; action: string; logoutAction?: string }`，只有 v2 账号项填写。v2 账号项的 `loginMethods` 为空数组。
  - `ViewInfo.kind` 的取值在 v3 三种之外加上 `'schema'`，只有 v2 插件会出现。
- 这些类型从 v3 sdk 导入声明类型。宿主依赖 v3 sdk 是在阶段二，阶段一先在 `pluginDescriptor.ts` 中按 4.1.1 手写这些声明类型，阶段二改为从 sdk 导入，字段不变。

v2 读取器的字段对应关系：

| v2 字段 | `PluginDescriptor` 字段 |
| --- | --- |
| `contributes.providers` | `providers` |
| `contributes.playlistImporters` | `importers` |
| `contributes.lyricConverters` | `lyricConverters` |
| `contributes.accountItems` | `accounts`。v2 账号项只有 `id`、`title`、`view`、`action`、`logoutAction`，读取器把它们放进 `AccountInfo` 的 `legacy` 字段，界面按 v2 原有方式展示，不提供 4.11 的登录对话框与能力接入 |
| `contributes.commands[]` | `actions[]`，`id` 取 v2 的 `action` 值。宿主一直以 `action` 为键 |
| `permissions` | `permissions` |
| `modules.surfaces[]` | `views[]` |
| `contributes.sidebarItems[]` | `pages[]`，`mount: 'sidebar'`。`group` 若不是 `discover`、`library`、`tools` 之一则归入 `tools` |
| `contributes.settingsPages[]` | `pages[]`，`mount: 'settings'` |
| `contributes.homeSections[]` 中 `kind: 'custom'` | `pages[]`，`mount: 'home-tab'` |
| `contributes.homeSections[]` 中 `kind` 为 `playlists` 或 `charts` | `homeSections[]` |
| `contributes.playlistSections[]` | `pages[]`，`mount: 'playlist-section'` |
| `contributes.uiExtensions[]` | `slots[]` |
| `contributes.menus` | `menus` |
| `contributes.styles` | `styles` |
| `contributes.guestAdapters` | `guestAdapters` |

v3 读取器的对应关系是一一直译，见 4.1。

### 3.5 版本识别

v3 issuer 导出：

```ts
export function sniffManifestVersion(input: Uint8Array | string): 2 | 3 | 'legacy-comment' | null
```

它复用 issuer 现有的头部与元数据提取逻辑，只读出 `manifestVersion`，**不做 schema 校验，不执行代码**。返回 `null` 表示无法识别。

宿主在 `src/main/services/plugin/runtimes.ts` 中按结果分发：

| 结果 | 处理 |
| --- | --- |
| `2` | 交给 v2 环境，用 `ceru-plugin-core-v2` 的 `readPluginArtifact` 完整读取与校验 |
| `3` | 交给 v3 环境，用 v3 core 的 `readPluginArtifact` 完整读取与校验 |
| `'legacy-comment'` | 维持现有提示：请通过 LX 兼容插件安装 |
| `null` | 安装时报错"无法识别的插件文件"；启动加载时按 6.3 显示为"无法加载" |

v3 artifact 沿用 v2 的单 JS 容器格式，`formatVersion` 仍为 `2`，只有 manifest 中的 `manifestVersion` 为 `3`。这样两套 issuer 的头部提取逻辑一致。

---

## 4. v3 协议规范

本节是规范性内容，只针对 v3 环境。类型定义以工具链 `packages/sdk/src` 为准。

### 4.1 manifest v3

#### 4.1.1 结构

```ts
interface PluginManifestV3 {
  manifestVersion: 3
  id: string
  name: string
  version: string
  description?: string
  author?: string
  publisher?: string
  license?: string
  homepage?: string
  config?: JsonObject
  engines: {
    hostApi: string            // 写 '^3.0.0'
    logicRuntime: string
    libraries?: Partial<Record<'vue' | 'react' | 'react-dom', string>>
  }

  /** 代码入口 */
  entry: {
    logic?: { module: string; activation?: string[] }
    share?: { module: string; configKeys?: string[]; guestAdapterId?: string; guestGlobals?: string[] }
    views?: ViewDeclaration[]
    /** 本机 HTTP 服务，见 4.14.7 */
    server?: { module: string; runtime: 'sandbox' | 'node'; port?: number; lan?: boolean }
    /** 原生模块，仅 server.runtime 为 node 时有效，见 4.14.5 */
    native?: { name: string; platforms: Record<string, string> }[]
  }

  /** 本插件提供给宿主与其他插件的能力 */
  provides?: {
    providers?: ProviderDeclaration[]
    importers?: ImporterDeclaration[]
    lyricConverters?: LyricConverterDeclaration[]
    accounts?: AccountDeclaration[]
    guestAdapters?: GuestAdapterDeclaration[]
    services?: ServiceDeclaration[]
    actions?: ActionDeclaration[]
  }

  /** 本插件需要使用的能力 */
  uses?: {
    permissions?: PermissionDeclaration[]
    plugins?: PluginDependency[]
  }

  /** 本插件对宿主界面的扩展 */
  ui?: {
    pages?: PageDeclaration[]
    homeSections?: HomeSectionDeclaration[]
    slots?: SlotDeclaration[]
    menus?: MenuContribution[]
    styles?: StyleContribution[]
    /** 替换软件界面区域，见 4.13 */
    regions?: RegionDeclaration[]
    skins?: SkinDeclaration[]
  }

  guestPolicy?: GuestPolicy
  dataSchemas?: { config: number; state: number }
}
```

`ProviderDeclaration`、`PermissionDeclaration`、`MenuContribution`、`StyleContribution`、`GuestPolicy`、`IconRef` 沿用 v2 的类型定义，字段不变。新增与改名的类型：

```ts
interface ViewDeclaration {
  id: string
  kind: 'component' | 'web' | 'native'
  /** component 与 web：构建产物中的模块 id。native：返回 NativeView 的 action id */
  module: string
  title?: string
  presentation?: { kind: 'drawer' | 'modal'; placement?: 'left' | 'right' | 'top' | 'bottom'; size?: number }
  lifecycle?: { openAction?: string; closeAction?: string }
}

interface ActionDeclaration {
  id: string
  title: string
  description?: string
  /** 声明后该 action 出现在插件的命令列表中，调用时打开这个 view */
  view?: string
}

interface ImporterDeclaration {
  id: string
  title: string
  providerId?: string
  examples?: { label: string; value: string }[]
  instructions?: string[]
  description?: string
  placeholder?: string
}

interface LyricConverterDeclaration { id: string; title: string; formats: LyricInputFormat[] }

interface AccountDeclaration {
  id: string
  title: string
  icon?: IconRef
  /** 是否允许同时登录多个子账号 */
  multiple?: boolean
  loginMethods: ('qrcode' | 'browser' | 'form' | 'oauth')[]
  /** 宿主据此把账号自动接入软件界面，见 4.11.4 */
  capabilities?: ('profile' | 'likes' | 'playlists' | 'history' | 'recommend')[]
  /** 绑定的 provider。这些 provider 的请求自动带上当前子账号 */
  providers?: string[]
  /** 可选的自定义账号设置页，指向 entry.views[].id */
  view?: string
}

interface GuestAdapterDeclaration {
  id: string
  title?: string
  extensions?: string[]
  format: string
  badge?: { label: string; backgroundColor: string; textColor: string }
  compatibilityProfile: string
  bootstrap: string
  runtime: string
  projectableProtocols: string[]
}

interface ServiceDeclaration {
  id: string
  version: string            // semver
  methods: string[]
  description?: string
}

interface PluginDependency {
  pluginId: string
  service: string
  version: string            // semver range
  optional?: boolean
}

interface PageDeclaration {
  id: string
  title: string
  mount: 'sidebar' | 'settings' | 'home-tab' | 'playlist-section'
  view: string               // entry.views[].id
  icon?: IconRef
  /** 仅 mount 为 sidebar 时有效 */
  group?: 'discover' | 'library' | 'tools'
  order?: number
  when?: { loggedIn?: boolean }
}

/** 开启宿主内置的首页歌单区块或榜单区块，数据来自所列 provider */
interface HomeSectionDeclaration {
  id: string
  title: string
  kind: 'playlists' | 'charts'
  providerIds?: string[]
  icon?: IconRef
  order?: number
}

interface SlotDeclaration {
  id: string
  slot: UISlotName
  mode: 'append' | 'prepend' | 'wrap' | 'replace'
  view: string
  order?: number
  when?: { loggedIn?: boolean; route?: string }
}

interface RegionDeclaration {
  /** 区域名，可带契约版本，例如 'player.lyrics' 或 'player.lyrics@1'，见 4.13.2 */
  region: string
  view: string               // entry.views[].id，必须是 component 视图
}

interface SkinDeclaration {
  id: string
  title: string
  preview?: IconRef
  /** 这套皮肤包含的区域，必须都在 ui.regions 中声明 */
  regions: string[]
  /** 皮肤设置项的 JSON Schema，由宿主渲染 */
  settings?: JsonSchema
}
```

v3 issuer 的 schema 拒绝 `contributes`、`modules`、顶层 `permissions` 等 v2 字段。

#### 4.1.2 示例

```ts
import { defineManifest } from '@shiqianjiang/ceru-plugin-sdk'

export default defineManifest({
  manifestVersion: 3,
  id: 'navidrome',
  name: 'Navidrome',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },

  entry: {
    logic: { module: './src/main.ts' },
    views: [
      { id: 'browse', kind: 'component', module: './src/views/Browse.vue' },
      { id: 'settings', kind: 'component', module: './src/views/Settings.vue' },
      { id: 'sync-button', kind: 'component', module: './src/views/SyncButton.vue' },
    ],
  },

  provides: {
    providers: [{ id: 'nd', name: 'Navidrome', protocols: ['tracks', 'playlists'], qualities: ['128k', 'flac'] }],
    importers: [{ id: 'nd-import', title: '从 Navidrome 导入' }],
    services: [{ id: 'navidrome-session', version: '1.0.0', methods: ['getServer', 'getToken'] }],
    accounts: [{ id: 'nd-account', title: 'Navidrome 账号', loginMethods: ['form'], capabilities: ['profile', 'playlists'], providers: ['nd'] }],
    actions: [
      { id: 'open-in-nd', title: '在 Navidrome 中打开' },
    ],
  },

  uses: {
    permissions: [
      { key: 'net', name: 'network.request', scope: { hosts: ['*'] }, reason: '访问你的 Navidrome 服务器' },
      { key: 'lib', name: 'library.write', reason: '把服务器歌单导入到本地' },
    ],
    plugins: [{ pluginId: 'lx-compat', service: 'lx-script-runner', version: '^1', optional: true }],
  },

  ui: {
    pages: [
      { id: 'browse', title: '我的服务器', mount: 'sidebar', group: 'library', view: 'browse', icon: { kind: 'host', name: 'server' } },
      { id: 'settings', title: 'Navidrome', mount: 'settings', view: 'settings' },
    ],
    slots: [{ id: 'sync', slot: 'playlist.header.actions', mode: 'append', view: 'sync-button' }],
    menus: [{ id: 'open', target: 'track', title: '在 Navidrome 中打开', action: 'open-in-nd' }],
  },

  config: { serverUrl: '' },
})
```

源码中 `entry` 下的 `module` 写文件路径。cli 构建时替换为 artifact 内的模块 id，并把全部模块打进同一个单 JS 文件。

#### 4.1.3 共享数据契约

以下类型同时在两个环境中流动，经过共享的宿主服务和音乐聚合层：`ResourceRef`、`ContentEntity`、`Page`、`SearchRequest`、`ResolveResult`、`MusicFault`、`CrLyric`、`LyricLine`、`TrackMetadata`、`PlaylistMetadata`、`ChartMetadata`、`LibraryPlaylist`、`PlaylistReference`、`OperationContext`。

**v3 sdk 中这些类型只能新增可选字段，不能删除字段、改名或收紧取值。** 宿主共享层对这些数据使用 v3 sdk 的校验函数，因此 v3 校验函数必须接受 v2 插件产生的合法数据。`test/data-contract.test.mjs` 用 v2 插件的真实输出样本做断言，见阶段二。

### 4.2 logic 侧 `ctx`

v3 的 `ctx` 保留 v2 中已有的分组路径，例如 `ctx.providers.register`、`ctx.library.playlists.import`、`ctx.player.play`，便于插件作者迁移。v2 preview 时代的兼容别名不进入 v3，包括 provider 顶层的 `search`、`resolve`、`lyrics`、`categories`、`list`、`share` 方法。

新增：

| 路径 | 作用 | 规范 |
| --- | --- | --- |
| `ctx.music` | 跨音源搜索、歌单、榜单、歌词、播放 | 4.2.1 |
| `ctx.plugins`、`ctx.services.register` | 使用与提供插件服务 | 4.2.2、4.6 |
| `ctx.hooks.on` | 拦截与改写软件操作 | 4.8.2 |
| `ctx.events.on` | 监听操作事件与状态事件 | 4.8.3 |
| `ctx.app.call`、`ctx.app.operations.list` | 按名字调用任意操作，获取工具目录 | 4.8.7 |
| `ctx.lifecycle.*` | 软件与插件自身生命周期 | 4.9 |
| `ctx.router.*` | 路由守卫与跳转 | 4.10 |
| `ctx.accounts.register` | 提供平台账号 | 4.11 |
| `ctx.server.serve` | 沙箱档 HTTP 服务 | 4.14.2 |
| `ctx.streams.registerTransform` | 播放流的自定义变换 | 4.14.4 |
| `ctx.crypto.createCipher`、`createDecipher` | 流式加解密 | 4.14.4 |
| `ctx.wasm.instantiate` | 加载 WebAssembly | 4.14.5 |
| `ctx.ui.pages`、`ctx.ui.views` | 打开页面、向视图推送状态 | 本节 |

`definePlugin` 同时接受函数与选项式对象，见 4.9。界面相关新增字段：

```ts
interface PluginContext {
  // ...与 v2 相同的分组路径...

  music: MusicAPI
  plugins: PluginsAPI
  services: { register(serviceId: string, handlers: Record<string, ServiceHandler>): Disposable }
  ui: HostUI & {
    // ...与 v2 相同的字段...
    pages: {
      /** 仅对 presentation 为 drawer 或 modal 的 view 有效 */
      open(pageId: string, props?: JsonObject): Promise<void>
      close(pageId: string): Promise<void>
    }
    views: {
      /** 推送状态到该 view 的所有已挂载实例。component 视图经 bridge.state 读取 */
      setState(viewId: string, state: JsonObject): Promise<void>
      on(event: 'mounted' | 'unmounted',
         handler: (info: { viewId: string; instanceId: string; props: JsonObject }) => void): Disposable
    }
  }
}
```

#### 4.2.1 `MusicAPI`

```ts
interface MusicSource {
  id: string            // providerId
  pluginId: string      // 'host' 表示本地音乐
  runtime: 2 | 3 | 'host'
  name: string
  protocols: string[]
  qualities: string[]
  icon?: string         // 已解析的 URL
  available: boolean
}

interface MusicAPI {
  sources(): Promise<MusicSource[]>
  search(sourceId: string, request: SearchRequest, call: ServiceCall): Promise<Page<ContentEntity>>
  suggest(sourceId: string, query: string, call: ServiceCall): Promise<string[]>
  hotSearch(sourceId: string, call: ServiceCall): Promise<string[]>
  tracks: {
    resolve(ref: ResourceRef, quality: string | undefined, call: ServiceCall): Promise<ResolveResult>
    lyrics(ref: ResourceRef, call: ServiceCall): Promise<CrLyric>
    artwork(ref: ResourceRef, call: ServiceCall): Promise<string | undefined>
  }
  playlists: {
    search(sourceId: string, request: SearchRequest, call: ServiceCall): Promise<Page<ContentEntity>>
    categories(sourceId: string, call: ServiceCall): Promise<Page<ContentEntity>>
    list(ref: ResourceRef, cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>>
    get(ref: ResourceRef, cursor: string | undefined, call: ServiceCall): Promise<PlaylistTrackPage>
  }
  charts: {
    list(sourceId: string, call: ServiceCall): Promise<Page<ContentEntity>>
    getTracks(ref: ResourceRef, cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>>
  }
  importers: {
    list(): Promise<{ id: string; pluginId: string; title: string; description?: string }[]>
    parse(importerId: string, value: string, cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>>
  }
  play(ref: ResourceRef, call: ServiceCall): Promise<void>
  enqueue(refs: ResourceRef[], position: 'next' | 'end', call: ServiceCall): Promise<void>
  on(event: 'sources.changed', handler: (sources: MusicSource[]) => void): Disposable
}
```

`ServiceCall` 沿用 v2 的定义，即 `{ operation, permissionKey }`。`sources()` 包含 v2 插件注册的音源，`runtime` 字段标明来源环境，调用方式没有区别。

#### 4.2.2 `PluginsAPI`

```ts
interface PluginsAPI {
  /** 硬依赖缺失时抛错，软依赖缺失时返回 null */
  use<T = Record<string, (input: JsonValue) => Promise<JsonValue>>>(pluginId: string, service: string): Promise<T | null>
  list(): Promise<{ pluginId: string; services: ServiceDeclaration[] }[]>
  on(event: 'available' | 'unavailable',
     handler: (info: { pluginId: string; service: string }) => void): Disposable
}

type ServiceHandler = (
  input: JsonValue,
  call: { callerPluginId: string; operation: OperationContext },
) => MaybePromise<JsonValue | void>
```

### 4.3 `component` 视图

#### 4.3.1 视图模块约定

cli 把每个 `kind: 'component'` 的 view 构建成一个 ESM 模块，默认导出一个工厂函数：

```ts
export default function (deps: ViewDeps): ViewEntry
interface ViewDeps {
  vue: typeof import('vue')
  tdesign: typeof import('tdesign-vue-next')
  sdk: typeof import('@shiqianjiang/ceru-plugin-sdk/vue')
}
type ViewEntry = (bridge: ViewBridge) => void | (() => void)
```

构建规则：`vue`、`tdesign-vue-next`、`@shiqianjiang/ceru-plugin-sdk/vue` 标为 external。cli 的 esbuild 后处理把这些 import 改写为从 `deps` 解构，并把整个模块体包进工厂函数。源码中直接 `export default` 一个 Vue 组件的文件，由 cli 自动包装为 `defineView((bridge) => mountComponent(component, bridge))`。

不使用 import map，不使用全局变量，不使用 `eval`。宿主以 `import(blobUrl)` 加载模块后调用 `mod.default(deps)`。

#### 4.3.2 `ViewBridge`

```ts
interface ViewBridge {
  readonly root: ShadowRoot
  readonly instanceId: string
  readonly viewId: string
  /** 路由参数或挂载上下文。playlist-section 收到 { playlist: LibraryPlaylist }。drawer 与 modal 收到 open() 传入的 props */
  readonly props: Readonly<JsonObject>
  /** logic 经 ctx.ui.views.setState 推送的状态 */
  readonly state: Readonly<Ref<JsonObject>>
  readonly theme: Readonly<Ref<'light' | 'dark'>>
  /** Teleport 目标，位于 body 层级的宿主层。TDesign 弹层的 attach 也指向这里 */
  readonly overlay: HTMLElement
  readonly components: HostComponents
  readonly icons: { url(name: HostIconName): string }
  invoke<I extends JsonValue = JsonValue, O extends JsonValue = JsonValue>(action: string, input?: I): Promise<O>
  /** 仅 drawer 与 modal 有效 */
  close(): Promise<void>
  onDispose(fn: () => void): void
}
```

`invoke` 只能到达本插件 `provides.actions` 中声明的 action，由 `SurfaceSession` 做校验与限流。

#### 4.3.3 `HostComponents`

宿主在 `CeruMusic/src/renderer/src/plugin/hostComponents.ts` 中显式导出。初始集合：

| 组件 | 说明 |
| --- | --- |
| `SongList` | 应用的歌曲列表，接收 `ContentEntity[]`，内置播放、收藏、下载菜单 |
| `PlaylistCard` | 歌单卡片 |
| `PlaylistGrid` | 歌单卡片网格 |
| `QualityBadge` | 音质标签 |
| `SourceIcon` | 平台图标 |
| `PageHeader` | 与应用页面一致的标题栏 |
| `EmptyState` | 空状态 |
| `LoadingState` | 加载状态 |

TDesign 整体通过 `deps.tdesign` 提供，不在这个表里。`HostComponents` 的 props 接口只增不改。移除组件或修改 props 视为 `hostApi` 的 major 变更。

#### 4.3.4 `@shiqianjiang/ceru-plugin-sdk/vue`

```ts
export function defineView(setup: (bridge: ViewBridge) => void | (() => void)): ViewEntry
/** 创建 app、注入 bridge、挂载到 root，返回卸载函数 */
export function mountComponent(component: Component, bridge: ViewBridge): () => void
export function useView(): ViewBridge
export function useAction<I, O>(action: string): (input?: I) => Promise<O>
export function useViewState<T extends JsonObject>(): Readonly<Ref<T>>
export function useHostComponents(): HostComponents
```

`mountComponent` 的内部步骤：`createApp(component)`，`app.use(TDesign)`，把 `ConfigProvider` 的 `attach` 指向 `bridge.overlay`，`app.provide(VIEW_BRIDGE_KEY, bridge)`，挂载到 `bridge.root` 内的容器元素，返回卸载函数。

#### 4.3.5 渲染进程加固

1. preload 暴露的桥对象在渲染进程启动后由应用代码取走，随后执行 `delete window.<bridge>`，应用内部改从模块闭包访问。排查 `src/renderer` 中所有 `window.api`、`window.electron` 的直接访问，统一改为从一个模块导入。
2. 视图模块以 blob URL 加载。渲染进程 CSP 的 `script-src` 加入 `blob:`。
3. shadow root 使用 `mode: 'closed'`。
4. issuer 对 `component` 入口的构建产物做静态扫描，命中以下任一模式即拒签：`window.api`、`window.electron`、`ipcRenderer`、`document.cookie`、`localStorage`、`sessionStorage`、`indexedDB`、`Element.prototype.`、`Node.prototype.`、`Object.defineProperty(window`、`eval(`、`new Function(`、`import(`。最后一项是动态 import，视图模块必须自包含。
5. 安装含 `component` 视图的插件时，确认框增加一行"此插件包含界面代码，将在应用内运行"。
6. 设置页提供"严格模式"开关。开启后，`component` 整页退回 iframe 方式加载，走 `PluginWebSurface.vue` 路径。槽位中的 `component` 视图不渲染。

#### 4.3.6 槽位中的 `component` 视图

`ui.slots[].view` 可以指向 `component` 视图。宿主施加以下限制：

- 每个插件在每个槽位上同屏最多 200 个实例。
- 单次挂载超过 50ms 记一次警告。连续 5 次超限后，暂停该插件的槽位渲染，并在插件列表中提示。
- `props` 为只读冻结对象。

### 4.4 RPC 契约表

位于 v3 `packages/core/src/contract.ts`，是 v3 环境所有 RPC 方法的唯一真相源。

```ts
export interface ContractEntry {
  /** null 表示无需权限。函数用于按参数动态决定权限 */
  permission: PermissionName | null | ((data: any) => PermissionName)
  /** 取 permissionKey 的位置。缺省时依次尝试 data.permissionKey、data.call?.permissionKey、data.args?.[keyIndex]?.permissionKey */
  keyIndex?: number
  validate?: (data: any, manifest: PluginManifestV3) => void
  timeoutMs?: number
  /** 去重键。同键的在途调用复用同一个 Promise，用于 library.playlists.import */
  dedupe?: (data: any) => string
  validateResult?: (result: any) => void
}

export const CONTRACT = {
  // 'music.search': { permission: 'music.read', … },
} as const satisfies Record<string, ContractEntry>
```

必须用 `as const satisfies`，不能写成 `const CONTRACT: Record<string, ContractEntry>`。后者让 `keyof typeof CONTRACT` 退化为 `string`，`HostServices` 就无法在宿主缺少实现时报错。

**初始键集合**，按以下三个来源取并集，一个不漏：

1. 现有 `PluginHost.ts` 的 `rpc` 方法（约第 788-1169 行）中所有 `method === '…'` 与 `method.startsWith('…')` 分支。
2. `packages/cli/runtime/sandbox.ts` 中所有字面量 `rpc('…')` 调用。
3. `sandbox.ts` 中动态拼接的服务方法：`rpc('services.' + service + '.' + method, { args })` 由 `PluginHost.ts` 的 `SERVICE_CAPABILITIES` 常量中每个服务的 `methods` 展开，例如 `services.player.play`、`services.queue.append`。这部分无法用 grep 得到，必须按 `SERVICE_CAPABILITIES` 逐项列出。

最后加上 v3 新增的方法。

**参数约定。** 契约表中每个方法收到一个 `data` 对象。沿用 v2 的两种形状，不新增第三种：

- 具名参数：`data` 就是参数对象，例如 `http.request` 的 `{ url, method, permissionKey, … }`。`permissionKey` 在 `data.permissionKey`。
- 位置参数：`data` 为 `{ args: [...] }`，例如 `services.*` 与 `music.*`。`ctx.music.search(sourceId, request, call)` 对应 `{ args: [sourceId, request, call] }`，`ServiceCall` 中的 `permissionKey` 由 `keyIndex` 指出，此例为 `2`。

`music.*`、`app.call` 与 4.8.4 目录中的操作一律使用位置参数形状。

`packages/core/src/dispatch.ts`：

```ts
export interface DispatchHooks {
  authorize(permissionKey: string | undefined, permission: PermissionName): Promise<void>
  log: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
  pluginId: string
  manifest: PluginManifestV3
}
export type HostServices = { [K in keyof typeof CONTRACT]: (data: any, hooks: DispatchHooks) => Promise<any> }
export function createDispatcher(services: HostServices, hooks: DispatchHooks): (method: string, data: any) => Promise<any>
```

`createDispatcher` 负责：检查方法是否存在、查询与申请权限、执行 `validate`、超时与取消、`dedupe`、执行 `validateResult`、写审计日志。`HostServices` 的类型由契约表推导，宿主缺少实现时编译报错。

v3 sandbox 运行时根据 `Object.keys(CONTRACT)` 生成 `ctx` 方法树。`'music.search'` 对应 `ctx.music.search`。`services.` 前缀映射到 `ctx` 顶层，例如 `'services.player.play'` 对应 `ctx.player.play`，`'services.app.call'` 对应 `ctx.app.call`。因此契约表中不得出现会映射到 `ctx` 已有对象的 `services.*` 键，例如不能用 `services.register`。

以下 `ctx` 成员不是契约表生成的，而是运行时中手写的客户端包装，内部仍调用契约表中的方法或使用专门的注册消息：`http.request`、`sockets.*`、`storage.*`、`permissions.*`、`hooks.on`、`events.on`、`lifecycle.*`、`router.beforeEach` 与 `afterEach`、`services.register`、`accounts.register`、`server.serve`、`streams.registerTransform`、`crypto.*`、`wasm.*`。新增客户端包装时，必须在这份列表中登记。

宿主侧 `V3PluginHost` 传给 `createDispatcher` 的 `HostServices` 对象，由共享的 `hostServices.ts` 适配而来。`V2PluginHost` 不使用契约表，保留自己的 RPC 分支与权限逻辑，但每个分支的实现体调用同一个 `hostServices.ts`。

一致性测试 `test/rpc-contract.test.mjs`：遍历 `CONTRACT`，断言 sandbox 生成的 `ctx` 含有对应路径，并断言 `docs/HOST-SERVICES.md` 含有该方法名。

### 4.5 权限变更

| 变更 | 内容 |
| --- | --- |
| 新增权限名 | `music.read`：覆盖 sources、search、suggest、hotSearch、playlists、charts、importers、lyrics、artwork。`music.control`：覆盖 play、enqueue、resolve |
| 新增权限组 | `musicRead: { title: '搜索与读取所有已安装音源', permissions: ['music.read'] }`。`musicControl: { title: '播放任意音源的歌曲', permissions: ['music.control'] }` |
| 复用 | `services.consume` 用于 `ctx.plugins.use` |
| 资源归属 | v3 环境中，`music.*`、`player.*`、`queue.*` 对 ref 的归属校验改为：ref 是公开资源且插件持有 `music.control` 即可。公开资源指 `scope === 'provider'` 或不含 `connectionId`。含 `connectionId` 的账号私有资源仍只允许所属插件操作。**v2 环境的 `ownedRef` 规则不变** |
| 安装提示 | 含 `component` 视图的插件增加界面代码提示 |
| 其他新增 | 操作拦截权限见 4.8.6，账号凭据提取 `credentials.capture` 见 4.11.3，HTTP 服务、流变换与完全信任见 4.14.6 |

权限记录的存储格式两个环境相同：`plugins/permissions/<pluginId>.json` 中存 `key:name:scope` 指纹。v2 插件升级为 v3 后，只要同一权限的 `key`、`name`、`scope` 不变，原有授权继续有效。

### 4.6 插件服务与依赖

只在 v3 环境之间生效。

| 规则 | 内容 |
| --- | --- |
| 声明 | B 在 `provides.services[]` 中声明，A 在 `uses.plugins[]` 中声明 |
| 注册 | B 在 logic 中调用 `ctx.services.register(id, handlers)`。handler 名必须在 `methods` 中声明 |
| 路由 | v3 `packages/core/src/service-router.ts`。只传 JSON，默认超时 30 秒，B 的 handler 收到 `callerPluginId` |
| 权限 | A 必须声明 `services.consume`，每次调用经契约表校验，不按插件对弹授权 |
| 硬依赖 | 默认。B 未安装、未启用或版本不匹配时，A 不激活，插件列表显示"缺少依赖 B，去安装" |
| 软依赖 | `optional: true`。B 缺失时 `use` 返回 null。B 可用后触发 `available` 事件 |
| 版本 | 用 semver 匹配 `ServiceDeclaration.version`。不匹配视为缺失 |
| 深度 | handler 内调用 `ctx.plugins.use` 时抛错 `Nested plugin service calls are not allowed` |
| 激活顺序 | 对硬依赖做拓扑排序。检测到环时，环上所有插件都不激活并报错 |
| 卸载 | B 停用或卸载后，硬依赖 B 的 A 自动停用并提示。B 恢复后 A 自动重新激活 |

### 4.7 开发者模式

宿主设置页新增"插件开发者模式"：

| 项 | 内容 |
| --- | --- |
| 开关 | `settings.pluginDeveloperMode: boolean`，默认关闭 |
| 添加 | 选择一个本地构建产物，即单 JS 文件。记录到新文件 `plugins/dev-entries.json`，格式为 `{ path: string; enabled: boolean }[]` |
| 加载 | 先经 3.5 的版本识别，再走对应环境的正常加载路径，唯一区别是跳过签名校验。与正式安装的同 id 插件冲突时开发版优先，并给出提示 |
| 热重载 | 用 `fs.watch` 监听该文件。变化后防抖 300ms，销毁旧 host 并重新加载。渲染层收到 `plugin:dev-reloaded` 后刷新该插件已挂载的视图 |
| 标识 | 插件列表显示"开发中"徽标、运行环境与文件路径。最近一次加载错误直接显示在插件卡片上 |
| cli | v3 的 `ceru-plugin dev` 只做 watch 构建，终端打印产物的绝对路径，并提示"在 CeruMusic 设置 → 插件开发者模式 中添加此文件" |

### 4.8 操作管线：hook、事件与工具

#### 4.8.1 概念

**操作**是软件里一次有意义的动作，例如点赞、切歌、添加到歌单、搜索、下载。每个操作有一个固定名字，例如 `track.like`。

同一个操作可以从很多入口触发。用户点击按钮、按快捷键、系统媒体键、其他插件调用、软件内部逻辑，触发的都是同一个操作，区别只在 `source` 字段。

每次执行操作都经过同一条管线：

```text
入口（按钮 / 快捷键 / 插件调用 / 系统媒体键 / 软件内部）
  │  runOperation(name, input, source)
  ▼
① 前置事件 <name>           监听者可以 preventDefault() 取消
  ▼
② hook 链 h1 → h2 → …      每个 hook 可以观察、改参数、拦截、包裹内置实现
  ▼
③ 内置实现                   软件原本的行为
  ▼
④ 完成事件 <name>:done       监听者收到最终参数与结果，只读
```

操作表是 4.4 契约表的扩展。契约表中每一行 `ContractEntry` 增加以下字段，使同一张表同时提供四样东西：插件可调用的 API、可拦截的 hook、可监听的事件、可当工具调用的目录。

```ts
interface OperationEntry extends ContractEntry {
  /** 输入参数的 JSON Schema。用于参数校验、工具目录与文档生成 */
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  /** 拦截此操作所需的权限。缺省表示不允许 hook */
  intercept?: PermissionName
  /** 监听此操作事件所需的权限 */
  observe?: PermissionName
  /** 是否派发可取消的前置事件 */
  cancelable: boolean
  /** 单个 hook 的执行时限 */
  hookTimeoutMs: number
  /** 内置实现所在进程 */
  defaultIn: 'main' | 'renderer'
  /** 用户发起的操作被插件改写或取消时，是否在界面上提示 */
  announce: boolean
}
```

#### 4.8.2 hook

hook 是一个高阶函数。它收到操作上下文 `op`，以及软件的内置实现 `next`：

```ts
ctx.hooks.on('track.like', async (op, next) => {
  op.input    // { track: ContentEntity, liked: true }
  op.source   // { kind: 'ui', location: 'player-bar' }
  op.state    // 只读的现场信息：当前播放、当前路由、当前账号
})
```

handler 的写法决定结果，规则只有四条：

| 写法 | 效果 | 典型用途 |
| --- | --- | --- |
| 不 return，不调用 `next` | 只观察。软件用 `op.input` 照常执行内置实现。直接修改 `op.input` 的字段也会生效 | 记录、统计、同步到其他平台 |
| return 一个新的 input | 软件用新参数执行内置实现 | 把要播放的歌换成高音质版本，把搜索词繁转简 |
| 调用 `op.preventDefault()` | 拦截。软件不执行内置实现。可以用 `op.respondWith(result)` 给出结果 | 未成年模式拦截某些歌，点赞改为同步到自建服务 |
| 调用 `next(input?)` | 自己在中间执行内置实现，拿到结果后再处理。handler 的 return 值作为最终结果，不 return 则用 `next` 的结果 | 播放失败时换源重试，搜索结果重新排序 |

`next` 最多调用一次。调用过 `next` 后，软件不会再执行一次内置实现。

示例：

```ts
// 收藏时自动同步到 Last.fm，不改变软件行为
ctx.hooks.on('track.like', async (op) => {
  await lastfm.love(op.input.track)
})

// 播放时自动换成同一首歌的无损版本
ctx.hooks.on('player.play', async (op) => {
  const hq = await findLossless(op.input.track)
  if (hq) return { ...op.input, track: hq }
})

// 播放解析失败时换一个音源重试
ctx.hooks.on('player.resolve', async (op, next) => {
  const result = await next()
  if (result.ok) return result
  const alt = await ctx.music.search('kw', { query: op.input.track.title, kinds: ['track'], filters: {}, limit: 1 }, call)
  return alt.items[0] ? next({ ...op.input, track: alt.items[0] }) : result
})

// 搜索结果去掉 live 版本
ctx.hooks.on('search.results', async (op) => ({
  ...op.input,
  page: { ...op.input.page, items: op.input.page.items.filter((x) => !/live/i.test(x.title)) },
}))
```

多个插件 hook 同一个操作时，按插件列表中的排序依次执行，后一个看到的是前一个修改过的 `op.input`。插件也可以声明 `{ priority: 'early' | 'normal' | 'late' }` 调整自己在同一排序内的位置。

#### 4.8.3 事件

事件是浏览器风格的写法，适合只想观察或只想取消的场景：

```ts
// 前置事件：在内置实现之前派发。只有操作表中 cancelable 为 true 的操作才有
ctx.events.on('track.like', (e) => {
  e.input           // 只读
  e.source
  e.preventDefault()
})

// 完成事件：操作结束之后派发，收到最终参数与结果
ctx.events.on('track.like:done', (e) => {
  e.input           // 经过所有 hook 修改后的最终参数
  e.result
  e.prevented       // 是否被取消
  e.handledBy       // 改写或取消了这次操作的插件 id 列表
})
```

除了操作事件，还保留并扩展状态事件。状态事件只有一种形式，只读：

| 事件 | 说明 |
| --- | --- |
| `player.changed`、`queue.changed`、`lyrics.changed`、`library.changed`、`downloads.changed`、`settings.changed`、`theme.changed`、`rooms.changed`、`devices.changed`、`account.changed`、`permissions.changed` | v2 已有，保持不变 |
| `player.progress` | 播放进度，节流为每秒一次 |
| `track.started` | 一首歌开始播放 |
| `track.finished` | 一首歌结束，带 `playedMs` 与 `completed`。按 Last.fm 规则，播放超过一半或四分钟即视为完成，方便做听歌记录 |
| `route.changed` | 页面切换 |

#### 4.8.4 初始操作目录

阶段五按下表实现。`入口` 列出该操作需要接入管线的现有代码位置，执行时用 `grep` 定位具体调用点。

| 操作 | input | 内置实现 | 可取消 | intercept 权限 | 入口 |
| --- | --- | --- | --- | --- | --- |
| `player.play` | `{ track, queueIndex? }` | 播放指定歌曲 | 是 | `player.intercept` | `store/ControlAudio.ts`、`store/GlobalPlayStatus.ts`、歌曲列表双击、系统媒体键 |
| `player.pause` / `player.resume` | `{}` | 暂停或继续 | 是 | `player.intercept` | 播放栏、快捷键、系统媒体键 |
| `player.next` | `{ reason: 'user' \| 'ended' \| 'error' }` | 按播放模式选下一首。hook 可以 return `{ track }` 指定下一首 | 是 | `player.intercept` | 播放栏、快捷键、播放结束 |
| `player.previous` | `{}` | 上一首 | 是 | `player.intercept` | 同上 |
| `player.seek` | `{ positionMs }` | 跳转 | 否 | `player.intercept` | 进度条、歌词点击 |
| `player.setVolume` | `{ volume }` | 设置音量 | 否 | `player.intercept` | 音量条、快捷键 |
| `player.setMode` | `{ mode }` | 设置播放模式 | 是 | `player.intercept` | 播放栏 |
| `player.resolve` | `{ track, quality }` | 经 `MusicRegistry` 解析播放地址 | 否 | `player.intercept` | 播放流程内部 |
| `player.error` | `{ track, error }` | 跳到下一首 | 是 | `player.intercept` | 播放流程内部 |
| `player.queueEnded` | `{}` | 按播放模式停止或循环。hook 可以 return `{ tracks }` 续播 | 是 | `player.intercept` | 播放流程内部 |
| `queue.add` | `{ tracks, position: 'next' \| 'end' }` | 加入队列 | 是 | `player.intercept` | 歌曲菜单"下一首播放"等 |
| `queue.remove` / `queue.clear` | `{ tracks? }` | 移除或清空 | 是 | `player.intercept` | 播放列表面板 |
| `queue.shuffle` | `{ items }` | 随机打乱，返回新顺序。hook 可以换成自己的随机算法 | 否 | `player.intercept` | 开启随机播放时 |
| `track.like` | `{ track, liked }` | 加入或移出"我喜欢" | 是 | `library.intercept` | 播放栏、歌曲菜单、快捷键 |
| `playlist.create` | `{ name, location }` | 创建歌单 | 是 | `library.intercept` | 歌单页 |
| `playlist.delete` | `{ playlist }` | 删除歌单 | 是 | `library.intercept` | 歌单页 |
| `playlist.addTracks` | `{ playlist, tracks }` | 添加歌曲 | 是 | `library.intercept` | 歌曲菜单"添加到歌单" |
| `playlist.removeTracks` | `{ playlist, tracks }` | 移除歌曲 | 是 | `library.intercept` | 歌单详情 |
| `playlist.import` | `{ value, importerId? }` | 调用导入器并写入歌单 | 是 | `library.intercept` | 导入对话框 |
| `playlist.export` | `{ playlist, format }` | 导出文件 | 是 | `library.intercept` | 歌单菜单 |
| `search.query` | `{ query, sourceId, kinds }` | 原样返回。hook 可以改写搜索词 | 是 | `search.intercept` | `store/search.ts` |
| `search.results` | `{ query, sourceId, page }` | 原样返回。hook 可以过滤、重排、合并 | 否 | `search.intercept` | 搜索结果返回后 |
| `search.suggest` | `{ query, items }` | 原样返回 | 否 | `search.intercept` | 搜索框 |
| `lyrics.load` | `{ track }` | 经 provider 加载歌词。hook 可以在缺歌词时补上 | 否 | `lyrics.intercept` | 歌词加载流程 |
| `lyrics.transform` | `{ track, lyric }` | 原样返回。hook 可以加翻译、注音 | 否 | `lyrics.intercept` | 歌词显示前 |
| `download.create` | `{ tracks, quality, directory? }` | 创建下载任务 | 是 | `downloads.intercept` | `store/download.ts` |
| `download.filename` | `{ track, name }` | 原样返回。hook 可以按自己的模板命名 | 否 | `downloads.intercept` | 下载流程内部 |
| `share.create` | `{ track }` | 生成分享链接 | 是 | `sharing.intercept` | 歌曲菜单"分享" |
| `link.open` | `{ url, from: 'paste' \| 'drop' \| 'deeplink' }` | 软件已有的链接识别。hook 可以认领链接，例如识别某平台歌单链接后打开导入 | 是 | `links.intercept` | 全局粘贴、拖放、`ceru://` 协议 |
| `notification.show` | `{ title, body, level }` | 软件内提示 | 是 | `notifications.intercept` | 软件内所有提示 |
| `window.close` | `{}` | 按设置最小化到托盘或退出 | 是 | `window.intercept` | 主窗口关闭按钮 |

不进入操作目录的动作：退出软件、卸载插件、修改插件权限、安装插件。这些动作涉及用户对插件本身的控制权，不允许被插件拦截。

#### 4.8.5 执行规则

| 规则 | 内容 |
| --- | --- |
| 快路径 | 渲染进程维护一份"有 hook 或可取消监听的操作名"集合，由主进程通过 `plugin:hooks-changed` 推送。操作不在集合中时，直接在本地执行内置实现，不经过 IPC。没有插件拦截时性能与现在相同 |
| 慢路径 | 操作在集合中时，经 IPC 交给主进程的 `OperationBus` 执行完整管线。`next` 最终调用内置实现，内置实现在渲染进程时沿用现有 `callPluginUI` 通道 |
| 超时 | 每个 hook 受 `hookTimeoutMs` 约束：播放类 800ms，路由守卫 500ms，其余 3000ms。超时视为"不 return"，管线继续 |
| 出错 | hook 抛错同样视为"不 return"，管线继续。错误写入插件日志 |
| 降级 | 同一插件的同一 hook 在 10 分钟内超时或出错 3 次，暂停该 hook 并在插件列表提示，用户可以手动恢复 |
| 防递归 | 插件在自己的 hook 内触发同名操作时，这次执行跳过该插件自己的 hook。管线嵌套深度上限为 3 |
| 可见性 | 操作表中 `announce` 为 true，且操作由用户发起、被插件改写或取消时，界面显示一条轻提示"已由 某插件 处理"，附"撤销本次"按钮。用户可以在设置中关闭提示 |
| 活动记录 | 每个插件最近 100 次改写或取消记录在插件详情页，内容包括操作名、时间、来源、改了什么 |
| 安全模式 | 设置页提供"暂停所有插件拦截"开关。按住 Shift 启动软件时自动开启。开启后所有 hook 与可取消监听都不执行，只保留完成事件 |

插件自己调用操作也走同一条管线，例如 `ctx.player.play(track)`。因此插件 A 让软件播放一首歌时，插件 B 的 `player.play` hook 同样生效，`op.source` 为 `{ kind: 'plugin', pluginId: 'A' }`。

v2 插件调用软件操作时也走这条管线，见 D24。`V2PluginHost` 中与 4.8.4 目录对应的 RPC 分支，在原有权限判断之后改为调用 `runOperation`，而不是直接调用 `hostServices`，`op.source.runtime` 为 `2`。

#### 4.8.6 权限

| 权限 | 作用 | 授权提示 |
| --- | --- | --- |
| `player.intercept` | hook 播放与队列操作 | 可以拦截和改变你的播放操作，例如切歌、换歌 |
| `library.intercept` | hook 点赞、歌单操作 | 可以拦截和改变你的收藏与歌单操作 |
| `search.intercept` | hook 搜索 | 可以改写搜索词和搜索结果 |
| `lyrics.intercept` | hook 歌词 | 可以替换和修改歌词 |
| `downloads.intercept` | hook 下载 | 可以拦截和改变下载任务 |
| `sharing.intercept` | hook 分享 | 可以改变分享内容 |
| `links.intercept` | 认领链接 | 可以处理你粘贴或打开的链接 |
| `notifications.intercept` | hook 提示 | 可以拦截和改变软件提示 |
| `window.intercept` | hook 窗口关闭 | 可以改变关闭窗口时的行为 |
| `navigation.intercept` | 路由守卫，见 4.10 | 可以在页面切换时拦截或跳转 |

监听前置事件需要对应的 intercept 权限，因为它能取消操作。监听完成事件与状态事件需要对应的读权限，例如 `player.read`、`library.read`。

#### 4.8.7 工具：按名字调用任意操作

操作表本身就是一份工具目录：

```ts
const tools = await ctx.app.operations.list()
// [{ name: 'track.like', description, inputSchema, outputSchema, permission }, …]

await ctx.app.call('track.like', { track, liked: true }, call)
```

`ctx.app.call` 与具名方法完全等价，走同一条管线、同一套权限。它让插件可以把软件能力交给自己接入的大模型使用：把 `operations.list()` 的结果转成模型的工具定义，模型选择工具后用 `ctx.app.call` 执行。

`docs/OPERATIONS.md` 由脚本从操作表生成，不手写。

### 4.9 生命周期

插件可以按 Vue 风格注入软件与插件自身的生命周期。两种写法等价：

```ts
// 选项式
export default definePlugin({
  setup(ctx) { /* 原来 definePlugin(ctx => …) 的内容 */ },
  onAppReady(ctx) { /* … */ },
  onUpdate(ctx, { from }) { /* 数据迁移 */ },
})

// 组合式，在 setup 内
ctx.lifecycle.onAppReady(() => { /* … */ })
ctx.lifecycle.onBeforeQuit(async () => { await flush() })
```

`definePlugin(ctx => …)` 的函数写法继续可用，等同于只有 `setup` 的选项式。

**软件生命周期：**

| 钩子 | 时机 | 说明 |
| --- | --- | --- |
| `onAppReady` | 主窗口显示且所有插件恢复完成 | 插件激活时若已经发生，立即补发一次 |
| `onBeforeQuit` | 软件即将退出 | 可以 await 清理，总时限 3 秒。不能取消退出 |
| `onWindowShow` / `onWindowHide` | 主窗口显示或隐藏，包括最小化到托盘 | |
| `onWindowFocus` / `onWindowBlur` | 主窗口获得或失去焦点 | |
| `onSuspend` / `onResume` | 系统睡眠与唤醒 | 来自 Electron `powerMonitor` |
| `onLock` / `onUnlock` | 系统锁屏与解锁 | 来自 Electron `powerMonitor` |
| `onOnline` / `onOffline` | 网络连通性变化 | |
| `onThemeChange` | 深浅色切换 | |
| `onLocaleChange` | 界面语言切换 | |
| `onIdle` | 用户空闲超过指定时长 | `ctx.lifecycle.onIdle(ms, fn)`，最小 60 秒 |

**插件自身生命周期：**

| 钩子 | 时机 | 说明 |
| --- | --- | --- |
| `onInstall` | 首次安装后 | 初始化数据 |
| `onUpdate` | 同 id 插件更新为新版本后的首次激活 | 收到 `{ from }`，用于数据迁移 |
| `onEnable` / `onDisable` | 用户启用或停用 | |
| `onUninstall` | 用户卸载前 | 清理远端数据或注销登录，时限 5 秒。之后宿主删除文件与本地数据 |
| `onConfigChange` | 用户修改了插件配置 | 收到变化的键 |
| `onPermissionChange` | 用户授予或撤销了权限 | 收到变化的权限 key |

插件停用状态下也需要执行 `onInstall`、`onUpdate`、`onUninstall` 时，宿主以"仅生命周期"模式短暂激活插件：只调用这一个钩子，不注册任何 provider、hook、页面，执行完立即停止。

### 4.10 路由守卫

```ts
ctx.router.beforeEach(async (to, from) => {
  if (to.name === 'plugin-page' && to.params.pluginId === ctx.plugin.id && !(await loggedIn()))
    return { name: 'plugin-page', params: { pluginId: ctx.plugin.id, pageId: 'login' } }
  // 不 return：放行
  // return false：取消本次跳转
  // return 路由对象：重定向
})
ctx.router.afterEach((to, from) => { /* 页面统计、记住上次位置 */ })
ctx.router.current()
ctx.router.push(to)
```

| 规则 | 内容 |
| --- | --- |
| 路由对象 | `{ name, params, query }`。`name` 取值为软件内置的具名路由，以及 `plugin-page` |
| 重定向目标 | 只能是软件内置路由，或本插件自己的页面。不能跳到其他插件的页面 |
| 权限 | `beforeEach` 需要 `navigation.intercept`。`afterEach`、`current`、`push` 不需要额外权限 |
| 执行 | 内部是操作 `router.navigate`，遵守 4.8.5 的全部规则，超时 500ms |
| 实现 | 渲染进程在 vue-router 的全局 `beforeEach` 中调用 `runOperation('router.navigate', …)`。没有插件守卫时走快路径 |

用途举例：插件页面的登录守卫，未成年模式限制某些页面，打开搜索页时带上默认关键词，统计页面访问。

### 4.11 账号能力

目标：软件本身不内置任何平台的登录，但插件可以提供与内置一样完整的账号体验。现在的网易云登录是为单一平台专门写的，v3 把其中通用的部分做成插件环境能力，任何平台的插件都能用。

#### 4.11.1 声明

```ts
provides: {
  accounts: [{
    id: 'netease',
    title: '网易云音乐',
    icon: { kind: 'asset', resource: 'netease.svg' },
    /** 是否允许同时登录多个子账号 */
    multiple: true,
    loginMethods: ['qrcode', 'browser', 'sms', 'password'],
    /** 声明后，宿主自动把对应能力接入软件界面，见 4.11.4 */
    capabilities: ['profile', 'likes', 'playlists', 'history', 'recommend'],
    /** 绑定到哪些 provider。这些 provider 的请求自动带上当前账号 */
    providers: ['wy'],
  }],
}
```

4.1.1 中 v3 的 `AccountDeclaration` 即此结构。v2 的 `accountItems` 只在 v2 环境中保留原行为。

#### 4.11.2 插件实现

```ts
ctx.accounts.register('netease', {
  async login({ method, auth }) {
    if (method === 'qrcode') {
      const key = await api.createQrKey()
      return auth.qrcode({
        image: await api.qrImage(key),
        poll: async () => {
          const s = await api.checkQr(key)
          return s.done ? { status: 'done', credential: s.cookie } : { status: s.scanned ? 'scanned' : 'waiting' }
        },
        expiresInMs: 120_000,
      })
    }
    if (method === 'browser') {
      return auth.browser({
        url: 'https://music.163.com/#/login',
        until: { cookie: 'MUSIC_U' },
      })
    }
  },
  async profile(account) { return { id, displayName, avatar, vip } },
  async validate(account) { return { valid: true } },
  async logout(account) { await api.logout(account.credential) },
})
```

#### 4.11.3 宿主提供的通用登录界面

插件只描述"怎么登录"，界面全部由宿主渲染，风格与软件一致：

| 方法 | 宿主做的事 |
| --- | --- |
| `auth.qrcode` | 显示二维码弹窗，按插件的 `poll` 轮询，显示"已扫码，请在手机上确认"，过期后自动刷新 |
| `auth.browser` | 打开独立的登录窗口，每个子账号使用独立的 session 分区。满足 `until` 条件后关闭窗口，只提取 manifest 中声明域名下的 cookie |
| `auth.form` | 按插件给出的字段渲染表单，支持账号密码、短信验证码倒计时、图形验证码 |
| `auth.oauth` | 用系统浏览器打开授权页，通过 `ceru://` 协议接收回调 |

凭据处理：

- 凭据由宿主保存，用 Electron `safeStorage` 加密，每个子账号一份。插件拿到的是 `CredentialRef`。
- 插件发 HTTP 请求时带上 `credential`，宿主在主进程附加 cookie 或请求头。插件默认看不到凭据明文，需要明文时声明 v2 已有的 `credentials.read` 权限。
- `auth.browser` 可提取的域名由权限 `credentials.capture` 的 `scope.domains` 限定。

#### 4.11.4 自动接入软件

宿主根据 `capabilities` 自动把账号接入现有界面，插件不用写页面：

| 能力 | 软件中出现的位置 |
| --- | --- |
| `profile` | 账号菜单中显示头像、昵称、会员标识，支持切换和退出子账号 |
| `likes` | "我喜欢"页出现该平台的喜欢列表。点赞操作 `track.like` 对该平台歌曲的内置实现，按用户设置同步到平台 |
| `playlists` | 歌单页出现"网易云 · 我的歌单"分组 |
| `history` | 播放历史中可以切换查看平台记录 |
| `recommend` | 首页出现"每日推荐"等推荐区块 |

这些位置的数据通过插件实现的对应方法获取，例如 `likes.list`、`playlists.list`，方法签名在实现阶段按现有 `LibraryAPI` 与 `PlaylistProvider` 的风格定义。

账号与音乐请求的关联：

- 当前子账号写入 `OperationContext.connectionId`。插件在 `provides.accounts[].providers` 中绑定的 provider，收到的请求自动带上它。
- 切换子账号触发操作 `account.switch`，可以被 hook；完成后派发 `account.changed`。
- 凭据失效时，`validate` 返回 `{ valid: false }`，宿主在账号菜单标记"需要重新登录"，并派发 `account.expired`。

### 4.12 候选扩展槽

以下扩展槽沿用 4.11 的模式：插件实现约定的方法，宿主负责界面和接入，用户感觉像软件内置功能。本任务书只列设计方向，不排入阶段，按需单独立项。

| 扩展槽 | 插件提供 | 软件中的效果 |
| --- | --- | --- |
| `provides.radios` | 根据种子歌曲或心情返回下一批歌曲 | 首页与播放栏出现"私人电台"，播放到队列末尾时自动续播 |
| `provides.scrobblers` | 接收 `track.finished` | 设置页出现听歌记录服务开关，如 Last.fm、ListenBrainz |
| `provides.outputs` | 设备列表、播放控制 | 播放设备菜单出现新的投放目标，如 AirPlay、Chromecast |
| `provides.backups` | 上传与下载歌单数据 | 设置页出现备份与同步，可选择该服务 |
| `provides.commands` | 命令名与处理函数 | 出现在全局命令面板中，可以绑定快捷键 |
| `provides.linkHandlers` | 链接规则与处理函数 | 声明式版本的 `link.open` hook，粘贴链接时软件直接显示"用 某插件 打开" |
| `provides.tools` | 带 JSON Schema 的 action | 软件的 AI 助手可以调用插件能力。宿主 `ai-service.ts` 目前没有工具机制，需要先在宿主侧建立 |

### 4.13 界面替换：区域与皮肤

插件可以替换软件已有的界面区域，例如歌词、唱片、背景，组合成一套独一无二的播放器皮肤。

#### 4.13.1 已有基础

`CeruMusic/src/renderer/src/components/Play/FullPlay.vue` 第 936-956 行已经用 `<component :is>` 在两个歌词渲染器之间切换。`LyricAdapter` 与 AML `LyricPlayer` 接收同一组属性：`lyricLines`、`currentTime`、`playing`、`alignPosition`、`enableBlur`、`enableSpring`、`enableScale`、`textAlign`，并发出同一个 `line-click` 事件。左侧区域也已经在 `cd` 与 `cover` 两种布局之间切换。

v3 把这种"固定属性契约、可替换实现"的模式推广为**区域**，并向插件开放。

#### 4.13.2 区域

区域是软件界面中一块可以整体替换的位置。每个区域有固定名字、带版本号的属性契约，以及软件自带的默认实现。

| 区域 | 位置 | 默认实现 | 契约要点 |
| --- | --- | --- | --- |
| `player.lyrics@1` | 全屏播放页右侧歌词 | `LyricAdapter`、AML `LyricPlayer` | 歌词行、当前时间、播放状态、对齐与动效设置。动作：跳转到某行 |
| `player.artwork@1` | 全屏播放页左侧封面区 | 唱片 `cd`、方形封面 `cover` 两种布局 | 封面图、主色、播放状态、歌曲信息 |
| `player.background@1` | 全屏播放页背景 | `ShaderBackground`、`PerformanceBackground`、钛金属背景 | 封面图、主色、播放状态、频谱 |
| `player.visualizer@1` | 全屏播放页频谱 | `AudioVisualizer` | 频谱数据、主色 |
| `player.songInfo@1` | 歌名、歌手、专辑 | `FullPlay.vue` 内的信息区 | 歌曲信息、主色 |
| `player.stage@1` | 全屏播放页除顶部按钮外的整个区域 | `FullPlay.vue` 主体 | 以上全部。占用此区域时，前五个区域不再单独渲染 |
| `desktopLyric@1` | 桌面歌词窗口 | `views/DeskTopLyric/DeskTopLyric.vue` | 当前与下一行歌词、当前时间、播放状态、锁定状态 |

关闭、全屏、返回等顶部按钮，以及评论层、歌词复制层，始终由软件渲染，不属于任何区域。这保证用户随时能退出插件界面。

#### 4.13.3 声明

```ts
ui: {
  regions: [
    { region: 'player.lyrics', view: 'neon-lyrics' },
    { region: 'player.artwork', view: 'cassette' },
    { region: 'player.background', view: 'aurora' },
  ],
  skins: [{
    id: 'retro',
    title: '复古磁带',
    preview: { kind: 'asset', resource: 'retro-preview.png' },
    /** 一套皮肤包含的区域。用户选择这套皮肤时一起生效 */
    regions: ['player.lyrics', 'player.artwork', 'player.background'],
    /** 皮肤设置项。宿主在"播放器主题"面板中渲染，插件不用写设置界面 */
    settings: {
      type: 'object',
      properties: {
        tapeColor: { type: 'string', format: 'color', title: '磁带颜色', default: '#d9a441' },
        showReels: { type: 'boolean', title: '显示转轴', default: true },
      },
    },
  }],
}
```

区域视图就是 `kind: 'component'` 的视图，沿用 4.3 的全部规则。

**用户怎么选：** 全屏播放页现有的"播放器主题"面板（`PlaySettings.vue`）中，"唱片""封面"两种布局旁边出现插件皮肤。选择皮肤即整套生效。高级选项中可以按区域单独选择，例如背景用 A 插件、歌词用 B 插件。每个区域同一时间只有一个实现。

#### 4.13.4 开发写法

```vue
<!-- src/views/NeonLyrics.vue -->
<script setup lang="ts">
import { useRegion, useFrame } from '@shiqianjiang/ceru-plugin-sdk/vue'

// 类型由区域名推导，写错属性名会在编辑器中报错
const { props, actions, settings } = useRegion('player.lyrics')
// props.lines         只读，CrLyric 的行，含逐字时间
// props.currentTime   Ref<number>，宿主每帧更新
// props.playing       Ref<boolean>
// props.track、props.palette、props.layout
// actions.seek(ms)    经操作管线执行 player.seek

const active = computed(() => findActiveLine(props.lines, props.currentTime.value))

// 需要逐帧动画时用宿主统一的帧循环，不自己开 requestAnimationFrame
useFrame((t) => { glow.value = Math.sin(t / 300) })
</script>

<template>
  <div class="neon">
    <p v-for="(line, i) in props.lines" :key="i" :class="{ on: i === active }" @click="actions.seek(line.startTimeMs)">
      {{ line.text }}
    </p>
  </div>
</template>
```

**基于软件已有组件改造。** 软件的默认实现都作为宿主组件开放，插件可以直接复用再加工，不必从零写起：

| 宿主组件 | 说明 |
| --- | --- |
| `LyricAdapter` | 软件自带歌词渲染器 |
| `AmlLyricPlayer` | AML 歌词渲染器，支持 TTML 逐字、对唱、背景人声 |
| `VinylRecord` | 黑胶唱片 |
| `SquareCover` | 方形封面 |
| `ShaderBackground` | 着色器背景 |
| `AudioVisualizer` | 频谱 |

```vue
<!-- 在软件的 AML 歌词外面加一层自己的装饰 -->
<script setup lang="ts">
const { props, actions } = useRegion('player.lyrics')
const { AmlLyricPlayer } = useHostComponents()
</script>
<template>
  <div class="frame">
    <AmlLyricPlayer v-bind="props.forward" @line-click="actions.seek" />
    <div class="sparkles" />
  </div>
</template>
```

`props.forward` 是可直接传给默认实现的属性集合。插件可以覆盖其中个别属性，例如改对齐方式。

#### 4.13.5 数据交换：为什么性能不是问题

歌词页每秒更新约 60 次，频谱每秒也是 60 次。如果这些数据经过插件 logic 的 worker 再传给界面，会产生大量 IPC 与序列化，必然卡顿。区域视图不走这条路：

| 数据 | 传递方式 | 成本 |
| --- | --- | --- |
| 当前时间、播放状态 | 宿主把渲染进程中已有的响应式数据，以只读 `Ref` 直接交给视图 | 零拷贝，与软件自带组件读取同一份数据 |
| 歌词行、歌曲信息、封面主色 | 只读响应式对象，歌曲切换时更新一次 | 零拷贝 |
| 频谱 | `useSpectrum()` 返回宿主分析器每帧写入的同一个 `Float32Array` | 零拷贝，所有视图共享一个分析器 |
| 逐帧回调 | `useFrame(cb)` 注册到宿主唯一的帧循环 | 页面隐藏或窗口失焦时，宿主统一暂停 |
| 区域动作 | `actions.*` 直接进入渲染进程的操作管线 | 没有 hook 时走快路径，与点击软件按钮相同 |
| 插件自己的业务数据 | `invoke` 到插件 logic，或 logic 用 `ctx.ui.views.setState` 推送 | 低频，经 IPC，与普通页面相同 |

规则：区域契约中的高频数据只能读不能写。区域视图可以调用契约中声明的动作，这些动作在用户选择该皮肤时一并授予，不单独弹权限。区域视图要做契约以外的事，例如联网获取歌词翻译，仍然要 `invoke` 到自己的 logic，由 logic 带权限去做。

#### 4.13.6 界面协调

| 问题 | 规则 |
| --- | --- |
| 尺寸 | 区域容器由宿主布局，视图填满容器。`useRegion` 提供 `size: Ref<{ width; height }>`，由 `ResizeObserver` 维护 |
| 主题与配色 | 视图可以读取 `props.palette`，即宿主从封面提取的主色、文字色、是否用深色文字，与软件自带界面使用同一套配色 |
| 与软件其他部分的层级 | 区域视图只能画在自己的容器内。弹层通过 `overlay` 输出，层级低于软件的顶部按钮与对话框 |
| 切换动画 | 切换皮肤或歌曲时，宿主负责淡入淡出。视图可以导出 `onEnter`、`onLeave` 自定义动画，时限 600ms |
| 多个皮肤混用 | 每个区域独立选择。用户按区域混用时，宿主只保证各自正常显示，不保证风格一致 |
| 插件停用或卸载 | 该插件占用的区域立即回到默认实现 |

#### 4.13.7 稳定性与降级

- **错误边界。** 区域视图挂载或运行时抛错，宿主立即换回默认实现，并在播放器主题面板中标记该皮肤"出错已停用"。
- **性能监测。** 全屏播放页打开时，宿主统计帧耗时。区域视图所在页面连续 2 秒平均帧耗时超过 20ms，提示"该皮肤可能影响流畅度"，并提供"换回默认"。连续 10 秒超过 33ms 自动换回默认。
- **契约版本。** 区域契约带版本号，只增不改。插件声明的版本高于宿主支持的版本时，该区域使用默认实现，皮肤的其他区域照常生效。
- **允许的技术。** 区域视图内允许 Canvas、WebGL、CSS 动画、Web Animations。不允许 Web Worker 与 WebAssembly，与 4.3.5 的静态扫描规则一致。

#### 4.13.8 开发体验

| 能力 | 说明 |
| --- | --- |
| 类型 | sdk 为每个区域导出契约类型。`useRegion('player.lyrics')` 的返回值由区域名推导，编辑器有完整提示 |
| 模板 | `create-ceru-plugin` 新增"播放器皮肤"模板，包含歌词、封面、背景三个区域的最小实现，以及一个复用 `AmlLyricPlayer` 的示例 |
| 模拟器 | 开发者模式中，全屏播放页增加调试条：选择测试歌曲与歌词（含逐字、对唱、无歌词三种），拖动时间轴，暂停与播放，切换深浅色，显示帧耗时 |
| 热重载 | 保存后 1 秒内替换视图，保留当前播放进度 |
| 检查元素 | 开发者模式下 shadow root 使用 `open` 模式，可以用开发者工具检查。正式运行仍为 `closed` |

### 4.14 HTTP 服务、流式加解密与原生模块

目标场景：服务端返回加密的音频地址，插件边下载边解密，把明文音频流交给播放器播放，并且支持拖动进度。为此提供三项能力：插件内的 HTTP 服务、流式加解密、原生计算能力。

#### 4.14.1 两档运行环境

`.node` 原生模块与完整的 Node 环境无法被沙箱限制。一旦加载，它们拥有当前用户的全部权限，软件的权限系统对它们无效。因此 v3 的 logic 分两档：

| | 沙箱档（默认） | 完全信任档 |
| --- | --- | --- |
| 运行位置 | 现有 worker 中的 `vm` 上下文 | Electron `utilityProcess` 独立进程，真实的 Node 环境 |
| Node 模块 | 没有 | 有，`http`、`fs`、`crypto`、`stream` 等 |
| HTTP 服务 | `ctx.server.serve`，Web 标准 `Request` / `Response` 写法，可用 Hono 等框架 | 原生 `http`、express、koa 均可 |
| 流式加解密 | 有，宿主内置算法以原生速度运行 | 有，直接用 Node `crypto` |
| WebAssembly | 有 | 有 |
| `.node` 原生模块 | 没有 | 有，仅限 Node-API 模块 |
| 网络权限 | 宿主逐次检查 | 宿主无法限制，进程可以直接联网 |
| 文件访问 | 只能访问用户选择的文件 | 用 Node 权限模型限制在插件数据目录内，见 4.14.5 |
| 用户同意 | 普通权限授权 | 安装时红色警告，单独确认，见 4.14.6 |

**选择原则：** 大多数需求在沙箱档就能完成。自定义解密算法优先用 WebAssembly，速度接近原生。只有必须使用现成的 `.node` 模块、或必须使用 express、koa 时，才使用完全信任档。

两档共用同一份 `ctx`：完全信任档通过 `MessagePort` 与宿主通信，`ctx` 由同一张契约表生成，调用 `ctx.music`、`ctx.player` 等仍经过权限检查。只有直接使用 Node 模块时绕过检查。

#### 4.14.2 沙箱档的 HTTP 服务

```ts
// 原生写法
ctx.server.serve(async (request) => {
  const url = new URL(request.url)
  if (url.pathname === '/hello') return new Response('hi')
  return new Response('not found', { status: 404 })
})

// 用 Hono 等支持 Web 标准的框架，打包进插件即可
const app = new Hono()
app.get('/playlist/:id', (c) => c.json(await load(c.req.param('id'))))
ctx.server.serve(app.fetch)

ctx.server.url   // 例如 http://127.0.0.1:41873，服务启动后可用
```

| 规则 | 内容 |
| --- | --- |
| 实现 | 宿主在主进程创建 `http.Server`，把每个请求转成 `Request` 发给 worker，worker 返回 `Response`。请求体与响应体都是流，按块用可转移的 `ArrayBuffer` 传递，不整体复制 |
| 监听地址 | 默认只监听 `127.0.0.1`。端口由宿主随机分配。插件可以在 manifest 中声明固定端口偏好，被占用时宿主改用随机端口 |
| 局域网访问 | 监听 `0.0.0.0` 需要权限 `network.serve.lan`，授权时提示"局域网内的其他设备可以访问此插件的服务" |
| 生命周期 | 插件启用时可以启动，插件停用、卸载、软件退出时宿主关闭服务 |
| 数量 | 每个插件一个服务 |
| 权限 | `network.serve`。授权提示"在本机运行一个小型网络服务" |

沙箱档不支持 express 与 koa，因为它们依赖 Node 的 `http` 模块对象，而不是 Web 标准接口。

#### 4.14.3 完全信任档的 HTTP 服务

```ts
// entry.server 指向的模块，运行在独立 Node 进程
import express from 'express'
import Koa from 'koa'

export default defineServer(async (ctx) => {
  const app = express()
  app.get('/stream/:id', handler)
  await ctx.server.listen(app)          // express app
  // await ctx.server.listen(koa.callback())  // koa
  // await ctx.server.listen((req, res) => { … })  // 原生 http
})
```

`ctx.server.listen` 接收 Node 的 request listener，由宿主侧的运行时代码调用 `http.createServer(listener).listen(port, host)`，端口与监听地址规则与 4.14.2 相同。插件也可以自己调用 `http.createServer`，Node 权限模型无法阻止，这是完全信任档的固有风险，见 4.14.6。

cli 用 esbuild 以 `platform: 'node'` 打包 `entry.server`，把 express、koa 等依赖一起打进单个 JS 文件。

#### 4.14.4 流式加解密与播放

**播放结果扩展。** `ResolveResult` 的成功分支新增可选字段 `stream`，告诉宿主拿到数据后如何处理：

```ts
type ResolveResult =
  | {
      ok: true
      url: string
      expiresAt?: number
      requestHeaders?: Record<string, string>
      /** 新增。缺省表示 url 是可直接播放的明文音频 */
      stream?: StreamSpec
    }
  | { ok: false; error: MusicFault }

type StreamSpec =
  /** 宿主内置算法，在主进程用 Node crypto 以原生速度解密 */
  | { decrypt: { algorithm: 'aes-128-ctr' | 'aes-256-ctr' | 'aes-128-cbc' | 'aes-256-cbc' | 'chacha20'; key: string; iv: string; encoding?: 'hex' | 'base64' }; contentType?: string; contentLength?: number }
  /** 插件自定义变换，在插件中执行 */
  | { transform: string; info?: JsonObject; contentType?: string; contentLength?: number }
```

`stream` 是共享数据契约中新增的可选字段，符合 4.1.3 的规则。v2 插件不会返回它，行为不变。

**插件自定义变换：**

```ts
ctx.streams.registerTransform('my-cipher', {
  /** 能否从任意字节位置开始解密。为 true 时支持拖动进度 */
  seekable: true,
  create({ offset, info }) {
    const state = initState(info, offset)   // 可以调用 WebAssembly 模块
    return {
      transform(chunk: Uint8Array): Uint8Array { return decryptChunk(state, chunk) },
      flush(): Uint8Array | void {},
    }
  },
})
```

`transform` 运行在插件 worker 中，数据块以可转移的 `ArrayBuffer` 传入传出，不复制。

**宿主的媒体管线：**

```text
播放器 <audio> ── ceru-media://<令牌> ──▶ 主进程协议处理器
                                           │ 按 Range 计算上游字节范围
                                           ▼
                                      下载上游加密数据（带 requestHeaders）
                                           │
                       ┌───────────────────┴───────────────────┐
              decrypt：主进程 Node crypto        transform：插件 worker 中执行
                       └───────────────────┬───────────────────┘
                                           ▼
                                   明文音频流返回播放器
```

| 规则 | 内容 |
| --- | --- |
| 协议 | 主进程用 `protocol.registerSchemesAsPrivileged` 注册 `ceru-media`，开启 `stream: true`，再用 `protocol.handle` 处理。令牌一次解析一个，有效期与 `expiresAt` 相同，存放在主进程内存中，不暴露密钥给渲染进程 |
| 拖动进度 | 播放器发出 Range 请求时，宿主换算成上游字节范围。CTR、ChaCha20 可以从任意位置开始。CBC 对齐到 16 字节块，并多取前一个块作为 IV。自定义变换 `seekable` 为 false 时不响应 Range，从头播放，进度条拖动禁用 |
| 投放设备 | DLNA 设备无法访问 `ceru-media://`。宿主在 `src/main/events/dlna.ts` 已有的本地 HTTP 代理上增加同样的处理，生成 `http://<局域网地址>/media/<令牌>` |
| 下载与缓存 | `download.create` 与 `musicCache` 使用同一条管线，保存解密后的文件 |
| 性能 | 内置算法在主进程以流方式处理，不整体读入内存。自定义变换受 worker 速度限制，验收要求见阶段九 |

**插件服务地址作为播放地址。** 插件也可以不用 `stream`，直接让自己的服务完成下载和解密，`resolve` 返回 `ctx.server.url + '/play/…'`。宿主对本机地址做限制：`resolve` 返回的地址指向 `127.0.0.1` 或 `localhost` 时，端口必须是该插件自己的服务端口，否则拒绝。这防止插件借播放器访问本机的其他服务。

**通用流式加解密 API。** 除播放外，插件也可以自行处理流，例如加密后上传：

```ts
const decipher = ctx.crypto.createDecipher('aes-128-ctr', key, iv)   // 返回 TransformStream
const response = await ctx.http.fetch(url, { permissionKey: 'net' })
const plain = response.body.pipeThrough(decipher)

const cipher = ctx.crypto.createCipher('aes-256-cbc', key, iv)
```

沙箱档中，这两个函数通过 worker 的 `__bridge` 同步调用 worker 线程中的 Node `crypto`，不经过 IPC，速度接近原生。现有的 `sdk/src/compat/crypto.js` 一次性加解密接口继续保留。

#### 4.14.5 原生计算能力

**WebAssembly（两档都可用）。** v3 沙箱档的 `vm` 上下文开启 `codeGeneration.wasm`。v2 环境冻结，保持关闭。插件把 `.wasm` 文件作为资源打包进 artifact，用 `ctx.wasm.instantiate(resource, imports)` 加载。WebAssembly 本身在沙箱内运行，不需要额外权限。

**`.node` 原生模块（仅完全信任档）。**

| 规则 | 内容 |
| --- | --- |
| 模块类型 | 只接受 Node-API 模块。Node-API 跨 Node 版本二进制兼容，软件升级 Electron 后不需要插件重新编译 |
| 平台 | 插件为每个支持的平台分别提供二进制，例如 `win32-x64`、`darwin-arm64`、`darwin-x64`、`linux-x64`。缺少当前平台时插件安装失败，提示"不支持当前系统" |
| 打包 | cli 把 `.node` 文件作为资源嵌入 artifact，并记录每个文件的 SHA-256。签名覆盖这些哈希 |
| 加载 | 宿主首次激活时把当前平台的二进制解出到 `plugins/native/<pluginId>/<version>/`，校验哈希后加载。哈希不符时拒绝启动 |
| 大小 | artifact 当前上限为 10MB（issuer `LIMITS.file`）。含原生模块的插件上限提高到 50MB |
| 文件权限 | 完全信任档进程用 Node 权限模型启动：`--permission`，`--allow-fs-read` 与 `--allow-fs-write` 限定为插件数据目录与原生模块目录，`--allow-addons` 仅在插件声明原生模块时开启，不允许子进程与 worker。网络不受 Node 权限模型限制 |

Electron 45 的 `utilityProcess.fork` 能否传入 `--permission` 等参数，需要在阶段九第 1 步先验证。如果不支持，文件访问也无法限制，4.14.6 的警告文案相应改为"可以访问你电脑上的所有文件"。

#### 4.14.6 权限与用户同意

| 权限 | 档位 | 授权提示 |
| --- | --- | --- |
| `network.serve` | 两档 | 在本机运行一个小型网络服务 |
| `network.serve.lan` | 两档 | 局域网内的其他设备可以访问此插件的服务 |
| `streams.transform` | 沙箱档 | 处理播放器的音频数据流 |
| `runtime.trusted` | 完全信任档 | 见下文 |

`runtime.trusted` 是一个普通的权限声明，写在 `uses.permissions` 中，使用 v2 已有的 `PermissionDeclaration` 结构，不新增 manifest 字段：

```ts
uses: {
  permissions: [
    { key: 'trusted', name: 'runtime.trusted', reason: '需要运行官方提供的解密模块来播放加密音频。', optional: false },
  ],
}
```

声明了 `entry.server.runtime: 'node'` 或包含 `.node` 资源的插件，必须声明这条权限，并且必须填写 `reason`。`optional` 缺省为 `false`。

**在安装时征得同意，而不是安装后再授权。** 普通权限可以在插件运行时按需申请，因为在用户同意之前，宿主能拦住每一次调用。`runtime.trusted` 做不到：完全信任档的代码一旦运行，就可能已经在用户电脑上留下了无法撤回的改动，事后撤销只能阻止以后的行为。所以必须在插件的任何代码运行之前让用户决定，安装确认就是这个时刻。

**安装确认框：**

```text
┌──────────────────────────────────────────────────────┐
│ ⚠ 此插件需要完全信任                                    │
│                                                      │
│ 某某音源 1.2.0 · 发布者 example-dev（签名已验证）          │
│                                                      │
│ 开发者说明：                                           │
│ 「需要运行官方提供的解密模块来播放加密音频。                  │
│   不会读取播放所需以外的文件。」                            │
│                                                      │
│ 完全信任意味着：                                        │
│ · 在独立进程中运行完整的 Node 环境                         │
│ · 可以直接访问网络，澜音无法检查它访问了哪里                  │
│ · 将运行原生模块 decrypt.node（Windows x64）              │
│ · 澜音无法限制它的行为，只在你信任开发者时安装               │
│                                                      │
│ 其他权限：访问公网服务、在本机运行网络服务                    │
│                                                      │
│ ☐ 我了解风险                                           │
│                                                      │
│      [取消]   [仅安装受限部分]   [同意并安装]                │
└──────────────────────────────────────────────────────┘
```

| 元素 | 规则 |
| --- | --- |
| 标题与"完全信任意味着" | 由宿主写死，插件无法修改或隐藏。条目按插件实际声明生成：有 `.node` 时列出文件名与平台，有 `lan: true` 时增加"局域网内的设备可以访问" |
| 发布者 | 显示签名中的发布者与验证结果。开发者模式下显示"开发中，未签名" |
| 开发者说明 | 取自该权限声明的 `reason`。必填，10 到 300 个字符。按纯文本显示，不解析 HTML、Markdown、链接。前面固定加"开发者说明："，外加引号，与宿主文字在视觉上明显区分，避免开发者冒充软件提示 |
| 其他权限 | 列出插件声明的其他权限名称。这些权限仍按原规则在使用时申请 |
| 我了解风险 | 不勾选时"同意并安装"不可点击 |
| 仅安装受限部分 | 只有 `runtime.trusted` 声明为 `optional: true` 时才显示。插件安装后只运行沙箱档部分，完全信任档不启动，之后可以在插件详情页开启 |

声明为 `optional: false`（默认）表示插件离开完全信任就无法工作，确认框只有"取消"和"同意并安装"两个按钮。

**同意之后：**

| 规则 | 内容 |
| --- | --- |
| 启动条件 | 宿主只在存在有效同意记录时启动完全信任档进程。同意记录存入 `plugins/permissions/<pluginId>.json`，格式与其他权限相同，额外记录同意时的发布者 |
| 插件内申请 | 插件不能在运行时调用 `ctx.permissions.request('runtime.trusted')`，这个调用直接返回 `denied`。只能通过安装确认框或插件详情页开启 |
| 更新 | 插件更新后新增了 `runtime.trusted`，或签名发布者发生变化，更新暂停，重新显示确认框。只更新代码与原生模块时不重复询问 |
| 签名 | 必须带有效签名。开发者模式例外 |
| 标识 | 插件列表显示"完全信任"标记 |
| 详情页 | 插件详情页显示与确认框相同的内容，包括开发者说明，并提供"撤销完全信任"按钮 |
| 撤销 | 完全信任档进程立即终止，沙箱档部分照常运行。`optional: false` 的插件撤销后整体停用，提示"此插件需要完全信任才能运行" |

#### 4.14.7 manifest

```ts
entry: {
  logic: { module: './src/main.ts' },
  /** 新增 */
  server?: {
    module: string
    runtime: 'sandbox' | 'node'
    port?: number            // 端口偏好
    lan?: boolean            // 是否监听局域网
  },
  /** 新增，仅 runtime 为 node 时有效 */
  native?: { name: string; platforms: Record<string, string> }[]   // 平台名 → 资源 id
},
```

`runtime: 'sandbox'` 时 `entry.server` 与 `entry.logic` 运行在同一个 worker 中，只是入口分开，便于组织代码。

---

## 5. v2 环境

### 5.1 冻结范围

v2 环境由两部分组成，都冻结：

| 部分 | 来源 | 冻结方式 |
| --- | --- | --- |
| 插件运行时、issuer、GuestStore、socket broker、network | 工具链 `0.3.16`，在 `release/v2` 分支发布 | 宿主 `package.json` 以 npm 别名精确锁定：`"ceru-plugin-core-v2": "npm:@shiqianjiang/ceru-plugin-core@0.3.16"`，`"ceru-plugin-sdk-v2": "npm:@shiqianjiang/ceru-plugin-sdk@0.3.16"` |
| 宿主适配 `V2PluginHost` | 现有 `PluginHost.ts` 移入 `src/main/services/plugin/v2/` | 协议层逻辑不改：RPC 分支、权限判断、`ownedRef`、Surface 与 Drawer 会话、Guest 管理。只有两处改动：各分支的实现体改为调用共享的 `hostServices.ts`，见阶段一第 4、5 步；与操作目录对应的分支改为调用 `runOperation`，见 D24 与阶段五 |

冻结后，v2 环境只接受两类改动：安全修复，以及宿主共享层接口变化时必需的适配。两类改动都必须通过 5.3 的兼容测试和 6.5 的升级保留测试。

v2 的 cli 与 create 停留在 `0.3.16`，仍可从 npm 安装，用于维护尚未迁移的 v2 插件项目。

### 5.2 最后一个 v2 版本 `0.3.16`

在 `release/v2` 分支上，从 `0.3.15` 开始，只包含以下改动：

1. **当前工作区中尚未提交的两处修复。** `packages/core/src/network.ts` 返回重定向后的最终地址 `url`；`packages/sdk/src/legacy-http.ts` 增加 `finalUrl`。它们用于 QQ 音乐短链等场景，属于 v2 插件需要的行为。
2. **歌词兼容修复。** 见 5.4。
3. **兼容回归测试。** 见 5.3。

不包含任何 v3 内容。

### 5.3 兼容回归测试

在 `release/v2` 分支新建 `test/v2-compat.test.mjs` 与 `test/fixtures/v2-compat/`：

| 夹具 | 内容 | 断言 |
| --- | --- | --- |
| `earliest-handwritten.js` | 原样取自 `git show 0af7338:examples/handwritten/plugin.js` | 能读取，能激活，注册 `hello.open` action |
| `earliest-source.js` | 手写 CommonJS 写法。provider 使用顶层 `search`、`resolve`、`lyrics`，歌词不带 `format` 字段，歌曲带 `metadata.artists` | `tracks.search`、`tracks.resolve`、`tracks.lyrics` 全部成功，返回的歌词带 `format: 'crlyric'` |
| `earliest-schema-surface.js` | 声明一个 `kind: 'schema'` 的 surface | 能读取并激活 |
| `legacy-comment.js` | `/*! @name x @version 1.0.0 */` 注释头 | `readArtifact` 抛出现有的迁移提示错误 |

夹具文件只追加，不修改。这组夹具同时复制到宿主仓库 `src/main/services/plugin/v2/__fixtures__/`，供 6.5 的升级测试使用。

### 5.4 歌词兼容修复

2026-11-18 实测：用 `0.3.15` 加载最早期写法的插件，读取、激活、宿主模块引用、provider 顶层旧方法、`schema` 页面、播放解析全部正常，**只有歌词失败**。

最早期歌词文档的形状是 `{ version: 1, track, offsetMs, lines }`。提交 `9d7eb72`（2026-09-19）把它改名为 `CrLyric`，并在 `assertLyricsDocument` 中强制要求 `format: 'crlyric'`。后果是按最早期写法返回歌词的插件，搜索和播放正常，但歌词全部加载失败，宿主报 `Invalid lyrics document`。只补上这个字段就能通过，其余字段完全兼容。

这个问题在 v3 之前就已存在。修复方式是在校验之前归一化，不放宽校验本身：

```ts
// packages/sdk/src/music.ts（release/v2 分支）
/** 最早期 v2 歌词没有 format 字段。仅在结构完全符合时补上，其余情况交给 assertLyricsDocument 报错 */
export function normalizeLegacyLyrics(value: unknown): unknown {
  if (record(value) && value.format === undefined && value.version === 1 && Array.isArray(value.lines))
    return { ...value, format: 'crlyric' }
  return value
}
```

调用点：`packages/core/src/index.ts` 的 `invokeProvider` 中，`tracks.lyrics` 与 `lyrics` 分支在 `assertLyricsDocument(result)` 之前执行 `result = normalizeLegacyLyrics(result)` 并返回归一化后的值。`convertLyrics` 的 `parse` 分支同样处理。

`normalizeLegacyLyrics` 定义在 `music.ts` 中，可以直接使用该文件内未导出的 `record` 辅助函数。它需要从 sdk 的 `index.ts` 导出，供 core 调用。宿主自己的 `src/common/localLyrics.ts` 中也调用 `assertLyricsDocument`，但那里处理的是本地歌词文件，不会遇到最早期插件返回的数据，**不需要**改动。

---

## 6. 升级保留

本节保证：用户从任何已发布的澜音版本升级到含 v3 的版本后，原有插件完整保留并正常运行。

### 6.1 现有数据布局

所有插件数据位于 `getAppDirPath()/plugins/` 下：

| 路径 | 内容 | 读写代码 |
| --- | --- | --- |
| `<pluginId>-<名称>.js` | 已安装插件文件 | `services/plugin/index.ts` |
| `state.json` | 每个插件的启用状态与排序 | `pluginConfig.ts` |
| `config/<pluginId>.json` | 插件配置 | `pluginConfig.ts` |
| `config/<pluginId>.storage.json` | 旧版插件存储，读取时迁移 | `storage.ts` |
| `permissions/<pluginId>.json` | 授权指纹列表 | `pluginConfig.ts` |
| `storage/<pluginId>.json` | 插件存储 | `storage.ts` |
| `guests/<pluginId>/` | LX 等兼容子插件 | v2 core 的 `GuestStore` |

v3 新增的路径，旧版澜音不会读取：

| 路径 | 内容 | 引入阶段 |
| --- | --- | --- |
| `dev-entries.json` | 开发者模式添加的本地插件 | 四 |
| `skins.json` | 用户选择的播放器皮肤与区域 | 六 |
| `hooks-paused.json` | 被暂停的 hook 与安全模式状态 | 五 |
| `accounts/<pluginId>/` | 加密保存的账号凭据 | 七 |
| `native/<pluginId>/<version>/` | 解出的原生模块 | 九 |

卸载插件时，宿主删除该插件在 `accounts/`、`native/`、`skins.json` 中的数据，以及 6.1 表中按插件 id 存放的配置、权限、存储。`state.json` 中的条目一并删除。

### 6.2 保留规则

1. **以上所有路径与文件格式不变。** v3 插件安装到同一目录，文件命名规则相同。v3 环境读写 `state.json`、`config`、`permissions`、`storage` 使用与 v2 相同的代码。
2. **v3 新增的数据使用新路径。** 例如开发者模式的 `plugins/dev-entries.json`。不在已有文件中增加字段。
3. **v3 core 的 GuestStore 必须能读取 v2 写入的 `guests/` 目录。** 一个 v2 兼容环境插件升级为 v3 后，用户已导入的子插件不丢失。`test/guest-store-compat.test.mjs` 用 v2 写出的目录做断言。
4. **加载过程不改写插件文件。** 读取、识别、校验都是只读操作。
5. **插件 id 不随环境改变。** 同一个插件从 v2 升级为 v3，只要 manifest 的 `id` 不变，配置、存储、启用状态全部沿用。授权按 4.5 的指纹规则沿用。
6. **降级安全。** 用户从 v3 版本回退到旧版澜音时，旧版 issuer 的 schema 规定 `manifestVersion` 必须为 `2`，会拒绝读取 v3 插件文件，并按旧版逻辑跳过。v2 插件不受影响，继续运行。v3 插件文件保留在目录中，重新升级后恢复。

### 6.3 加载失败的插件保留在列表中

修改 `services/plugin/index.ts` 的 `loadInstalledPlugins`：

- 版本识别返回 `null`，或对应环境的 `readPluginArtifact` 抛错时，不再跳过。生成一条 `InstalledPlugin` 记录，状态为 `broken`，记录错误信息，`runtime` 为识别出的版本或 `unknown`。
- 插件列表显示该插件的文件名、"无法加载"状态和错误原因，提供"删除"与"重新安装"两个操作。
- 文件不自动删除，`state.json` 中该插件的条目不清除。

这一项在阶段一完成，早于任何 v3 运行时代码进入宿主。

### 6.4 安装与更新入口

宿主有三条把插件文件写入 `plugins/` 的路径，全部在 `src/main/services/plugin/index.ts`：

| 入口 | 触发方式 |
| --- | --- |
| `selectAndAddPlugin` | 用户在设置页选择本地文件 |
| `downloadAndAddPlugin` | 用户粘贴链接安装，或在插件更新提示中点击"立即更新" |
| `addPlugin` | 前两者最终调用；`externalInstall.ts` 的外部安装也走这里 |

**新版宿主的规则：**

1. 三条入口都先调用 3.5 的 `sniffManifestVersion`，再用对应环境的 `readPluginArtifact` 完整校验。三条入口中现有的 `manifestVersion !== 2` 判断都要删除，由版本识别取代：`selectAndAddPlugin`、`addPlugin`、`downloadAndAddPlugin` 各有一处。
2. 校验全部通过之后才写文件。任何一步失败，已安装的同 id 插件文件、状态、授权、配置、存储都不动。
3. 更新可以跨版本：同 id 插件从 v2 更新为 v3，或从 v3 回退为 v2，都按新文件的版本号选择环境。数据保留规则见 6.2 第 5 条。
4. 版本识别为 `3` 但 v3 校验失败时，错误提示指出具体字段。识别结果无法识别时，提示"无法识别的插件文件"。

**旧版宿主的行为，即未升级的澜音：**

插件更新由插件代码调用 `ctx.ui.pluginUpdate.request` 发起，用户点击后走 `downloadAndAddPlugin`。旧版 issuer 的 schema 规定 `manifestVersion` 必须为 `2`，v3 文件在 `readPluginArtifact` 中被拒绝，`addPlugin` 不会执行。因此原 v2 插件保持安装且正常运行，不会损坏或丢失。代价是用户看到一条 schema 校验报错，且插件下次启动时可能再次提示更新。

旧版宿主已经发布，无法修改。这一问题由插件作者在发起更新前判断软件版本来避免：

```ts
// v2 插件中推送 v3 更新前的判断
const { version } = await ctx.app.getInfo()   // 返回真实的澜音版本号。新旧宿主都提供，宿主处理时不做权限检查，见 PluginHost.ts 中 services.app.getInfo 分支
if (semver.gte(version, FIRST_V3_APP_VERSION)) {
  await ctx.ui.pluginUpdate.request({ version: v3Version, url: v3Url })
} else {
  // 旧版宿主：继续推送 v2 更新，或不推送
}
```

要求：

- `docs/MANIFEST-V3.md` 的迁移章节写明这段判断，并给出 `FIRST_V3_APP_VERSION` 的实际值。这个值由用户决定，本文定稿时尚未确定。编写该文档时向用户询问，不要自行猜测。
- v2 环境下 `ctx.host.apiVersion` 冻结为 `'2.0.0'`，新旧宿主相同，**不能**用来区分软件版本。必须用 `ctx.app.getInfo().version`。
- 共享 `hostServices.ts` 中 `app.getInfo` 的 `version` 字段必须始终返回 `app.getVersion()`，两个环境一致。同一结果中的 `hostApi` 字段按调用方所在环境返回，见 3.2。

### 6.5 升级保留测试

宿主仓库新建 `src/main/services/plugin/__tests__/upgrade.test.ts` 与夹具目录 `src/main/services/plugin/__fixtures__/appdata-v2/plugins/`。

夹具内容：

- 5.3 中的 v2 兼容夹具；
- 至少一个由 v2 cli 构建的带静态 header 的插件；
- 一个声明了 `guestAdapters` 的兼容环境插件，加上它在 `guests/` 下导入的一个子插件；
- 对应的 `state.json`，其中部分插件启用、部分停用；
- 对应的 `config/`、`permissions/`、`storage/` 文件；
- 一个损坏的插件文件，用于覆盖 6.3。

**测试搭建：**

- 用 Jest，与宿主现有测试相同的 `ts-jest` 配置。按 `src/main/services/DownloadManager.test.ts` 的做法用 `jest.mock('electron', …)` 模拟 Electron：`app.getPath` 指向临时目录，`app.getVersion`、`app.getName`、`app.getLocale` 返回固定值，`nativeTheme`、`shell`、`clipboard`、`dialog`、`globalShortcut`、`BrowserWindow` 给出空实现。
- 模拟 `src/main/utils/path` 的 `getAppDirPath`，返回临时目录。
- `jest.config.js` 的 `moduleNameMapper` 目前没有 `@common` 别名，而被测代码依赖它。补上 `'^@common/(.*)$': '<rootDir>/src/common/$1'`。
- 插件逻辑真实运行：沙箱是 `node:worker_threads` 的 worker，不依赖 Electron，可以在 Jest 中直接运行。
- `callPluginUI` 等通往渲染进程的调用用 Jest mock 记录调用参数，不需要真实渲染进程。
- 启用状态的恢复由渲染进程调用 `pluginService.restoreEnabledPlugins()` 触发。测试中在 `loadInstalledPlugins()` 之后直接调用它，等同于渲染进程启动后的行为。

**测试步骤：** 把夹具复制到临时目录，执行 `loadInstalledPlugins()`，再执行 `restoreEnabledPlugins()`，然后断言。

**断言按阶段逐步加入。** 每条断言只在它依赖的能力完成后加入，加入前不写占位断言，也不用 `skip`：

| 断言 | 内容 | 加入时机 |
| --- | --- | --- |
| 列表完整 | 每个可读的插件文件都有一条记录 | 阶段一第 1 步，基线 |
| 状态不变 | 启用与停用状态、排序与 `state.json` 一致 | 阶段一第 1 步，基线 |
| 授权不变 | 每个插件已授予的权限与 `permissions/` 一致 | 阶段一第 1 步，基线 |
| 配置与存储不变 | 插件内调用 `ctx.config.get()` 与 `ctx.storage.get()` 返回夹具中的值 | 阶段一第 1 步，基线 |
| 子插件不变 | 兼容环境插件的 `guests.list()` 返回夹具中的子插件 | 阶段一第 1 步，基线 |
| 文件未改写 | 加载前后 `plugins/` 下所有已有文件的内容哈希一致，`state.json` 除外。`state.json` 只允许为新插件追加条目 | 阶段一第 1 步，基线 |
| 音源可用 | v2 音源插件的搜索与播放解析成功 | 阶段一第 1 步，基线 |
| 更新失败不伤旧插件 | 对一个已安装的 v2 插件执行一次更新，下载内容为校验失败的文件。更新报错后，原插件文件、状态、授权、配置、存储不变，插件仍可正常运行 | 阶段一第 1 步，基线 |
| 损坏插件可见 | 损坏的插件文件以 `broken` 状态出现在列表中 | 阶段一第 2 步 |
| 环境正确 | 所有 v2 插件的 `runtime` 为 `2` | 阶段一第 8 步 |
| 聚合可见 | v2 音源插件出现在 `MusicRegistry.sources()` 中 | 阶段三 |

0.4 要求每个阶段结束时运行这组测试，指的是运行当时已加入的全部断言。

除自动测试外，阶段一与阶段四结束时各做一次人工升级验证，由用户完成，见 0.7：安装已发布的澜音 v2.4.0，装入夹具中的插件并完成授权、配置、导入子插件，然后覆盖安装新构建，逐项确认。

---

## 7. 分阶段实施

每个阶段独立可交付、可发布。阶段内步骤按序号执行。

**阶段依赖：**

| 阶段 | 内容 | 依赖 | 用户可见变化 |
| --- | --- | --- | --- |
| 零 | 发布最后一个 v2 版本 | 无 | 最早期插件歌词恢复显示 |
| 一 | 宿主双环境骨架 | 零 | 损坏插件显示为"无法加载" |
| 二 | v3 工具链与 v3 环境 | 一 | 可以安装 v3 插件 |
| 三 | `ctx.music` 聚合层 | 二 | v3 插件可以跨音源搜索播放 |
| 四 | 组件页面、页面挂载、开发者模式 | 三 | Vue 页面、开发者模式 |
| 五 | 操作管线、hook、事件、生命周期、路由守卫 | 二 | 插件可以拦截与改写操作 |
| 六 | 界面区域与播放器皮肤 | 四 | 插件皮肤 |
| 七 | 账号能力 | 四、五 | 插件提供平台登录 |
| 八 | 插件服务与依赖 | 二 | 插件之间互相调用 |
| 九 | HTTP 服务、流式加解密、原生模块 | 三 | 加密音频播放、本机服务 |

按依赖关系，阶段五、八、九可以在各自依赖完成后与其他阶段并行。并行开发时，所有阶段共享 4.4 的契约表，合并时以契约表冲突为准逐行解决，不得在两个分支中各自新增同名方法。

每个阶段的验收中，凡用到其他阶段能力的条目，以依赖表为准：依赖尚未完成时，用 dev mock 或测试桩代替，并在提交说明中注明。

### 阶段零：发布最后一个 v2 版本

**目标：** 冻结 v2 环境，修复现有歌词问题，为双环境准备好固定的 v2 运行时。

**工具链仓库改动：**

1. 从 `ce3e66f`（`0.3.15`）本地创建 `release/v2` 分支。
2. 在 `release/v2` 上提交 0.6 第 1 条列出的两处短链修复与重新构建的 `sandbox.js`，见 5.2 第 1 条。这两处修复同样属于 v3，阶段二开始前把它们也合入 `main`。
3. 按 5.3 建立兼容测试，先确认在未改动的代码上只有歌词一项失败。
4. 按 5.4 加入 `normalizeLegacyLyrics` 并接入两个调用点，使测试全部通过。
5. 运行 `node scripts/bump-version.mjs 0.3.16`，再运行 `npm run release:check -- v0.3.16`，本地提交。`docs/release.md` 提到的 `.release-audit/bump-native.mjs` 不在版本库中，不要使用。检查 `package-lock.json` 与模板快照中的版本号是否也已更新，没有就手工改。
6. 本地打标签 `v0.3.16`。标签必须是 `v<semver>` 格式：推送任何 `v*` 标签都会触发发布，格式不对时 `scripts/check-release-version.mjs` 会让发布失败。
7. **停下，按 0.5 征得用户同意后**，推送 `release/v2` 分支与 `v0.3.16` 标签。CI 会把五个包以 `latest` 标记发布到 npm。此时 npm 上还没有 3.x，`latest` 指向 0.3.16 是正确的。

**宿主仓库改动：**

1. 等 0.3.16 在 npm 上可以安装后，把 `@shiqianjiang/ceru-plugin-core` 与 `@shiqianjiang/ceru-plugin-sdk` 精确锁定为 `0.3.16`。阶段一会再加上同版本的 v2 别名，阶段二再把这两个依赖升到 `^3`。阶段一到二之间同一个包会装两份，这是预期行为。
2. 在宿主中安装 `earliest-source.js`，确认歌词正常显示。

**验收：**

- `release/v2` 上 `npm test` 全部通过。
- 宿主现有插件行为不变，最早期写法插件的歌词恢复显示。

这一阶段修复的是线上已存在的问题，单独发布，不等待 v3。

**之后的 v2 补丁版本。** 3.0.0 发布后，npm 的 `latest` 应当指向 3.x。此后在 `release/v2` 上发布的 `0.3.x` 补丁不能占用 `latest`。阶段二第 16 步会修改发布流程来保证这一点，在那之前不要发布 v2 补丁。

### 阶段一：宿主双环境骨架

**目标：** 宿主具备两套运行环境的结构，但此时 v3 环境只是占位。用户看到的行为不变。

**宿主仓库改动：**

1. **先建测试，后改代码。** 按 6.5 建立升级保留测试与夹具，此时只写"基线断言"，在未改动的代码上运行通过。测试的搭建要求见 6.5。
2. 按 6.3 修改 `loadInstalledPlugins`，加载失败的插件保留在列表中。先在测试中加入"无法加载"断言并确认它失败，再改代码使其通过。
3. `package.json` 新增 v2 别名依赖：`"ceru-plugin-core-v2": "npm:@shiqianjiang/ceru-plugin-core@0.3.16"`、`"ceru-plugin-sdk-v2": "npm:@shiqianjiang/ceru-plugin-sdk@0.3.16"`、`"ceru-plugin-issuer-v2": "npm:@shiqianjiang/ceru-plugin-issuer@0.3.16"`。确认 `scripts/check-production-deps.mjs` 与 electron-vite 打包能识别别名包，按 0.2 用 `yarn build:unpack` 确认两套包的 `assets/` 都进入产物。
4. 新建 `src/main/services/plugin/hostServices.ts`。把 `PluginHost.rpc` 中每个分支的**实现部分**搬进来，分支内的权限判断与参数校验留在原处。`handleFileService`、`registerPluginHotkey`、`unregisterPluginHotkey`、`handleSharingService`、`handleTaskService` 一并迁入。
5. 把 `manager/PluginHost.ts` 移到 `v2/V2PluginHost.ts`，所有 `@shiqianjiang/ceru-plugin-core`、`-sdk`、`-issuer` 的 import 改为对应的 `ceru-plugin-*-v2` 别名。`src/main/services/plugin/` 下其他只服务于 v2 的文件，例如 `shareResolver.ts`，同样改用别名。`rpc` 方法各分支改为调用 `hostServices`。
6. 新建 `src/common/pluginDescriptor.ts`（3.4）与 `v2/manifest.ts`，即 v2 读取器。
7. 按 1.2 的列表逐个迁移 16 个文件，改为读取 `PluginDescriptor`。每迁移一个文件，运行一次升级保留测试。
8. 新建 `src/main/services/plugin/runtimes.ts`。本阶段 `sniffManifestVersion` 先用宿主内的临时实现，只识别 v2 与注释头，阶段二换成 v3 issuer 的版本。安装与启动加载都经过它。6.4 列出的三条安装入口全部改用它，并删除 `src/main/services/plugin/index.ts` 中全部三处 `manifestVersion !== 2` 判断，分别位于 `selectAndAddPlugin`、`addPlugin`、`downloadAndAddPlugin`。完成后在测试中加入"运行环境为 2"的断言。
9. 新建 `v3/` 目录占位，识别为 v3 的插件此时按"需要更新版本的澜音"显示为 `broken`。
10. 重写 `src/main/services/plugin/AGENTS.md`，描述双环境目录结构。删除对 `CeruPluginService.ts`、`CeruMusicPluginHost.ts`、`converter-event-driven.ts` 的引用，这些文件都不存在。

**验收：**

- 6.5 升级保留测试全部通过，包括本阶段新增的断言。
- 在宿主仓库执行下面的命令，除 `src/main/services/plugin/v2/` 与 `src/main/services/plugin/v3/` 外没有结果：

  ```bash
  grep -rlE "\.contributes\b|manifest\??\.modules\b|\.modules\?\.(surfaces|logic|share)" src --include=*.ts --include=*.vue
  ```

- `V2PluginHost.ts` 中不再包含服务实现代码，只有协议层逻辑。
- 把一个插件文件改坏，重启后它以"无法加载"出现在列表中。
- 待人工验收，见 0.7：从澜音 v2.4.0 覆盖安装后，所有插件、状态、授权、配置、子插件都在。
- 0.2 全部命令通过。

### 阶段二：v3 工具链与 v3 环境

**目标：** 工具链发布 `3.0.0`，宿主能安装和运行 v3 插件。v3 插件的能力与 v2 相同，新能力在后续阶段加入。

**工具链仓库改动（`main` 分支）：**

1. `packages/sdk/src/manifest.ts`：`PluginManifest` 改为 4.1.1 的 v3 结构，删除 v2 结构。`defineManifest` 只接受 v3。删除 provider 顶层旧方法的类型，删除 `MediaLease` 等已废弃类型。4.1.3 的共享数据契约类型保持不变。
2. `packages/issuer`：schema 改为 v3，拒绝 v2 字段。新增并导出 `sniffManifestVersion`（3.5），它能识别 v2 与 v3 两种 manifest 以及注释头格式。
3. 迁移运行时：把 `packages/cli/runtime/` 下的 `sandbox.ts`、`rpc.ts`、`surface-size.ts` 移到 `packages/core/runtime/`。修改 `scripts/build-runtime.mjs`：从 core 构建到 `packages/core/assets/sandbox.js`，cli 需要的资产从 core 复制。
4. 新建 `packages/core/src/contract.ts` 与 `dispatch.ts`（4.4）。
5. v3 sandbox 按契约表生成 `ctx`，删除手写的 `rpc('xxx')` 列表，删除 `providerAliases`。`http.request`、`sockets.*`、`storage.*`、`permissions.*` 保留客户端包装，方法名从契约表获取。报告的 `apiVersion` 为 `'3.0.0'`。
6. 删除 `packages/cli/src/socket-broker.ts`，改为从 `@shiqianjiang/ceru-plugin-core/sockets` 导入。
7. 确认后删除 `packages/core/src/electron.ts` 与 `packages/core/assets/preload.cjs`，从 `exports` 中移除 `./electron`。
8. 把 `packages/sdk/src/host-library.ts` 迁到 `packages/core/src/host-library.ts`，从 sdk 中删除。
9. 收缩 `PluginCore`：`context()` 只保留 `plugin`、`config`、`providers`、`actions`、`playlistImporters`、`lyricConverters`、`effects` 七项。删除 `CoreHostAdapter` 的 `services`、`request`、`onNotice` 与私有方法 `request()`。内部 manifest 访问改读 v3 字段。
10. `SurfaceSession` 改读 `provides.actions` 与 `entry.views`。
11. GuestStore 按 6.2 第 3 条保持磁盘格式兼容，新增 `test/guest-store-compat.test.mjs`。
12. `packages/cli/src/dev.ts`：RPC 分发改为 `createDispatcher(mockServices, hooks)`。本阶段 playground 保留，阶段四移除。
13. cli 构建流程只接受 v3 manifest。新增 `ceru-plugin migrate` 子命令（`packages/cli/src/migrate.ts`）：读取 v2 项目的 manifest，按 3.4 的字段对应关系改写为 v3 结构，并把 provider 顶层旧方法改写提示打印出来。只改 manifest，不改插件逻辑代码。
14. 模板改为 v3：在模板仓库 `G:\code\CeruMusic-Plugin-Template` 的 `templates/` 中修改全部模板，再在工具链仓库运行 `node scripts/sync-templates.mjs` 同步快照。不要直接修改 `packages/cli/templates` 或 `packages/create/src`，见 0.1。
15. 新增 `test/rpc-contract.test.mjs`（4.4）与 `test/data-contract.test.mjs`（4.1.3）。后者用 5.3 夹具中 v2 插件的真实输出，断言 v3 sdk 的校验函数全部接受。
16. 修改发布流程，使 v2 补丁不会占用 npm 的 `latest` 标记：`.github/workflows/release.yml` 中的 `npm publish`，在版本号以 `0.` 开头时改为 `npm publish --tag v2`。这一步修改 CI 配置，**按 0.5 先征得用户同意**。同步更新 `docs/release.md`，说明 v2 补丁从 `release/v2` 分支打标签发布，用户通过 `npm i @shiqianjiang/ceru-plugin-core@v2` 安装。
17. 按阶段零第 5、6 步同样的方式把版本号设为 `3.0.0`、本地提交并打标签 `v3.0.0`。**停下，按 0.5 征得用户同意后**推送，由 CI 发布。

**宿主仓库改动：**

1. 依赖 `@shiqianjiang/ceru-plugin-core` 与 `@shiqianjiang/ceru-plugin-sdk` 升级为 `^3.0.0`。v2 别名依赖不变。
2. 宿主共享层（`src/common`、`hostServices.ts`、渲染层）对共享数据契约的类型与校验改用 v3 sdk。v2 专用类型只在 `v2/` 目录内从 `ceru-plugin-sdk-v2` 导入。
3. `runtimes.ts` 改用 v3 issuer 的 `sniffManifestVersion`。
4. 新建 `v3/V3PluginHost.ts`：用 v3 core 的 `PluginCore`、`NodePluginSandbox` 与 `createDispatcher`。`HostServices` 由共享 `hostServices.ts` 适配。权限状态机复用 `V2PluginHost` 中的实现：先把它从 `V2PluginHost` 抽到 `src/main/services/plugin/shared/permissions.ts`，再由两边引用。这是宿主自己的代码，不依赖任何一版 core，抽取属于 5.1 允许的共享层适配，抽取后运行升级保留测试。Surface 会话**不共享**：`SurfaceSession` 是 core 中的类，v2 继续用 `ceru-plugin-core-v2` 的版本，v3 用 v3 core 的版本，两者分别改读各自的 manifest 结构。
5. 新建 `v3/manifest.ts`，即 v3 读取器。
6. 插件列表显示每个插件的运行环境，v2 插件带"v2"徽标。
7. 安装 v3 插件时的错误提示：manifest 校验失败时显示具体字段，不显示 schema 原文。

**验收：**

- 用 v3 模板生成的音源插件能安装、搜索、播放、显示歌词。
- 用 `ceru-plugin migrate` 迁移一个 v2 模板项目并构建，得到的 v3 插件与原 v2 插件行为一致。同一插件 id 从 v2 文件更新为 v3 文件后，配置、存储、启用状态保留。
- v2 插件与 v3 插件同时启用，互不影响。
- `test/data-contract.test.mjs` 与 `test/guest-store-compat.test.mjs` 通过。
- 演练：在 v3 契约表新增一个只读方法，例如 `services.app.getLocale`，只修改 `contract.ts` 与 `hostServices.ts` 两处，v3 插件的 `ctx.app.getLocale` 自动可用。演练完成后删除该方法。
- 6.5 升级保留测试全部通过。
- 0.2 全部命令通过。

### 阶段三：`ctx.music` 聚合层

**目标：** v3 插件能搜索和播放任何已安装音源的内容，包括 v2 插件提供的音源和本地音乐。

**工具链仓库改动：**

1. 新建 `packages/sdk/src/music-api.ts`，按 4.2.1 定义类型，`PluginContext` 新增 `music`。
2. `catalog.ts` 的 `PERMISSION_NAMES` 新增 `music.read` 与 `music.control`。`permissions.ts` 的 `PERMISSION_GROUPS` 新增 `musicRead` 与 `musicControl`。
3. 新建 `packages/core/src/music-registry.ts`：

   ```ts
   export class MusicRegistry {
     register(source: { pluginId: string; runtime: 2 | 3 | 'host'; providerId: string; declaration: ProviderInfo }, invoke: ProviderInvoker): Disposable
     registerImporter(source: { pluginId: string; runtime: 2 | 3; declaration: ImporterInfo }, invoke: ImporterInvoker): Disposable
     sources(): MusicSource[]
     resolveProvider(ref: ResourceRef): { pluginId: string; providerId: string } | undefined
     // 与 MusicAPI 一一对应的方法，内部路由到对应插件并校验结果
     on(event: 'sources.changed', handler: (sources: MusicSource[]) => void): Disposable
   }
   ```

   `ProviderInvoker` 只接收方法路径、参数与 `OperationContext`，与插件属于哪个环境无关。把 `CeruMusic/src/main/services/musicSdk/service.ts` 中的 provider 选择、`retargetTrackRef`、`scope: 'provider'` 回退和结果归一化逻辑迁入。
4. 契约表新增全部 `music.*` 方法。搜索请求校验用新增的 `assertSearchRequest`，放在 sdk 的 `validate.ts`。
5. `packages/core/package.json` 的 `exports` 新增 `./music`。dev mock 实现 `music.*`。

**宿主仓库改动：**

1. 新建 `src/main/services/plugin/musicRegistry.ts`，创建全局 `MusicRegistry` 实例。
2. `V2PluginHost` 与 `V3PluginHost` 在 provider 与 importer 注册时调用 `registry.register(...)`，注销时释放。`V2PluginHost` 的这一处改动是 5.1 允许的"共享层接口适配"。
3. 新建 `src/main/services/musicSdk/localSource.ts`，以 `providerId: 'local'`、`pluginId: 'host'`、`runtime: 'host'` 注册本地音乐，实现 `tracks.search`、`resolve`、`lyrics`、`artwork`。数据来自 `src/main/services/LocalMusicIndex.ts` 与 `src/main/services/localLyrics.ts`，歌词解析复用 `src/common/localLyrics.ts`。
4. `musicSdk/service.ts` 的 provider 查找全部改为经过 `MusicRegistry`。对外函数签名不变。
5. `hostServices.ts` 实现 `music.*`。`music.play` 与 `music.enqueue` 转发到现有播放器路径。
6. `V3PluginHost` 按 4.5 实现放开后的资源归属规则。`V2PluginHost` 的 `ownedRef` 不变。
7. 搜索页 `views/music/find.vue` 的音源列表改为读取 `registry.sources()`。

**验收：**

- 一个不含 provider 的 v3 测试插件：`ctx.music.sources()` 返回所有已安装音源，包括 v2 音源插件的音源和 `local`。对一个 v2 插件提供的音源执行 `search`，再对第一条结果执行 `play`，宿主开始播放。
- 卸载一个音源插件后，`sources.changed` 事件触发，列表更新。
- 本地音乐以 `local` 出现在搜索页音源列表中，搜索与播放正常。
- 在 6.5 升级保留测试中加入"聚合可见"断言，测试全部通过，v2 音源插件行为不变。

### 阶段四：`component` 视图、页面挂载与开发者模式

**目标：** v3 插件用 Vue 编写页面，挂载到侧边栏、设置页、首页 tab、歌单页四处，使用宿主组件与 TDesign。开发者在真实应用中热重载预览 v2 与 v3 插件。

**工具链仓库改动：**

1. 新建 `packages/sdk/src/view-bridge.ts`，按 4.3.2 定义类型。
2. 新建 `packages/sdk/src/vue/index.ts`，实现 4.3.4。`exports` 新增 `./vue`，`peerDependencies` 新增 `vue` 与 `tdesign-vue-next`，版本范围与宿主一致。
3. `packages/cli/src/project.ts` 与 `frameworks.ts`：按 4.3.1 构建 `component` view。`.vue` 文件编译继续使用现有的 `vuePlugin`。
4. `packages/issuer`：对 `component` 入口执行 4.3.5 第 4 条的静态扫描。
5. `packages/cli/src/dev.ts`：删除 Electron playground 启动逻辑，只保留 watch 构建，并按 4.7 打印提示。确认后删除 `packages/cli/assets/` 下的 `electron-app/`、`electron.cjs`、`playground.js`、`index.html`、`style.css`、`native-view.js`、`core-contracts.js`。`scripts/build-runtime.mjs` 与 `package.json` 的 `files` 同步修改。
6. 在模板仓库新增"页面扩展（Vue）"模板并同步快照，做法同阶段二第 14 步：包含一个 `sidebar` 页面、一个 `settings` 页面、一个 `playlist.header.actions` 槽位按钮，演示 `useAction`、`useViewState` 与 `SongList`。

**宿主仓库改动：**

1. 渲染进程加固，即 4.3.5 第 1 至 3 条。`window.api` 等直接访问统一改为从 `src/renderer/src/plugin/hostBridge.ts` 导入。
2. 新建 `src/renderer/src/plugin/hostComponents.ts`（4.3.3）与 `viewDeps.ts`。
3. 新建 `src/renderer/src/components/PluginComponentView.vue`：创建 shadow host，推入主题变量与 TDesign 样式表，通过 blob URL 加载模块，调用工厂函数，构造 `ViewBridge`，处理 `state` 推送与销毁。
4. 新建 `src/renderer/src/components/PluginPage.vue` 与路由 `/plugin/:pluginId/:pageId`，按 view 的 `kind` 分发：`component` 到 `PluginComponentView`，`web` 到 `PluginWebSurface`，`native` 到 `PluginNativeSurface`，`schema` 到现有 `PluginDrawer` 声明式渲染路径。
5. 四个挂载位置改为读取 `PluginDescriptor.pages`。v2 插件的旧入口经 v2 读取器出现在同样的位置。首页内置区块读取 `PluginDescriptor.homeSections`。
6. 槽位渲染支持 `component` 视图，施加 4.3.6 的限制。
7. `V3PluginHost` 支持挂载 `component` 视图，实现 `ui.pages.open/close` 与 `ui.views.setState/on`，加入契约表与 `hostServices.ts`。
8. 安装确认框增加界面代码提示。设置页新增"严格模式"开关，并实现回退。
9. 开发者模式（4.7）：新建 `src/main/services/plugin/devMode.ts`。`Settings/plugins.vue` 增加开关、添加文件入口、徽标、运行环境与错误展示。
10. `src/renderer/src/utils/pluginContributionCatalog.ts` 改为基于 `PluginDescriptor` 列出能力，新增 `pages`、`services` 条目。

**验收：**

- 用"页面扩展（Vue）"模板生成插件，运行 `ceru-plugin dev`，在开发者模式中添加产物。侧边栏出现入口，页面内的 `SongList` 显示 `ctx.music.search` 的结果，点击可以播放。设置页出现一节，歌单页 header 出现槽位按钮。修改 `.vue` 源码并保存后，页面在 1 秒内刷新。
- 开发者模式添加一个 v2 插件文件，同样能加载与热重载，列表显示"v2"。
- 页面内的 TDesign `Dialog` 弹出到 overlay 层，不被页面容器裁剪。
- 在构建产物中加入 `localStorage.getItem` 后，签名阶段拒绝。
- 开启严格模式后，侧边栏页面以 iframe 方式显示，槽位按钮消失。
- v2 插件的 `schema`、`web`、`native` 视图行为不变，`sidebarItems` 等旧入口仍出现在原位置。
- 人工升级验证：从澜音 v2.4.0 覆盖安装后，所有 v2 插件、状态、授权、配置、子插件都在，并且可以安装上面的 v3 插件。
- 6.5 升级保留测试全部通过。

### 阶段五：操作管线、hook、事件、生命周期与路由守卫

**目标：** 插件可以调用、拦截、改写软件的各种操作，监听事件，注入生命周期，守卫路由。没有插件拦截时，软件性能与现在相同。

**工具链仓库改动：**

1. `packages/core/src/contract.ts`：`ContractEntry` 扩展为 4.8.1 的 `OperationEntry`。为 4.8.4 目录中的每个操作补全 `inputSchema`、`outputSchema`、`intercept`、`observe`、`cancelable`、`hookTimeoutMs`、`defaultIn`、`announce`。
2. 新建 `packages/core/src/operation-bus.ts`：`OperationBus` 类，负责 hook 与监听者的注册表、4.8.2 的 hook 语义、4.8.5 的排序、超时、出错、降级、防递归、活动记录。不依赖 Electron，可在 cli 的 dev mock 中复用。
3. 新建 sdk 类型文件：`hooks.ts`（`HookContext`、`HookHandler`、`OperationSource`。hook 收到的 `op` 类型命名为 `HookContext`，避免与已有的 `OperationContext` 冲突，`op.operation` 字段即该次调用的 `OperationContext`）、`events.ts`（前置事件、完成事件、状态事件类型）、`lifecycle.ts`、`router.ts`。
4. `catalog.ts` 与 `permissions.ts` 新增 4.8.6 的十个 intercept 权限，以及 `credentials.capture`。
5. sandbox 运行时：新增 `ctx.hooks.on`、`ctx.events.on`、`ctx.lifecycle.*`、`ctx.router.*`、`ctx.app.call`、`ctx.app.operations.list`。`definePlugin` 支持选项式对象。worker 与宿主之间新增消息：`hook-invoke`、`hook-next`（worker 向宿主的 RPC）、`hook-result`、`event-dispatch`、`lifecycle`。
6. 新建 `scripts/gen-operations-doc.mjs`，从操作表生成 `docs/OPERATIONS.md`。
7. dev mock 支持模拟触发操作，以便在没有宿主时测试 hook。

**宿主仓库改动：**

1. 新建 `src/main/services/plugin/operations/bus.ts`：全局 `OperationBus` 实例。`V3PluginHost` 在插件注册 hook、监听者时登记，插件停止时清除。登记变化时向渲染进程推送 `plugin:hooks-changed`。
2. 新建 `src/main/services/plugin/operations/catalog.ts`：每个操作到内置实现的映射。内置实现在主进程的直接调用 `hostServices`；在渲染进程的经现有 `callPluginUI` 通道调用。
3. 新建 `src/renderer/src/plugin/operations.ts`：导出 `runOperation(name, input, source, localDefault)`，实现 4.8.5 的快路径与慢路径。
4. 把 4.8.4 目录"入口"列中的每个调用点改为调用 `runOperation`。逐个改，每改一类操作就运行一次 6.5 升级保留测试。`player.*` 优先，因为它们最频繁，最需要验证快路径。
5. 状态事件：`PluginHostBridge.vue` 中现有的 `publishHostEvent` 调用保留。新增 `player.progress`、`track.started`、`track.finished`、`route.changed` 的派发。`track.finished` 按 4.8.3 的规则判断是否完成。
6. 生命周期：新建 `src/main/services/plugin/lifecycle.ts`，接入 `app` 的 ready 与 `before-quit`、`powerMonitor` 的 suspend、resume、lock-screen、unlock-screen、主窗口的 show、hide、focus、blur、`nativeTheme` 的 updated。网络状态与界面语言由渲染进程通过 IPC 上报。`onBeforeQuit` 需要在 `before-quit` 中先 `preventDefault`，等待所有插件的钩子完成或 3 秒超时，再真正退出。
7. 插件自身生命周期：`addPlugin` 判断同 id 插件已存在时，记录旧版本号，新版本首次激活时调用 `onUpdate`。删除插件前以"仅生命周期"模式激活并调用 `onUninstall`。`onInstall` 在首次安装后调用。
8. 路由守卫：渲染进程 vue-router 的全局 `beforeEach` 与 `afterEach` 中调用 `runOperation('router.navigate', …)`。
9. 界面：操作被插件改写或取消时的轻提示与"撤销本次"；插件详情页的活动记录；设置页的"暂停所有插件拦截"开关；按住 Shift 启动进入安全模式。被暂停的 hook 与"暂停所有插件拦截"开关的状态保存到 `plugins/hooks-paused.json`，重启后保持。

**验收：**

- 没有任何插件 hook 时，连续切歌 100 次，`runOperation` 不产生 IPC 调用。用性能面板确认点击到开始播放的耗时与改造前相差不超过 5ms。
- 测试插件 hook `track.like`：不 return 时软件照常点赞；return 另一首歌时点赞的是另一首；`preventDefault` 时软件不点赞且出现"已由 某插件 处理"提示，点击撤销后软件执行原本的点赞。
- 测试插件 hook `player.resolve`，用 `next` 包裹，在第一次解析失败时换源成功。
- hook 中故意等待 5 秒：800ms 后管线继续，软件正常播放。连续 3 次后该 hook 被暂停并提示。
- 两个插件同时 hook `search.query`，按插件列表顺序依次生效。
- 插件在自己的 `player.play` hook 中调用 `ctx.player.play`，不产生死循环。
- 开启安全模式后，所有 hook 不执行。
- `onBeforeQuit` 中写文件，退出后文件存在。`onUpdate` 在插件更新后收到正确的 `from`。
- 路由守卫把未登录用户从插件页面重定向到登录页。试图重定向到其他插件页面时被拒绝。
- 用 `ctx.app.operations.list()` 返回的目录，`ctx.app.call` 调用 `track.like` 成功。
- 6.5 升级保留测试全部通过，v2 插件不受影响。

### 阶段六：界面区域与播放器皮肤

**目标：** 插件可以替换歌词、封面、背景等区域，组成播放器皮肤，流畅且易于开发。

**工具链仓库改动：**

1. sdk 新增 `regions.ts`：4.13.2 中每个区域的契约类型。`vue/index.ts` 新增 `useRegion`、`useFrame`、`useSpectrum`。
2. manifest v3 的 `ui` 新增 `regions` 与 `skins`，按 4.13.3 定义。issuer schema 同步。
3. 在模板仓库新增"播放器皮肤"模板并同步快照，做法同阶段二第 14 步，内容见 4.13.8。

**宿主仓库改动：**

1. 新建 `src/renderer/src/plugin/regions.ts`：区域注册表，以及每个区域的契约数据来源。数据直接取自现有 store：`player.lyrics`、`effectiveLyricTime`、`isAudioPlaying`、`coverDetail` 等。
2. 新建 `src/renderer/src/plugin/frameLoop.ts`：唯一的 `requestAnimationFrame` 循环，页面隐藏时暂停。新建 `spectrum.ts`：复用 `AudioVisualizer.vue` 的分析器，对外提供共享 `Float32Array`。
3. 新建 `src/renderer/src/components/PluginRegion.vue`：参数为区域名与默认实现。用户为该区域选择了插件视图时挂载 `PluginComponentView`，否则渲染默认实现。负责错误边界、帧耗时监测、切换动画、降级。
4. `FullPlay.vue`：把歌词、左侧封面区、背景、频谱、歌曲信息五处改为 `<PluginRegion>` 包裹现有实现。`player.stage` 包裹整个主体。顶部按钮、评论层、歌词复制层保持在外层。改动只做包裹，不改现有实现的内部逻辑。
5. `DeskTopLyric.vue`：同样包裹为 `desktopLyric` 区域。桌面歌词是独立窗口，该窗口内同样需要 `PluginComponentView` 与区域数据来源。
6. 把 4.13.4 表中的默认实现加入 `hostComponents.ts`，并为每个组件导出 `forward` 属性的构造函数。
7. `PlaySettings.vue`：显示插件皮肤与预览图，支持整套选择与按区域选择，渲染皮肤 `settings` 表单。选择结果保存到新文件 `plugins/skins.json`。
8. 开发者模式的全屏播放页调试条，见 4.13.8。

**验收：**

- 用"播放器皮肤"模板生成插件并在开发者模式中加载，选择皮肤后歌词、封面、背景全部替换。歌词随播放实时滚动，点击某行跳转成功。
- 打开性能面板播放 1 分钟：使用皮肤时的平均帧耗时与默认界面相差不超过 2ms。期间插件 worker 与主进程之间没有逐帧消息。
- 复用 `AmlLyricPlayer` 的示例插件显示 TTML 逐字歌词效果正确。
- 在区域视图中故意抛错，立即换回默认实现并标记皮肤出错。
- 在区域视图中故意每帧阻塞 40ms，10 秒后自动换回默认并提示。
- 停用插件后，所有区域立即回到默认实现。
- 默认界面的外观与行为与改造前完全一致。
- 6.5 升级保留测试全部通过。

### 阶段七：账号能力

**目标：** 插件可以提供完整的平台账号体验，效果与内置相当，宿主中没有任何平台专用代码。

**工具链仓库改动：**

1. sdk 扩展 `AccountDeclaration` 为 4.11.1 的结构。新增 `accounts.ts`：账号实现接口与 `auth` 辅助方法的类型。
2. sandbox 运行时新增 `ctx.accounts.register`，以及 `auth.qrcode`、`auth.browser`、`auth.form`、`auth.oauth` 的客户端部分。
3. 契约表新增 `account.switch` 等账号相关操作。

**宿主仓库改动：**

1. 新建 `src/main/services/plugin/accounts/vault.ts`：用 `safeStorage` 加密保存凭据，每个子账号一份，存放在新目录 `plugins/accounts/`。
2. 新建 `src/main/services/plugin/accounts/browserLogin.ts`：独立 session 分区的登录窗口，按 `until` 条件结束，只提取声明域名下的 cookie。
3. 渲染进程新增通用登录对话框：二维码、表单、浏览器登录进度、OAuth 等待。
4. 账号菜单支持插件账号的多个子账号、切换与退出、"需要重新登录"标记。
5. 按 `capabilities` 把账号接入"我喜欢"、歌单页、播放历史、首页推荐。
6. HTTP 请求的 `credential` 在主进程附加凭据。`OperationContext.connectionId` 自动带上当前子账号。

**验收：**

- 用一个测试平台的插件完成二维码登录与浏览器登录，账号菜单显示头像与昵称，可以添加第二个子账号并切换。
- "我喜欢"页出现该平台的喜欢列表。开启同步后，在软件里点赞一首该平台的歌，平台上同步生效。
- 插件未声明 `credentials.read` 时，拿不到 cookie 明文，但带凭据的请求成功。
- 凭据失效后账号菜单显示"需要重新登录"。
- 宿主代码中搜索平台名，例如 `netease`、`music.163.com`，在插件环境相关目录中没有结果。
- 6.5 升级保留测试全部通过，v2 插件的 `accountItems` 行为不变。

### 阶段八：插件服务与依赖

**目标：** v3 插件 A 可以声明依赖，并调用 v3 插件 B 暴露的服务。所有调用经宿主路由。

**工具链仓库改动：**

1. 新建 `packages/sdk/src/plugins-api.ts`，按 4.2.2 定义类型，`PluginContext` 新增 `plugins` 与 `services.register`。
2. 新建 `packages/core/src/service-router.ts`：注册表、semver 匹配、拓扑排序、环检测、深度限制，以及 `available` 与 `unavailable` 事件。
3. 契约表新增 `plugins.use`、`plugins.list`、`plugins.invoke`、`plugins.registerService`。最后一项是 sandbox 向宿主发送的服务注册通知，`ctx.services.register` 是它的客户端包装，见 4.4。
4. `exports` 新增 `./services`。dev mock 支持在 `ceru.config` 中声明模拟依赖的返回值。

**宿主仓库改动：**

1. 新建全局 `ServiceRouter`。v3 插件激活前按 `uses.plugins` 询问路由器，硬依赖缺失时标记为 `blocked`，不激活。B 注册或注销服务时通知路由器。v2 插件不参与。
2. `hostServices.ts` 实现 `plugins.*`。
3. `Settings/plugins.vue`：`blocked` 状态显示"缺少依赖 B（服务 xx ^1.0），去安装"。B 恢复后 A 自动激活。
4. 开发者模式支持同时加载多个本地插件，以便调试依赖。

**验收：**

- 测试插件 B 暴露 `echo` 服务，A 硬依赖 B 并调用成功。
- 停用 B 后，A 自动停用并显示缺少依赖。重新启用 B 后，A 自动激活。
- A 改为软依赖后，缺少 B 时 `use` 返回 null。启用 B 后触发 `available` 事件。
- B 的 handler 内调用 `ctx.plugins.use` 时，抛出指定错误。
- 构造 A→B→A 的环，两者都不激活，并在插件列表中提示。
- 6.5 升级保留测试全部通过。

### 阶段九：HTTP 服务、流式加解密与原生模块

**目标：** 插件可以运行本机 HTTP 服务，可以边下载边解密加密音频交给播放器播放并支持拖动进度，在用户明确同意后可以使用完整 Node 环境与 `.node` 模块。

依赖见第 7 节开头的阶段依赖表。

**第 1 步：技术验证。** 正式开发前先做一个最小原型，回答两个问题，结论写进提交说明：

- Electron 45 的 `utilityProcess.fork` 能否通过 `execArgv` 启用 Node 权限模型，`--allow-fs-read`、`--allow-fs-write`、`--allow-addons` 是否生效。
- `protocol.handle` 返回的流式 `Response` 能否被 `<audio>` 正常播放，Range 请求能否正确触发拖动。

任何一项不成立时，暂停本阶段，回报替代方案后再继续。

**工具链仓库改动：**

1. sdk：`ResolveResult` 增加 `stream` 字段与 `StreamSpec` 类型。新增 `server.ts`、`streams.ts`、`crypto-streams.ts`、`wasm.ts` 的类型。manifest v3 的 `entry` 增加 `server` 与 `native`。新增 4.14.6 的四个权限。
2. sdk 的 `assertResolveResult` 接受 `stream` 字段并校验其结构。按 4.1.3，不得收紧其他字段。
3. core 沙箱运行时：`ctx.server.serve`、`ctx.streams.registerTransform`、`ctx.crypto.createCipher` 与 `createDecipher`、`ctx.wasm.instantiate`。worker 的 `__bridge` 增加 `cipher` 类操作，在 worker 线程中直接使用 Node `crypto`。v3 的 `vm` 上下文开启 `codeGeneration.wasm`。
4. core 新增 `trusted-runtime/`：完全信任档的进程入口。负责通过 `MessagePort` 建立 `ctx`，提供 `defineServer` 与 `ctx.server.listen`，加载校验过的 `.node` 文件。
5. cli：`entry.server` 按 `runtime` 分别以 `platform: 'browser'` 或 `platform: 'node'` 打包。`.node` 与 `.wasm` 作为资源嵌入并记录哈希。
6. issuer：含 `.node` 资源的 artifact 上限为 50MB。校验 `runtime.trusted` 与 `entry.server.runtime`、`entry.native` 的一致性。`runtime.trusted` 的 `reason` 必填，10 到 300 个字符，含 HTML 标签时拒绝。签名覆盖资源哈希。
7. 在模板仓库新增"加密音源"模板并同步快照，做法同阶段二第 14 步：一个 provider 返回 `stream.decrypt`，一个返回 `stream.transform` 并用 WebAssembly 实现变换，一个用 `ctx.server.serve` 提供播放地址。

**宿主仓库改动：**

1. 新建 `src/main/services/plugin/server/sandboxServer.ts`：为沙箱档插件创建 `http.Server`，请求与响应以流的方式在主进程与 worker 之间传递。
2. 新建 `src/main/services/plugin/trusted/TrustedRuntime.ts`：用 `utilityProcess.fork` 启动完全信任档进程，传入 Node 权限模型参数，管理生命周期，崩溃后按插件停用流程处理。
3. 新建 `src/main/services/plugin/media/mediaProtocol.ts`：在 `app` ready 之前调用 `protocol.registerSchemesAsPrivileged` 注册 `ceru-media`，ready 后 `protocol.handle`。实现令牌表、Range 换算、内置解密、调用插件自定义变换。
4. 播放流程：`player.resolve` 的内置实现收到带 `stream` 的结果时，生成令牌，把 `ceru-media://<令牌>` 交给播放器。
5. `src/main/events/dlna.ts`：本地代理增加 `/media/<令牌>` 路由，复用同一套处理。
6. 下载与缓存：`download.create` 与 `musicCache` 对带 `stream` 的结果走同一条管线，保存解密后的数据。
7. `player.resolve` 返回本机地址时，校验端口属于该插件自己的服务，见 4.14.4。
8. 安装确认框与插件列表：实现 4.14.6 的完全信任警告、单独确认、"完全信任"标记、更新时重新确认、撤销后终止进程。
9. `.node` 解出目录 `plugins/native/` 是新路径，符合 6.2 第 2 条。卸载插件时一并删除。

**验收：**

- "加密音源"模板的三个 provider 都能正常播放。拖动进度条到任意位置后从该位置继续播放。
- 内置 AES-128-CTR 解密播放一首 FLAC，主进程 CPU 占用与播放未加密 FLAC 相比增加不超过 5 个百分点。
- WebAssembly 自定义变换以至少 4MB/s 的速度处理数据，足以播放 24 位 96kHz FLAC。
- 下载一首加密歌曲，保存的文件可以用系统播放器直接打开。
- 投放到 DLNA 设备的加密歌曲能正常播放。
- 沙箱档插件的服务只能从本机访问。授予 `network.serve.lan` 后，局域网其他设备可以访问。
- `resolve` 返回其他本机端口的地址时被拒绝。
- 用 express 写的完全信任档插件正常提供服务。加载一个示例 Node-API 模块并调用成功。
- 完全信任档插件读取插件数据目录以外的文件失败（若第 1 步验证权限模型可用）。
- 安装完全信任档插件时，确认框显示宿主固定文字、发布者、开发者说明与原生模块列表。不勾选"我了解风险"无法安装。`reason` 少于 10 个字符时 issuer 拒绝签名。
- `optional: true` 的插件选择"仅安装受限部分"后，沙箱档功能正常，完全信任档进程不启动。之后在详情页开启，进程启动。
- 插件运行时调用 `ctx.permissions.request('runtime.trusted')` 返回 `denied`。
- 撤销完全信任后进程立即退出。更新插件时更换签名发布者，重新出现确认框。
- 6.5 升级保留测试全部通过。v2 插件的播放不受影响。

---

### 7.10 补充验收：插件入口显隐、音源选择与登录拦截（2026-11-19）

本节是用户新增的交付要求，并入阶段三（音源聚合）、四（页面与脚手架）、五（操作与生命周期）、七（账号），不代表现有 v3 已支持。下面的 API 名称是示意，行为和验收条件是要求。不得改变冻结的 v2 或为某个音源、某一种登录写宿主特例。

**入口规则。** 插件可控制自己注册的主侧栏、设置侧栏、发现页 Tab、歌单页分区及音源平台入口。保留三种用法：仅声明条件（例如发现页选中 `wy`）、仅注册判断函数、两种并用。并用时支持 `all`（默认，两者都满足）或 `any`（至少一者满足）；函数普通 `true/false` 参与合并，显式 `force-show/force-hide` 则覆盖这次显隐结果。无规则保持原行为。强制结果只管本插件入口的可见性，不绕过停用、撤权、登录或数据服务校验，也不能控制别的插件。当前入口消失时回到可见入口，恢复时不抢焦点。

**上下文与账号。** 激活时即可读取用户已选的音源平台与提供者；选择提交后自动通知并重新判断，无需播放音乐或申请 `player.read`。这是搜索/发现使用的选择，不是正在播放的歌曲来源。插件可因登录、切换账号、退出、续期或凭据过期主动要求重算；多个登录方式、账号和连接由插件自行判断，不设全局 `loggedIn`。初始化或异步重算不得短暂显示受限内容，过时的结果不得覆盖最新选择。允许条件满足后加载或预取数据，也可打开时再加载；重算不应重复请求。始终保留可达的登录入口。

**音源注册与选择器。** 未登录也能先注册 `wy`。注册身份使用插件 ID 与 provider ID 的组合；不能让后注册的同平台插件覆盖已有提供者或悄悄改变用户偏好。注册与入口状态独立：隐藏则不显示且不能选；禁用则显示但置灰且不能选，可选原因通过悬停或键盘聚焦展示，无原因不强制提示；可选则可以发起切换。仅隐藏入口不等于终止正在播放的歌曲，真正失效的账号应阻止新的受保护操作。当前选择失效时明确回退到其他可用选择或空状态，不把另一个同平台提供者冒充原选择。

**切换 hook。** 搜索框旁的音源下拉、设置中的音源选择等入口走同一次宿主切换操作。插件仅拦截切入自己的可选提供者，不拦截用户切走。要实现点选后登录，入口必须可选而非禁用。提交前保持原选择和持久化值；已登录可直接放行，未登录可弹登录框、异步等待而不阻塞界面。成功且请求仍有效时继续原操作、只提交一次；关闭/取消/失败则不提交，插件可调用宿主 toast 提示「需要登录」。用户另选目标、停用插件或撤权时取消待处理操作，迟到的登录结果不得抢回选择。区分等待用户操作与普通 hook 执行预算，提供取消与清理，不能无限占住切换管线。

**本地验收与作者交付：**

1. JS、TS 脚手架及开发文档给出纯声明、纯函数、组合规则和登录拦截示例；测试 `all/any`、两种显式覆盖、旧插件无规则、异步旧结果丢弃。组件视图、已有原生视图以及宿主入口要验证实际显隐，不是只让插件内容变空。
2. 以 `G:/code/pluginclitest/网易云账号` 的 `daily`（「网易云推荐」）为例，在无播放的冷启动、切入/切出 `wy`、多账号切换和过期时验证：默认只在发现页已选 `wy` **且**插件判断账号可用时显示。设置登录入口始终可达；平台本身不能依赖“先选中 `wy` 才可选”。
3. 安装两个提供 `wy` 的插件验证独立注册、偏好保留、隐藏、置灰（有/无原因）和可选；移除或停用一个不影响另一个。仅改可见性与账号失效的效果分别验收。
4. 在实际 Windows 桌面分别从搜索下拉和设置发起：已登录放行、登录成功仅提交一次、关闭保留原值并可提示、等待期间改选别的平台、停用或撤权后的迟到结果丢弃。记录所用候选包、脚手架包及实际结果；本节不授权提交、推送、覆盖安装或发布。

## 8. 文档同步

| 文档 | 阶段 | 内容 |
| --- | --- | --- |
| `docs/runtime-contract.md`（`release/v2`） | 零 | 歌词兼容说明，顶部注明"v2 已冻结" |
| `CeruMusic/src/main/services/plugin/AGENTS.md` | 一、五、九 | 阶段一重写，描述双环境结构与共享层。阶段五补充操作管线目录，阶段九补充完全信任档与媒体管线 |
| 新建 `docs/MANIFEST-V3.md` | 二，此后每阶段补充 | v3 manifest 完整字段说明、示例、v2 到 v3 字段对应、`ceru-plugin migrate` 用法。阶段六、七、九新增的 `ui.regions`、`ui.skins`、`provides.accounts`、`entry.server`、`entry.native` 在各自阶段补入 |
| `docs/HOST-SERVICES.md` | 二、三、五、七、八、九 | 契约表中每个方法一条，新增 `music.*` 与 `plugins.*` 章节 |
| `docs/runtime-contract.md`（`main`） | 二、三 | v3 运行契约、共享数据契约、新增权限名、资源归属规则 |
| `docs/design.md` | 二 | 顶部加注"v3 实现以 plugin-environment-refactor.md 为准" |
| `docs/NATIVE-SURFACES.md` | 四 | 顶部注明"新插件推荐使用 component 视图"，正文保留 |
| 新建 `docs/COMPONENT-VIEWS.md` | 四 | `component` 视图编写指南、`ViewBridge`、`sdk/vue`、`HostComponents` 列表、开发者模式用法 |
| `README.md`，根目录与各包 | 二、四 | v3 manifest 示例，说明 v2 项目应使用 `0.3.16` 版 cli 或执行迁移，移除 playground 说明，加入开发者模式说明 |
| `CeruMusic/docs/plugin-notice-usage.md` | 四 | 如涉及 `plugin:dev-reloaded` 事件则补充 |
| 新建 `docs/HOOKS-AND-EVENTS.md` | 五 | hook 四种写法、事件、执行规则、权限、生命周期、路由守卫，每项附示例 |
| `docs/OPERATIONS.md` | 五 | 由脚本生成，不手写 |
| 新建 `docs/REGIONS-AND-SKINS.md` | 六 | 区域列表与契约、皮肤声明、复用宿主组件、性能规则、调试条用法 |
| 新建 `docs/ACCOUNTS.md` | 七 | 账号声明、四种登录方式、凭据规则、能力接入 |
| 新建 `docs/SERVER-AND-STREAMS.md` | 九 | 两档运行环境的区别与选择、HTTP 服务两种写法、加密播放的三种做法、WebAssembly、`.node` 打包与平台、完全信任的用户同意流程 |

---

## 9. 风险与默认处理

| 风险 | 默认处理 |
| --- | --- |
| 升级后 v2 插件丢失或状态改变 | 6.2 保留规则、6.3 失败可见、6.5 每阶段运行的升级保留测试，以及两次人工升级验证 |
| 版本识别出错，把 v2 插件送进 v3 环境 | `sniffManifestVersion` 只依据 `manifestVersion` 字段。识别结果与对应环境的完整校验不一致时，按 6.3 显示为"无法加载"，不尝试另一个环境 |
| 两套运行时同时打包导致体积增加 | v2 运行时约为现有体积，属于已知成本。`check:packaging` 确认没有重复打包到渲染进程 |
| 共享数据契约在 v3 中被无意收紧，导致 v2 插件的数据被共享层拒绝 | 4.1.3 规则与 `test/data-contract.test.mjs` |
| v2 冻结后出现安全问题 | 在 `release/v2` 上修复并发布 `0.3.x` 补丁，宿主更新精确版本号，必须通过 5.3 与 6.5 |
| 从 `V2PluginHost` 抽取共享代码时改变了 v2 行为 | 抽取只移动实现体，协议层不动。每次抽取后运行 6.5 |
| v3 插件装到旧版澜音 | 旧版 issuer 拒绝 `manifestVersion: 3`，插件不会以错误方式运行，见 6.2 第 6 条 |
| 宿主 Vue 或 TDesign 大版本升级，破坏 `component` 视图 | 两者的版本纳入 `hostApi` 语义。升级时 cli 增加兼容性检查命令 |
| 恶意 `component` 视图污染渲染进程 | 分级信任、静态拒签、严格模式回退，见 4.3.5。logic 层权限模型不受影响 |
| 槽位内大量 Vue app 实例影响性能 | 4.3.6 的配额与降级 |
| 放开资源归属后插件可以播放任意平台的歌曲 | 仅限 v3，需要 `music.control` 权限，授权文案明确说明 |
| 依赖环与版本漂移 | 深度为 1、拓扑排序、出现环即拒绝激活 |
| 开发者模式跳过签名被滥用 | 只对用户手动添加的本地文件生效，列表有明显徽标，默认关闭 |
| 插件 hook 让软件变慢 | 快路径保证无 hook 时零开销。每个 hook 有超时，反复超时自动暂停 |
| 插件悄悄改写或拦截用户操作 | 需要 intercept 权限，用户发起的操作被改写时有提示与撤销，插件详情页有活动记录，有安全模式 |
| 插件拦截导致用户无法控制软件 | 退出、安装、卸载、改权限不进入操作目录。安全模式可一键关闭所有拦截 |
| 多个插件 hook 同一操作互相冲突 | 按插件列表顺序依次执行，完成事件的 `handledBy` 记录所有参与者，便于排查 |
| 皮肤影响播放流畅度 | 高频数据零拷贝，统一帧循环，帧耗时监测与自动降级 |
| 皮肤出错导致播放页不可用 | 错误边界立即换回默认实现。顶部按钮始终由软件渲染，用户随时能退出 |
| 软件改版导致区域契约变化 | 契约带版本号，只增不改，不兼容时该区域回到默认实现 |
| 登录窗口被用来窃取其他网站 cookie | 只提取 `credentials.capture` 声明的域名，每个子账号独立 session 分区 |
| 完全信任档插件作恶 | 无法从技术上阻止。依靠单独同意、强制签名、"完全信任"标记、更新时重新同意、可随时撤销。文件访问在 Node 权限模型可用时限制在插件目录 |
| `.node` 模块与用户系统不兼容 | 只接受 Node-API 模块，按平台分别提供，缺少当前平台时安装即失败 |
| 插件借播放地址访问本机其他服务 | `resolve` 返回本机地址时只允许插件自己的服务端口 |
| 解密影响播放流畅度 | 内置算法在主进程流式运行，自定义变换零拷贝传递数据块，阶段九有吞吐量验收 |
| 不可拖动的加密格式 | `seekable: false` 时禁用进度条拖动，而不是出错 |

实施中遇到本文未覆盖的决策点，优先选择对 v2 环境和已安装插件零影响的方案，并在提交说明中记录。

---

## 附录 A：术语表

| 术语 | 含义 | 规范 |
| --- | --- | --- |
| 宿主 | 澜音应用本身，即 `CeruMusic` | 0.1 |
| 工具链 | `CeruMusic-Plugin-Cli` 中的 sdk、issuer、core、cli、create 五个包 | 0.1 |
| artifact | 插件的发行文件，一个单 JS 文件，含 manifest、代码模块与资源 | 3.5 |
| manifest | 插件的声明，写在 artifact 头部。v2 与 v3 结构不同 | 4.1 |
| 运行环境 | v2 环境或 v3 环境。由插件的 `manifestVersion` 决定 | 3 |
| 档位 | v3 logic 的两种运行方式：沙箱档与完全信任档 | 4.14.1 |
| 沙箱档 | 在 worker 的 `vm` 上下文中运行，没有 Node 模块，所有能力经权限检查 | 4.14.1 |
| 完全信任档 | 在 `utilityProcess` 中运行真实 Node，可以用 express、koa、`.node`，宿主无法完全限制 | 4.14.1 |
| logic | 插件的不可视部分，即 `entry.logic` 的代码 | 3 |
| view | 插件的可视部分。v3 有 `component`、`web`、`native` 三种 | 4.1.1 |
| component 视图 | 在渲染进程 Shadow DOM 中运行的 Vue 或原生 DOM 视图，共享宿主 Vue 与组件 | 4.3 |
| `ViewBridge` | component 视图拿到的唯一宿主接口 | 4.3.2 |
| 宿主组件 | 宿主开放给 component 视图使用的组件，如 `SongList`、`AmlLyricPlayer` | 4.3.3、4.13.4 |
| 页面 | 挂载到侧边栏、设置页、首页 tab、歌单页的整页视图 | 4.1.1 `PageDeclaration` |
| 槽位 | 现有页面中的小块扩展点，例如歌单每一行的按钮 | 4.3.6 |
| 区域 | 软件界面中可整体替换的一块，例如歌词、唱片、背景 | 4.13.2 |
| 皮肤 | 一组区域视图的组合，用户在播放器主题面板中选择 | 4.13.3 |
| 契约表 | `core/src/contract.ts`，v3 所有 RPC 方法与操作的唯一定义 | 4.4 |
| 操作 | 软件里一次有意义的动作，例如 `track.like`，所有入口走同一条管线 | 4.8.1 |
| 操作管线 | 前置事件、hook 链、内置实现、完成事件四步 | 4.8.1 |
| hook | 插件注册的 `(op, next)` 函数，可以观察、改参数、拦截、包裹内置实现 | 4.8.2 |
| 内置实现 | 软件原本的行为，即 hook 中的 `next` | 4.8.1 |
| 前置事件 | 操作执行前派发、可以 `preventDefault` 的事件 | 4.8.3 |
| 完成事件 | 操作结束后派发、带最终参数与结果的只读事件，名字以 `:done` 结尾 | 4.8.3 |
| 状态事件 | 软件状态变化的只读事件，如 `player.changed` | 4.8.3 |
| 快路径 | 没有插件拦截时，操作直接在本地执行，不经过 IPC | 4.8.5 |
| 安全模式 | 暂停所有插件拦截的状态，按住 Shift 启动进入 | 4.8.5 |
| `MusicRegistry` | 音乐聚合层，汇总所有已安装音源 | 4.2.1、阶段三 |
| provider | 插件提供的音源实现 | 4.1.1 |
| 插件服务 | 插件对其他插件公开的非标准能力 | 4.6 |
| 硬依赖、软依赖 | 缺少依赖时不激活，或照常激活并返回 null | 4.6 |
| `PluginDescriptor` | 宿主读取插件声明的统一只读视图，屏蔽 v2 与 v3 的结构差异 | 3.4 |
| 媒体管线 | `ceru-media://` 协议，负责边下载边解密并交给播放器 | 4.14.4 |
| guest、子插件 | 兼容环境插件中运行的外部格式脚本，例如洛雪脚本 | D13 |
| 开发者模式 | 在真实软件中加载本地插件并热重载的设置项 | 4.7 |

## 附录 B：v2 与 v3 对比

供插件作者与产品说明使用。实施以正文为准。

| 方面 | v2 | v3 |
| --- | --- | --- |
| 运行环境 | 一套，任何改动都可能影响已发布插件 | 两套并存。v2 冻结原样运行，v3 独立演进 |
| 软件升级后的旧插件 | 不涉及 | 全部保留，状态、授权、配置、数据不变 |
| 损坏的插件 | 从列表中消失 | 显示为"无法加载"并说明原因 |
| manifest | `contributes` 平铺十几个数组，权限单独在外 | 按 `entry`、`provides`、`uses`、`ui` 分组 |
| 页面入口 | `sidebarItems`、`settingsPages` 等四种写法 | 统一为 `ui.pages`，用 `mount` 区分四个位置 |
| 页面技术 | iframe 或 JSON，样式与软件不统一，弹窗出不了框 | component 视图，共享宿主 Vue、TDesign、业务组件，外观与软件一致 |
| 列表行内按钮 | 做不到 | 槽位中的 component 视图 |
| 替换软件界面 | 做不到 | 替换歌词、唱片、背景等区域，组成皮肤 |
| 使用其他音源 | 只能操作自己声明的歌曲 | `ctx.music` 搜索与播放任何已安装音源，包括 v2 插件与本地音乐 |
| 拦截软件行为 | 只能接收少量只读事件 | 30 多个操作可以 hook，可观察、改参数、拦截、包裹 |
| 生命周期 | 只有激活与停用 | 软件与插件自身共 20 多个生命周期钩子 |
| 路由 | 无 | 路由守卫与跳转 |
| 账号 | 账号菜单项，登录界面由插件自己写 | 声明登录方式，界面、凭据保管、"我喜欢"与歌单接入由软件完成 |
| 插件之间 | 完全隔离 | 声明依赖后可以调用对方的服务 |
| 本机服务 | 无 | 沙箱档 Web 标准写法；完全信任档可用 express、koa |
| 加密音频 | 无 | 返回解密参数或自定义变换，软件边下载边解密，支持拖动 |
| 原生能力 | 无 | WebAssembly；完全信任档可用 `.node` |
| 开发预览 | cli 自带模拟窗口，数据是假的 | 在真实软件中加载，保存后 1 秒内刷新 |
| 工具链版本 | `0.3.x`，停在 `0.3.16` | `3.x` |
| 安全底线 | 插件代码不进主进程，敏感能力需授权 | 不变。新增能力各有权限；完全信任档在安装时单独征得同意 |
