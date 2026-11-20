# 插件与宿主兼容性检查

新建工程的 `npm run check:compat` 检查 `ceru.plugin.json` 声明的宿主 API、逻辑运行时、组件库版本范围和播放器区域契约。存在冲突时命令退出码为 1；仅有提示时为 0。支持 `--json`，便于 CI 读取。

```sh
npm run check:compat
npm run check:compat -- --host ../ceru-host.json --json
npm run typecheck
npm run build
npm run validate
```

旧工程可运行 `npx --no-install ceru-plugin check-compat`，或在 `package.json` 中添加 `"check:compat": "ceru-plugin check-compat"`。

未传 `--host` 时使用该工具包构建时记录的运行时参考版本，结果的 `target` 为 `bundled-runtime-reference`。这不会检测电脑上安装的澜音，也不能证明某个安装包兼容。测试另一份宿主时传入该宿主维护者提供的 JSON，结果的 `target` 为 `host-profile`。以下是配置格式示例，版本应来自目标宿主构建：

```json
{
  "schemaVersion": 1,
  "hostApi": "3.0.0",
  "logicRuntime": "ceru-js@1",
  "componentLibraries": {
    "vue": "3.5.43",
    "tdesign-vue-next": "1.15.4"
  },
  "regions": [
    "player.lyrics@1", "player.artwork@1", "player.background@1",
    "player.visualizer@1", "player.songInfo@1", "player.stage@1", "desktopLyric@1"
  ]
}
```

宿主维护者可从**该安装包所用的 Core 包**的 `assets/compatibility.json` 获取元数据。此文件在工具链构建时从实际组件运行时依赖生成；若宿主自行替换运行时，应同步输出实际版本，不应使用另一个工具包的参考数据。

组件视图使用宿主 Vue、TDesign 和 SDK。检查会同时比较 SDK 支持范围与工程中的依赖范围；本地安装版本和宿主版本不同也会提示，避免编辑器类型与运行时不一致。普通 `web` 视图自行打包的框架不受宿主组件库版本约束。区域缺省后缀等同 `@1`，要求 `@2` 的区域不会被 `@1` 代替。

页面和皮肤模板的 Vue 开发依赖使用 `^3.5.21`，兼容桌面候选的 3.5.21 和工具包参考环境的 3.5.43。安装时可能选到范围内较新的类型包；兼容性检查会提示类型版本与宿主不同，但不会将受支持的宿主错误地拒绝。插件运行时仍使用桌面提供的 Vue，不将本地 Vue 副本打进组件产物。验证桌面候选时应使用随候选提供的 `ceru-host.json`，不要把参考环境版本当作实际桌面版本。

检查只读取 JSON 和已安装包的元数据，不执行插件、配置模块或安装脚本，不写出构建产物。它不检查组件所有 API 调用、声明权限能否获批、账号或设备可用性，也不代替类型检查、构建、真实桌面验收。
