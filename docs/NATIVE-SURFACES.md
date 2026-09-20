# 原生列表与插件自定义页面

本教程对应 SDK、Core、Issuer、CLI 和 create-ceru-plugin **0.3.5**，包含原生 Surface、现有歌单页区块、账号摘要／退出菜单及登录弹框自动关闭接口。

插件可以同时声明 `native`、`web` 和 `schema` 三种 Surface。推荐歌单、音乐库和歌曲列表适合 `native`：插件在逻辑沙箱中运行 render 回调，返回标准数据；澜音用自己的歌单卡片、列表和按钮渲染，沿用主题、导航和播放器。账号表单、二维码等自定义交互可以继续使用插件打包的 Vue/React 页面。

## 从脚手架运行完整示例

```sh
npm create ceru-plugin@0.3.5 my-library -- --template connected-library --lang ts
cd my-library
npm install
npm run dev
```

选择“歌单页 · 我的音乐库”即可在本地／云歌单区域下看到插件的原生歌单网格、歌曲列表和导入入口。模板还展示账号菜单贡献、连接设置和状态刷新。JS 作者将 `--lang ts` 改为 `--lang js`。示例元数据来自本地常量；接入自己的授权 API 后实现 `tracks.resolve` 才能播放实际音频。

开发工作台直接在 Host DOM 中预览这些声明，并执行逻辑回调、权限申请和 Surface 生命周期。`ui.navigation.open` 会在工作台记录导航目标；澜音实现自己的歌单详情路由及播放器。插件开发不需要启动澜音。使用 `npm run build` 构建后，只分发 `dist/plugin.js`。

## 声明原生 Surface

个人歌单应贡献到 Host 现有歌单页：

```json
"playlistSections": [{ "id": "library", "title": "我的音乐库", "view": "library", "order": 0 }]
```

`view` 必须指向已声明的 native Surface。Host 保留自己的本地／云歌单区域，并按 `order` 呈现插件区块。推荐等发现页内容仍可使用 `homeSections`；本教程的个人歌单示例使用 `playlistSections`。

从插件按钮前往个人歌单时，调用 `ctx.ui.navigation.open({ page: 'playlist', sectionId: 'library' })`。`sectionId` 是调用插件的贡献 ID，Host 负责路由和定位。它只能用于 `page: 'playlist'`，不能指向其他插件的区块。使用该导航时不要声明打开抽屉的 command.view，也不要调用 `ui.openView('library')`。

以下字段加入 `ceru.plugin.json` 的 `manifest`。`entry` 是逻辑动作名称，必须同时在 `contributes.commands` 声明；无需为它建立 Web 模块或 HTML 文件。

```json
{
  "modules": {
    "logic": { "entry": "logic.main" },
    "surfaces": [{ "id": "library", "kind": "native", "entry": "render.library" }]
  },
  "contributes": {
    "commands": [
      { "id": "render.library", "title": "渲染音乐库", "action": "render.library" },
      { "id": "playlist.open", "title": "打开歌单", "action": "playlist.open" },
      { "id": "playlist.import", "title": "导入歌单", "action": "playlist.import" }
    ],
    "playlistSections": [{ "id": "library", "title": "我的音乐库", "view": "library", "order": 0 }]
  }
}
```

在逻辑模块注册 render：

```ts
import { assertResourceRef, defineNativeView, definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('render.library', defineNativeView(async (_input, operation) => {
    operation.signal.throwIfAborted()
    return {
      type: 'page',
      sections: [{
        id: 'playlists', title: '我的歌单', layout: 'grid',
        items: [{
          ref: { pluginId: ctx.plugin.id, providerId: 'catalog', connectionId: 'main', kind: 'playlist', id: '1' },
          title: '收藏的音乐',
          playlist: { description: '来自已连接的音乐库', trackCount: 12 },
          capabilities: ['open'],
        }],
        onOpen: 'playlist.open',
        itemActions: [{ label: '导入歌单', action: 'playlist.import' }],
      }],
    }
  }))

  ctx.actions.register('playlist.open', async (input) => {
    const ref = input && typeof input === 'object' && !Array.isArray(input) ? input.ref : undefined
    assertResourceRef(ref)
    if (ref.pluginId !== ctx.plugin.id || ref.providerId !== 'catalog' || ref.kind !== 'playlist')
      throw new Error('Unknown playlist')
    await ctx.ui.navigation.open({ page: 'playlist', ref })
  })
  ctx.actions.register('playlist.import', async (input) => {
    const ref = input && typeof input === 'object' && !Array.isArray(input) ? input.ref : undefined
    assertResourceRef(ref)
    await ctx.ui.playlistImport.open({ importerId: 'catalog', initialValue: ref.id })
  })
})
```

上述 `catalog` provider 和 importer 也需要清单声明与实现。歌单详情通过 `providers.register(..., { playlists: { get(...) } })` 返回歌曲页，导入通过 `playlistImporters.register` 返回歌曲页；完整声明在 `connected-library` 模板中。

`NativeView` 只传 JSON 数据和已声明的动作 ID。`layout: 'grid'` 展示网格；`layout: 'list'` 展示列表。`onOpen` 接收 `{ ref }`；`onPlay` 接收 `{ ref, refs }`，其中 `refs` 是当前 section 的完整资源列表。`itemActions` 接收动作的对象 `input` 与 `{ ref }` 合并后的数据，Host 始终覆盖 `ref` 为用户点击的资源。资源的 `pluginId`、`providerId`、`connectionId` 和私有 `data` 必须完整保留。

播放动作获取 `playbackControl` 权限后调用 `ctx.queue.replace(items, call)`、`ctx.player.play(ref, call)`，其中 `call` 包含当前 `operation` 和声明的 `permissionKey`。Host 负责播放器和队列，插件负责元数据和解析。导入操作交给 `ctx.ui.playlistImport.open`，由 Host 处理目标歌单、持久化和去重。

## 状态、生命周期与分页

Host 完成挂载后运行 `lifecycle.openAction`，然后请求 render。用户操作执行完毕或 `ctx.ui.setState('library', publicState)` 更新后，Host 重新请求 render。render 应读取或加载内容，不应无条件再次广播状态。分页状态可以保留在插件中，通过声明的“上一页／下一页”动作更新后重新 render。

关闭页面时，Core 的 `SurfaceSession` 取消未完成调用并执行一次 `lifecycle.closeAction`，过期会话不能再操作 Host。插件的网络操作使用传入的 `operation.signal`；账号轮询也应在关闭动作中停止。

## 账号菜单子账号

插件提供公开的展示信息和自己的账号页面：

```json
"accountItems": [{ "id": "main", "title": "音乐库账号", "view": "account", "action": "account.summary", "logoutAction": "account.logout" }]
```

`account` 必须是声明的 Surface，`account.summary` 必须是声明的命令动作，返回：

```ts
{ signedIn: true, displayName: '我的昵称', avatarUrl: 'https://example.com/avatar.png', badge: '会员' }
```

未登录返回 `{ signedIn: false, displayName: '未登录' }`。头像与 badge 可省略；头像为 HTTP(S) URL，badge 是简短文本。Host 在账号胶囊菜单展示这些信息，点击后打开插件的 `view`，已登录项目可以通过二级菜单执行 `logoutAction`。退出动作同样必须在 commands 声明。插件登录、退出或账号过期后调用 `ctx.ui.setState('account', publicState)`，Host 会重新请求账号摘要。Cookie、token 和其他凭据保存在插件私有存储中，不能放进摘要或页面状态。

账号 Surface 可用 `presentation: { kind: 'modal', size: 480 }` 申请居中弹框，`size` 表示宽度。Vue/React 页面在登录动作完成返回之后调用 Surface 上下文的 `await ctx.close()`，Host 关闭当前会话并触发清理；不要收到早于登录动作返回的状态广播就关闭，以免取消仍在进行的调用。逻辑侧也可使用 `ctx.ui.closeView(surfaceId)` 请求关闭自己的页面。

Web 沙箱自动观察 `#plugin-root` 的内容高度，并通过带会话 generation 的 `resize` 消息发送 `{ height }`。Host 验证消息来源和有限的 1–16384 像素值后，按最小值与视口最大值限制显示高度。简短登录表单应使用自然内容高度，避免把页面根设成 `height/min-height: 100vh`；较长内容仍允许访问和滚动。关闭 Surface 时尺寸观察一并停止。

## Host 集成要求

Host 使用 Core `SurfaceSession` 管理会话，并在 renderer 中把 `NativeView` 映射到自身组件。Core 校验内容实体、大小限制和引用的动作；Issuer 安装前验证 render 入口与账号引用。Web Surface 仍按原有方式加载隔离的插件页面。Host 无需导入平台 SDK、账号流程或任何平台专属 UI 组件。
