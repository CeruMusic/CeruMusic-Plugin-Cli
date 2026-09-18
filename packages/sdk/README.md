# Ceru Plugin SDK

面向 Ceru Music v2 的 TypeScript 类型与小型作者辅助函数。

包含 PluginContext、SurfaceContext、Provider、资源引用、权限名、结构化错误、UI Schema、图标名和类型化 Lodash。运行能力由 Host 提供，SDK 本身不授予权限。

~~~ts
import { definePlugin, hostIcon } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('hello', async () => {
    const values = ctx.utils.lodash.uniq(['a', 'a', 'b'])
    ctx.log.info('Ready', { count: values.length })
  })
})

const icon = hostIcon('platform.tx')
~~~

动作需要在 Manifest 中声明。平台图标复用 Host 资源，不内嵌图片。

[完整指南与示例](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
