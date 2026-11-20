# v3 工具链本地验收（不发布）

### 2026-11-21：末轮静态检查与模板源核对

计划要求的只读 ESLint 已覆盖 362 个改动文件，修正后 0 错误、5,066 条现有警告；未运行全仓库 --fix，也未批量改写风格。扫码 HTTPS 地址必须在 URL 归一化前拒绝原始控制字符，原正则有意用于此安全检查，增加带原因的单行 lint 说明，校验逻辑未变；另将 hook 策略测试清理前的直接 throw 改为 Jest 断言。扫码、策略和升级保留三个测试套件共 41/41 通过，包含 36 项升级回归。扫码源码与打包源码去除新增注释后完全相同，去注释转译后的 JavaScript 也一致，因此不重建或替换安装包。

当前模板源与 CLI 快照的 419 个文件逐字节一致；147 个契约方法均在 HOST-SERVICES.md 中列名，操作目录生成器 --check 通过。计划列出的 21 份文档/README 均存在且记录当前哈希；文件存在与方法列名仅证明文档覆盖，不替代运行验收。证据为交付目录 qa/final-plan-consistency.json、qa/final-eslint-summary.json 和 qa/final-lint-related-tests.log。安装器与开发包指纹保持上一检查点不变；两次真实覆盖升级及原自动切歌数值门槛仍未关闭，用户已确认的人工通过结果保留。

### 2026-11-21：区域视图限制、最终工具链回归与本地安装包

当前本地候选为 `ceru-music-2.5.0-region-policy-win-x64-setup.exe`，SHA-256 `4AD29404933FABC51735AD4F0FB77725E689B295D964947CF8E855EA94168612`；内嵌与受测 ASAR 均为 `027B51E44B89A1530D5679171EBFFA1A0471157FD5C6671D2D273A5E27440C91`。助手未执行安装器，未提交、推送、打标签或发布。下文较早记录中的“当前”均指各自历史检查点。

补齐任务书 §4.13.7：区域视图中的 Worker、SharedWorker 和 WebAssembly 在清单读取、签名及桌面安装前拒绝；Canvas/WebGL 及逻辑端 `ctx.wasm` 保持可用。只对 `ui.regions` 引用的组件视图增加限制；静态检查不称为 JavaScript 沙箱。实际旧包先复现漏拦，最终包拒绝安装且贡献列表不变。

跳过安装脚本后曾漏掉 Windows 注册表原生模块，已通过现有 `prepare-native-modules.mjs` 补齐；打包前检查现在会明确拒绝缺少该模块的 Windows 构建。最终 6 项 Electron 检查均实际加载该原生模块。安装器内嵌 ASAR、SQLite 和 registry-js 原生文件与受测文件一致。与上一个账号 UI 候选比较全部 7,482 个打包/解包文件，仅两份 issuer JavaScript 有预期变化，无新增/删除；冻结 v2 的 106 个文件完全一致。

最终工具链全量 **294/294，0 失败、0 跳过**；区域策略/皮肤/加密相关专项 8/8。桌面完整 Jest **237/237、50 suites**，包含 36 项升级回归。Node/renderer 类型检查通过；本次后续变更仅为 issuer、文档和构建/验收脚本。实际最终 ASAR 的共享组件、自定义扫码、默认扫码、网易云账号模拟接口、动态 Tab 与基础兼容播放 6 项全部通过。自定义扫码仍验证 CSS 不外溢、主题变量同步、真实 iframe 焦点后的 Esc 和登录生命周期。

最终开发包 `ceru-devkit-3.0.0-6eb53b48ce34.zip`，SHA-256 `1123E89CFE9B6A2D277DC404D8DDDEDACA291DEA35D1606D24A3936812DBDA0D`；22 条目逐项一致，五包 659 文件与当前构建相同。最终包独立安装的皮肤、页面、加密音源、扫码登录 × JS/TS 共 8 组合全部通过，包含兼容性、类型、构建、校验和适用的监听修复检查。使用已有 npm 缓存；此前 28 组合单独保留，不写作最终包全量重跑。SDK/Core/create 归档未变，CLI 仅 README 修订，issuer 为本次区域检查变化。

你的真实账号登录/切换、重启保留、账号隔离及退出保护、所选 DLNA/LAN 和人工性能均已记为用户实测通过，不要求重复确认。两次真实 Windows 覆盖升级仍未确认；历史自动切歌绝对差 36.905ms（另一次约 39.834ms）未改写，不能据人工通过推断修改了原 5ms 数值要求。完整证据见交付目录 `qa/region-policy-summary.json` 与 `qa/user-manual-acceptance.json`。

### 2026-11-20：用户实测反馈补录

用户在当前对话中逐项确认：真实平台账号登录和切换“通过并且符合预期没有bug”；关闭重开后登录“保留”；账号间推荐/收藏/歌单隔离及退出后的访问保护“没问题”；所选 DLNA/局域网播放、控制、授权及撤权访问检查“没问题”；人工性能检查“通过”。上述项目记为**用户实测通过**，原始反馈与对应批注 ID 见交付目录 `qa/user-manual-acceptance.json`。

用户没有补充具体测试安装器的版本/指纹或原始性能 trace，因此本记录不将这些反馈描述为助手针对最终 ASAR 新执行的测试，也不扩展为所有未选细分步骤都已验证。此前自动切歌绝对差 36.905ms（另一次分段复核约 39.834ms）仍超过原 5ms 数值标准；人工性能验收已由用户确认通过，自动数值记录保持不变，未推断用户已修改数值标准。

两次真实 Windows 覆盖升级尚未收到确认。此次只补录验收，不改变程序、安装器和脚手架，不授权发布；助手未执行安装器。

### 2026-11-20：自定义扫码内容、样式隔离与 Esc（最终本地候选）

SDK 的 `AccountQrCode` 新增可选 `view`，导出公开 `AccountQrViewState`。CLI 与模板仓库新增 `account-qrcode` JS/TS 示例，提供宿主默认模板、宿主 Vue/TDesign 组件与纯 HTML/CSS。省略 `view` 兼容已有插件；凭据和票据不传给视图。

桌面统一使用 sandbox iframe 隔离扫码自定义内容，外层弹窗及生命周期由软件管理。宿主同步白名单 CSS 主题变量，组件使用 Host 运行库，closed Shadow DOM 按真实内容测高。Core 还转发扫码视图未被处理的 Escape，使焦点在 iframe 内时也能关闭。实际 Electron 已验证 CSS 不外溢、主题/主题色、测高、真实子文档焦点后的 Esc、取消、过期和成功流程。

`account-custom-all-tests.log`：292 项中 289 通过、0 失败、3 项环境条件跳过，运行在最后测高/Esc 修复之前。最终 `account-custom-escape-focused-tests.log` 12/12 通过；`account-custom-status-worker-tests.log` 另检查 JS/TS waiting→scanned→done 序列。模板仓库校验 28 变体及 5 份社区提交通过。

当前开发包为 `artifacts/ceru-devkit-3.0.0-05aeb712e252.zip`，C5C45FD5719FC912FC2FF2CFB4E319FD6F2E8FB6C3552EB715A2CF84A36C45DB，22 文件逐项与目录相同。`account-custom-size-devkit-verify.log` 的 28 个独立安装组合全部通过，测试对应前包 `d2d48e1361ae`；最终仅 Core 的 `package/assets/sandbox.js` 增加扫码 Esc 转发，另外四个归档逐字节相同，见 `artifacts/account-custom-final-package-delta.json`。最终包 `account-custom-escape-devkit-verify.log` 的扫码 JS/TS 两组合再次通过。没有将前包 28 组称为最终 Core 全量重跑，且使用本机已有 npm 缓存。

`artifacts/account-custom-tested-packages.json` 验证最终五包 659 文件与构建逐项一致。桌面最终 ASAR 的 6 项实际检查及 36 项升级回归通过，冻结 v2 的 106 文件不变，安装器内嵌 ASAR 一致；详细指纹见桌面交付 `qa/account-ui-fix-summary.json`。助手未执行安装器、未发布；后续用户已确认账号、所选设备检查及人工性能通过，见顶部补录。覆盖升级仍待确认，历史自动性能数值保持原记录。下文“当前”指历史检查点。

### 2026-11-20：当前源码全量回归补验

`artifacts/desktop-host-final-full-tests.log`：`npm test` 退出 0，重新构建五包、宿主组件类型检查和操作目录一致性检查通过；288 项中 285 通过、0 失败、3 项环境条件跳过。随后配置现有 Electron、真实 SQLite 原生模块以及 Express/Koa/ASAR 测试依赖，`artifacts/desktop-host-final-trusted-tests.log` 的 24 项专项全部通过，无跳过，包含前述三个条件用例。专项包含重复用例，不将两组通过数直接相加。

`artifacts/desktop-host-tested-package-comparison.json` 对五个归档内全部 633 个文件与本次全量回归后的源码/构建结果逐项比较，内容均一致，因此上述回归对应当前交付开发包 `b04136d3a64b`。没有重新发布或替换包版本。独立 26 组合作者安装结果仍见下节；真实平台、设备和人工覆盖升级不包含在 Node 测试通过结论中。

### 2026-11-20：当前交付与实际宿主兼容性

当前开发包为 `artifacts/ceru-devkit-3.0.0-b04136d3a64b.zip`，4,242,458 字节、22 文件逐项一致，SHA-256 `06CEE7DB6F2C7E17E4367C8815388B451475C8C638CFFB576E64F66E1102C338`。目录版同名不带 `.zip`；归档比较见 `artifacts/desktop-host-devkit-summary.json`。SDK、issuer、Core、create 四个归档与上一检查点逐字节相同；CLI 仅改四份页面/皮肤模板的 `package.json` 及模板快照，没有运行时代码差异。

交付核对发现页面/皮肤模板将 Vue 写死为 3.5.43，导致实际桌面 Vue 3.5.21 被 `check:compat --host` 错误拒绝。新增测试先复现失败，修复后 `artifacts/desktop-host-compatibility-tests.log` 13/13 通过，覆盖 JS/TS 页面和皮肤对 3.5.21、3.5.43 的声明兼容性。模板源的四份配置改为 `^3.5.21` 后同步到 CLI；393 文件指纹为 `sha256:81d1bcf718b7b0a2b9a800f3407206dfdbb18a3451f8b2d540e71a65470642bb`。模板仓库校验 26 变体及 5 份社区提交通过。

新版目录包 26 个组合全部完成独立安装、兼容性检查、类型检查、构建和产物校验；每个组合还通过实际桌面 Vue 3.5.21、TDesign 1.15.4 的 `check:compat --host`。结果见 `artifacts/desktop-host-matrix-results.json`。首次运行完成 18 个组合后，页面 JS 因离线缓存缺少 Vue 3.5.45 的依赖退出 1，日志完整保存在 `artifacts/desktop-host-devkit-first-attempt.log`。允许补齐依赖后，仅续跑剩余 8 个组合，`artifacts/desktop-host-devkit-remaining.log` 退出 0；没有把首次运行称为全量通过。两种皮肤的错误产物保留、监听恢复和动画钩子，以及 TS hook 移动目录后的监听均通过。测试使用现有缓存并允许补齐缺项，不代表全新空缓存机器的网络验收。

桌面候选与安装器沿用下述已验证的 CSP 版本，14 项安装包检查与额外开发模式启动检查的结果不变。固定本地交付目录为桌面工作树的 `dist/plugin-upgrade-local-2.5.0`，含安装器、开发包、实际 `ceru-host.json`、指纹及完整验收记录。待人工覆盖升级、真实设备/账号、性能面板及切歌绝对差 ≤5ms 的边界不变，未发布。

### 2026-11-20：共享组件版离线开发包（上一检查点）

上一检查点作者目录为 `artifacts/ceru-devkit-3.0.0-60d76a539641`，同名 ZIP 为 4,245,060 字节、22 个文件，逐项解压比对一致；SHA-256 为 `479DE0533E362461613E7F9C055D67182CBE12C0A56AC18892F4660F60800E73`。五包元数据见 `artifacts/component-devkit-summary.json`；Core SHA-1 为 `231a3c328f1ff3ce0774b4de9a33397dc6c0adad`，包含实际 utilityProcess 传输入口和 `component-runtime` 浏览器入口。与前包 `95fcea54caf3` 相比仅修订三份指南、新增当前验证范围与历史记录两份指南；五个归档、创建脚本及其他非文档文件逐字节相同。比较与 ZIP 校验见 `artifacts/component-csp-docs-devkit-summary.json`。历史包 `95fcea54caf3` 的 ZIP SHA-256 为 `B9480D9E3557D58432FED1567FB87CAED7B14D2ED3A9FACEE1A3FB193498076D`。

`artifacts/component-sizing-devkit-verify.log` 已退出 0：前包 `95fcea54caf3` 的 26 个模板/语言组合独立安装、兼容性检查、类型检查、构建与产物校验全部通过。还覆盖目录移动、页面子组件、JS/TS 皮肤错误后保留原产物并恢复监听、导出的动画钩子和加密音源。逐项结果见 `artifacts/component-sizing-matrix-summary.json`。本次仅改文档，通过非文档文件逐字节比较沿用上述结果，没有重复执行 26 次安装。使用现有 npm 缓存，不代表空缓存网络安装验收。

JS/TS 皮肤模板的宿主歌词和自定义歌词改用区域高度，背景改用区域内定位，避免从 iframe 改为主渲染器后 `100vh` 和固定定位越界。模板源与 CLI 的 393 文件快照一致，指纹 `sha256:9c293801298e0985fd190317840d439116366809c58c92dc033af71c8a63cb36`。`artifacts/component-skin-sizing-test.log` 4/4 通过。实际干净桌面包中的 JS 歌词/封面/背景热更新为 866/883/361ms，TS 为 845/852/850ms，区域尺寸、兄弟会话和连续播放检查通过。

实际桌面包的 JS/TS 页面与皮肤热更新、同一宿主 Vue/组件、共享时钟/频谱、严格模式、退出清理等结果统一记录于桌面 `docs/plugin-upgrade-local-qa.md`。以下旧开发包指纹与早期替代架构均为历史检查点，不作为当前包的实现说明。未提交、推送或发布。

配套宿主后续修复了桌面歌词窗口读取严格模式的权限检查，并补充主渲染器 CSP；当前 ASAR SHA-256 为 `4D494310D4B4B0BC781382FDEE37759E517BFA1F4509B942C308F5C8B8EA7965`。CSP 允许 Blob/data 与固定版本 TDesign 图标脚本，阻止任意内联脚本和未授权外链，保留现有指纹/图形库需要的 `unsafe-eval`。统计页面单独隔离，其内存存储初始化以固定哈希放行。

当前宿主 14 项实际 Electron 检查退出 0，覆盖共享组件、v2/v3 基础兼容、舞台与桌面歌词、真实 JS/TS 页面及皮肤热更新、个性化面板动画、区域降级、禁用原因 Tooltip、登录与账号隔离。默认/皮肤各连续播放一分钟，平均主帧工作耗时 1.919/0.805ms、绝对差 1.114ms，无逐帧 IPC。新安装器内嵌 ASAR 与受测文件一致，未执行。另有独立开发模式检查 `component-csp-icons-dev-startup-final.log` 退出 0：使用真实 electron-vite 配置、Vite 服务和临时 profile，三处 `component-runtime` 引用转换成功，实际页面和热重载通过，无渲染异常。此检查不计入 14 项安装包测试。详细日志、安装器指纹及仍待验收项目见桌面 `docs/plugin-upgrade-local-qa.md`；人工操作清单见桌面 `docs/plugin-upgrade-manual-acceptance.md`，不能据此宣布整份计划已经完成或发布。

另行对最终构建与旧基线各连续切歌 100 次，当前平均 358.195ms、旧版 395.100ms，操作及快照 IPC 增量均为 0；当前快约 36.905ms，但文档要求的绝对差 ≤5ms 仍未通过。该失败单列保存，没有混入上述通过项目；真实覆盖安装、物理设备和真实账号也仍待验收。

### 2026-11-20：独立进程与共享组件运行时

Core 增加宿主可注入的 utilityProcess 传输，使用带令牌的独立 MessagePort 握手和有界 RPC。开启此传输前必须明确提供 unrestricted 文件访问同意；Node/CLI 传输保留原权限参数。`utility-trusted-complete.log` 24/24 通过，无跳过；实际 Electron utility 与完整桌面授权 UI 的证据记录在桌面报告。

新增浏览器入口 `@shiqianjiang/ceru-plugin-core/component-runtime`，Vue、TDesign、SDK 和 AML 内核保持 external，交由桌面自己的依赖解析。组件文档同时返回已经校验的 ESM 工厂源码。普通桌面视图使用主渲染器 Shadow DOM，严格模式继续使用原 iframe 路径。`component-full-tests.log` 全量 287 项中 284 通过、3 项跳过；宿主组件的四项渲染测试直接导入发布入口，全部通过。

桌面的 `component-author.log` 使用真实 CLI 分别生成 JS/TS 页面，在主渲染器中验证搜索和保存后更新，耗时 832/842ms。当前完整开发包与独立安装矩阵见上方；下方较旧的开发包指纹仅对应此前检查点。

### 2026-11-20：开发者兼容性检查

新增 `ceru-plugin check-compat`、`--host profile.json` 与 `--json`；26 个模板都提供 `npm run check:compat`。检查宿主 API、逻辑运行时、SDK 的组件库支持范围、工程开发依赖范围和区域契约。组件模板的 Vue 由 3.5.21 对齐到实际运行时 3.5.43；普通 web 视图仍自行打包框架，不受宿主组件版本约束。默认报告明确标注为工具包参考版本，不宣称检测到了已安装桌面。检查不执行配置模块或插件，报告仅保留公开兼容性字段。

完整回归 `artifacts/compatibility-full-test.log` 已退出 0：284 项中 281 通过、3 项环境条件跳过。随后补充 SDK 支持范围和报告字段投影，最终构建通过，`compatibility-final-tests.log` 的 12 项专项全部通过、无跳过。模板仓库的 26 个变体与 5 份社区插件校验通过。五包版本/内部依赖检查通过，没有创建标签或发布。

当前作者目录为 `artifacts/ceru-devkit-3.0.0-6048808eb63c`，ZIP 4,229,216 字节、20 文件逐项一致，SHA-256 `A12AAB64C7CF2463A61C8B99970A15C8644279A3155F28D37F445FBC78D880ED`，含兼容性指南。`artifacts/compatibility-matrix.log` 已退出 0：26 个模板/语言组合分别独立安装，通过新增兼容性检查、类型检查、构建和产物校验；并验证页面子组件渲染、移动目录后的监听、服务授权、JS/TS 皮肤故意编译失败后恢复、动画钩子和加密音源。使用本机 npm 缓存，未在空缓存的新机器验证网络安装。

Core SHA-1 `2e081f1332459cf4a0a8834d04843d7004f4f93f` 与此前受测包相比，只新增 `assets/compatibility.json`，其余归档文件内容相同；SDK/issuer 哈希未变。桌面源码和独立候选目录仅更新 Core 本地归档及锁文件，没有安装依赖、修改运行中的桌面或重建既有安装器。因此此前 ASAR 的运行验收不能写成“新安装包已验收”。主渲染器零拷贝与 utilityProcess 的实现差异，以及覆盖安装、物理设备、真实账号等剩余验收仍见桌面 QA，未将整份任务书标为完成。

此前检查点（2026-11-20）：本地 Core/SDK/CLI 已含 23 个主动操作、沙箱 HTTP、Node 完全信任入口、资源校验及 JS/TS 加密音源模板。当时全量 `artifacts/region-budget-full-tests.log` 为 273 项：270 通过、3 项按环境条件跳过；其后的整秒阻塞边界专项 10/10 通过。另设置真实依赖与 Node-API 二进制后，`server-final-trusted-tests.log` 的 23 项全部通过、无跳过。当时作者目录为 `ceru-devkit-3.0.0-d0d6f4a89ef7`，ZIP SHA-256 为 `64D6075543151CCA19C6C84E725197A987C04FCFC80D38D2EE3B05AEC8312F14`；ZIP 的 19 个文件已逐项与目录版对比。下文历史包和阶段性失败保留，不应视为当前包结论。

该作者目录的 `artifacts/server-final-matrix.log` 已退出 0：26 个模板/语言组合逐一在独立作者目录安装依赖、构建并校验产物。包括 Vue 普通 script 与子组件实际渲染、移动项目后的 TS 监听、服务授权、JS/TS 皮肤故意编译失败后恢复监听、动画导出，以及两个加密音源模板。第三方包使用本机 npm 缓存；这不是在空缓存或另一台机器上的联网安装结论。目录版通过矩阵，ZIP 通过逐文件一致性检查；没有宣称另外从 ZIP 重跑了 26 次安装。

### 2026-11-20：区域耗时检测修正

Core 现统计区域更新的实际耗时，包含帧回调、Vue 批处理和布局读取；不再用 RAF 间隔代替插件工作时间。增加低频调度不误报、整秒阻塞仍回退的用例，失焦时宿主提供的视觉组件也暂停。`region-budget-full-tests.log` 为 273 项：270 通过、3 项环境跳过；之后的整秒阻塞边界及相关专项为 `region-budget-final-tests.log`，10/10 通过。

最新 Core SHA-1 `2cec9e70788f0939ae6af434d32d8f5c69f562b8`；SDK、issuer、CLI、create 与已完成 26 项矩阵的 `63cdbaaa7936` 包相同，逐包对比见 `region-final-package-comparison.json`。作者包 `ceru-devkit-3.0.0-d0d6f4a89ef7.zip` 共 4,224,819 字节，19 文件逐项比对通过，SHA-256 `64D6075543151CCA19C6C84E725197A987C04FCFC80D38D2EE3B05AEC8312F14`。该最新目录版的 `region-final-matrix.log` 已退出 0：26 个独立安装的模板/语言组合全部通过，包括页面组件渲染、移动目录后的监听、JS/TS 皮肤故意编译失败后恢复以及两种语言的加密音源。第三方依赖使用本机缓存，未宣称全新机器联网验证。`npm run release:check -- v3.0.0` 仅检查五包版本和内部精确依赖，通过；没有创建 tag 或执行发布。

## 2026-11-20：服务、原生入口与加密音源整合

最终同一 Core 配套桌面 ASAR（SHA-256 `41F259888F35E949C903DB9F04ACE8001E9074018BE24EA7A9C7CE02D0BE805A`）的真实 UI 复验记录在桌面仓库：完整 `--cli`、完整皮肤、TS 皮肤热更新、系统操作、音源选择、面板动画均退出 0。JS 皮肤四次保存到可见为 484/664/668/574ms，TS 为 475/603/889/659ms；历史存在 1222ms 的封面样本，不能宣传所有负载下恒小于 1 秒。默认与皮肤各 60 秒主帧耗时差 0.296ms，区域会话与播放保持，worker 无逐帧通信。安装包内嵌 ASAR 已核对一致，但未安装或发布。

- `server-worker-stable-tests.log`：HTTP transport、真实 worker 与初始化回归 44/44。覆盖提前响应的大 POST、双向流、取消、连接复用、请求/响应字节限制及回环/LAN 配置。
- `server-final-full-tests.log`：首次整合全量为 268 通过、1 失败、3 跳过，失败是 RPC 测试还预期旧的 17 项目录；更新为实际 23 项后，`server-final-rpc-recheck.log` 6/6，最终全量复验为 269/269 个执行项通过。
- `server-final-trusted-tests.log`：实际 Express/Koa、Electron 45 的 Node-API SQLite 模块、限定目录、禁止新增 worker/子进程、独立 IPC、撤销与异常退出、ASAR runner、签名/发布者和未签名开发例外均通过。Node 权限不等于原生机器码的 OS 沙箱。
- 模板仓库 `server-final-template-tests.log`：26 个 JS/TS 模板变体及 5 个社区提交通过。`encrypted-source` 三个 provider 为内置 AES-CTR、自定义 WASM、本机服务；桌面的实际脚手架/worker/HTTP/媒体验证另记录在桌面报告中。
- `server-final-dual-runtime.log`：冻结 v2 与新版 v3 从各自 tarball 安装，真实 worker 并存、迁移保持 ID/源码、搜索、WAV 与歌词一致；打包 CLI 的 14 个规则场景通过。

当前三包 SHA-1：SDK `357a7546b8b888e7bb3a0952a9db538536bcb2cd`、issuer `cd76a054d449f05e174b22867b78b11b49cd269f`、Core `7a835d0946a1571139f38a2d68f5534472c3080c`。语义接口 3.0.0 对应桌面首次 v3 候选 2.5.0，尚未发布。服务作者用法见 [服务与音频流](SERVER-AND-STREAMS.md)。组件仍使用隔离 iframe 与宿主提供的实现，详见组件指南的架构决策说明；不宣称主窗口内零拷贝。


### 2026-11-19：带皮肤卡片预览的作者包

JS 和 TS 的 `player-skin` 模板均使用可直接替换的 `assets/studio-preview.svg`。清单引用同一工程的内嵌资源，不申请网络权限。模板仓库校验 24 个变体和 5 份社区提交，CLI 同步 354 个模板文件，快照摘要 `sha256:695affc0465862933e5ef6aa64ac0676b502377c500f761b42ae5300b4e177dc`。

本地作者包 `artifacts/ceru-devkit-3.0.0-c22b97f2e696.zip`，SHA-256 `DEE48D7D5A659058ABCB495EACDD0A989A7617424612B98DE161E1A2C287F3C9`。从实际 ZIP 解压执行 `npm run verify:devkit -- <解压目录>`，六种组合通过，退出 0；安装使用本机第三方 npm 缓存。两个皮肤工程均检查构建后的清单引用、图片 MIME 与原始 SVG 内容一致，以及运行时组件实现没有被复制进插件。桌面 `--panel-only` 使用同一 CLI 模板，实际解码 240×160 预览，验证无预览与损坏图片回退、卡片尺寸及面板动效。未覆盖安装或发布；不代表 TS 热重载时间或原生运行时隔离通过。

### 2026-11-19：播放器区域 SDK 的作者包

本地开发包 artifacts/ceru-devkit-3.0.0-a5b473ef1704.zip，SHA-256 为 9598234DE0F33A6D983B0C23F7073D01B3A221595EA13C566003180391C4004E。JS/TS 皮肤模板从同一模板仓库同步，区域入口使用宿主的同一套函数，不将宿主组件打入插件。模板源 24 个变体、5 份社区提交通过；组件构建、类型诊断、错误恢复和皮肤产物专项 9/9 通过。

从本次 ZIP 解压运行 verify:devkit，退出 0。TS 播放钩子、JS 页面扩展、JS/TS 皮肤及 JS/TS 内容库均独立安装、构建、校验；其中皮肤产物验证宿主组件入口和两个动画钩子。安装使用本机已有第三方 npm 缓存。专项通过不等于新代码重新跑过上一节的全量套件，也不等于桌面热重载达到一秒。未发布。
## 可重复运行

1. 两个隔离工作区分别运行 `npm ci`、`npm test` 和 `npm run pack:all`。v2 依赖固定 0.3.16，v3 本地五个包为 3.0.0；打包只生成 artifacts，不使用发布命令。
2. 在 v3 工具链运行 `npm run verify:dual-runtime -- <冻结 v2 工具链目录>`。它在临时目录离线安装真实 tarball（需要此前安装依赖时的 npm 缓存），从两个 Core 各自解析 issuer/SDK，启动两个 worker，同时搜索；v3 解析本地 WAV 并校验内容和歌词，v2 返回原歌词。此项不是 Electron 播放验收。
3. 在 v3 模板仓库运行 `npm ci` 和 `npm test`。18 个 JS/TS 模板使用 v3 issuer，社区的已编译 v2 插件使用 v2 issuer。更新模板源头后在 v3 工具链运行 `node scripts/sync-templates.mjs <v3 模板仓库>/templates`。
4. `test/guest-store-compat.test.mjs` 的索引和脚本文本实际由冻结 v2 GuestStore 生成。v3 读取原 ID、选择、授权和平台数据并调用子插件，全程不重写索引。`test/data-contract.test.mjs` 的搜索、播放地址、歌词是冻结 v2 worker + Core 调用 earliest-source.js 的输出。

## 旧项目迁移

运行 `ceru-plugin migrate --project <目录>`。本命令不执行配置模块，只改 ceru.plugin.json 中的 manifest 数据；不改插件逻辑或锁文件。provider 顶层旧方法须由作者移到 tracks/playlists/sharing。schema 视图和依赖旧摘要动作的账号没有无损的一对一映射，命令报出字段并保持原文件不动，不会假装它们已可用。新模板用 native 或 web 设置页替代 schema。

## 桌面验收边界

工具链单独跑通不是桌面验收。桌面本地 ASAR 已独立验证两代插件并存、v3 音源搜索、返回定时歌词和实际播放。请见桌面仓库 `docs/plugin-upgrade-local-qa.md`。前一阶段的 v2.4.0 人工覆盖安装仍在待验清单。后续组件、账号、音乐聚合等阶段没有因声明类型存在而自动完成。

## 2026-11-18 本地记录

- 五个 v3 包编译并打包。双版本离线安装验证通过：真实 v2/v3 worker 同时启用，返回各自的搜索结果和歌词；v3 解析 URL 的 WAV 内容与测试音频逐字节一致。
- 工具链 91 项回归通过；18 份模板与 5 份社区提交静态验证通过。桌面升级保留专项已有 7 项通过，包括同 ID 跨代更新、激活失败保留旧版、权限作用域与子插件授权。未做个人资料覆盖安装。
- 本地 CLI 生成的未签名音源样例：`artifacts/qa/source-project/dist/plugin.js`，插件 ID 为 `local.source-project`。它默认提供本地搜索和示例歌词，设置自己的 HTTP(S) previewUrl 后才可试听。
- 本记录不代表合并、推送、打标签或发布。

## 真机开发预览与槽位复验

在桌面工作树运行 `node scripts/test-electron-runtime.mjs <本地 app.asar> --cli <v3 工具链工作树>`。命令使用临时资料和本地 CLI，生成 Vue 示例并监听源码，修改搜索按钮文字，等待新一代页面绘制，并确认实际出现新的可访问控件。它也修改一个 v2 开发文件并从旧版 worker 查询新歌名，不改冻结工作树。

CLI 监听回归验证错误的脚本类型、模板表达式和未闭合标签均不会替换上次可用产物。保存到首帧的门槛为例子中一次普通文字修改不超过 1 秒，不是首次构建或大型工程的性能保证。桌面报告另记 ASAR 和实测值。组件初始化仅传宿主图标，不复制供完整 web 视图使用的图片目录；歌单操作槽位可通过冻结的 `useView().props.slot` 获知挂载位置，不传用户路径或凭据。

## 插件间服务的本地回归

`test/service-router.test.mjs` 验证清单限定的服务与方法、semver、可用事件、归属、纯 JSON 限额、在途取消、封闭的硬依赖环，以及读取 `ceru.config.json` 的固定模拟返回值。模拟器走实际契约授权，并检查已取得的服务句柄在撤权后不能继续调用。桌面升级回归另外使用真实 worker 验证两插件回声、软依赖、硬依赖中止与恢复、手动停用、错误版本和冷启动顺序；见桌面本地验收报告。测试不连接外部账号或发布服务。

## v3 本地作者开发套件

### 当前交付状态（2026-11-20）

以下历史记录按当时的产物保留。当前本地作者包为 `artifacts/ceru-devkit-3.0.0-b04136d3a64b.zip`，SHA-256 `06CEE7DB6F2C7E17E4367C8815388B451475C8C638CFFB576E64F66E1102C338`。26 个模板/语言组合均完成独立安装、类型检查、构建、校验及真实宿主版本兼容性检查，包含 JS/TS 页面与皮肤模板。页面和皮肤模板 Vue 依赖现为 `^3.5.21`，兼容本次桌面实际使用的 Vue 3.5.21。

首次矩阵执行完成 18 项后，因离线缓存缺少 Vue 3.5.45 的依赖而失败；允许联网补缓存后，其余 8 项通过。两次日志保留于 `artifacts/desktop-host-devkit-first-attempt.log` 和 `artifacts/desktop-host-devkit-remaining.log`，汇总为 `artifacts/desktop-host-matrix-results.json`。这不等于无网络、无缓存的新电脑安装验收。

当前源码全量测试为 288 项、285 通过、0 失败、3 项条件跳过；配置原生模块和集成工具后，相关 24 项专项全部通过且无跳过，计数不相加。五个交付 tgz 的 633 个文件与测试后构建一致，见 `artifacts/desktop-host-tested-package-comparison.json`。桌面当前 ASAR 的 16 项 Electron 检查通过，另有开发模式启动验证；其中网易云两组复验使用测试接口数据。完整桌面记录在配套工作树的 `docs/plugin-upgrade-local-qa.md`。

实现要求见 [插件环境任务书](plugin-environment-refactor.md)。本地候选与作者套件已准备，真实旧版覆盖升级、物理 DLNA/第二台 LAN 设备、真实平台账号、人工性能面板仍待验收；无 hook 切歌的绝对差 5ms 门槛未通过。没有提交、推送或发布。

### 早期交付记录

本地包面向 Node.js 22.12+，不以 npm latest 作为验收依赖。运行 npm test、npm run pack:all，再运行 npm run verify:devkit 与 npm run verify:dual-runtime -- <冻结 v2 工作树>。最后 npm run pack:devkit 将 5 个包和完整性清单输出到 artifacts 下的新目录，可整体压缩给作者。兼容桌面在「设置 → 插件管理 → 管理设置 → 插件开发者模式」添加构建产物。

验证脚本在外部临时目录安装套件，以套件生成 JS 页面与 TS 播放规则项目，后者移动后再安装。新工程先运行 npm run typecheck，检查此时还没有分发产物，然后构建和验证；播放规则另跑四个真实 worker 离线场景。首次安装第三方依赖仍需 npm 缓存或网络。参考本仓库 docs/OPERATIONS.md；离线规则通过不等于真实播放器已通过。

本轮：工具链 111 项通过，模板仓库 22 份 JS/TS 变体与 5 份社区提交通过，套件的两个外部工程安装与双代 worker 回归通过。本地套件 `artifacts/ceru-devkit-3.0.0-7ee7695e163d.zip` 的 SHA-256 为 `06A27F9983F0EF1FD55E94C431B1BB63504B4BB6ECE985A1E622CF99BB6F1C23`。开发模式的终端提示与 22 份模板说明均指向新的「管理设置」入口。

## 阶段四：真实桌面预览与宿主组件

- 新项目和旧项目的 `npm run preview` 都只校验构建文件并打印要加入澜音开发者模式的本地路径；兼容旧脚本的 `--no-open`。不再提供独立 Electron 窗口、调试端口或 HTTP 预览服务器。冻结的 v2 工具链不受影响。
- 组件协议、属性、事件与菜单授权示例见 [组件视图指南](COMPONENT-VIEWS.md)。`npm test` 对 8 个宿主控件做渲染和交互检查，并验证错误模板不会替换上一次有效的构建文件。
- 构建五个本地包后，`npm run verify:devkit` 在项目目录之外离线生成 TS 播放拦截和 JS 页面工程，执行各自的类型检查、构建、校验以及打印预览路径。桌面验收另运行 `node test/electron-smoke.mjs <桌面源码目录> <打包的 app.asar>`，检查真实搜索框回车、空结果、曲目信息、队列修订号、媒体播放及热重载。
- 视图仍在隔离 iframe 中。该验收不意味着跨容器弹层、主窗口桥迁移、全部 hook 或原生模块已经交付。

本地校验：114 项工具链测试、22 个模板变体和 5 个社区提交；冻结 v2 与 v3 的真实 worker 并行验证通过。独立开发包为 `artifacts/ceru-devkit-3.0.0-6d871c0cfe38.zip`，SHA-256 `16307EDFA2446FD3BB51CB42441A46F9003215529774A44B6F7A8ACE10B47309`。压缩包包含五个本地 Ceru 包，不等于完全离线的第三方 npm 镜像；离线安装使用了已有 npm 缓存。

### 状态事件开发套件

四个新增事件的契约与授权见 HOST-SERVICES.md。工具链 114/114，真实双版本 worker 和两个独立脚手架的离线安装、构建与校验通过。当次本地开发套件为 artifacts/ceru-devkit-3.0.0-6b3737cf3a1c.zip，SHA-256 B47164D90AF72731DE670F1965AFCD142E2CD3218A1BDD250C189C95EC8749F8。未发布 npm 包或标签。

### 2026-11-19：九个播放操作的作者套件

与桌面 `dist/mode-hooks-qa/win-unpacked/resources/app.asar` 配套的本地 ZIP：`artifacts/ceru-devkit-3.0.0-44dad4a606e8.zip`，SHA-256：`B38F9BB7DF8755825ED4D9A89371920B18E4A7DE098C03263332680234ABC344`。压缩包包含五个 Ceru 包，以及操作目录、播放拦截、组件视图、宿主服务和 manifest 五份文档。页面工程的宿主组件锁定 Vue 3.5.21、TDesign 1.15.4，与当前桌面及 SDK 匹配。

从实际 ZIP 解压，运行 `npm run verify:devkit -- <解压后的套件目录>`。在外部临时目录创建 TS 播放插件和 JS 页面；TS 工程移动后独立安装。首次允许补齐第三方缓存，再新建工程用 npm 离线安装。两次均通过 typecheck、build、validate 和 preview；TS 工程六个模拟场景通过，已安装 Core 的九个操作与随包目录一致。第三方依赖仍需首次联网或对应 npm 源的已有缓存，ZIP 不包含 npm 镜像。

冻结 v2 与本次 v3 包独立 worker 的并行搜索、WAV 与歌词回归通过，迁移清单后保留 ID 和行为；模板仓库 22 个变体、5 份社区提交校验通过。本次为本地作者验收，不是发布或完整重构验收。

### 2026-11-19：十一项操作与删除保护示例

配套桌面候选为 `dist/queue-removal-qa/win-unpacked/resources/app.asar`，作者套件为 `artifacts/ceru-devkit-3.0.0-61b9b5d07cea.zip`，SHA-256：`437325EA72944FD14511F65314A449723DFD9D7CDC477781A897A2EE6A4CE714`。从实际 ZIP 解压后，在已有 npm 缓存条件下，TS 播放规则与 JS 页面工程均在外部目录完成离线安装、类型检查、构建、校验和预览路径检查。TS 工程移动后仍可用；安装的核心与随包目录均包含十一项操作。

JS/TS 播放模板新增定向移除保护示例，与清空队列区分。打包 CLI 生成的十个真实 worker 场景通过；冻结 v2 与新版 v3 并行搜索、音频及歌词回归通过。本地桌面用新版脚手架完成 Electron 回归，未报告渲染错误。本记录不代表所有计划阶段已完成或正式发布。

### 2026-11-19：中文项目与账号作者指南

修复前分别以「黑胶歌词」「桌面歌词」创建工程，两者均得到 `local.my-plugin`。修复后显示名保留中文，生成的内部 ID 不同；同名工程在另一个父目录生成时 ID 稳定。英文常规目录、中文混排及长目录名也通过真实清单校验。只影响新建工程，不迁移已安装插件或修改既有 ID。CLI 编译、脚手架 8/8 和五包本地打包均通过。

从 ZIP `ceru-devkit-3.0.0-86d15bb4316d.zip` 解压执行 `verify:devkit`，退出 0。TS 播放钩子、JS 页面扩展、TS/JS 播放器皮肤、TS/JS 内容库六种组合独立安装、构建、校验产物；两份皮肤工程使用不同中文目录名。测试用到了已缓存的第三方 npm 依赖。受测 ZIP 的 SHA-256 是 `134C219274B99AC223F507F21E71F96EA314A2BBE18A56A3872F773E898589FA`。

最终本地开发包 `artifacts/ceru-devkit-3.0.0-0141eafed386.zip` 的 SHA-256 是 `29FBA9B7F4ABF5199C9A2E84DDA712CD5DCFC7E9B022E9F59CD44E0CA3BB8BD0`。将两个 ZIP 解压逐文件核对，仅首页、`docs/ACCOUNTS.md` 和 `docs/MANIFEST-V3.md` 不同；五个 npm 包及创建脚本逐字节一致。已校验这三份文档之间和指向其他随包文档的相对链接。最终文档包没有重复执行六项安装。未发布，未覆盖安装；不代表皮肤热重载或原生隔离已达标。

### 2026-11-19：配套工作树全量回归

| 验证对象 | 实际执行 | 本轮结果 |
| --- | --- | --- |
| v3 工具链源码 | `npm test` | 五包编译、运行时资产构建、宿主组件类型检查、操作目录校验通过；139 个测试通过，未跳过。监听错误恢复测试中的不闭合标签为预期负例。 |
| 桌面源码 | `yarn typecheck`；`yarn test --runInBand --silent` | 主进程及渲染进程类型检查通过；33 个 Jest 套件、138 个测试全部通过，含升级保留回归。 |
| 本地 v2/v3 包 | `npm run verify:dual-runtime -- <冻结 v2 工作树>` | 冻结 0.3.16 与 3.0.0 独立 worker 并行搜索、返回 WAV 字节与歌词；迁移示例保留同一 ID、源码不变、搜索和解析结果一致；打包 CLI 的十个播放拦截场景通过。 |
| 模板源和最终作者包 | 模板仓库 `npm test`；从 `0141eafed386` ZIP 提取 CLI `.tgz` 后与源码及 CLI 工作树逐文件比较 | 校验 24 个模板变体和 5 份社区提交（不执行提交代码）；三处的 352 个模板文件路径和内容均相同。两个 `snapshot.json` 的文件列表和重新计算的摘要均匹配：`sha256:4147d8b8f467b39cafec5c113a79f6d12d5961d0d83f4075e68f4ff369e24d28`。 |

本轮是源码、包和模板兼容性回归，不等于对用户已安装的桌面进行覆盖升级。未重新测量 TS 皮肤保存到可见时间，也未改变完全信任运行时的隔离门槛；这两项不因本表通过而达标。未发布。

### 2026-11-19：插件主动重算与作者示例

独立作者套件目录 `artifacts/ceru-devkit-3.0.0-e45e3a7c1bd1` 通过 `verify:devkit`。六种组合分别安装依赖、类型检查、构建和校验交付物；其中 connected-library 的 JS 与 TS 还检查了无条件设置入口、演示发现页的组合规则，以及连接状态改变后的 `ctx.entries.invalidate()` 调用。模板快照摘要为 `sha256:6df2ade76abdbb24dc464c8fdaecf84a56e105dfc71c7108a664709efc102bdc`。本次验证目录版，不是 ZIP 解压验收。直接 init 后未安装依赖的首次构建失败，不计入通过项。

RPC 契约专项 4/4，覆盖拒绝目标参数、同一插件并发调用去重和不同插件互不合并。与此 SDK/core 配套的独立 Windows 桌面验证了测试插件在音源不变的情况下主动显示入口、撤销连接后隐藏当前页；不代表真实平台凭据或登录拦截已验收。未发布。

### 2026-11-20：完整操作 Schema、事件与主动分享

操作目录由 Core 生成，包含 34 个操作的输入/结果 Schema；14 个可主动调用工具使用与宿主相同的执行权限。通用前置/完成事件支持撤权、安全模式、超时与失败暂停，`op.state` 按各自读取权限投影。新增 `share.create` 工具返回有类型的分享链接，不再要求所有工具结果都为 null。

Core `ad0d3f0ad6f2787686187c95510134128b0b026c`、SDK `0adc0db61766d56450d9b6130e4563061f722cb4`：完整 182 项测试、隔离 SDK 消费者类型检查、冻结 v2/v3 双运行时、打包 CLI 的 14 个真实 worker 场景通过。模板源 24 个变体和 5 份提交静态校验通过。桌面同包生产构建、42 套/172 项回归及实际分享/下载专项通过，证据在桌面 `docs/plugin-upgrade-local-qa.md`。

本地交付文件 `artifacts/ceru-devkit-3.0.0-b956af118d06.zip`，SHA-256 `C77D82BA421DE92DEE52B74EDFE56291DFA80AF8CF1844FABF5725F9E6A040A8`。ZIP 的 18 个文件均已与目录版逐字节比对。与运行离线矩阵的 `73d7351d502b` 目录版相比仅宿主服务说明有改动，五包 tgz 相同。第三方依赖离线安装仍依赖本机已有 npm 缓存。阶段九安全门槛未通过，尚未提供任意 Node/原生模块运行环境；这不是完整重构已完成或已发布的声明。

`share-tool-matrix.log` 最终退出 0，24 个模板/语言组合全部通过完全离线安装、类型检查、构建与产物校验；包括目录迁移后的监听、服务权限校验、皮肤错误恢复以及动画钩子打包。该矩阵使用 `73d7351d502b` 目录版，并未声称已从 ZIP 再跑一遍完整矩阵。

### 2026-11-20：系统主动工具及桌面包验证

主动工具增加 `notification.show`、`link.open`、`window.close`，共 17 项。工具目录的权限字段允许 `null`：普通文字提示不需要额外授权，`ServiceCall.permissionKey` 可以为空字符串。链接及关闭窗口仍分别需要 `external.open` 和 `window.control`，使用同一套 RPC 验证器和桌面操作总线。生成的 `OPERATIONS.md` 区分“无需额外权限”与“仅宿主入口”。

Core `8b7a2b7ecded6b6b7f65aced859b60e1d9a91008`、SDK `268b61f0f0f55765ed4cc7d006813bcb645ca14d`、issuer `7a94802aad690337d3c880f9070acbb7e9de56be`。`system-tools-full-test.log` 182/182、`system-tools-targeted.log` 7/7 通过；`system-tools-dual-runtime.log` 通过两代 worker、迁移、WAV/歌词及 CLI 14 场景；模板源 24 个变体及 5 份提交静态校验通过。

独立桌面生产构建、双端类型检查、43 套/173 项回归通过。打包 ASAR 的系统专项和原关闭窗口专项均退出 0，实际覆盖通知取消/改写、链接过滤、请求授权取消、等待中撤权、默认链接处理及记住关闭到托盘设置。具体哈希与命令见桌面的 `docs/plugin-upgrade-local-qa.md`。本地作者目录 `artifacts/ceru-devkit-3.0.0-6c4272db6ae5` 包含这五个固定包及更新后的九篇指南。

`system-tools-matrix.log` 最终退出 0：24 个模板/语言组合的完全离线安装、类型检查、构建、产物校验通过，包含页面组件实际渲染、服务授权、移动后监听与 JS/TS 皮肤错误恢复。测试目录清理完毕。相同目录的 ZIP 共 18 个文件、4,124,280 字节，逐项内容核对通过，SHA-256 `B29A44A8544BF2030155132373A8028D56A7C251665823F0CA75DABDFEA6A90A`。矩阵跑的是目录版，并非从 ZIP 再安装一遍。桌面本轮 ASAR 的 Naive Tooltip、音源选择和个性化面板动画回归也已通过。


### 2026-11-20：媒体与自定义流日志复核（至 03:43 UTC）

本次为仅文档追加，没有重新运行测试、提交或发布。最新 `artifacts/media-custom-full-tests.log` 报告 **197/197，通过**；`artifacts/media-custom-tests.log` 的六项专项覆盖 Node realm、网络授权/取消、流式密码、自定义 worker 变换和 WASM，WASM 本机测量为 36.02 MiB/s。`media-custom-build.log` 与 `media-custom-pack.log` 分别保存工具链构建和五包打包结果。

该次 `artifacts/pack-summary.json` 记录 SHA-1：Core `b360ae905e19bc631d02ba64f00c5c026461a6f8`、SDK `dc927c9264ed869fcca67abd31bd4195c1e6a158`、issuer `7a94802aad690337d3c880f9070acbb7e9de56be`、CLI `d77f890c46d0d516d0b1fe7055765bbc4fbc952f`、create `fa7b3435f4f670d0e27ed54831a94296e22de76e`。独立桌面候选的三个 v3 tgz 与对应摘要一致。

历史失败继续有效：`artifacts/media-full-tests.log` 曾为 193/194，其中 `stream resolves pass through host preparation and never expose keys to a consumer` 因返回对象多出 `expiresAt: undefined` 而断言失败；`media-full-tests-recheck.log` 随后为 194/194。后来的 197/197 是新增自定义流版本的结果，不抹去首次失败。`media-dual-runtime.log` 保存了当时冻结 v2/v3 worker、WAV/歌词、保留 ID/源码迁移及 CLI 14 场景的通过结果。

`artifacts/media-devkit-verify.log` 报告 `ceru-devkit-3.0.0-7a99e3b71d2e` 的 24 个独立安装模板/语言组合通过；其中故意破坏模板产生的错误日志也保留。该矩阵先于 `media-custom-pack.log`，不能作为本次自定义流五包已经重新通过作者安装矩阵的证明。

桌面证据位于 `C:/Users/Administrator/.codex/worktrees/desktop-v2-compat/CeruMusic`：

- `media-custom-host-tests.log`：2 套/42 项通过，限升级与下载管理专项。此前 `media-all-host-tests.log` 的 43 套/176 项不代表新候选全量重跑。
- `media-custom-electron.log`：独立临时 profile 的 Electron 45.0.0 媒体 harness 中，五种内置算法及 worker WASM 变换均能播放并跳到第 143 秒后继续，时长 180 秒，Range 检查为 true。五次缓存淘汰 `totalSize` 异常仍存在，不能把通过的媒体断言解释为所有缓存行为正常。
- 临时候选 `C:/Users/Administrator/AppData/Local/Temp/ceru-default-release-14277043-487e-4e7b-8dda-51e417518e4e/media-custom-build.log`：生产依赖检查、双端类型检查和生产构建完成，末尾 `Done in 165.16s.`。既有 `dist/media-streams/win-unpacked` 的打包早于此版，最新自定义流候选的打包验收未完成。

打包 exe 的 JS 入口尝试必须按失败记录：`media-packaged-executable.log` 显示正常应用读取既有 profile、插件和曲目，随后停止 PID 6148（停止处置据本次任务记录）；它不是隔离运行，末尾播放断言为 `4294967295 !== 0`，不能计为通过，也**不能断言用户数据未改变**。当前桌面 `scripts/test-plugin-media.mjs:14` 在启动前拒绝 `--executable=...`；打包验收须改用隔离 ASAR harness。同批 `media-packaged-panel.log` 的界面通过项不证明媒体播放或 profile 隔离。

待办仍包括新五包的作者安装矩阵、新候选的全量宿主及隔离 ASAR 媒体验收、缓存淘汰异常调查、物理 DLNA 和完整加密音源 JS/TS 三 provider 模板。HTTP server 由另一代理实现，`ctx.server.serve`、端口登记、LAN 授权/撤权与停用清理尚未在本记录验收；本机 HTTP 媒体夹具不代表服务 API 完成。完全信任/原生模块流程及前述覆盖升级、性能失败也未由本轮解除。


## 发布验收决定（2026-11-21）

用户明确澄清：“我的意思就是通过了 可以发版 下次再修复”（批注 `a0616616-0c29-4d20-ad01-4b43637c1021`）。当前结果按用户接受的已知限制进入发布，不再要求重复人工确认。两次独立覆盖升级缺少分别确认的证据；原切歌数值的绝对差仍超过 5ms，新版平均快 36.905ms。原始记录保留，此决定不改写测量结果。账号、登录保留、账号数据隔离、DLNA/LAN 及人工性能反馈按用户原确认保留。

代码须合并回原仓库并保留远端新提交，正式发布结果以 GitHub Actions、Release 和 npm registry 的实际状态为准。
