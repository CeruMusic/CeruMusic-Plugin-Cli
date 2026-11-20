# 桌面应用生命周期

在 v3 工程的逻辑入口中使用。页面不是生命周期的所有者；关闭页面也不会停用逻辑插件。

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin({
  setup(ctx) {
    ctx.lifecycle.onThemeChange(async theme => {
      await ctx.storage.set('lastTheme', theme)
    })
  },
  async onBeforeQuit(ctx) {
    await ctx.storage.set('lastShutdown', Date.now())
  }
})
```

已有函数式入口无需迁移，在 setup 或函数入口中调用 `ctx.lifecycle.onBeforeQuit(handler)` 即可。注册返回取消监听函数；停止插件时宿主也会清除监听。对同一工作不要同时用两种方式注册。

| 通知 | 行为 |
| --- | --- |
| onAppReady | 主窗口就绪；晚启用时对这个运行实例补发一次。 |
| onWindowShow / onWindowHide | 主窗口实际显示、隐藏，或最小化、恢复导致可见性变化。 |
| onWindowFocus / onWindowBlur | 主窗口获得或失去焦点。 |
| onSuspend / onResume、onLock / onUnlock | 由系统电源事件转发；物理休眠和锁屏仍需设备验收。 |
| onThemeChange | 参数为 light 或 dark；同一深浅色不重复通知。 |
| onOnline / onOffline | 主界面 Chromium 报告在线或离线时通知；不保证某个服务能连接。首次报告只记录状态。 |
| onLocaleChange | 参数为主文档语言（如 zh-CN）；不把操作系统首选语言误当作界面语言。当前界面没有多语言设置。 |
| onIdle | 调用 `ctx.lifecycle.onIdle(60000, handler)`，或在选项式入口提供 `onIdle: { milliseconds: 60000, handler(ctx) { … } }`。阈值单位毫秒，至少 60 秒。持续空闲只触发一次，用户恢复活动后可重新触发。 |
| onInstall / onUninstall | 首次安装后初始化；卸载前仍能读取本插件的数据，回调结束或 5 秒总时限到期后删除文件与本地数据。 |
| onUpdate | 同 ID 版本变更时收到 `{ from }`，当前版本从 `ctx.plugin.version` 读取；重新安装同一版本不触发。 |
| onEnable / onDisable | 显式改变插件启停状态时通知，不把重启恢复或更新当作用户启用。 |

停用插件执行安装、迁移或卸载回调时不会挂载任何页面或服务。选项式入口只登记目标钩子，不执行正常 setup。函数式入口需要同步登记生命周期监听；不要把存储写入或联网操作放在登记回调之前。临时 worker 可在回调中读写自身存储和读取配置；远端清理只可使用已授予的网络权限，不弹出新授权请求。
| onConfigChange / onPermissionChange | 参数为本插件实际变化的键名数组，不含配置值。配置新增、修改和删除，以及权限授予或撤销，均会通知；重复保存不重复通知。 |
| onBeforeQuit | 正常退出时并行等待已登记的回调，所有插件共享最多 3 秒，无法取消退出。 |

不要只在退出时保存关键数据：强制结束进程、掉电或超时都不能保证最后一次写入。退出钩子适合刷新少量待写状态，不适合等待用户交互或完成长时间网络请求。
