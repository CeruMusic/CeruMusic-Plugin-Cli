# Manifest v3：声明与迁移

v3 项目在 `ceru.plugin.json` 的 `manifest` 中声明协议。下例是可运行的最小音源清单；实际搜索方法仍须在 `exports.activate`（脚手架中为默认导出的逻辑入口）调用 `ctx.providers.register` 注册。

```json
{
  "manifestVersion": 3,
  "id": "example.catalog",
  "name": "示例音源",
  "version": "1.0.0",
  "engines": {
    "hostApi": "^3.0.0",
    "logicRuntime": "ceru-js@1"
  },
  "entry": {
    "logic": {
      "module": "logic.main"
    }
  },
  "provides": {
    "providers": [
      {
        "id": "catalog",
        "name": "曲库",
        "protocols": [
          "music.search@1"
        ]
      }
    ]
  },
  "uses": {
    "permissions": []
  }
}
```

## 字段

| 路径 | 含义 |
| --- | --- |
| `manifestVersion`, `id`, `name`, `version` | 协议必须是数字 3。更新时保持 `id`，它决定安装身份和数据所有者；软件版本与协议版本不同。 |
| `description`, `author`, `publisher`, `homepage`, `license` | 展示或归属元数据。不要在这些字段中放入凭据。 |
| `engines` | `hostApi` 是协议版本范围，`logicRuntime` 描述逻辑运行环境。`libraries` 可声明框架版本要求，不代表宿主已支持组件视图。 |
| `config`, `dataSchemas` | 私有默认配置，以及配置和状态数据的版本。公开描述不导出 `config`；同 ID 原位升级不自动擦除已保存的数据。 |
| `entry.logic`, `entry.share` | `module` 必须对应交付文件中的模块。分享模块只能取得 `configKeys` 明确列出的配置；可用 `guestAdapterId` 和 `guestGlobals` 描述子音源绑定。 |
| `entry.views` | 每个视图有 `id`、`kind`、`module`；可指定标题、抽屉/模态框展示参数和打开/关闭动作。基础宿主支持 `native` 与 `web`。`schema` 是 v2 专属。 |
| `provides` | `providers` 声明音源和协议；`importers` 声明歌单导入器；`lyricConverters` 声明歌词格式；`actions` 使用实际注册的动作 ID；`guestAdapters` 声明可管理的子插件格式。 |
| `uses.permissions` | 每项有 `key`, `name`, `reason`，按需指定 `scope`, `optional`, `requiredFor`。运行时授权绑定键、能力名和作用域；扩大作用域不会继承授权。 |
| `guestPolicy` | 子插件只有一层，授权属于各自子插件。停止或替换父插件不会把子插件授权转给新身份。 |
| `ui` | `pages` 指定页面与挂载点；`homeSections` 指定歌单或榜单；`slots`, `menus`, `styles` 描述已有 UI 扩展点。声明是元数据，不会执行或授权插件代码。 |
| `ui.pages[].when` | 可省略。`selectedSource` 填平台的 provider ID，例如 `catalog`，与用户当前选择的可用音源匹配；不看正在播放的歌曲或实现插件 ID。`loggedIn` 指软件账号登录状态，不代表第三方平台登录。两项同时声明时必须都满足。 |
| 组件与皮肤 | `entry.views[].kind: component` 声明组件视图；`ui.regions`、`ui.skins` 组合播放器区域，见[皮肤指南](REGIONS-AND-SKINS.md)。 |
| 账号与服务 | `provides.accounts` 声明账号、登录方式与能力，见[账号指南](ACCOUNTS.md)。`provides.services` 声明服务，`uses.plugins` 声明消费者的依赖，见[宿主服务](HOST-SERVICES.md)。 |
| 服务与原生模块 | `entry.server` 的沙箱入口使用 Web Request/Response；Node 入口需要安装时确认完全信任。`entry.native` 按平台声明带哈希的 Node-API 资源。见 [服务与音频流](SERVER-AND-STREAMS.md)。这些能力当前属于本地 2.5.0 候选，尚未发布。 |

## 从 v2 迁移

保留旧项目可继续使用冻结的 CLI `0.3.16`。迁移请在项目副本上使用**本地安装的 v3 CLI**：

```sh
ceru-plugin migrate --project ./my-plugin
ceru-plugin build --project ./my-plugin
```

| 旧字段 | 新字段 |
| --- | --- |
| `modules.logic/share/surfaces` | `entry.logic/share/views`；把 `entry` 属性改为 `module`。 |
| `contributes.providers/playlistImporters/lyricConverters/guestAdapters` | `provides.providers/importers/lyricConverters/guestAdapters`。 |
| `contributes.commands` | `provides.actions`；使用原 `action` 值作为 ID，同步命令入口和菜单引用。 |
| `permissions` | `uses.permissions`。 |
| `sidebarItems/settingsPages/playlistSections`、自定义首页 | `ui.pages`，挂载点分别为 `sidebar/settings/playlist-section/home-tab`。歌单、榜单保留在 `ui.homeSections`。 |
| `uiExtensions/menus/styles` | `ui.slots/menus/styles`。 |

迁移命令只改项目清单，不执行或改写逻辑，也不更新包依赖。`schema` 页面、旧账号菜单不能无损转换，会报出具体字段并保留原文件。迁移后手动调整项目 SDK/CLI 依赖，并把旧 provider 顶层方法（如 `search`）改为 `tracks.search` 等分组方法。不要把容器 `formatVersion: 2` 改为 3。

桌面端先只读识别版本，再交给相应 core 完整校验。坏文件保留在列表中；不会尝试用另一代沙箱启动。

### 兼容旧宿主的更新入口

本轮本地开发将首个支持 v3 的桌面目标版本定为 **2.5.0**，常量 `FIRST_V3_APP_VERSION` 为 `2.5.0`。这是一项待最终发布批准的版本选择，不表示 npm 或桌面安装包已经发布。v2 兼容发行线继续固定使用 0.3.16 工具链，后续 v2 维护包使用 npm 的 `legacy-v2` 标签。

仍需在 v2.4.0 上工作的旧插件应保留 v2 发行文件，只在宿主版本足够时引导用户安装自己的 v3 文件。不要把当前插件的更新地址直接切成 v3 专用包：

```ts
import { gte } from 'semver'

const FIRST_V3_APP_VERSION = '2.5.0'
const { version } = await ctx.app.getInfo()
if (gte(version, FIRST_V3_APP_VERSION)) {
  // 在用户主动更新时选择自己的 v3 插件发行地址。
  // 此 URL 指向插件文件，不是桌面程序或 npm 包。
  await ctx.ui.pluginUpdate.request({
    url: 'https://plugins.example.com/my-plugin-v3.js',
    version: '3.0.0',
    notes: '适用于澜音 2.5.0 及以上版本',
  })
}
```

示例域名需要替换为开发者自己的发行地址；`semver` 是由插件构建器打包的依赖。旧宿主继续停留在 v2 插件，不自动跳过兼容性检查。

## 插件间服务（仅 v3）

提供方示例：

```json
{"provides":{"services":[{"id":"echo","version":"1.2.0","methods":["reply"]}]}}
```

调用方示例：

```json
{"uses":{"permissions":[{"key":"useEcho","name":"services.consume","reason":"使用回声服务"}],"plugins":[{"pluginId":"example.provider","service":"echo","version":"^1.0.0","optional":true}]}}
```

使用清单中的插件 ID（不是桌面安装记录的哈希或开发文件路径），并匹配服务自己的版本。默认硬依赖：不满足时保留记录与启用意愿，但不运行逻辑；软依赖缺失时 `use` 返回 `null`。接口、参数与权限见 `HOST-SERVICES.md`；真实调用与注册示例见 SDK README。
