# 插件账号开发指南

从本地开发包创建 `connected-library` 工程即可体验账号流程，无需申请真实平台凭据：

```sh
npm run create -- "../音乐库账号" --template connected-library --lang ts
cd "../音乐库账号"
npm install
npm run dev
```

在桌面开发者模式添加监听命令打印的 `dist/plugin.js`。从账号菜单选择「音乐库账号」，输入演示昵称，再添加第二个子账号。切换后，喜欢列表、歌单、播放历史和推荐应显示对应账号的数据。模板只演示数据接入，不会提供真实音频。JavaScript 版本使用 `--lang js`。

## 声明与注册

逻辑激活时或执行入口判断时，`await ctx.accounts.current('catalog')` 读取本插件该账号声明当前选中的子账号。无选择时返回 `null`，否则仅返回 `{ connectionId, expired }`。这次读取不请求网络、不解密凭据，也不表示平台刚刚验证了登录；未声明的账号会报错。不要在插件存储中另写一份当前选择或过期标记。

在 `ceru.plugin.json` 的 `manifest.provides.accounts` 声明账号。模板使用下面的字段；`providers` 里的 `catalog` 必须是该插件实际声明的音源。

```json
{
  "id": "catalog", "title": "音乐库账号", "multiple": true,
  "loginMethods": ["form"], "providers": ["catalog"],
  "capabilities": ["profile", "likes", "playlists", "history", "recommend"]
}
```

在 `src/index.ts` 用同一 ID 调用 `ctx.accounts.register('catalog', implementation)`。`login` 负责一次登录；`profile(account, operation)` 返回 `{ id, displayName, avatar?, vip? }`。`account.id` 是宿主的连接 ID，不是平台用户 ID。按连接 ID 区分子账号的本地数据；不要把登录昵称当成身份凭据。可选的 `validate` 返回 `{ valid: false }` 时，账号进入需要重新登录状态。

## 四种登录方式

业务请求收到平台明确的登录失效响应时，用 `await ctx.accounts.reportExpired(accountId, connectionId, credential)` 上报该请求实际使用的连接和句柄，需要 `credentials.use` 权限。宿主仅将本插件当前选中且句柄仍匹配的账号置为过期；首次写入返回 `true`，重复报告、已切换账号或续登前的旧句柄返回 `false`。不要重新获取句柄来上报旧请求，也不要把超时、无网络或资源访问受限当作登录过期。

只声明平台实际支持的方式。在 `login({ method, auth }, operation)` 中按 `method` 分支；用户取消返回 `null`，不要自行创建连接。

| 方式 | 插件调用 | 登录完成的依据 |
| --- | --- | --- |
| `form` | `auth.form({ fields })`；字段支持 `text`、`password`、`code` | 表单提交不等于登录成功。插件向平台验证后返回 `{ credential, binding }`；纯本地演示不需要 `binding`。不要记录表单值。 |
| `qrcode` | `auth.qrcode({ image, expiresInMs, poll })` 接受 PNG data URL；只有登录地址时用 `{ url, expiresInMs, poll }`，二选一 | 桌面本地绘制 HTTPS 登录地址的二维码，不请求该地址，也不需要插件打包二维码组件。`poll` 区分 `waiting`、`scanned`、`expired`、`done`；只有 `done` 携带凭据。使用每次轮询传入的 `operation`，过期重新申请二维码。 |
| `browser` | `auth.browser({ url, until: { cookie } })` | 宿主打开独立登录窗口并按声明域名获取指定 cookie。原样返回一次性回执，插件不接收 cookie 明文。需要 `network.request`、`credentials.capture` 和 `credentials.use`。 |
| `oauth` | `auth.oauth({ authorizationUrl, tokenUrl, clientId, scopes })` | 使用公共客户端授权码与 PKCE S256。宿主负责回调、交换令牌并返回一次性回执；不要在插件内嵌客户端密钥。需要 `network.request` 和 `credentials.use`。 |

每种方式的参数限制、二维码轮询状态及 OAuth 回调 URI 计算规则见[宿主服务](HOST-SERVICES.md)。

## 扫码弹窗的两种内部 UI

省略 `view` 使用现有宿主模板；传入本插件声明的 `component` 或 `web` 视图 ID，替换弹窗内部内容。弹窗外壳、标题、关闭按钮和进出动画仍由软件提供。自定义登录内容统一运行在独立 iframe 中，即使依赖向 `document.head` 写样式，也只影响该 iframe；组件使用宿主提供的运行库。

```ts
return auth.qrcode({
  image, // 或 url，二选一
  view: 'login', // 可省略，使用默认模板
  expiresInMs: 120000,
  poll: operation => pollPlatform(operation),
})
```

创建 `account-qrcode` 模板即可获得 JS/TS 示例：`--template account-qrcode --lang ts`。`src/index.ts` 的 `loginView` 可选 `undefined`（默认模板）、`'login'`（Vue 组件）或 `'login-html'`（纯 HTML/CSS/DOM）。组件示例复用软件的 Vue/TDesign；HTML 示例无组件框架依赖。

自定义组件通过 `useViewState<{ login: AccountQrViewState }>()` 读取实时状态，首次挂载参数也提供 `bridge.props.login`。纯 HTML 通过 `ctx.subscribe(state => ...)` 读取 `state.login`。公开字段为 `kind: 'qrcode'`、`accountId`、`image` 或 `url/origin`、`status: 'waiting' | 'scanned'`、`expiresAt`（Unix 毫秒）。`login` 为本次宿主会话保留字段，其他插件视图状态照常提供。凭据和登录票据不会传入视图。

CSS 可直接使用 `--td-brand-color`、`--td-text-color-primary`、`--td-bg-color-container` 等宿主变量；组件和隔离 HTML 均同步明暗模式与主题色。组件调用 `useView().close()`，HTML 调用 `ctx.close()` 取消登录。关闭、取消、过期、停用插件会结束会话并释放视图；只有宿主确认 `done` 后才保存账号。不要在视图再启动轮询或保存凭据。

## 带凭据的请求

联网登录返回的 `binding` 明确指定 HTTPS `origin` 和 `sendAs: 'bearer'` 或 `'cookie'`。申请 `credentials.use` 时，把允许的精确来源写入 `scope.origins`。网页登录还要在 `credentials.capture.scope.domains` 指定登录域名。不要把 cookie 或 token 存进 `ctx.storage`、返回给视图、写入日志或拼入 URL。

在 `profile` 或账号集合实现中，`account.credential` 是宿主凭据引用，不是请求头字符串。以下示例假定清单中的网络权限键为 `net`，并且已经授权对应的凭据来源：

```ts
const reply = await ctx.http.request({
  url: 'https://music.example.org/profile', permissionKey: 'net',
  credential: account.credential, operation,
})
```

宿主附加凭据；插件不要额外设置 `Cookie` 或 `Authorization`。绑定账号的 provider 可从 `operation.connectionId` 获取当前连接，再用 `ctx.credentials.get(connectionId)` 取得不透明引用。没有连接时，不要偷偷使用另一个子账号。

## 把账号内容接到播放器

`likes.list`、`history.list`、`recommend.list` 返回曲目的 `Page`，`playlists.list` 返回歌单的 `Page`。每个 `list(account, request, operation)` 都应使用 `account.id` 区分连接，并尊重 `request.limit` 和 `request.cursor`。资源引用注明所属 provider 和连接 ID，防止切换子账号后仍操作原账号的数据。要支持同步点赞，再实现 `likes.set(account, { ref, liked }, operation)`。只有用户为该子账号开启同步时才同步本地收藏；平台失败不应回滚本地操作。

真实平台接入后至少复查：取消登录不新增账号；两个子账号可独立切换和退出；关闭点赞同步不写入平台；凭据失效提示重新登录；重启后选中的连接与数据仍匹配。
