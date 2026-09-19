# @shiqianjiang/ceru-plugin-core

Ceru Music v2 的 Host 无关 Core。它读取单文件 artifact，校验 manifest，接收插件注册的 Provider、Action 和歌单 Importer，并在结果返回应用前执行统一的数据契约校验。

Core 提供 `./node` 纯 Node worker 运行环境、`./electron` 可见页面沙箱、`./network` HTTP 代理和 `./sockets` 连接管理。后台逻辑不依赖 DOM；可见页面单独运行。播放器、歌单、账号和授权界面由澜音现有服务提供。

Node VM 内只运行本领域的 SDK 与打包后的插件，跨边界使用 JSON，删除原生桥引用并禁用字符串代码生成；worker 设内存、运行时限和消息额度。公网请求由用户按组授权，内网另行授权。此隔离不应宣称是针对所有 V8 漏洞的安全保证。

歌词统一使用 SDK `CrLyric`（`format: 'crlyric'`、`version: 1`、毫秒时间轴）。`lyricConverters` 插件负责导入各种歌词和导出 LRC/增强 LRC/YRC；Core 不包含歌词解析器。音质顺序由 Provider 的 `qualities` 数组定义，从低到高。

```ts
const core = await PluginCore.load(bytes, {
  host: {
    activate: (artifact, context) => sandbox.run(artifact, context),
    request: (request) => hostHttp.request(request),
  },
})

await core.invokeProvider('tx', 'tracks.search', [request], operation)
await core.importPlaylist('import.tx', value, undefined, 100, operation)
```

插件仍然只需要导出 `manifest`、`activate` 和可选的 `surfaces`。Core 不要求使用 CLI。
