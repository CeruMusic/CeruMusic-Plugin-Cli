# 澜音 v2 运行契约

## 数据和运行边界

单个 JS 文件静态导出 manifest，后台 activate 在纯 Node worker 的独立 VM 运行，Web Surface 在 Electron 的隔离浏览器中运行。Core 校验并分发 providers、actions、playlistImporters、lyricConverters。插件负责平台业务和格式转换，应用持有本地数据库、云账号与现有页面。

`manifest` 保存标准元数据，`manifest.config` 保存插件自定义字段。安装预览、侧边栏、来源、导入选项和帮助文案读取静态声明。应用进入主界面前加载贡献缓存，页面切换复用缓存；安装、更新、卸载时刷新。自定义页面隐藏后复用其运行状态。

`playlists.list(ref, cursor, operation)` 只有两个业务参数；`operation` 由 Host 最后注入，不能将 limit 作为第三个参数。limit/sort 可保存在请求资源的 data 中。Core 对参数数量进行检查，补齐省略的可选位置。

## 唯一歌词结构

```ts
interface CrLyric {
  format: 'crlyric'
  version: 1
  track: ResourceRef
  offsetMs: number
  lines: {
    startTimeMs: number
    endTimeMs?: number
    text: string
    translation?: string // 第一组翻译的兼容纯文本摘要
    romanization?: string // 第一组音译的兼容纯文本摘要
    translations?: LyricSubLine[]
    romanizations?: LyricSubLine[]
    isBackground?: boolean
    isDuet?: boolean
    words?: {
      startTimeMs: number
      endTimeMs: number
      text: string
      translation?: string
      romanization?: string
    }[]
  }[]
  plainText?: string
}

interface LyricSubLine {
  language?: string
  text: string
  words?: LyricWord[]
}
```

Provider `tracks.lyrics` 返回此结构。逐字翻译/音译使用 `translations`/`romanizations` 保留独立时间轴，并同时填写首选内容的 `translation`/`romanization` 纯文本摘要以兼容旧 Host。时间标签不是文本，禁止写入摘要字段。QRC/KRC 解密、YRC/LRC/增强 LRC/TTML 解析都在插件进行；TTML 工具及 XML 解析器作为插件依赖编入单文件，不放入宿主。

插件声明 `contributes.lyricConverters` 并通过 `ctx.lyricConverters.register(id, { parse, export })` 注册。parse 支持明确格式或 auto；export 接收 CrLyric 和目标 lrc、enhanced-lrc、yrc，返回 text、mime、extension。播放端仅映射标准毫秒字段到渲染组件；下载/标签写入不二次转换。无转换插件时本地音频继续播放，非 crlyric 的嵌入歌词不可渲染。

聆澜的网易云/QQ 歌词优先请求 TTML，超时或解析失败回退平台接口，两者都输出 crlyric。

## 插件日志

`ctx.log.debug/info/warn/error` 接受 `message` 和可选的结构化详情：

```ts
ctx.log.info('歌词加载完成', { source: 'tx', lines: 50 })
```

运行时会保持消息和详情为同一条日志，Host 负责脱敏、格式化和长度限制。不要手动把详情 `JSON.stringify` 后拼进消息，也不需要传入 `undefined` 占位参数；长字符串/对象会保留首尾并标记截断，方便开发预览和正式客户端得到一致输出。

## 权限与更新

授权按能力组展示中文名称。权限记录与插件稳定 ID 关联，记录 key、能力名、scope 的指纹，存于应用 userData，不存安装目录。软件升级与插件升级保留相同声明的决定；扩大范围重新申请。撤销立即取消进行中的网络操作、关闭 Socket。拒绝亦持久保存，用户可以在权限面板重新授予；卸载删除记录。

## 音质

Provider.qualities 为从低到高的有序数组，标识没有固有等级。`compareQualities(order,a,b)` 返回 -1/0/1，未知项返回 undefined；`selectQuality(order,available,requested)` 选目标或最近的较低可用项，无较低项时选择最低可用项。最高默认值是数组末项。

## 当前生产接入状态

- 已接入：后台 Node 环境、Surface 页面、网络/Socket、权限弹窗与持久化、搜索/排行/歌单、导入帮助、歌词转换、插件日志、配置和存储、账号基本信息、本地/云歌单服务桥、应用内歌曲分享链接。
- UI 沿用现有歌单/搜索/排行榜组件；平台接口从应用删除，用户安装插件后才获得对应能力。侧栏静态声明不会为每个音源自动生成页面。
- 网络平台可随时变更接口；当前 GitCode 曲库返回 Project not found，需要有效仓库配置。不能把外部服务不可用掩盖为空成功。
- 歌曲分享使用数据型 cerumusic:// 链接，由接收端已安装的插件解析。旧服务端网页播放依赖上传插件，尚未迁移；新客户端不得上传含卡密的 v2 插件。云歌单分享可继续使用不带网页播放的现有接口。
- Guest、任意 UI slot 组合、全局样式、全部播放器/下载/文件/AI 服务并未完整生产接入。capabilities 必须如实返回不可用，不能用空成功值伪装支持。

切歌准备阶段同时获取播放地址、封面与 crlyric，保留上一首展示并显示加载状态；当前请求准备完成后统一提交显示并播放。晚到的旧请求丢弃，封面/歌词不可用时使用空态。
