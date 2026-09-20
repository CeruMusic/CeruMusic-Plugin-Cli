# 宿主服务与插件扩展

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
      "words": [
        { "startTimeMs": 1200, "endTimeMs": 1700, "text": "你" },
        { "startTimeMs": 1700, "endTimeMs": 2400, "text": "好" }
      ]
    }
  ]
}
```

所有时间使用毫秒；行和词按时间排序。翻译、罗马音、逐字时间可缺省；只有纯文本时用 `plainText`，无歌词返回空 `lines`。Core 拒绝格式错误，不替插件猜测单位或解密。开发 Host 已在 Provider/导入器结果进入 UI 前调用统一数据校验。

歌单导入 API 接收标准歌曲列表与目标引用。`createHostLibraryBridge`（SDK 的 `host-library` 子路径）提供 Core 校验和委托流程：校验数据 → 确认授权/目标 → 调用已有本地或云歌单服务 → 成功后触发既有界面刷新事件。具体账号、存储、去重事务和刷新回调由软件绑定；它没有另一份歌单数据库。失败不会发出成功刷新。插件需要提示时调用 `ctx.ui.toast({ message: '导入完成', level: 'success' })`。

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
  "contributes": {
    "playlistImporters": [
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
  "contributes": {
    "homeSections": [
      { "id": "catalogs", "title": "歌单", "kind": "playlists", "providerIds": ["music"] },
      { "id": "charts", "title": "排行榜", "kind": "charts", "providerIds": ["music"] }
    ]
  }
}
```

没有启用插件贡献 `playlists`/`charts` 时，正式 Host 不显示对应页签。内置类型复用当前软件的页面和交互；`custom` 类型必须引用一个插件 Surface。

`uiExtensions` 可以向稳定 Slot 贡献隔离 Surface，模式为 `append`、`prepend`、`wrap` 或 `replace`。Host 决定组合顺序、卸载清理和冲突处理；插件 JavaScript不能直接访问 Electron renderer DOM。`styles` 的 `surface`/`slot` 作用域由 Host 隔离，全局 `application` CSS 需要 `ui.styles.global` 权限，并禁止远程 `@import`、外部 `url()` 和可执行 CSS。这样可定制现有 UI，同时保持软件当前布局为默认体验。

## 当前接入状态

本次实现了 SDK 类型、manifest 校验、开发运行环境的 HTTP / Socket 网络服务、导入器注册与统一导入预览窗口。独立 CLI 不是已运行的澜音桌面应用，没有用户登录和软件歌单数据库。它会明确拒绝 `library.playlists.*`，不会伪造保存成功，也不会创建替代歌单库。

澜音正式 Host 尚需把这些 RPC 接到软件已有服务：

| 扩展点                          | 现有软件能力                                                             |
| ------------------------------- | ------------------------------------------------------------------------ |
| `contributes.playlistImporters` | `src/renderer/src/views/music/songlist.vue` 的导入菜单和网络导入弹窗     |
| 本地歌单列表、读取、写入        | `src/renderer/src/api/songList.ts`，通过 `songlist:*` IPC 使用现有存储   |
| 云歌单                          | `src/renderer/src/api/cloudSongList.ts` 与既有云同步流程，使用软件登录态 |
| 本地/云目标选择及进度           | 软件现有 UI，由 Host 持有，不交给插件实现                                |

这张映射是正式 Host 的接线要求，不代表上述软件页面已完成 v2 插件接入。本次未修改桌面应用的生产插件加载器。
