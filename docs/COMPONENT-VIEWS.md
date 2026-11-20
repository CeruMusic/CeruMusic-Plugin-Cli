# v3 组件视图：从模板到真实桌面

本地候选的普通组件视图以 Blob ESM 工厂加载，在应用主渲染器的 closed Shadow DOM 中挂载，共享应用本身的 Vue、TDesign 和宿主业务组件。CLI 只生成引用，不把这些实现复制进插件。开启严格模式后，整页改在无同源权限的 iframe 内运行，槽位不显示。Shadow DOM 隔离样式而不是 JavaScript 权限；安装时会提示界面代码在应用内运行。插件动作仍由宿主按声明校验和限流，logic 保持独立沙箱。区域在窗口失焦或文档隐藏时暂停帧回调，恢复后继续。

宿主页面通过 CSP 允许本地脚本和 Blob 视图模块，阻止任意内联脚本、未授权的远程脚本、嵌入对象和修改基础 URL。现有 TDesign 图标仅放行官方固定版本脚本 `https://tdesign.gtimg.com/icon/0.3.2/fonts/index.js`，没有放开整个域名。为兼容冻结 v2 与严格模式视图仍允许 `data:` 脚本；现有指纹与图形库需要的 `unsafe-eval` 也暂时保留。因此 CSP 不是普通组件的 JavaScript 沙箱，不替代签名时的静态检查或严格模式。访问统计置于独立的无同源权限 iframe，其内存存储初始化仅由固定脚本哈希放行。

在本地 v3 工具链运行 `ceru-plugin init my-page --template page-extension --lang ts`。进入工程并安装依赖后运行 `npm run dev`，把终端打印的 JS 文件添加到澜音「设置 → 插件管理 → 管理设置 → 插件开发者模式」。不要导入源码目录。此步骤是本地预览，不上传、不覆盖已安装文件。

## 视图入口

在 `entry.views` 声明 `{"id":"search","kind":"component","module":"view.search"}`，在项目 `entries` 将该模块映射到 `src/Search.vue`。再用 `ui.pages` 声明页面的标题、ID、挂载位置和 `view:"search"`。四个位置是 `sidebar`、`settings`、`home-tab`、`playlist-section`。`when.loggedIn` 可限制登录状态；侧栏图标可选宿主图标或插件打包的图片。

在 `component` 里直接从 `vue`、`tdesign-vue-next` 和 SDK 的 `/vue` 或 `/vue/region` 入口导入；构建器会把这些引用连接到宿主提供的对象。开发依赖用于编译和类型提示，并不表示桌面组件实现会被打进插件。自写的子组件和样式则随插件交付。不要从桌面工程导入 `.vue` 源文件，也不要复制 TDesign 的整套样式。

例如，`{"id":"daily","title":"每日推荐","view":"search","mount":"home-tab","when":{"selectedSource":"catalog"}}` 只在用户选中可用的 `catalog` 音源时显示，不要求开始播放，也不要求该页面的插件提供 `catalog`。四个挂载位置使用同一条件。始终要能打开的设置或登录入口请省略 `when`。

需要读取插件自己的账号状态时，在 `provides.actions` 声明动作 `daily.visible`，在逻辑入口用 `ctx.actions.register` 注册，并为页面设置 `when: { selectedSource: 'wy', predicate: 'daily.visible' }`。下例中的 `accountIsUsable()` 是插件自己的只读判断，不是宿主 API。

```js
ctx.actions.register('daily.visible', async ({ pageId, selectedSource, selectedProvider }) => {
  return pageId === 'daily' && await accountIsUsable()
})
```

`selectedSource` 是选中的平台 ID，`selectedProvider` 是所选实现插件的清单 ID；不可用时为 `null`，本地内置音源没有实现插件。省略 `selectedSource` 条件可只用函数。普通布尔结果与声明条件按 `combine: 'all'`（默认）或 `'any'` 合并；返回 `'force-show'` 或 `'force-hide'` 可覆盖显隐，不授予任何权限，也不替代后续服务的账号校验。判断等待中、异常或返回非法值时保持隐藏。判断函数可能重复调用，不应在其中弹登录框或拉取页面数据。

```vue
<script setup>
import { Button } from 'tdesign-vue-next'
import { useAction, useViewState, useHostComponents } from '@shiqianjiang/ceru-plugin-sdk/vue'
const search = useAction('search')
const play = useAction('play')
const state = useViewState()
const { SongList } = useHostComponents()
</script>
<template>
  <Button @click="search('示例')">搜索</Button>
  <SongList :items="state.items ?? []" @play="item => play(item.key)" />
</template>
```

动作在 `provides.actions` 声明、由 logic 注册；state 由 `ctx.ui.views.setState(viewId, state)` 推送。组件不直接访问 IPC、文件或播放器。Vue SFC 由工具链生成挂载函数；手写组件可用 `defineView`、`mountComponent` 和 `onDispose` 生命周期清理资源。不要将插件的可变全局状态当成跨视图通信。

## 宿主组件

| 组件 | 输入、交互 |
| --- | --- |
| SongList | `items` 接受 ContentEntity 或带 title 的简化对象。可显示 artists、来源、时长与首项音质；`label` 命名列表。只有提供相应动作才显示菜单；不可播放的歌名不是按钮。 |
| PlaylistCard / PlaylistGrid | 单项 `item` 或多项 `items`，显示歌单作者与曲目数；`@open` 收到原条目，未监听时不渲染假按钮。卡片支持 default、cover 插槽，网格支持 default。 |
| QualityBadge / SourceIcon | `quality="flac"` 显示“无损”；`source="local"` 显示本地图标/文字。未知音源使用通用图标和原名称，不请求远程图标。 |
| PageHeader | `title`、`description`；default 可替换标题，actions 用于标题栏按钮。 |
| EmptyState / LoadingState | `title` 或默认插槽覆盖提示；空状态支持 description 与 actions；加载状态遵循系统减少动态效果设置。 |
| SquareCover | 接收 `artwork`、`track`、`palette`、`playing`，显示宿主统一的方形封面。 |
| VinylRecord | 接收同一组歌曲和配色属性；播放时使用宿主帧状态驱动旋转，尊重减少动态效果。 |
| ShaderBackground | 接收 `artwork`、`palette`、`playing`，提供带封面取色的背景层，填满父容器。 |
| AudioVisualizer | 接收 `spectrum`、`color`、`barCount`、`height`；在频谱或舞台区域内读取宿主共享的频谱数组。 |

页面模板使用 `<SongList :items="state.items" :actions="{play:'play', enqueue:'enqueue'}" />`。actions 的键还支持 favorite、download，值是**本插件清单声明并由 logic 注册**的动作名。传入 key 时回调只收到 key；否则只收到资源标识字段，不携带 data 或媒体 URL。若使用旧的 `@play` 而不设置 actions.play，监听器仍收到完整条目。一次只提交一个菜单动作，失败在列表中显示。

插件作者应在 logic 保存原始引用，搜索结果更新后让旧 key 失效。授权后可通过 ctx.music.play/enqueue 点播其他音源；收藏和下载服务仍检查声明的权限与资源归属，不是任意跨源写入。没有能力的插件不要声明相应菜单。

## 上下文和限制

- `useView()` 提供 ShadowRoot、视图与实例 ID、冻结的 props、只读 state/theme、overlay、宿主组件、图标查询、invoke、close、onDispose。开发者模式中添加的本地预览组件使用 open 根，可在开发者工具的 Elements 面板展开 `.component-root`（严格模式为 iframe 内的 `#plugin-root`）。普通安装的组件即使开启开发者模式也使用 closed 根。抽屉可收到打开时的 props。
- 歌单详情区块收到 `{playlist:{ref:{id,location},name,description?,trackCount?,writable}}`，无歌曲列表、签名地址或私有元数据。在歌单概览没有已选歌单，请处理缺省值。
- 歌单操作按钮声明在 `ui.slots` 中，`view` 必须是组件。它收到 `props.slot`。每个插件在每种槽位最多 200 个实例；连续五次组件挂载超过 50 毫秒后暂停该插件的槽位，但独立页面可继续打开。
- 通过 `useHostComponents()` 获取下列控件。它们不要求插件再打包 Vue 或加载远程图片。
- 严格模式使用无同源权限 iframe 保留独立页面并隐藏槽位；作者只依赖 ViewBridge，不依赖主窗口 DOM。

## 播放器区域组件

用 `--template player-skin --lang ts` 或 `--lang js` 创建示例。三个 Vue 文件分别替换歌词、封面、背景。`ui.regions` 声明区域与视图的对应关系，`ui.skins` 组合这些区域；视图必须是 `component`。省略 `@1` 表示第一版契约，宿主不能把要求第二版的视图当成第一版挂载。

`useRegion('player.lyrics')` 只在该区域挂载时可用。`props.currentTime.value` 是毫秒，`props.lines` 是只读歌词；`actions.seek(line.startTimeMs)` 返回 Promise。`useFrame(callback)` 注册当前区域的帧回调，组件卸载时释放；`useSpectrum()` 只用于背景、频谱或整个舞台。普通页面没有播放区域上下文。区域数据不应包含凭据、媒体请求头、私有连接资料或媒体文件路径。

`region.size.value.width` 和 `height` 是宿主分配给该视图的 CSS 像素尺寸，会随容器缩放。全屏区域按秒统计每次更新的实际耗时，包括帧回调、Vue 更新与布局读取；连续约 2 秒平均耗时超过 20ms 会提示用户可换回默认，连续约 10 秒超过 33ms 自动回退该区域。浏览器等待下一帧、隐藏窗口和暂停采样不计入连续卡顿；插件本身长时间阻塞仍计入。帧回调抛错也会回退该区域。

在 `player.lyrics` 或 `player.stage` 中可以从 `useHostComponents()` 取 `AmlLyricPlayer`。它使用澜音的 AML 内核和区域帧时钟，支持逐字、翻译、音译、对唱和背景歌词。给外层设置高度后，用 `<AmlLyricPlayer v-bind="props.forward" @line-click="actions.seek" />` 渲染。点击事件传毫秒时间；宿主仍负责决定是否允许跳转。播放器皮肤的 TS/JS 模板默认使用桌面的 `LyricAdapter`；开启“逐字歌词”才切换到宿主的 `AmlLyricPlayer`。作者无需安装 AML 包。

封面、背景和频谱也可以直接复用宿主组件。它们只消费当前区域已经提供的只读数据，不会自行请求网络：

```vue
<script setup lang="ts">
import { useHostComponents, useRegion } from '@shiqianjiang/ceru-plugin-sdk/vue'
const region = useRegion('player.artwork')
const { VinylRecord, SquareCover } = useHostComponents()
</script>
<template>
  <VinylRecord v-if="region.props.layout === 'cd'" :artwork="region.props.artwork" :track="region.props.track" :palette="region.props.palette" :playing="region.props.playing.value" />
  <SquareCover v-else :artwork="region.props.artwork" :track="region.props.track" :palette="region.props.palette" :playing="region.props.playing.value" />
</template>
```

`AudioVisualizer` 的 `spectrum` 是宿主共享的 128 项 `Float32Array`；不要复制到 logic 或从插件自行启动第二个音频分析器。`ShaderBackground` 的父容器由宿主提供，插件只负责包裹和叠加自己的内容。

在 `ui.skins[].settings` 声明 `type: 'object'` 与 `properties`。宿主可生成布尔开关、六位十六进制颜色、文本、数值、整数和标量枚举输入；支持 `default`、数值上下界和文本长度，不支持的字段不会展示。设置按插件和皮肤分别保存；可逐项重置。声明示例见 `player-skin` 模板的 `ceru.plugin.json`。

在 `computed` 或渲染函数中读取 `region.settings`。不要在 `setup` 时把 `settings` 解构成一次性快照。插件只有在该套皮肤的对应区域内才会收到它的设置；单独挂载、混搭其他插件或旧宿主都会需要默认外观。设置是只读数据，不要把密钥放进皮肤配置。

## 对话框与弹层

从 tdesign-vue-next 导入 Dialog，并使用 v-model:visible 控制显示。默认挂载到当前视图的 bridge.overlay；显式传入其他 attach 会覆盖该行为。对于自定义 Vue Teleport，目标使用 useView().overlay，并监听该节点的 ceru-overlay-dismiss 事件来关闭自己的内容。

普通模式的 overlay 位于 body 层级独立 Shadow DOM 中，使用相同的宿主样式，弹层不会被小槽位裁剪。严格模式下，由用户点击或键盘操作打开时，桌面把同一个隔离 iframe 临时展示在宿主弹层，窗口标题栏保留，插件无需重新加载。严格模式宿主关闭按钮不依赖插件配合，后台视图或未获得用户操作时不会扩展到主窗口。不支持保留 iframe 状态的环境仍在原容器内显示。不要将此机制用于后台权限确认。

