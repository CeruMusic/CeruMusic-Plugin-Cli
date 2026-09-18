# Ceru Plugin SDK

面向 Ceru Music v2 的 TypeScript 类型与小型作者辅助函数。

包含 PluginContext、分组 Provider、歌曲/歌词/歌单标准数据、宿主服务、权限组、Surface、资源引用、结构化错误、UI Slot、图标名和类型化 Lodash。运行能力由 Host 提供，SDK 本身不授予权限。

```ts
import { definePlugin, hostIcon } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('hello', async () => {
    const values = ctx.utils.lodash.uniq(['a', 'a', 'b'])
    ctx.log.info('Ready', { count: values.length })
  })
})

const icon = hostIcon('platform.tx')
```

动作需要在 Manifest 中声明。平台图标复用 Host 资源，不内嵌图片。

CLI 并非必需。插件也可以直接写成 `exports.manifest`、`exports.activate`、`exports.surfaces` 的单个 JavaScript 文件，通过 `require('@ceru/http')` 等内置模块使用相同能力。第三方 npm 包必须在发行前打入文件。

运行配置通过 `await ctx.config.get<PluginConfig>()` 读取。配置默认值来自静态 `exports.manifest.config`，个性化发行值来自签名后的 `personalization.config`；Host 递归合并后再交给插件。`definePluginConfig()` 可为外部 TS/JS 配置保留完整字段提示。

[完整指南与示例](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
