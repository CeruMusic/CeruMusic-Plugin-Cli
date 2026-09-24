# create-ceru-plugin

0.3.10 修复交互向导结束后进程不退出：会话结束停掉挂起的 stdin 读取，CLI 正常返回。

0.3.9 修复 Windows 下方向键选择失灵：连续提问不再反复切换原始模式，避免输入被行编辑缓冲吞掉。

0.3.8 的脚手架支持方向键选择模板（每项带一行说明）与语言，目录非空会当场提示重填，创建后给出 `cd`／`npm` 步骤卡片；非交互终端仍输出纯文本。

0.3.5 的 `connected-library` 以 `playlistSections` 集成现有歌单页，并演示按 `sectionId` 导航定位。

0.3.3 的 `connected-library` 模板包含原生歌单网格、歌曲列表、账号摘要与 Host 播放／导入动作示例。

类似 create-vue 的 Ceru Music 插件脚手架。

```bash
npm create ceru-plugin@latest
```

也可以直接选择模板：

```bash
npm create ceru-plugin@latest my-plugin -- --template react --lang ts
cd my-plugin
npm install
npm run dev
npm run build
```

提供 9 种模板、TS/JS 变体、VS Code 配置、小 demo 与离线模板快照。最终只分发 dist/plugin.js。

脚手架是可选的：不需要第三方包或编译语法时，可以直接编写 `exports.manifest / exports.activate / exports.surfaces` 单文件插件。CLI 项目中的第三方依赖会打入最终 JS，Host 模块不会重复打包。

模板：source、connected-library、importer、guest-adapter、web-surface、vue、vue-tsx、react、web-dist。

[工具链指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme) · [模板和社区插件](https://github.com/CeruMusic/CeruMusic-Plugin-Template)
