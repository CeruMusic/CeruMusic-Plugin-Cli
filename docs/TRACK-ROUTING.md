# 公共歌曲路由与音质大小（0.3.6）

歌曲来源与播放实现可以不同。例如账号插件读取个人歌单，用户选择另一个同平台音源解析播放。Host 只处理标准引用和路由，平台账号、歌曲权益与音质枚举转换仍由插件实现。

```ts
import type { MusicTrack } from '@shiqianjiang/ceru-plugin-sdk'

const song: MusicTrack = {
  ref: {
    pluginId: ctx.plugin.id,
    providerId: 'wy',
    kind: 'track',
    id: '12345', // 同一平台不同插件认可的公共歌曲 ID
    scope: 'provider',
  },
  title: '示例歌曲',
  capabilities: ['music.resolve@1'],
  metadata: {
    artists: ['示例歌手'],
    qualities: ['128k', '320k', 'flac'],
    qualitySizes: { '128k': 3600123, '320k': 9000456, flac: 28000789 },
  },
}
```

- `scope: 'provider'` 仅用于公共歌曲 ID；Host 的播放、下载、歌词按各自配置的实现路由。跨插件时重建目标 `pluginId`，只传 `providerId/kind/id/scope`，不传原插件的 `data`。
- 不写 `scope` 时保持原插件归属；服务器私有库、账号相关 ID 使用这个默认行为，并通过 `connectionId` 区分连接。`scope: 'provider'` 不能与 `connectionId` 同时使用。个人歌单本身仍归原插件，只有其中公共歌曲可以声明 provider scope。
- `metadata.qualities` 描述歌曲实际存在的格式；`qualitySizes` 是相同标识对应的真实正整数**字节数**，未知就省略，不能根据时长估算或填入 MB 字符串。`qualities`、manifest 的 `qualities` 和 `resolve(ref, quality)` 使用同一套标识。
- 网易云示例：`standard → 128k`、`higher → 192k`、`exhigh → 320k`、`lossless → flac`、`hires → hires`、`jyeffect → atmos`、`sky → atmos_plus`、`jymaster → master`。平台私有枚举只在插件内部转换；不为不存在的格式伪造大小。
- 内容读取账号的会员级别不应缩减所有其他解析器可见的歌曲格式；账号解析器在实际 `resolve` 时自行验证播放权限。Host 下载菜单同时参考歌曲格式和所选播放实现支持的格式。

Host 可用 `retargetTrackRef(ref, targetManifestId)` 完成引用重建和私有资源保护。缓存必须在选择解析器后生成键，并区分实际插件、平台、连接、歌曲和音质；更换播放实现不能继续复用旧实现的缓存。

能力分配中的“播放解析”对应 `ctx.providers.register(providerId, { tracks: { resolve } })`。同一平台所有实际注册此方法的插件都列在这一项下；选择决定公共歌曲的播放与下载解析器。`ctx.actions.register('play', ...)`、扫码、刷新和渲染等命令属于插件自身，不能凭同名就在插件之间切换。Host 仅对已经接入的公共协议与扩展动作提供分配入口；插件按钮仍调用所属插件的命令，再通过 `ctx.player.play` 进入宿主播放链路。

启用插件只增加可用实现，不覆盖已有音源或单项能力选择。自动分配按每项能力计算：先使用该项明确指定的实现，再使用平台首选中支持该能力的实现，缺少时由其他已启用插件补齐。因此账号插件可以增加登录、个人歌单等功能，同时保留原音源的搜索、排行榜和评论。私有资源仍绑定原插件，不能为了补位把连接数据交给其他插件。

澜音的能力目录读取完整 `manifest.contributes`、界面/分享模块声明以及运行时注册的 Provider 方法、Action、导入器和歌词转换器。账号、首页自定义栏目、歌单页区块即使只有一个插件提供也会显示；插件内操作保留原归属，不作为音源互换选项。目录区分“已声明”“已注册”和缺少注册或界面引用的情况。新贡献类型和新注册集合保留原标识与来源，明确标注当前版本尚未识别，不能静默过滤或假装已经支持。

插件调用 `ctx.ui.toast`、网络或播放器等宿主 API，是使用宿主服务；将业务功能提供给澜音时，仍应通过对应的贡献声明和注册接口暴露。填写插件自有的 `title`、`description`，由宿主展示；不用为了出现在目录里仿照某个现有插件的函数名。

这项接口需要支持该路由与元数据转换的 Host；单独更新 SDK 不会替旧桌面端增加实现。旧队列中未声明 scope 的引用仍按原归属处理，重新从插件获取歌曲即可使用新的公共引用。
