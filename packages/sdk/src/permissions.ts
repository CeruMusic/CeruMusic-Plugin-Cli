import type { JsonObject } from './manifest.js'
import type { PermissionName } from './catalog.js'
import type { PermissionStatus, UserIntentHandle } from './index.js'

/** Permission groups are user-facing decisions, not one prompt per method. */
export const PERMISSION_GROUPS = {
  musicRead: { title: '搜索与读取所有已安装音源', permissions: ['music.read'] },
  musicControl: { title: '播放任意音源的歌曲', permissions: ['music.control'] },
  network: { title: '访问公网服务', permissions: ['network.request', 'network.socket'] },
  localServer: { title: '在本机运行网络服务', permissions: ['network.serve'] },
  lanServer: { title: '允许局域网设备访问插件服务', permissions: ['network.serve.lan'] },
  audioTransform: { title: '处理播放器的音频数据流', permissions: ['streams.transform'] },
  trustedRuntime: { title: '在独立进程中运行完全信任的代码', permissions: ['runtime.trusted'] },
  localNetwork: {
    title: '访问局域网与本机服务',
    permissions: ['network.private', 'network.discovery'],
  },
  account: { title: '读取登录状态与基本账号资料', permissions: ['account.profile'] },
  accountIntercept: { title: '可以拦截子账号切换', permissions: ['account.intercept'] },
  libraryIntercept: { title: '可以拦截和改变收藏与歌单操作', permissions: ['library.intercept'] },
  searchIntercept: { title: '可以拦截搜索并改写搜索词', permissions: ['search.intercept'] },
  searchRead: { title: '观察搜索操作', permissions: ['search.read'] },
  linksRead: { title: '观察主动打开的公开链接', permissions: ['links.read'] },
  notificationsRead: { title: '观察软件内文字提示', permissions: ['notifications.read'] },
  windowRead: { title: '观察窗口关闭请求', permissions: ['window.read'] },
  libraryRead: { title: '读取歌单与收藏', permissions: ['library.read'] },
  libraryManage: { title: '创建和修改歌单与收藏', permissions: ['library.write'] },
  libraryDelete: { title: '删除歌单与歌曲记录', permissions: ['library.delete'] },
  playbackRead: { title: '读取播放状态和队列', permissions: ['player.read'] },
  navigationRead: { title: '读取当前页面名称', permissions: ['route.read'] },
  navigationIntercept: { title: '拦截页面跳转', permissions: ['navigation.intercept'] },
  playbackIntercept: { title: '可以拦截和改变你的播放操作，例如切歌、换歌', permissions: ['player.intercept'] },
  playbackControl: {
    title: '控制播放和播放队列',
    permissions: ['player.control', 'playback.fallback.hold'],
  },
  downloads: { title: '管理下载任务', permissions: ['downloads.create', 'downloads.manage'] },
  files: { title: '使用用户选定的文件', permissions: ['files.read', 'files.write'] },
  localMusic: {
    title: '索引本地音乐和编辑标签',
    permissions: ['localMusic.read', 'localMusic.write'],
  },
  clipboardRead: { title: '读取剪贴板', permissions: ['clipboard.read'] },
  clipboardWrite: { title: '写入剪贴板', permissions: ['clipboard.write'] },
  notifications: { title: '发送系统通知', permissions: ['notifications.system'] },
  external: { title: '在系统浏览器打开链接', permissions: ['external.open'] },
  settingsRead: { title: '读取软件偏好', permissions: ['settings.read'] },
  settingsWrite: { title: '修改软件偏好', permissions: ['settings.write'] },
  window: { title: '控制软件窗口', permissions: ['window.control'] },
  windowIntercept: { title: '可以拦截窗口关闭请求', permissions: ['window.intercept'] },
  lyricsIntercept: { title: '读取和处理当前歌曲的歌词', permissions: ['lyrics.intercept'] },
  downloadsIntercept: { title: '处理下载请求与下载文件名', permissions: ['downloads.intercept'] },
  sharingIntercept: { title: '处理歌曲分享请求与分享链接', permissions: ['sharing.intercept'] },
  linksIntercept: { title: '处理主动粘贴、拖入与打开的公开链接', permissions: ['links.intercept'] },
  notificationsIntercept: { title: '改写或隐藏软件内提示', permissions: ['notifications.intercept'] },
  hotkeys: { title: '注册全局快捷键', permissions: ['hotkeys.register'] },
  sharing: { title: '发布和撤销分享', permissions: ['sharing.publish', 'sharing.revoke'] },
  roomsRead: { title: '读取一起听房间状态', permissions: ['rooms.read'] },
  roomsControl: { title: '加入房间和控制一起听', permissions: ['rooms.control'] },
  ai: { title: '使用软件 AI 服务', permissions: ['ai.use'] },
  devices: { title: '控制音频设备与投放', permissions: ['devices.control'] },
  uiAppearance: { title: '修改软件全局外观', permissions: ['ui.styles.global'] },
  background: { title: '后台任务', permissions: ['background.run'] },
  credentials: { title: '使用本插件已保存的连接凭据', permissions: ['credentials.use'] },
  credentialCapture: { title: '从独立登录窗口保存指定网站的登录凭据', permissions: ['credentials.capture'] },
  credentialExport: { title: '读取本插件连接凭据明文', permissions: ['credentials.read'] },
  guestPlugins: { title: '安装和运行兼容子插件', permissions: ['guests.manage', 'guests.run'] },
  services: { title: '调用其他插件提供的服务', permissions: ['services.consume'] },
} as const
export type PermissionGroup = keyof typeof PERMISSION_GROUPS
export function permissionGroup(name: PermissionName): PermissionGroup | undefined {
  return (Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).find((key) =>
    (PERMISSION_GROUPS[key].permissions as readonly string[]).includes(name),
  )
}
export interface PermissionGrant {
  key: string
  name: PermissionName
  group?: PermissionGroup
  scope: JsonObject
  status: PermissionStatus
  expiresAt?: number
}
export interface PermissionGroupRequest {
  group: PermissionGroup
  /** Omit to request all statically scoped declarations in this group. */
  keys?: string[]
  /** Dynamic scopes keyed by declared permission key. */
  scopes?: Record<string, JsonObject>
  intent?: UserIntentHandle
}
export interface PermissionGroupResult {
  group: PermissionGroup
  status: PermissionStatus
  grants: PermissionGrant[]
}
