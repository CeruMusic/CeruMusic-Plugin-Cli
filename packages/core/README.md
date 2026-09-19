# @shiqianjiang/ceru-plugin-core

Ceru Music v2 的 Host 无关 Core。它读取单文件 artifact，校验 manifest，接收插件注册的 Provider、Action 和歌单 Importer，并在结果返回应用前执行统一的数据契约校验。

Core 不实现 Electron、播放器、歌单数据库或账号登录。宿主通过 `CoreHostAdapter` 提供 sandbox、HTTP、权限和 UI 服务；CeruMusic 的 Electron Host 与开发 Host 使用同一边界。

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
