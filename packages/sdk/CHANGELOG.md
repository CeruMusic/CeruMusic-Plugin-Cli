# SDK 变更记录

## 0.3.6

- `ResourceRef.scope: 'provider'` 标记公共平台歌曲 ID；支持 Host 按用户的播放/歌词路由选择实现。私有资源默认仍归原插件，`retargetTrackRef` 跨插件时只保留公共标识，剥离私有数据。
- `TrackMetadata.qualitySizes` 按音质 ID 返回真实字节数，供原生下载界面显示；校验拒绝负值、非整数及未声明音质。

## 0.3.5

- Web Surface 自动上报挂载内容高度；Host 可按视口调整短弹框高度，长内容保留滚动，关闭后停止尺寸观察。

- 新增 `contributes.playlistSections`：插件的 native Surface 嵌入 Host 现有本地／云歌单页。
- `ui.navigation.open({ page: 'playlist', sectionId })` 跳转定位调用插件的已声明区块，SDK、Issuer 与 CLI 校验原生视图引用及导航归属。
- 独立工作台增加 Host 歌单页预览，多区块共用 Core Surface 生命周期；connected-library JS/TS 模板展示页内集成和导航。
- CLI 保留 0.3.4 的实际包版本查询。

## 0.3.3

- 新增 Host 原生基础 UI Surface：插件返回经过校验的 `NativeView` 数据，宿主用自己的列表、网格和按钮组件渲染；平台业务与登录流程仍留在插件内。
- 原生列表支持资源打开、播放及逐项菜单动作；Core 校验所有动作引用，CLI 在 Host DOM 中预览并共享 Surface 生命周期。
- 新增 `accountItems` 和 `AccountSummary`：插件贡献账号菜单摘要与登录页面，Host 展示头像、昵称和可选会员标签。
- 账号菜单支持声明 `logoutAction`；Surface 支持 `modal` 展示、Web `ctx.close()` 及逻辑 `ctx.ui.closeView()`，便于插件完成扫码后关闭自己的登录界面。
- 浏览器沙箱公共服务调用序列化 OperationContext 并传递取消信号，修复调用队列/播放器时 AbortSignal 无法跨窗口克隆的问题。

## 0.3.1

- 播放解析结果新增 `requestHeaders`，供 Host 在获取对应临时媒体地址时附加防盗链、认证或客户端请求头；请求头只保留在 Host 主进程，并按完整 URL 与到期时间隔离。

## 0.3.0

- 正式声明 Web Surface 的 title、presentation 和 lifecycle；界面与业务由插件实现，宿主仅提供容器。
- CLI 和 Core 共用 SurfaceSession，统一打开、关闭、取消请求和过期会话校验。
- 开发工作台按页面分发状态，支持关闭页面和私有存储持久化；页面不接收清单中的默认凭据。
- Core 正式导出 /guests、/surface、/surface-document，恢复已使用的 Guest 和分享能力，消除本机 node_modules 补丁。
- 五个工具链包与脚手架模板统一到 0.3.0。以下 0.2.5 的类型改动一并发布。

## 0.2.5

- 从根入口及 `/guests`、`/share`、`/storage` 导出 Guest、分享解析与存储类型。
- 同步 PluginContext 的 Guest 管理、插件更新、歌单导入参数与 Storage 空值/共享键签名。
- 补齐 GuestBootstrapAPI、Manifest 分享入口、命令说明、Guest 展示信息与菜单说明。
- 打包前自动构建并检查公开导出文件，避免源码中存在但 npm tarball 缺失。
- 新增真实打包、隔离安装、严格类型检查及运行时子路径导入测试。
- 将 CommonJS 宿主模块声明明确标为 .d.cts，兼容 NodeNext 与 Bundler 模式。
- 避免公开 Buffer 返回类型依赖开发环境中的 Node Buffer 泛型声明。

运行能力由 Host 决定；本次类型补充不会为旧宿主添加业务实现。
