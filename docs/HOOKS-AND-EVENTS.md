# 桌面 v3 候选：播放与队列拦截

当前开发版本接入以下操作：

| 操作 | 输入 | 示例 |
| --- | --- | --- |
| `player.play` | 单首歌曲摘要、可选队列索引 | 取消带演示前缀的点播 |
| `player.resolve` | `{ track, quality }`；空音质表示使用音源默认值 | 首次解析失败后用备用音源的公开歌曲引用重试 |
| `queue.add` | 歌曲摘要数组、位置 `next` 或 `end` | 把指定歌曲放到下一首 |
| `queue.shuffle` | `{ items }`，宿主本轮随机生成的播放顺序 | 返回 `{ items: [...op.input.items].reverse() }` 可替换本轮顺序，不改界面队列。每项必须原样保留，重复项次数不能变；不能取消。超过 1000 首或传输上限时保留本地随机顺序。 |
| `playlist.create` | `{ name, location }`，需要 `library.intercept` | 歌单页新建时，可取消或返回 `{ ...op.input, name: '新名称' }`。位置不可改写，描述不会发给插件。此入口创建的是本地歌单，不会上传至云端。 |
| `playlist.delete` | `{ playlist: { id, name, location } }`，需要 `library.intercept` | 本地、云端或双端删除前触发。可取消或放行；歌单 ID、名称和删除范围均不能改写。云端 ID 等内部同步元数据不会发送给插件。 |
| `playlist.export` | `{ playlist: { id, name, location }, format }`，需要 `library.intercept` | 歌单菜单导出前触发，可取消或在 `cmpl`（默认压缩格式）、`cpl`（未压缩格式）之间切换。不能更换歌单、修改歌曲或指定保存路径。桌面候选已验证取消不生成文件，两种格式的实际保存文件均可解密读回。 |
| `playlist.import` | `{ value, importerId? }`，需要 `library.intercept` | 网络歌单导入窗口提交后、读取和建单之前触发。可取消，或改写链接/ID 与导入器。`importerId` 为公开的 `manifest.id:导入器id`，必须对应当前启用的导入器；省略时保留用户原先的选择。输入最长 4096 字符，不接受本地路径或 `file:` URL。宿主仍负责分页、写入和失败清理。文件导入以及 `ctx.library.playlists.import({items,...})` 不属于此解析入口；后者使用歌单歌曲增删管线。 |
| `playlist.addTracks`、`playlist.removeTracks` | `{ playlist, tracks }`，需要 `library.intercept` | 用 `await next({ ...op.input, tracks: op.input.tracks.filter(...) })` 筛选或重排本次选中的歌曲；用 `op.preventDefault()` 取消整次操作。不能更换目标歌单、扩大范围、重复歌曲或引入其他歌曲。歌曲元数据以宿主原值为准，私有引用只在本次操作内有效。适用于单首和批量菜单，以及插件的歌单写入调用。v3 调用者添加使用 `ctx.library.playlists.import`（`library.write`），移除使用 `ctx.library.playlists.removeTracks`（`library.delete`）。冻结 v2 `0.3.16` 的 worker 支持添加，但实际未暴露 `removeTracks`，不要仅依据 v2 的类型声明调用它。 |
| `player.queueEnded` | `{}`，本地播放队列最后一首自然播完 | 不处理时按原播放模式推进；`op.preventDefault()` 停在队尾。返回 `{ tracks }` 可把 1–1000 首公开音源歌曲接到队尾并播放第一首。手动跳歌、单曲循环和一起听房间不触发。 |
| `queue.remove` | `{ tracks }` | 改写或取消要移除的队列歌曲；空数组不删除任何歌曲 |
| `queue.clear` | `{}` 或 `{ tracks }` | 清空发起时的本地队列，或改为仅移除指定歌曲 |
| `player.setMode` | `{ mode }`，值为 `sequence`、`random` 或 `single` | 取消切换，或返回另一个模式。仅静音时不触发 |
| `player.seek` | `{ positionMs }`，非负整数毫秒 | 返回新的时间；不能取消 |
| `player.setVolume` | `{ volume }`，0 到 1 | 返回新的音量；不能取消 |
| `player.previous` | 空对象 `{}` | 取消上一首请求 |
| `player.next` | `{ reason }`，原因是 `user`、`ended` 或 `error` | 返回 `{ track }` 从当前队列选择下一首；不能改写原因 |
| `player.error` | `{ track, error }`；`error` 为 `resolve`（取地址）、`start`（启动）、`media`（播放中）或 `playback`（其他播放失败） | 系统准备因失败跳歌时，调用 `op.preventDefault()` 可取消；`await next()` 保留原限流和跳歌次数保护。不能改写已经发生的错误或歌曲，也不能主动调用此操作。 |
| `player.pause` | 空对象 `{}` | 取消暂停请求 |
| `player.resume` | 空对象 `{}` | 取消继续当前歌曲的请求（区别于点播指定歌曲） |
| `window.close` | 空对象 `{}`，需要 `window.intercept` | 标题栏关闭或 Ctrl+W / Alt+F4 关闭主窗口前，可取消或放行。处理器时限 800 ms，超时恢复原关闭流程。显式退出、插件权限与卸载不经过此操作；用户撤销一次拦截后可继续原关闭流程。 |
| `lyrics.load` | `{ track }`，需要 `lyrics.intercept` | `await next()` 返回原始结构化歌词或 `null`。可在缺失时返回补充歌词。不可改换歌曲，不能取消。 |
| `lyrics.transform` | `{ track, lyric }`，需要 `lyrics.intercept` | 在显示前处理歌词，可返回带翻译或注音的结构化歌词。每次读取都处理，结果不写回原始歌词缓存。不能取消。 |
| `download.create` | `{ tracks, quality, directory? }`，需要 `downloads.intercept` | 在取下载地址和入队之前，可取消、筛选或重排原歌曲，或更改音质。最多 1000 首；不能增加歌曲。`directory` 是本次临时句柄，不是路径，也不能改写。混合音质为 `auto`，原值或 `auto` 保留每首原来的音质。 |
| `download.filename` | `{ track, name }`，需要 `downloads.intercept` | 更改文件基本名；不能取消、改扩展名、加目录、改歌曲或使用系统保留名。异常或非法输入保留原名。 |
| `share.create` | `{ track }`，需要 `sharing.intercept` | 可取消、更换为公开歌曲，或返回自己的 `{ id, url, template? }` 分享结果。`await next()` 获取默认结果后可修改链接或文案。不接收登录信息、解析器源码和上传令牌。 |
| `link.open` | `{ url, from: 'paste' \| 'drop' \| 'deeplink' }`，需要 `links.intercept` | 可认领或改写用户主动打开的单个公开链接。不能改写来源；登录回调、安装链接、含凭据/片段的地址、输入框编辑及后台剪贴板读取不进入管线。未认领的普通网页不会自动用浏览器打开。 |
| `notification.show` | `{ title, body, level: 'info' \| 'success' \| 'warning' \| 'error' }`，需要 `notifications.intercept` | 可取消或改写软件内文字提示。系统通知、授权/安装/修复提示及带按钮或组件内容的提示由宿主保留。插件自身提示会经过管线，同名递归跳过自身。 |

歌曲摘要只包含公开引用、标题和歌手。不要把本地歌曲引用当作文件名或持久 ID。插件在清单声明 `player.intercept`，用户授权后，逻辑侧通过 `ctx.hooks.on` 注册处理函数；未授权、撤权或暂停拦截时不改变原播放器行为。不要把一般的读取权限当作改写授权。

处理函数可不做处理、取消可取消的操作，或通过 `await next(input)` 把新输入交给下游。普通播放钩子最多放行一次。`player.resolve` 不能取消：只有首次返回 `{ok:false}` 后，整条解析管线才允许用不同输入重试一次；不能并发重试，也不传出播放地址。每个处理器的执行预算为 800 ms，不包括等待下游执行的时间。重复出错或超时可能导致处理器暂停。

从本地套件创建 `playback-hook` 工程后，运行 `npm install`、`npm test`。编辑 `tests/hooks.json` 增补离线场景，用 `npm run typecheck` 独立验证类型。之后运行 `npm run dev`，在「设置 → 插件管理 → 管理设置 → 插件开发者模式」添加打印的 JS 文件。关闭面板，在该插件的权限里允许播放拦截。再次打开「管理设置 → 播放与队列」，可暂停所有拦截、查看活动记录或恢复被暂停的处理器。

**子账号切换**：在 manifest 声明 `account.intercept`，通过 `ctx.hooks.on('account.switch', handler)` 注册。输入仅含账号提供插件的 `pluginId`、账号声明 `accountId`、原连接 `fromConnectionId` 和用户选择的 `connectionId`，不含昵称、凭据引用或令牌。可调用 `op.preventDefault()` 取消或 `await next()` 放行，不可替换用户选择的身份。处理时限 3000 ms。取消不产生 `account.changed`；重复选择已生效的账号也不重复发事件。登录、续登、退出不经过这个 hook。`ceru-plugin test-hooks` 支持用两个合成连接 ID 测试取消、放行和撤权。

歌词处理器的执行预算为 3000 ms，不包含等待 provider 或下游的时间。`next` 最多调用一次；返回值可替换下游歌词结果，未返回则使用下游结果。直接返回歌词文档或使用 `op.respondWith(document)` 可提供结果；返回 `null` 表示无歌词。文档使用 `OperationLyric`：与 `CrLyric` 相同，但 `track` 仅含本次输入的 `kind/providerId/id`。本地和私有歌曲使用临时引用，不能作为文件路径或持久 ID；不要给歌词的引用补上账号、插件安装标识或 `data`。输入和结果经过时间轴、引用一致性与 1 MiB 上限校验，非法结果或异常回退到原始结果。原始音源缺失或失败时仍可补充歌词。

```ts
ctx.hooks.on('lyrics.transform', async (op, next) => {
  const lyric = await next()
  if (!lyric) return null
  return {
    ...lyric,
    lines: lyric.lines.map(line => ({ ...line, translation: translate(line.text) })),
  }
})
```

`ceru-plugin test-hooks` 的歌词场景额外填写 `defaultResult`（模拟原始歌词或 `null`）与 `expect.result`。直接提供结果而不调用原实现时，填写 `expect.defaultCalled: false`。桌面播放、本地解析与歌词补载走同一处理流程；导出使用原始歌词，不把显示用翻译写回缓存。

可使用 `ctx.events.on('player.pause', event => event.preventDefault())` 订阅可取消操作的前置事件；输入与来源只读，订阅需要相应的拦截权限。不可取消操作没有前置事件。

`ctx.events.on('player.pause:done', event => { /* event.input, result, prevented, handledBy, failed */ })` 在操作结束后接收最终输入、公开结果、取消标记、参与改写或取消的插件 ID，以及宿主执行失败标记。完成事件不能取消操作，安全模式下仍可接收。播放、歌单、账号、歌词、下载、分享分别要求 `player.read`、`library.read`、`account.profile`、`player.read`、`downloads.manage`、`music.read`；搜索、公开链接、软件内提示和窗口关闭分别要求 `search.read`、`links.read`、`notifications.read`、`window.read`。注销函数和权限撤销都会停止后续投递；事件监听同样受预算与重复失败暂停机制限制。

`op.state` 是本次处理前取得的只读现场快照，包含 `player`、`route` 和 `account`。它们分别需要 `player.read`、`route.read` 和 `account.profile`；没有授权或暂时不可读取时为 `null`。播放摘要不含原始私有歌曲 ID、文件路径、连接凭据或私有数据；账号只含公开登录摘要。权限在等待读取期间撤销时不会继续暴露旧结果。快照只用于辅助判断，不可修改它来改变宿主状态。离线作者测试默认提供三项均为空的冻结快照。

下载处理器的执行预算为 3000 ms，不包含等待下游的时间。用户直接发起的下载被拦截后会提示处理插件，并可在 30 秒内“撤销本次”：仅当本次任务尚未开始时，取消这些任务并以原始选项重新入队，跳过两种下载钩子。已经开始下载或保存的文件不会回滚。插件发起的下载在等待期间被停用或撤销授权，会停止后续入队。

分享处理器同样有 3000 ms 预算，`next` 最多一次。返回链接支持 HTTP、HTTPS 与 `cerumusic:`，拒绝文件链接、脚本链接和 URL 内嵌用户名密码。取消或提供自定义结果时不运行原分享实现。桌面分享窗口保持用户确认；默认服务器分享仍检查登录。"撤销本次"优先恢复已生成的原始结果，避免重复发布；原实现尚未执行时才调用原实现。不会撤回远端已发布内容。离线 `test-hooks` 使用 `defaultResult` 与 `expect.result` 检查结果，自定义结果用 `expect.defaultCalled: false`。

也可通过 `ctx.app.call('share.create', { track }, call)` 主动生成分享链接，`call.permissionKey` 必须对应 `sharing.publish`。歌曲使用公开的 `OperationTrack`，不能传本地路径、私有句柄或账号信息；结果为 `{ id, url }`，由 TypeScript 根据操作名推导。它与 `ctx.sharing.create` 使用同一套处理器、撤权检查和本机分享编码；取消时调用失败，不写远端分享服务器。模型工具可读取 `ctx.app.operations.list()` 中该项的输入和输出 Schema。

`notification.show`、`link.open`、`window.close` 也可通过 `ctx.app.call` 发起，来源由宿主固定为当前插件。软件内提示不需额外权限；公开链接需要 `external.open`，链接仍交给原有识别器处理，不能绕过登录回调、插件安装或敏感参数过滤。关闭窗口需要 `window.control`，遵循用户的“关闭时询问 / 最小化到托盘 / 退出”设置。它们都经过对应的事件与处理器，取消时不执行默认行为；等待期间撤权会终止调用。

```ts
ctx.actions.register('notice', (_input, operation) =>
  ctx.app.call('notification.show', {
    title: '', body: '导入完成', level: 'success'
  }, { permissionKey: '', operation })
)
```
