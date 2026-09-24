# Contributing

工具链问题、SDK、构建器和调试工作台请提交到本仓库。模板与社区成品插件请提交到 [CeruMusic-Plugin-Template](https://github.com/CeruMusic/CeruMusic-Plugin-Template)。

1. 使用 Node.js 22.12+，运行 npm ci。
2. 修改 packages 中对应模块，保持公共类型与运行行为一致。
3. 为行为变化补充有意义的测试；运行 npm test。
4. 涉及框架或调试行为时，运行相应 Electron smoke check。
5. 运行格式检查与 npm run pack:all，确认没有把密钥、测试工程或私有配置包含进 npm 产物。
6. 提交 PR，说明行为变化、验证方式与兼容性。

维护者发版：推送 `v<版本>` tag 触发 GitHub Actions 发布到 npm，流程与一次性配置见 [docs/release.md](docs/release.md)。打 tag 前跑 `npm run release:check -- v<版本>`。

模板快照从独立模板仓库同步。请不要只修改 packages/cli/templates 中的副本而不更新上游。

不要使用用户上传的脚本在主进程、CLI 校验器或社区 CI 中执行。涉及签名或权限边界的改变需要提供负向用例。
