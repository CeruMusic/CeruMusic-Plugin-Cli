# 澜音插件 v3 本地开发包

所有新建工程都提供 `npm run check:compat`，用于检查宿主 API、组件库和区域版本。默认与本工具包参考运行时比较；检查另一份桌面构建时运行 `npm run check:compat -- --host ../ceru-host.json`。通过后继续类型检查、构建和桌面验收，详见[兼容性检查](docs/COMPATIBILITY.md)。

此目录用于未发布版本的本地开发，不会安装或更新桌面软件。需要 Node.js 22.12 或更高版本及 npm。解压后在此目录打开终端：

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run templates
npm run create -- ../my-first-plugin --template playback-hook --lang ts
cd ../my-first-plugin
npm install
npm test
npm run dev
```

省略模板或语言可在交互终端用方向键选择。页面开发可选 `--template page-extension`；JS 可选 `--lang js`。只有 playback-hook 模板自带上述场景测试。`dev` 会打印要在「设置 → 插件管理 → 管理设置 → 插件开发者模式」添加的文件路径；关闭监听后运行 `npm run build` 和 `npm run validate`。无需全局 CLI。

播放器皮肤可用 `npm run create -- "../黑胶歌词" --template player-skin --lang ts`。生成后运行 `npm install` 和 `npm run dev`，将输出文件加入桌面开发者模式，然后在播放界面的「个性化 → 外观」选择「留声」。默认歌词和封面直接使用桌面组件。区域契约、模拟器和组件示例见[皮肤开发指南](docs/REGIONS-AND-SKINS.md)。中文目录名会保留为插件显示名。生成的 `manifest.id` 标识插件和它的数据；已有项目移动目录或改显示名时不要更改它。

随包文档与本次 SDK 一起打包，可在解压后直接阅读：[操作目录](docs/OPERATIONS.md)、[播放拦截与离线测试](docs/HOOKS-AND-EVENTS.md)、[组件视图](docs/COMPONENT-VIEWS.md)、[账号开发](docs/ACCOUNTS.md)、[宿主服务](docs/HOST-SERVICES.md)和[清单格式](docs/MANIFEST-V3.md)。

Ceru 自身的五个 v3 包随工具包交付，不会从 npm 选择其他代际。创建项目时校验包并复制必需的四个包到项目的 `.ceru-toolchain/`，依赖路径相对项目，可以移动目录。不要单独删除它。第三方依赖首次安装通常需要联网；已有对应 npm 缓存可加 `--offline`。离线场景测试只使用模拟播放器；最终应在匹配的桌面测试版验收。切勿在这里执行 npm publish。
