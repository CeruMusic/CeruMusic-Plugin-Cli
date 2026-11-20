# 播放器区域与皮肤

从 `player-skin` 模板创建 TS 或 JS 工程。模板有歌词、封面、背景三个 Vue 视图。构建后，在桌面「设置 → 插件管理 → 管理设置 → 插件开发者模式」启用开发者模式并添加构建出的 JS 文件；进入全屏播放器，从「播放器个性化」选中该皮肤。调试视图时不需要发布插件。

## 声明与选择

只编写区域视图时，从 `@shiqianjiang/ceru-plugin-sdk/vue/region` 导入 `useRegion`、`useHostComponents`、`useFrame` 和 `useSpectrum`。该入口使用同一套宿主函数，只加载所需类型；仍会检查模板属性和表达式。原有 `/vue` 入口继续兼容，需要 `useView` 等通用页面 API 时仍用它。

在 `entry.views` 中声明 `kind: 'component'` 的视图，并用 `ui.regions` 的 `region` 和 `view` 绑定它。要让用户一次应用多个区域，在 `ui.skins` 中声明 `id`、`title`、`regions`。查看模板的 `ceru.plugin.json` 可获得能直接构建的完整配置。用户也可以展开「按区域选择」，为指定区域选择其他插件、系统默认，或跟随整套皮肤。

| 区域（契约版本 1） | 视图可以读取或执行什么 |
| --- | --- |
| `player.lyrics` | 定时歌词行、逐字时间、播放状态；点击歌词跳转 |
| `player.artwork` | 歌曲、封面、布局、配色与播放状态 |
| `player.background` | 歌曲、封面、配色及频谱 |
| `player.songInfo` | 曲名、歌手、专辑和配色 |
| `player.visualizer` | 频谱和配色 |
| `player.stage` | 接管全屏主体，读取歌词、封面、歌曲和频谱；退出、个性化等宿主按钮保留。退出舞台后恢复各区域的选择 |
| `desktopLyric` | 独立桌面歌词窗口中的当前行、下一行和锁定状态 |

## 个性化面板的预览图

预览图是可选的，不必为此编写组件或申请网络权限。在工程 `ceru.plugin.json` 的顶层 `resources` 对象中登记本地缩略图，例如：

```json
{
  "studio.preview": { "path": "assets/studio.webp", "type": "base64", "mime": "image/webp" }
}
```

然后给已有的 `manifest.ui.skins[]` 条目增加 `"preview": { "kind": "asset", "resource": "studio.preview" }`。也可以直接写 `"preview": { "kind": "host", "name": "music-note" }` 使用宿主图标。`resource` 是本插件的资源 ID，不是路径或远程 URL。

面板使用 3:2 预览框，按比例完整显示图片。支持 PNG、JPEG、WebP、GIF 和 SVG；二进制缩略图请控制在 96 KiB 以内（编码后不超过 128 KiB）。未声明、超限、资源不可用或无法解码时，宿主会显示调色板图标，用户仍能选择皮肤。

## 复用歌词渲染器

在歌词或舞台组件内，`useRegion` 提供只读数据、设置、尺寸和区域动作；`useFrame` 注册与挂载生命周期一起清理的帧回调。不要把逐帧时间通过 logic IPC 往返传递。`AmlLyricPlayer` 使用宿主同版本的 AML 内核，可直接读取区域提供的逐词时间和对唱信息：

```vue
<script setup lang="ts">
import { useHostComponents, useRegion } from '@shiqianjiang/ceru-plugin-sdk/vue'

const { props, actions } = useRegion('player.lyrics')
const { AmlLyricPlayer } = useHostComponents()
</script>

<template>
  <AmlLyricPlayer v-bind="props.forward" @line-click="actions.seek" />
</template>
```

在模板皮肤的设置中打开「逐字歌词」可以试用上述组件。`line-click` 的单位是毫秒。皮肤设置由宿主保存；切换另一插件的区域不会把当前皮肤的私有设置转交给它。

新建 JS 或 TS 皮肤默认使用 `src/BuiltinLyrics.vue`：通过 `useHostComponents()` 获取桌面播放器的 `LyricAdapter`，把 `line-click` 接到 `actions.seek`，无歌词时显示占位提示。要自行实现歌词布局，把工程 `ceru.plugin.json` 的 `entries["view.lyrics"]` 改为 `src/Lyrics.vue`，保留视图 ID、区域声明和皮肤设置。已有工程不会自动改写入口，也可以按需切换。

封面、背景和频谱也可以从 `useHostComponents()` 复用 `VinylRecord`、`SquareCover`、`ShaderBackground`、`AudioVisualizer`。播放器皮肤模板的 `Artwork.vue` 与 `Background.vue` 已分别展示黑胶/方形封面和背景组件的最小用法。组件只使用当前区域的 `props`，不会把封面或频谱转发到插件 logic。

`LyricAdapter`、`VinylRecord`、`SquareCover` 和 `AudioVisualizer` 的显示实现由匹配的桌面测试版提供，不会复制进作者的 `dist/plugin.js`。普通模式使用主渲染器相同的 Vue 模块，时间和播放状态直接引用播放器的只读 Ref；需要频谱的区域共享分析器写入的同一 Float32Array。严格模式改用隔离 iframe，通过消息传递快照和频谱，不承诺零拷贝。不要从桌面源码目录或 Core 包导入 `.vue` 文件，也不要依赖 Pinia、音频元素或主窗口 DOM。`AmlLyricPlayer` 与 `ShaderBackground` 使用宿主提供的 AML 内核。

## 区域切换动画

区域视图允许 Canvas、WebGL、CSS 动画与 Web Animations。区域模块中的 `Worker`、`SharedWorker`、`WebAssembly` 引用会在读取产物及签名时被拒绝；不要在区域内创建独立后台计算或 WASM 实例。音频变换仍应放在 logic 的 `ctx.wasm` 与 `ctx.streams` 中。此检查针对 `ui.regions` 引用的组件模块，不限制普通页面的既有能力，也不把静态扫描视为 JavaScript 沙箱。

区域视图可在普通 `<script>` 中导出 `onEnter` 和 `onLeave`，与同一文件的 `<script setup>` 并用。未提供钩子时，宿主使用 140 ms 的透明度过渡。`reason` 区分 `skin`（区域切换）和 `track`（切歌）。每个阶段最多等待 600 ms；减少动态效果时跳过。动画只应修改当前区域，响应取消信号，不要等待网络或阻塞主线程。

```vue
<script lang="ts">
import type { RegionTransitionHook } from '@shiqianjiang/ceru-plugin-sdk/vue'

export const onEnter: RegionTransitionHook = async ({ root, signal }) => {
  const element = root.querySelector('.frame')
  if (!element) return
  const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 })
  signal.addEventListener('abort', () => animation.cancel(), { once: true })
  await animation.finished.catch(() => {})
}
</script>
```

## 模拟器与性能检查

仅在开发者模式下，全屏播放器顶部才出现「皮肤模拟器」。先选中要调试的插件皮肤，再打开模拟器。三个 12 秒样例分别为逐字、对唱、无歌词；拖动时间轴、播放或暂停，可以查看插件对时间变化的反应。切换浅色预览会更新区域配色及组件主题，不会更改软件的全局主题。调试时不播放样例音频，也不主动改变当前歌曲或队列；模拟器关闭后，区域重新读取真实播放状态。模拟器主要用于全屏插件区域，不控制独立桌面歌词窗口。

模拟器的毫秒读数显示宿主预览窗口近期动画帧的平均间隔，不是插件独占的 CPU 时间。降级检测另行统计区域每次更新的实际耗时，包括帧回调、Vue 更新与随后一次布局读取；浏览器等待下一帧的时间不计入，避免低频调度导致无开销的区域被误判。连续约 2 秒平均更新耗时超过 20ms 时，宿主显示提示，可以手动换回默认；连续约 10 秒超过 33ms 时自动回退。区域代码抛错也会回退。用户关闭面板时多个警告合为一条，打开后可分别处理。

窗口失焦或页面隐藏时暂停区域帧回调及宿主提供的歌词、唱片、背景动画，恢复后从当前播放快照继续。暂停动画不会暂停音频或修改 `region.props.playing` 的播放状态。
