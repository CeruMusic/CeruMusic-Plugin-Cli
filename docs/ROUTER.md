# 插件路由

v3 逻辑入口提供 `ctx.router.current()`、`push(to)`、`beforeEach(handler)` 和 `afterEach(handler)`。current 返回主窗口当前的具名页面（没有公开页面时返回 null）；push 接受 `{ name, params?, query? }`，成功切换返回 true，取消或重复跳转返回 false。不能传任意路径、外部 URL 或辅助窗口名称。

只有 beforeEach 需要在 uses.permissions 中声明 navigation.intercept，并由用户另行授予。取消、改写或超时影响的是当前导航。未授权、撤权、全局暂停或该守卫暂停时，导航按默认行为执行。每个插件每次处理限时 500 ms；返回 false 取消，返回合法具名目标重定向，返回 undefined 放行。异常或超时放行，十分钟内三次失败会暂停该插件的路由守卫。

```ts
export default definePlugin(ctx => {
  const stop = ctx.router.beforeEach(async to => {
    if (to.name !== 'plugin-page' || to.params.pluginId !== ctx.plugin.id || to.params.pageId === 'login') return
    if (!(await ctx.storage.get('signedIn'))) {
      return { name: 'plugin-page', params: { pluginId: ctx.plugin.id, pageId: 'login' } }
    }
  })
  return stop
})
```

login 必须在自己的 ui.pages 中声明且当前可见。插件使用清单 id，桌面负责映射到安装实例。不能重定向到另一个插件。

路由快照只保留公开字段。list 保留安全的 id、type、source；search 保留 keyword；settings 保留 section。插件页保留 pluginId、pageId；只有所属插件能看到它自己的查询字段。afterEach 只报告成功导航，失败与取消不通知。两个监听接口都返回解绑函数；停用插件会释放监听。
