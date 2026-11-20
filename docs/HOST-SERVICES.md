# 宿主服务与插件扩展

播放拦截内部消息：
- `hooks.register` 仅登记声明过的操作，实际触发时检查授权。
- `hooks.next` 继续当前插件自己的在途调用；过期或重复调用均拒绝。
- `services.app.operations.list` 对应 `ctx.app.operations.list()`，返回可主动调用的操作名称、描述、输入/输出 JSON Schema 和执行权限。目录本身不授权。
- `services.app.call` 对应 `ctx.app.call(name, input, call)`。例如 `track.like` 使用 `library.write`，不是 `library.intercept`；插件不能通过此接口使用钩子的临时私有引用。播放操作使用 `player.control`，下载使用 `downloads.create`，分享使用 `sharing.publish`，公开链接使用 `external.open`，关闭窗口使用 `window.control`。`notification.show` 不需要额外授权，目录中的 `permission` 为 `null`，调用时 `permissionKey` 可为空字符串。`share.create` 返回分享链接对象，其他当前工具成功时返回 `null`；未列出的操作不能调用。
- `hooks.libraryNext` 仅用于声明并获准 `library.intercept` 的收藏钩子。`track.like` 的 `liked` 是目标状态，不是切换指令。私有歌曲引用只在本次调用内有效。
- `hooks.resolveNext` 是 `player.resolve` 钩子内部的继续操作。`await next()` 返回 `{ ok }`，不会返回播放 URL 或音源凭据。首次失败后，整条管线允许一次使用不同输入的重试；成功后不能重试，也不能并行调用 `next`。
- 桌面 v3 的 `ctx.favorites.add(refs, call)` 和 `ctx.favorites.remove(refs, call)` 也经过 `track.like`。两者接受本插件已声明音源的资源引用。加入时先核对整批歌曲都在当前队列；移除时按实际收藏匹配，不要求歌曲仍在队列，未收藏的引用不产生写入。重复引用只处理一次。钩子按歌曲执行，可以只取消其中一首；这不是批量事务。
- 对私有歌曲，其他插件的钩子只拿到本次操作的临时歌曲标识和公开展示信息，不会拿到账户连接、原始 ID 或资源附带数据。需要收藏本插件拥有的私有资源时使用具名接口，不要把临时标识传给 `ctx.app.call`。
- `hooks.searchNext` 是 `search.query` 的内部续调，仅限有 `search.intercept` 授权的插件。可改写 `query`，不能替换用户选择的音源或搜索类别。
- `search.suggest` 共用这一权限和续调接口。输入 `{ query, items: string[] }` 只包含当前输入和本次音源建议，不含本地搜索历史。可以增删或重排建议；不能更改输入词或通过 `preventDefault()` 取消操作。
- `search.results` 在每次单曲或歌单搜索返回后运行。输入为 `{ query, sourceId, page: { kind, items } }`；可按 `item.title` 过滤、重排或合并同类的公开资源。不能取消，也不能改写搜索词、所选音源或页类型。`item.ref.providerId === 'private'` 表示仅本次回调链可用的临时标识，可保留或删除，不可保存、伪造或用于后续查询。分页游标由宿主管理，不传给拦截插件。
- `accounts.current` 和 `accounts.reportExpired` 是账号实现读取当前连接和报告登录过期的内部调用，不是公共宿主服务。
- `hooks.accountNext` 是 `account.switch` 的内部 continuation，使用独立的 `account.intercept` 授权，不接受播放 hook 的调用票据。
- `hooks.windowNext` 是 `window.close` 的内部 continuation，使用 `window.intercept` 授权，只能放行当前窗口关闭请求。
- `hooks.lyricsNext` 使用独立的 `lyrics.intercept` 授权，仅继续当前歌词操作，返回公开的结构化歌词或 `null`。调用票据绑定当前 worker 与操作，不接受其他操作的票据。
- `hooks.downloadsNext` 使用独立的 `downloads.intercept` 授权，仅继续当前下载操作。票据绑定当前 worker 与操作；创建任务只能筛选本次原始歌曲，文件名只能改基本名，不能改变目录或扩展名。
- `hooks.sharingNext` 使用独立的 `sharing.intercept` 授权，只继续当前歌曲分享。返回 `{id,url,template?}` 或 `null`，不传出登录凭据、解析模块源码或上传令牌。
- `hooks.linksNext` 使用独立的 `links.intercept` 授权，只继续当前公开链接；登录回调、插件安装、含凭据链接、后台剪贴板读取不进入管线。
- `hooks.notificationsNext` 使用独立的 `notifications.intercept` 授权，只继续当前软件内文字提示；系统通知、权限与安装确认不受影响。

组件视图：`ui.pages.open`、`ui.pages.close` 仅控制本插件声明的抽屉与弹窗；`ui.views.setState` 将状态推送到同一视图的各个实例。`ctx.ui.views.on` 在 worker 本地订阅 mounted/unmounted。

桌面侧栏：`ui.pages` 中 `mount: "sidebar"` 的条目可以省略 `icon`，也可以提供 `{ "kind": "host", "name": "search" }` 或 `{ "kind": "asset", "resource": "nav.logo" }`。`host` 名称取自 SDK 的 `HOST_ICON_NAMES`；`asset` 指向本插件打包的 SVG、PNG、JPEG、WebP 或 GIF 图片资源，不是文件路径或外链。通用宿主图标跟随侧栏文字颜色，插件图片保留原色。无图标或自定义图片加载失败时，入口仍可用并显示默认图标。冻结的 v2 `sidebarItems` 继续按原格式读取，不要给旧清单新增 `icon` 字段。

### v3 音乐聚合

`music.read` 用于发现和读取音源，`music.control` 用于解析与播放。来源变化通过 `ctx.music.on('sources.changed', handler)` 订阅。

- `music.sources`
- `entries.invalidate`：插件连接、续期或过期状态改变后请求宿主重新判断自己的页面入口。不接受参数，也不能指定其他插件。不代替受保护的数据操作检查。
- `entries.selection`：在激活函数中调用 `await ctx.entries.selection()` 可读取搜索和发现所用的音源，不要求播放或 `player.read` 权限。`selectedSource` 是平台 ID，`selectedProvider` 是实现插件的清单 ID。本地音源的提供者为 `null`，没有选择时两项均为 `null`。冷启动恢复期间读取保存的选择，不保证该插件已经完成激活。
- `entries.selectionChanged`：通过 `ctx.events.on('entries.selectionChanged', listener)` 订阅选择变化，返回取消订阅函数。通知与读取接口使用相同字段，不包含歌曲、账号或凭据。
- `music.search`
- `music.suggest`
- `music.hotSearch`
- `music.tracks.resolve`
- `music.tracks.lyrics`
- `music.tracks.artwork`
- `music.playlists.search`
- `music.playlists.categories`
- `music.playlists.list`
- `music.playlists.get`
- `music.charts.list`
- `music.charts.getTracks`
- `music.importers.list`
- `music.importers.parse`
- `music.play`
- `music.enqueue`

#### 示例：搜索本地音源并播放第一首

这个插件消费已有音源，不注册 provider。在 `source` 模板的 TS 工程中，用下面的内容替换 `ceru.plugin.json` 和 `src/index.ts`。`lookup`、`listen` 是本插件清单里的权限键，不是权限名。只列出音源时，`sources()` 不传 `ServiceCall`，但仍需 `music.read` 授权。搜索、播放要把当前动作收到的 `operation` 和对应权限键一起传给宿主。

```json
{
  "manifest": {
    "manifestVersion": 3,
    "id": "example.local-search-player",
    "name": "搜索本地测试曲目",
    "version": "1.0.0",
    "engines": { "hostApi": "^3.0.0", "logicRuntime": "ceru-js@1" },
    "entry": { "logic": { "module": "logic.main" } },
    "provides": { "actions": [{ "id": "play-first", "title": "播放本地测试曲目" }] },
    "uses": { "permissions": [
      { "key": "lookup", "name": "music.read", "reason": "从本地音源搜索测试曲目" },
      { "key": "listen", "name": "music.control", "reason": "播放用户请求的搜索结果" }
    ] }
  },
  "entries": { "logic.main": "src/index.ts" }
}
```

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(ctx => {
  ctx.actions.register('play-first', async (_input, operation) => {
    const read = await ctx.permissions.requestGroup({ group: 'musicRead' })
    if (read.status !== 'granted') return '未获搜索授权'
    const local = (await ctx.music.sources()).find(source => source.id === 'local' && source.available)
    if (!local) return '本地音源不可用'
    const result = await ctx.music.search(local.id, {
      query: '测试', kinds: ['track'], filters: {}, limit: 10,
    }, { permissionKey: 'lookup', operation })
    const track = result.items.find(item => item.ref.kind === 'track' && item.playable !== false)
    if (!track) return '没有匹配曲目'
    const control = await ctx.permissions.requestGroup({ group: 'musicControl' })
    if (control.status !== 'granted') return '未获播放授权'
    await ctx.music.play(track.ref, { permissionKey: 'listen', operation })
    return track.title
  })
})
```

运行 `npm run build` 和 `npm run validate`。在桌面开发者模式加载产物后，用本地曲库中标题含「测试」的歌曲验证 `play-first`。查询其他已安装音源时，从 `sources()` 的结果取 `id`，播放时原样传回搜索结果的 `ref`，不要用曲名或平台歌曲 ID 重建引用。只想加入队列时，把 `play` 换成 `ctx.music.enqueue([track.ref], 'end', { permissionKey: 'listen', operation })`。

插件负责提供新的数据和业务逻辑。软件已有的请求库、歌单、账号、同步、导入窗口、播放器、图标和静态资源属于 Host，不应在每个插件内重写。

## 宿主服务与权限组

SDK 按领域提供 `account`、`library`、`player`、`queue`、`favorites`、`history`、`downloads`、`files`、`clipboard`、`localMusic`、`settings`、`window`、`hotkeys`、`sharing`、`rooms`、`devices`、`ai`、`tasks` 和 `events`。`ctx.capabilities.list/get` 用于查询正式 Host 是否已经接入某个领域；开发 Host 对尚未连接的软件能力返回 `host-not-connected`，不会伪造结果。

账号服务只返回登录状态、插件隔离用户 ID、昵称和头像句柄。OAuth/OIDC token、Cookie、手机号和邮箱不作为默认插件资料。需要登录时调用软件自己的登录页。

Manifest 仍声明细粒度权限 key，安装与运行时按用户能理解的组展示：网络、账号、歌单读取、歌单修改、播放读取、播放控制、下载、文件、本地音乐、设置、窗口、快捷键、分享、一起听、AI、设备、后台任务和 UI 外观。插件可以调用 `permissions.requestGroup()` 一次申请整组，并通过 `getGranted()` 查看当前授权；动态 origin、用户选择文件和目标歌单仍保持精确 scope。删除、剪贴板读取和凭据明文等高影响操作不能因为同组授权绕过当次用户意图。

## 手写文件与 require

CLI 不是运行时依赖。手写文件直接导出 `exports.manifest`、`exports.activate` 和 `exports.surfaces`，并可使用字面量 `require()` 加载 Host 模块：`ceru`、`@ceru/http`、`@ceru/ui`、`@ceru/socket`、`@ceru/library`、`@ceru/account`、`@ceru/player`、`@ceru/tools`、`@ceru/crypto`、`@ceru/compression`、`@ceru/encoding`、`@ceru/legacy-http`、`lodash`。

## 配置

- `exports.manifest.config` 是构建期默认配置，只允许 JSON 兼容对象。
- `ctx.config.get<T>()` 返回默认配置、签名交付配置与本地开发覆盖值递归合并后的只读对象。
- 后端动态发行使用 `personalization.config`，不改写逻辑 bundle；模板策略默认按构建配置的字段和类型生成。
- `personalization.display` 可覆盖用户看到的名称、描述和作者；插件 ID、版本、权限与贡献点不可由交付配置修改。
- `ceru.plugin.json` 支持内联 `config`，也支持 `@./config.ts` 引用；引用只在构建期执行并展开，发行文件中不保留路径或模块依赖。

手写发行文件不能直接 require npm 包。CLI 或其他 bundler 必须把第三方依赖及本地模块放进同一个 JS。动态 require 和未知 Host 模块会被拒绝；Core 不读取插件作者或用户机器上的 `node_modules`。

## 数据边界

流程固定为：平台数据 → 插件请求/转换/解密 → 标准 JSON → Core 校验 → 软件使用/渲染。软件及 Core 不识别 QRC/KRC/YRC、平台歌曲字段或各平台歌单链接格式。

歌曲使用 `MusicTrack`：`ref` 保存插件/Provider/歌曲标识，`title`、`metadata.artists`、`metadata.album`、`metadata.qualities`、`metadata.durationMs` 为稳定字段。原平台响应保留在插件内部，不塞进 `extensions` 要求软件二次转换。列表使用 `{ items, nextCursor?, totalEstimate? }`；每页 cursor 由插件负责产生，Host 只传回该 cursor，不推断平台分页规则。

歌词 `provider.tracks.lyrics(ref, operation)` 返回：

```json
{
  "version": 1,
  "track": { "pluginId": "example.source", "providerId": "catalog", "kind": "track", "id": "123" },
  "offsetMs": 0,
  "lines": [
    {
      "startTimeMs": 1200,
      "endTimeMs": 2400,
      "text": "你好",
      "translation": "Hello",
      "translations": [
        {
          "language": "en",
          "text": "Hello",
          "words": [
            { "startTimeMs": 1200, "endTimeMs": 1700, "text": "Hel" },
            { "startTimeMs": 1700, "endTimeMs": 2400, "text": "lo" }
          ]
        }
      ],
      "words": [
        { "startTimeMs": 1200, "endTimeMs": 1700, "text": "你" },
        { "startTimeMs": 1700, "endTimeMs": 2400, "text": "好" }
      ]
    }
  ]
}
```

所有时间使用毫秒；行和词按时间排序。逐字翻译/音译放在 `translations`/`romanizations` 的 `words` 中；单数 `translation`/`romanization` 是首选纯文本摘要，不得混入平台时间标签。翻译、罗马音、逐字时间可缺省；只有纯文本时用 `plainText`，无歌词返回空 `lines`。Core 拒绝格式错误，不替插件猜测单位或解密。开发 Host 已在 Provider/导入器结果进入 UI 前调用统一数据校验。

歌单导入 API 接收标准歌曲列表与目标引用。`createHostLibraryBridge`（Core 的 `host-library` 子路径）提供 Core 校验和委托流程：校验数据 → 确认授权/目标 → 调用已有本地或云歌单服务 → 成功后触发既有界面刷新事件。具体账号、存储、去重事务和刷新回调由软件绑定；它没有另一份歌单数据库。失败不会发出成功刷新。插件需要提示时调用 `ctx.ui.toast({ message: '导入完成', level: 'success' })`。

正式 UI 保留当前歌单页右上角入口、平台选择、导入弹窗和交互；只把固定的平台选项与取数分支接成贡献点，不重写软件布局。CLI 的独立预览是调试工具，不是正式软件 UI 的替代品。

## HTTP：宿主 Axios，插件类型代理

```ts
export default definePlugin((ctx) => {
  const http = ctx.http.create({
    baseURL: 'https://example.com',
    permissionKey: 'catalog',
    requestPermission: true,
  })

  ctx.actions.register('search', async (input, operation) => {
    return http.get<{ items: { id: string; title: string }[] }>('/songs', {
      query: { q: String(input) },
      operation,
    })
  })
})
```

`get<T>` / `post<T>` 返回类型化数据；`request<T>` 返回 `{ status, headers, data }`。支持 `query`、`json`、`form`、`body`、默认请求头和按需权限申请。`json/form/body` 只能选一种。`throwHttpErrors: false` 可让音源处理 429、403 等平台状态。

Axios 只安装在 Host，插件发行文件不包含 Axios。授予 `network.request` 后可访问任意公网 HTTP(S) 地址，不维护 origin/path 白名单；局域网、localhost 和其他私网地址另需 `network.private`。Host 仍限制危险连接头、请求体/响应体大小和调试器自身端口。默认不自动重试，避免重复写入或加重音源限流。HTTP 默认超时 15 秒，文本响应 2 MiB；操作取消会中止开发 Host 的上游请求。

迁移原有 `httpFetch(...).promise` 代码时，可用 `@shiqianjiang/ceru-plugin-sdk/legacy-http` 的 `createLegacyHttpBridge(ctx)`。它适配 form、JSON5/JSONP、旧返回结构、顶层调用串行化、取消检查与权限申请。旧 HTTP 地址会升级为 HTTPS；不支持 HTTPS 的旧平台接口需更新。新插件优先使用 `ctx.http.create`。

## 实时连接：Socket.IO 与 WebSocket

```ts
const socket = await ctx.sockets.connect({
  kind: 'socket.io', // 原生协议使用 websocket
  url: 'https://example.com',
  permissionKey: 'realtime',
  operation,
})

ctx.effects.add(
  socket.on('connect', () => {
    void socket.emit('subscribe', { channel: 'status' })
  }),
)
ctx.effects.add(
  socket.on<[string]>('status', ([status]) => {
    ctx.log.info(status)
  }),
)
```

Manifest 中声明一次 `network.socket` 即可连接任意公网 Socket.IO 或 WebSocket 地址；私网地址仍需 `network.private`。原生 WebSocket 支持 `ws://`/`wss://`，Socket.IO 支持 `http://`/`https://`，当前开发 Host 使用 WebSocket transport，不包含 polling transport。Socket.IO 是事件协议，不等同于原生 WebSocket。

Socket.IO/`ws` 库只在 Host 中。插件获得 `on`、`emit`、`send`、`disconnect`。原生 WebSocket 收到文本消息；Socket.IO 回调收到参数数组。当前 JSON 通道不传输二进制帧，不提供 ack 回调。开发 Host 最多 8 个连接，消息 64 KiB，事件队列 256 条，每连接每秒最多发送 100 条；Socket.IO 最多重连 5 次，原生 WebSocket 不自动重连。重载、停止、撤销权限会关闭连接。

## 播放解析：返回直链

`provider.tracks.resolve()` 直接返回 `{ ok: true, url, expiresAt?, requestHeaders? }`。软件播放器使用该地址，不创建代理租约、不经过 Core 转发，也不按媒体域名再次申请权限。需要防盗链或认证请求头时，插件通过 `requestHeaders` 声明；Host 只对该完整临时 URL 附加这些值，不把它们发送给渲染页面，并在到期后清除。插件负责确保地址可播放并在需要时提供到期时间；失败返回标准 `MusicFault`，可用 `recovery.mode` 表达限流、卡密过期和是否暂停自动换源。分享协议不会自动公开这个播放直链或请求头。

## 歌单导入：注册菜单项，复用软件界面

Manifest：

```json
{
  "provides": {
    "importers": [
      {
        "id": "my-platform",
        "title": "从我的平台导入",
        "placeholder": "歌单链接或 ID"
      }
    ]
  }
}
```

后台只实现取数：

```ts
ctx.effects.add(
  ctx.playlistImporters.register('my-platform', {
    async getTracks({ value, cursor, limit }, operation) {
      return loadPlatformPlaylist(value, cursor, limit, operation)
    },
  }),
)

// 从插件其他动作打开同一个 Host 窗口，可预填链接。
await ctx.ui.playlistImport.open({
  importerId: 'my-platform',
  initialValue: playlistUrl,
})
```

Host 把声明追加到“歌单 → 右上角导入”的选项，点击后使用现有导入窗口。输入校验、预览、连续分页、目标本地/云歌单选择、去重、进度、重试、账号检查、权限和保存均由 Host 处理。插件不提交 Vue 组件，也不建立自己的歌单数据库。

SDK 还提供 `ctx.library.playlists.list/getTracks/import`，供确实需要直接操作歌单的插件使用。`library.read/write` 的授权范围、用户选择的目标和当前账号均须在 Host 验证；`requestId` 用于同批重试去重。分页导入应由 Host 保留任务上下文，不能每页重新创建一个歌单。

## 首页、Slot 与样式

首页由插件贡献决定是否出现业务页签：

```json
{
  "ui": {
    "homeSections": [
      { "id": "catalogs", "title": "歌单", "kind": "playlists", "providerIds": ["music"] },
      { "id": "charts", "title": "排行榜", "kind": "charts", "providerIds": ["music"] }
    ]
  }
}
```

没有启用插件贡献 `playlists`/`charts` 时，正式 Host 不显示对应页签。内置类型复用当前软件的页面和交互；自定义首页使用 `ui.pages` 中 `mount: "home-tab"` 的页面声明。

`ui.slots` 可以向稳定 Slot 贡献隔离 Surface，模式为 `append`、`prepend`、`wrap` 或 `replace`。Host 决定组合顺序、卸载清理和冲突处理；插件 JavaScript不能直接访问 Electron renderer DOM。`styles` 的 `surface`/`slot` 作用域由 Host 隔离，全局 `application` CSS 需要 `ui.styles.global` 权限，并禁止远程 `@import`、外部 `url()` 和可执行 CSS。这样可定制现有 UI，同时保持软件当前布局为默认体验。

## 当前接入状态

本次实现了 SDK 类型、manifest 校验、开发运行环境的 HTTP / Socket 网络服务、导入器注册与统一导入预览窗口。独立 CLI 不是已运行的澜音桌面应用，没有用户登录和软件歌单数据库。它会明确拒绝 `library.playlists.*`，不会伪造保存成功，也不会创建替代歌单库。

桌面宿主复用以下已有服务，开发宿主不模拟用户的真实数据：

| 扩展点                          | 现有软件能力                                                             |
| ------------------------------- | ------------------------------------------------------------------------ |
| `provides.importers` | `src/renderer/src/views/music/songlist.vue` 的导入菜单和网络导入弹窗     |
| 本地歌单列表、读取、写入        | `src/renderer/src/api/songList.ts`，通过 `songlist:*` IPC 使用现有存储   |
| 云歌单                          | `src/renderer/src/api/cloudSongList.ts` 与既有云同步流程，使用软件登录态 |
| 本地/云目标选择及进度           | 软件现有 UI，由 Host 持有，不交给插件实现                                |

本地桌面候选使用各自版本的 core 和 worker，并共享文件、授权及宿主服务。独立运行的 CLI 不能替代桌面宿主的集成验收。

## v3 RPC 方法表

开发宿主和桌面宿主应先通过契约分发器鉴权，再调用相应服务。标为内部的方法由运行时包装调用，不是插件的顶层 API。

| RPC | 所需权限 |
| --- | --- |
| `services.capabilities.list` | 无独立权限；对象归属仍由宿主校验 |
| `services.capabilities.get` | 无独立权限；对象归属仍由宿主校验 |
| `services.account.getSession` | account.profile |
| `services.account.getProfile` | account.profile |
| `services.account.openLogin` | 无独立权限；对象归属仍由宿主校验 |
| `services.app.getInfo` | 无独立权限；对象归属仍由宿主校验 |
| `services.app.openSettings` | 无独立权限；对象归属仍由宿主校验 |
| `services.app.openExternal` | external.open |
| `services.player.getState` | player.read |
| `services.player.play` | player.control |
| `services.player.pause` | player.control |
| `services.player.next` | player.control |
| `services.player.previous` | player.control |
| `services.player.seek` | player.control |
| `services.player.setVolume` | player.control |
| `services.player.setMode` | player.control |
| `services.queue.get` | player.read |
| `services.queue.append` | player.control |
| `services.queue.replace` | player.control |
| `services.queue.remove` | player.control |
| `services.queue.reorder` | player.control |
| `services.favorites.contains` | library.read |
| `services.favorites.add` | library.write |
| `services.favorites.remove` | library.write |
| `services.history.list` | player.read |
| `services.downloads.list` | downloads.manage |
| `services.downloads.create` | downloads.create |
| `services.downloads.pause` | downloads.manage |
| `services.downloads.resume` | downloads.manage |
| `services.downloads.cancel` | downloads.manage |
| `services.downloads.retry` | downloads.manage |
| `services.downloads.reveal` | downloads.manage |
| `services.files.pick` | 无独立权限；对象归属仍由宿主校验 |
| `services.files.pickDirectory` | 无独立权限；对象归属仍由宿主校验 |
| `services.files.readText` | files.read |
| `services.files.readBase64` | files.read |
| `services.files.saveText` | 无独立权限；对象归属仍由宿主校验 |
| `services.files.writeText` | files.write |
| `services.clipboard.readText` | clipboard.read |
| `services.clipboard.writeText` | clipboard.write |
| `services.localMusic.list` | localMusic.read |
| `services.localMusic.scan` | localMusic.read |
| `services.localMusic.getTags` | localMusic.read |
| `services.localMusic.writeTags` | localMusic.write |
| `services.settings.get` | settings.read |
| `services.settings.update` | settings.write |
| `services.window.control` | window.control |
| `services.hotkeys.register` | hotkeys.register |
| `services.hotkeys.unregister`（内部） | 无独立权限；对象归属仍由宿主校验 |
| `services.sharing.create` | sharing.publish |
| `services.sharing.revoke` | sharing.revoke |
| `services.sharing.resolve` | 无独立权限；对象归属仍由宿主校验 |
| `services.rooms.getState` | rooms.read |
| `services.rooms.join` | rooms.control |
| `services.rooms.leave` | rooms.control |
| `services.rooms.requestTrack` | rooms.control |
| `services.devices.list` | devices.control |
| `services.devices.select` | devices.control |
| `services.ai.generate` | ai.use |
| `services.tasks.schedule` | background.run |
| `services.tasks.cancel` | background.run |
| `library.playlists.list` | library.read |
| `library.playlists.getTracks` | library.read |
| `library.playlists.import` | library.write |
| `library.playlists.removeTracks` | library.delete |
| `library.playlists.clearPlaylist` | library.delete |
| `config.get` | 无独立权限；对象归属仍由宿主校验 |
| `http.request` | network.request |
| `server.start`（内部，由 ctx.server.serve 调用） | network.serve；局域网监听另外需要 network.serve.lan |
| `server.stop`（内部） | 无，仅关闭自己的服务 |
| `permissions.query` | 无独立权限；对象归属仍由宿主校验 |
| `permissions.request` | 无独立权限；对象归属仍由宿主校验 |
| `permissions.getGranted` | 无独立权限；对象归属仍由宿主校验 |
| `permissions.requestGroup` | 无独立权限；对象归属仍由宿主校验 |
| `sockets.connect`（内部） | network.socket |
| `sockets.send`（内部） | 无独立权限；对象归属仍由宿主校验 |
| `sockets.disconnect`（内部） | 无独立权限；对象归属仍由宿主校验 |
| `storage.get` | 无独立权限；对象归属仍由宿主校验 |
| `storage.set` | 无独立权限；对象归属仍由宿主校验 |
| `storage.delete` | 无独立权限；对象归属仍由宿主校验 |
| `guests.list` | 无独立权限；对象归属仍由宿主校验 |
| `guests.import` | guests.manage |
| `guests.select` | guests.manage |
| `guests.remove` | guests.manage |
| `guests.invoke` | guests.run |
| `ui.dialogs.confirm` | 无独立权限；对象归属仍由宿主校验 |
| `ui.dialogs.prompt` | 无独立权限；对象归属仍由宿主校验 |
| `ui.dialogs.pickPlaylist` | 无独立权限；对象归属仍由宿主校验 |
| `ui.navigation.open` | 无独立权限；对象归属仍由宿主校验 |

`router.current` 返回主窗口的公开具名路由。`router.push` 仅允许内置具名目标及本插件已声明的页面。监听与守卫见 [路由指南](ROUTER.md)。

`accounts.form` 是登录期间使用的内部 RPC。插件通过 `ctx.accounts.register(id, implementation)` 注册已声明账号，在 login 回调中调用 `auth.form({fields})`；只有用户从宿主账号菜单发起的登录才能显示表单。取消返回 `null`，不会创建子账号。不要在日志、状态或存储中保留表单值。

扫码账号在 `provides.accounts[].loginMethods` 声明 `qrcode`。登录回调按 `method` 分支，返回 `auth.qrcode({ image, expiresInMs, poll })`（内部 RPC：`accounts.qrcode`）。image 为不大于 1024×1024、编码后不超过 350000 字符的 PNG data URL；远程图片请用已授权的网络接口取得后编码，不要传 URL。poll 接收可取消的 operation，返回 waiting、scanned、expired 或 done；done 必须携带 credential，若用于 HTTP 可同时给出 binding。例：

```ts
async login({ method, auth }, operation) {
  if (method !== 'qrcode') return null
  const code = await platform.createCode(operation)
  return auth.qrcode({
    image: code.pngDataUrl, expiresInMs: 120_000,
    poll: pollOperation => platform.checkCode(code.id, pollOperation),
  })
}
```

platform 为插件自有的授权平台客户端。宿主每次只轮询一次，间隔至少一秒。已扫码不代表登录；用户确认且 poll 返回 done 后才保存账号。过期时宿主重新调用 login，请每次申请新二维码。取消或插件停用终止本次登录。总时限为五分钟，最多八次申请，不进行无限自动刷新。

`auth.qrcode` 可额外指定 `view: 'login'`，引用本插件声明的 `component` 或 `web` 视图。省略时使用现有宿主模板。软件保留弹窗外壳、标题、关闭按钮和动画，插件只设计内部 HTML/CSS/UI。视图状态 `login` 包含二维码、`waiting/scanned` 与 `expiresAt`，不含凭据或票据；组件调用 `bridge.close()`、DOM 调用 `ctx.close()` 取消。隔离视图同步宿主 `--td-*`、`--ceru-*` 样式变量。完整示例见 [账号开发指南](ACCOUNTS.md) 和 `account-qrcode` JS/TS 模板。

**系统浏览器 OAuth 登录**（内部 RPC：`accounts.oauth`）：账号声明 `loginMethods: ['oauth']`，申请 `network.request` 和 `credentials.use`，后者的 `scope.origins` 必须包含平台 HTTPS 来源。以下分支放在 `ctx.accounts.register` 的 `login` 方法内：

```ts
if (method === 'oauth') return auth.oauth({
  authorizationUrl: 'https://accounts.example.org/authorize',
  tokenUrl: 'https://accounts.example.org/token',
  clientId: 'ceru-desktop', scopes: ['profile'],
})
```

**独立网页登录**（内部 RPC：`accounts.browser`）：声明 `loginMethods: ['browser']`，申请 `network.request`、按完整主机名限定的 `credentials.capture`（`scope.domains`）及按精确 HTTPS 来源限定的 `credentials.use`（`scope.origins`）。在 login 中返回 `auth.browser({url:'https://music.example.org/login',until:{cookie:'session_id'}})`。每次创建新的临时窗口分区，不共享已有登录状态，只接受同一来源请求、指定名字的 host-only、Secure、根路径 Cookie。关闭窗口取消登录。仅适用于可在一个 HTTPS 来源内完成登录的平台；需要第三方授权跳转时使用系统浏览器 OAuth。插件原样返回宿主回执，再用 `account.credential` 请求资料。

**平台音乐库**：在账号声明的 `capabilities` 中列出 `likes`、`playlists`、`history` 或 `recommend`，并在 `providers` 中绑定音源。每项实现 `list(account, {cursor, limit}, operation)`，返回 `{items, nextCursor?}`；歌单返回 `MusicPlaylist`，其余返回 `MusicTrack`。资源属于本插件的绑定音源，不能指定别的子账号；宿主会补全当前 `connectionId`。切换、失效、停用或重新登录后旧请求不能复用。本页的游标必须前进，返回数量不能超过 `limit`。打开歌单后其 `playlists.get` 同样应使用当前账号连接。

在 `likes.set(account, {ref, liked}, operation)` 中执行幂等的收藏或取消收藏。用户在“我喜欢”页为该子账号开启“同步点赞”后，播放栏或歌曲菜单成功修改本地收藏时才同步；关闭同步不改变已有收藏。平台失败不回滚本地操作。`connected-library` 的 TS/JS 模板含可离线运行的子账号数据与收藏实现，演示音源不提供真实歌曲地址。

平台需支持公共客户端、授权码、PKCE S256 和 Bearer 令牌。授权、交换和附加凭据的资源仅支持同一 HTTPS 来源，不接受端点中的查询、片段、密码、令牌交换重定向或客户端密钥。平台注册回调为 `ceru://oauth/callback/` 加规范化来源（`new URL(authorizationUrl).origin`）的 SHA-256 小写十六进制摘要。插件应原样返回 `auth.oauth()` 的结果；成功结果只有一次性 `completionId`，不是 access token。取消或拒绝返回 `null`。在 `profile` 中使用宿主传入的 `account.credential` 访问已授权来源，不要把凭据放在 URL、日志或界面里。

绑定账号的 provider 收到当前子账号的 `operation.connectionId`；没有子账号时不传该字段。一个 provider 只能绑定一种账号。`credentials.get` 对应 `ctx.credentials.get(connectionId)`：需要已授权的 `credentials.use`，只能取得本插件已保存连接的不透明引用，不能取得凭据字符串。

带凭据请求：登录实现返回 `{credential, binding: {origin: "https://music.example.org", sendAs: "bearer"}}`；也支持 `sendAs: "cookie"`。`credentials.use` 的 `scope.origins` 明确列出允许使用凭据的 HTTPS 来源（包含非默认端口）。请求仍需 `network.request`。宿主附加请求头并拒绝跨来源重定向；插件不能同时指定 Cookie 或 Authorization，也不会收到 Set-Cookie 响应头。未绑定的旧凭据不能默默用于联网。`account.changed` 与 `account.expired` 只向该账号所属插件投递账号标识，不含凭据。
| `ui.playlistImport.open` | 无独立权限；对象归属仍由宿主校验 |
| `ui.pluginUpdate.request` | 无独立权限；对象归属仍由宿主校验 |
| `ui.notifications.show` | notifications.system |
| `ui.progress.create` | 无独立权限；对象归属仍由宿主校验 |
| `ui.progress.update` | 无独立权限；对象归属仍由宿主校验 |
| `ui.progress.close` | 无独立权限；对象归属仍由宿主校验 |
| `operations.cancel`（内部） | 无独立权限；对象归属仍由宿主校验 |
| `surface.invoke`（内部） | 无独立权限；对象归属仍由宿主校验 |

## v3 插件间服务

| RPC | 用途与权限 |
| --- | --- |
| `plugins.registerService` | 只能注册本清单声明的服务和方法；停用时撤销。 |
| `plugins.use` | 只解析调用者声明的依赖和 semver 范围；需 `services.consume`。 |
| `plugins.list` | 只列出当前调用者可用的已声明服务；同一权限。 |
| `plugins.invoke` | 每次重新检查权限、版本和服务所有者；仅 JSON，默认 30 秒，不允许服务嵌套。 |

作者使用 `ctx.services.register` 和 `ctx.plugins.use/list/on`，不直接发送 RPC。处理函数的 `callerPluginId` 由宿主提供。

### 离线测试依赖方

在作者工程根目录的 `ceru.config.json` 设置服务的固定 JSON 返回值（仅供 CLI 测试，不授予桌面权限）：

```json
{"mockServices":[{"pluginId":"example.catalog","service":"lookup","version":"1.2.0","returns":{"find":{"title":"示例歌曲"}}}]}
```

假设清单声明了 `services.consume` 权限、对 `example.catalog` 的 `lookup ^1.0` 依赖及 `lookup.song` 动作。在逻辑入口注册动作：

```js
ctx.actions.register('lookup.song', async input => {
  const catalog = await ctx.plugins.use('example.catalog', 'lookup')
  return catalog ? catalog.find(input) : null
})
```

在 `tests/services.json` 写出预期结果，然后在该工程运行 `npx --no-install ceru-plugin test-services`。也可通过 `--config` 指定其他场景文件。

```json
[
  {"name":"查询成功","action":"lookup.song","input":{"id":"1"},"granted":true,"expect":{"title":"示例歌曲"}},
  {"name":"拒绝授权","action":"lookup.song","input":{"id":"1"},"granted":false,"error":"Permission denied: services.consume"}
]
```

每个场景用新的 worker 执行构建后的插件。`granted` 只模拟清单已声明的服务消费权限；`expect` 比较完整 JSON，`error` 比较动作抛出的完整消息，两者只能选一个。缺少兼容的硬依赖会在激活前失败；要测试可选依赖离线时的处理，声明 `optional: true` 并从 `mockServices` 移除对应服务。返回值是静态样例，不启动提供方插件、不验证网络业务或桌面启停事件；这些场景请在桌面开发者模式中加载真实的两个插件验证。

## v3 播放和页面事件

通过 `ctx.events.on(name, listener)` 订阅，返回值用于取消订阅。宿主对每次派发检查当前授权；未授权或已撤权时不派发，也不弹出授权窗口。冻结的 v2 环境不接收这些新增事件。

| 事件 | 清单权限 | 数据 |
| --- | --- | --- |
| `player.progress` | `player.read` | `{ positionMs, durationMs }`。本地音频实际推进时至多每秒一次，未知时长为 0。 |
| `track.started` | `player.read` | `{ track: { title, artist, source } }`。仅选中而未播放不会触发，暂停后继续不重复触发。 |
| `track.finished` | `player.read` | `{ track, playedMs, completed }`。结束或换歌时结算，跳过、暂停、缓冲的时间不算。实际收听超过曲长的一半或 240000 毫秒才标为完成；未知曲长只用四分钟阈值。 |
| `route.changed` | `route.read` | `{ from, to }`。成功切换路径后只给路由名，未具名为 null。不暴露路径、搜索条件、查询参数或账号。 |

歌曲事件不携带文件路径、试听地址、凭据或完整资源引用。
<!-- Operation listener registration is an internal RPC, implemented by ctx.events.on. -->
`events.register`：操作事件订阅与注销的内部通道，不作为可调用的公共方法。
