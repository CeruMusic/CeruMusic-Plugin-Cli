# 发版

推送 `v*` tag 触发 [`.github/workflows/release.yml`](../.github/workflows/release.yml)：校验版本后跑测试与打包，按依赖顺序把 5 个包发到 npm，再用打包产物建 GitHub Release。

## 双版本发布边界

`0.3.16` 与 `3.0.0` 已于 2026-11-21 发布并逐项核对 npm 官方版本及标签。`0.x` 正式版使用 `legacy-v2`，预发布使用 `next`，v3 正式版使用 `latest`。v2 补丁从 `release/v2` 发布，可用 `npm i @shiqianjiang/ceru-plugin-core@legacy-v2` 安装。桌面 2.5.0 Release 按用户最新要求暂缓，等待后续修改和再次确认。

## 认证：Trusted Publishing（无 token）

发布走 npm [Trusted Publishing](https://docs.npmjs.com/trusted-publishers)（GitHub Actions OIDC），仓库里不存任何 npm token，也不需要配置 `NPM_TOKEN`。**不要给发布步骤加 `NODE_AUTH_TOKEN`**：传统 token 的优先级高于 OIDC，一旦提供就会覆盖掉可信发布。

每次发布由 npm 自动附带 provenance 证明（可信发布 + 公开仓库 + 公开包三个条件同时满足）。因此：

- 工作流必须跑在 GitHub 托管 runner 上（自托管 runner 不支持 OIDC）。
- 各包 `package.json` 的 `repository.url` 必须与 GitHub 地址大小写完全一致，否则发布被拒。
- npm CLI 需 ≥ 11.5.1、Node 需 ≥ 22.14，工作流里已用 `npm install -g npm@^11.5.1` 保证。

## 一次性配置

在 npmjs.com 上给下面 5 个包各加一个 Trusted Publisher（包页面 → Settings → Trusted publishing → GitHub Actions）：

`@shiqianjiang/ceru-plugin-sdk`、`@shiqianjiang/ceru-plugin-issuer`、`@shiqianjiang/ceru-plugin-core`、`@shiqianjiang/ceru-plugin-cli`、`create-ceru-plugin`

| 字段                 | 值                                               |
| -------------------- | ------------------------------------------------ |
| Organization or user | `CeruMusic`                                      |
| Repository           | `CeruMusic-Plugin-Cli`                           |
| Workflow filename    | `release.yml`（只填文件名，不要路径）            |
| Environment name     | 留空                                             |
| Allowed actions      | 勾选允许直接 `npm publish`，不能只留 staged 发布 |

字段大小写、文件名、扩展名必须与仓库完全一致，npm 在保存时不校验，填错只会在发布时报 `ENEEDAUTH`。此外，只有 `npm publish` / `npm stage publish` 支持 OIDC，其他 `npm` 命令（`whoami`、`access` 等）仍需要传统认证。

新包无法用可信发布完成首次发布：先在包页面上不存在，配置项也无处可加。新增包时先用 `npm login` 手工发布一次，再加 Trusted Publisher。

## 发版步骤

版本号由人工维护，5 个包（含内部精确依赖、`package-lock.json`、CLI 模板快照）必须同版本；工作流只做校验，不替改版本。

```bash
node scripts/bump-version.mjs 3.0.0
# 如需调整模板依赖，先修改模板源仓库，再同步快照；不要直接编辑 CLI 快照。
# node scripts/sync-templates.mjs <模板源仓库>/templates
npm install --package-lock-only --ignore-scripts
npm run release:check -- v3.0.0
npm test
npm run pack:all
```

`scripts/bump-version.mjs` 已纳入版本库，只更新五包的版本与内部精确依赖，不自动更新 lockfile 或模板源。模板应按任务书从源仓库同步，随后检查 lockfile。旧 `.release-audit/bump-native.mjs` 不在版本库中，不能作为交付步骤的依赖。

以上命令仅做本地准备。检查通过后，提交、标签、推送及正式发布仍按用户明确授权执行；2026-11-21 用户已明确同意统一发布；正式状态以发布记录为准。v2 维护版使用 `release/v2` 分支和对应的 `0.3.x` 版本号，不从 v3 工作树降版本。

## 工作流做了什么

1. `scripts/check-release-version.mjs`：要求 tag 版本、5 个 packages 的 `version` 与它们之间的内部依赖（精确版本）三者完全一致，否则直接失败。
2. `npm ci` → `npm test`（ubuntu）→ `npm run pack:all`：打包会扫描产物，拒绝私钥、`.env`、`.npmrc` 与 `node_modules`；产出的 tgz 就是 Release 附件。
3. 按 `sdk → issuer → core → cli → create` 顺序执行 `npm publish --tag <对应标签>`。内部依赖是精确版本，顺序颠倒会在发布窗口期出现装不上的版本组合。
4. 使用触发工作流的标签创建 GitHub Release，附上 `artifacts/*.tgz`，并用 `--verify-tag` 确认标签已存在；不写死旧版标签。

## 失败与重跑

发布步骤是幂等的：registry 上已存在该版本的包会被跳过，只补发剩下的包。所以任何一种中断都能直接重跑 workflow：

- 某个包发布失败 → 修好后重跑，前面成功的包自动跳过。
- 包都发出去了，只有 Release 或某个后续步骤失败 → 重跑只补 Release。
- 版本已经在 npm 上、再打一次同名 tag 推送会被 checkout 之前的 tag 冲突挡住；若 tag 未推送成功则 Release 步骤会因为 tag 不存在而失败，不会静默通过。

要确认包已带 provenance：`npm audit signatures`，或看包页面上的 provenance 标记。

## 备注

- `test.yml` 仍会在 tag 推送时跑一遍双平台矩阵，与本地发布前验证重复，只是多花几分钟。
- 历史上 0.3.x 是手工发布且没有打 tag，最后一个 tag 停在 `v0.2.5`。因此下一次发版的 Release notes 范围会覆盖 `v0.2.5` 之后的全部提交。


2026-11-21 实际发布检查修正：npm 将 `v2` 识别为有效 SemVer 范围，拒绝作为 dist-tag（`Tag name must not be a valid SemVer range: v2`）。维护标签改为 `legacy-v2`；版本仍为 `0.3.16`，分支仍为 `release/v2`。任务书原 `--tag v2` 命令保留作设计历史，实际使用 `--tag legacy-v2`。

最终离线作者套件 `ceru-devkit-3.0.0-6eb53b48ce34` 的 28 个组合已全部通过：原 8 个及续跑 20 个，均使用同一套件，分别留存日志；同时通过最终打包 v2/v3 双运行时检查。
