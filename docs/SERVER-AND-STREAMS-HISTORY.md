# 服务与音频流：历史验证记录

本文件保留早期检查点及失败证据，**不描述当前运行行为**。当前用法以 [服务与音频流](SERVER-AND-STREAMS.md) 为准；最新产物与验收结果见 [运行验证范围](RUNTIME-VALIDATION.md)。

## 已被替换的旧独立进程方案

当前独立进程使用 Electron 的 Node 运行入口和 Node 权限参数；前期 `utilityProcess` 探针未能落实所需文件权限，因此未采用它。JS 文件读写被限定在插件专用目录及加载所需文件，禁止额外子进程和 worker；撤销会取消其宿主调用并终止进程。加载的原生机器码具有完全信任权限，Node 的限制不是操作系统沙箱。

## 历史验证记录

以下保留此前检查点，包含当时尚未完成的项目和失败记录。当前功能状态以本节以上接口说明及最新的 [运行验证范围](RUNTIME-VALIDATION.md) 为准，桌面实际验证见其 `docs/plugin-upgrade-local-qa.md`。

本文对应 v3 本地候选版，尚未发布。冻结的 v2 0.3.16 不增加这些接口。

## 已接入：内置解密播放

音源的 `tracks.resolve` 可以在成功结果中返回 `stream.decrypt`。播放器接收宿主生成的 `ceru-media://` 临时地址；解密参数和上游请求头保存在主进程，不传给播放器或其他插件。

```ts
import type { ResolveResult } from '@shiqianjiang/ceru-plugin-sdk'

function resolveEncryptedTrack(metadata: {
  url: string
  keyHex: string
  ivHex: string
  plaintextBytes: number
}): ResolveResult {
  return {
    ok: true,
    url: metadata.url,
    stream: {
      decrypt: {
        algorithm: 'aes-128-ctr',
        key: metadata.keyHex,
        iv: metadata.ivHex,
        encoding: 'hex',
      },
      contentType: 'audio/flac',
      contentLength: metadata.plaintextBytes,
    },
  }
}
```

`contentLength` 是解密后的字节数。密钥必须与算法匹配：AES-128 使用 16 字节，AES-256 和 ChaCha20 使用 32 字节；IV 为 16 字节。支持 `hex` 和 `base64`。不要把账号的长期凭据写在示例源码中；按音源接口返回本次音频所需参数。

内置算法为 AES-128-CTR、AES-256-CTR、AES-128-CBC、AES-256-CBC 和 ChaCha20。CTR 按块调整计数器；CBC 对齐块并读取前一个密文块作为 IV。CBC 必须提供明文长度才能跳播；未知长度时只能从头读取。上游忽略 Range 返回 200 时，宿主从头解密并丢弃目标位置之前的数据。多个字节范围不支持，返回 416。

Electron 45 的密码库不提供 raw ChaCha20，因此本地候选版包含与 Node 原生输出逐字节比对的兼容实现；支持原生算法的环境优先使用原生实现。此实现不提供认证标签校验，音源须按其协议选用算法。

下载和缓存复用同一条解密管线，磁盘保存明文音频。下载任务恢复时遇到已失效的临时地址，会重新向原音源解析。禁用、撤权或卸载提供者后，旧令牌及在途请求失效。未给 `expiresAt` 时令牌默认保留六小时，最长保留二十四小时。

DLNA 使用宿主已有 HTTP 服务的 `/media/<令牌>` 路由，返回同样的明文和 Range 响应。目前验证的是 HTTP 路由和真实 Electron 播放，物理 DLNA 设备仍待验收。

## 已接入源码：worker 变换、WASM 与通用加解密

`ctx.streams.registerTransform(id, { seekable, create })` 注册的实现运行在插件 worker。输入和输出在主进程与 worker 间通过可转移的 ArrayBuffer 传输；分片或共享池 Buffer 先取得独立的精确范围，避免错误地转移整块底层缓冲区。单块上限 1 MiB，每个 worker 最多同时处理八块，每个插件最多十六个变换实例。取消、撤权、停用和读取结束释放实例。

`ctx.wasm.instantiate('resource-id')` 加载 `ceru.plugin.json` 中声明的 `type: "base64", mime: "application/wasm"` 资源；返回 `{ module, instance }`。v3 的 VM 允许 WebAssembly 编译，字符串代码生成仍关闭，冻结 v2 不变。真实 worker 测试中的 8 MiB WASM 变换达到 32.5–36.0 MiB/s，这只是该测试算法与本机的测量。

`ctx.crypto.createCipher(algorithm, key, iv, options?)` 和 `createDecipher` 返回 Web 标准 TransformStream。密钥和 IV 可传 Uint8Array，字符串默认使用 hex，可通过 `options.encoding` 选择 base64。`options.signal` 可取消流。五种内置算法的加密输出、分块解密和无效 CBC 尾块均与 Node 原生实现比对，密码计算直接在 worker 内调用，不经过主进程 RPC。

这些源码变化还需随下一次本地包更新验证桌面与作者安装路径；不要把此前已验的作者包当作包含这些接口。

## 仍在开发

以下声明或类型不能视为可用运行时：

- `ctx.server.serve`、服务端口登记和局域网权限的完整生命周期。
- 完全信任进程、原生模块的安装确认和撤销流程。
- 计划中的加密音源 JS/TS 模板，包含内置解密、自定义 WASM 变换和本机服务三个 provider。

HTTP 服务、完全信任进程及三个 provider 的完整作者模板尚不能用于发布的插件。

已有 Node 权限及原生模块探针只能证明候选运行方式的可行性，不能代替安装流程、真实插件生命周期和平台验收。后续验收记录写在桌面的 `docs/plugin-upgrade-local-qa.md` 与工具链的 `docs/v3-local-qa.md`。

## 2026-11-20 检查点补充：已测范围与未完成项

本节保留上文作为历史记录，补充最新自定义流包的实际验证范围；仅更新文档，未提交或发布。`artifacts/media-custom-build.log`、`media-custom-pack.log` 记录构建和五包打包，`media-custom-full-tests.log` 报告 197/197，通过；`media-custom-tests.log` 的六项专项通过，包含真实 worker 自定义变换、WASM 以及流式密码/取消。该次 Core SHA-1 为 `b360ae905e19bc631d02ba64f00c5c026461a6f8`，SDK 为 `dc927c9264ed869fcca67abd31bd4195c1e6a158`。

桌面 `media-custom-electron.log` 记录 Electron 45.0.0 独立媒体 harness 的五种内置算法与 worker WASM 变换：时长 180 秒，开始播放、跳到第 143 秒后继续播放和 Range 检查均为 true。这是临时 profile 的专项，尚不是最新打包产品媒体入口的完整验收；日志里的五次缓存淘汰 `totalSize` 异常仍待调查。桌面 `media-custom-host-tests.log` 只代表 2 套/42 项专项通过。

独立候选 `C:/Users/Administrator/AppData/Local/Temp/ceru-default-release-14277043-487e-4e7b-8dda-51e417518e4e/media-custom-build.log` 已记录生产依赖检查、双端类型检查和生产构建完成。先前 `media-package.log` 的 `dist/media-streams/win-unpacked` 早于自定义流包；不能据此宣称新版已完成打包播放验收。`ceru-devkit-3.0.0-7a99e3b71d2e` 的 24 组合矩阵也早于本次自定义流打包，须为新包重新验证作者安装路径。

打包 exe 的 JavaScript 入口误启动另记为失败：桌面 `media-packaged-executable.log` 显示应用读取了既有 profile、插件和曲目，随后停止 PID 6148（处置据本次任务记录）；未实现隔离，播放断言为 `4294967295 !== 0`。没有前后数据核对，不能宣称用户数据未改变。当前 `scripts/test-plugin-media.mjs:14` 已在启动前拒绝 `--executable=...`，要求使用隔离 ASAR harness；旧面板专项的通过不能替代媒体或数据隔离验证。

**HTTP server 仍由另一代理实现，本记录不宣称完成。** 测试中的本机 HTTP 上游、LAN 媒体路由与 `ctx.server.serve` 插件服务是不同的验收范围。后续须记录端口登记、绑定地址、LAN 授权及撤权、取消、停用/卸载释放服务和资源限制的实际结果；声明和类型存在不能作为通过依据。

新版隔离 ASAR 媒体链路、全量宿主回归、作者安装矩阵、物理 DLNA、三 provider 的加密音源 JS/TS 模板及完全信任/原生模块流程仍待完成。更完整的日志边界、首次 193/194 工具链失败与后续重跑记录见 [运行验证范围](RUNTIME-VALIDATION.md) 和桌面 `docs/plugin-upgrade-local-qa.md`。
