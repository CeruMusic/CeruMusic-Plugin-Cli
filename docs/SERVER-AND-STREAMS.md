# 服务与音频流

本文描述本地 2.5.0 桌面候选与 3.0.0 工具链的接口；尚未发布。下面的运行方式已实现，具体通过哪些测试以文末链接的验收记录为准。不要将旧 npm 包与本文的新接口混用。

## 选择运行方式

| 需求 | 入口与 API | 授权 |
| --- | --- | --- |
| 提供本机 HTTP 音频或 API | 沙箱 logic 或 `entry.server.runtime: "sandbox"`；`ctx.server.serve` | `network.serve`；开放局域网另需 `network.serve.lan` |
| 已知算法的加密音频 | `tracks.resolve` 返回 `stream.decrypt` | 仍遵循音源和网络权限；无需完全信任 |
| 自定义解码或 WASM | `ctx.streams.registerTransform`，返回 `stream.transform` | `streams.transform`；WASM 使用声明的插件资源 |
| Express、Koa 或 Node-API 模块 | `entry.server.runtime: "node"`；`ctx.server.listen` | 安装时单独确认 `runtime.trusted`，监听服务另需网络服务权限 |

沙箱中没有 Node 模块，HTTP 处理函数在插件 worker 内执行。完全信任入口运行在独立进程，普通 logic 仍在沙箱中。两者通过宿主已登记的本机服务地址配合，不能共享 JavaScript 对象。

桌面候选通过 Electron `utilityProcess` 与专用 `MessagePort` 运行完全信任入口。Electron 45 不启用 Node 权限模型：此入口可以访问电脑上的所有文件、直接联网和启动其他程序。安装或重新授权时会明确显示这些权限并要求勾选确认；早期受限 Node 模式的同意不自动沿用。普通沙箱入口与它的权限边界保持独立。Core 在非 Electron 的作者测试中仍支持带 Node 权限参数的子进程，但该测试结果不能用来宣称桌面入口具有文件隔离。

## 沙箱 HTTP 服务

在 `uses.permissions` 声明一个 `network.serve` 权限，例如 `{ "key": "demo-server", "name": "network.serve", "reason": "在本机提供演示音频" }`。logic 可以直接启动服务：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async (ctx) => {
  const server = await ctx.server.serve((request) => {
    const path = new URL(request.url).pathname
    return path === '/health'
      ? new Response('ok', { headers: { 'content-type': 'text/plain' } })
      : new Response(null, { status: 404 })
  }, { permissionKey: 'demo-server' })
  ctx.log.info('本机服务已启动', { url: server.url })
  ctx.effects.add(() => server.close())
})
```

也可以声明 `entry.server: { "module": "server.main", "runtime": "sandbox" }`，将 `server.main` 映射到单独源码，默认导出 SDK 的 `defineServer(async ctx => { ... })`。两种写法使用同一个沙箱和同样的权限检查，每个插件只能同时运行一个服务。

默认仅监听 `127.0.0.1`，端口由系统分配。指定的端口被占用时改用空闲端口，应读取返回的 `url/port`，不要拼接固定端口。需要局域网访问时必须明确传 `lan: true` 并声明、获得 `network.serve.lan`；该模式监听 `0.0.0.0`，返回 URL 仍为本机地址，其他设备使用宿主的局域网 IP。防火墙与设备可达性需在目标网络验证。

Request/Response 的 Web Streams 在 worker 和宿主之间分块传输，单块最多 1 MiB，单 worker 最多八个在途请求。请求头上限 16 KiB；请求头、上传、socket 和完整请求均有超时。CONNECT、协议升级及跨来源浏览器请求会被拒绝。关闭服务、停用、撤权或宿主退出会取消在途请求并释放监听端口。服务应自行处理 GET、HEAD、Range 和内容类型；宿主不会替业务接口添加身份验证。

`ctx.server.url` 和 `ctx.server.port` 在服务关闭时变为 `undefined`。宿主仅允许音源返回归属于该插件的本机服务端口；另一个插件或系统服务的本机 URL 会被拒绝。

## Express、Koa 与原生模块

Node 入口的最小声明如下，`entries` 是项目配置的顶层字段：

```json
{
  "manifest": {
    "entry": { "server": { "module": "server.main", "runtime": "node" } },
    "uses": { "permissions": [
      { "key": "trusted", "name": "runtime.trusted", "reason": "使用 Node 服务提供本插件所需的音频处理接口", "optional": true },
      { "key": "serve", "name": "network.serve", "reason": "在本机提供音频处理接口" }
    ] }
  },
  "entries": { "server.main": "src/server.ts" }
}
```

这只是完整 manifest 中的片段，ID、版本和 engines 等字段仍需保留。安装 Express 及其类型后，服务入口可以这样写：

```ts
import express from 'express'
import { defineServer } from '@shiqianjiang/ceru-plugin-sdk'
import type { TrustedServerContext } from '@shiqianjiang/ceru-plugin-core/trusted'

export default defineServer<TrustedServerContext>(async (ctx) => {
  const app = express()
  app.get('/health', (_request, response) => response.send('ok'))
  const server = await ctx.server.listen(app, { permissionKey: 'serve' })
  ctx.effects.add(() => server.close())
})
```

Koa 使用 `ctx.server.listen(app.callback(), options)`。通过此 API 启动的端口会登记给宿主，沙箱 logic 启动时可读 `ctx.server.url`。CLI 会把依赖打入插件的 Node 入口；Node 内置模块保留为运行时引用。`ctx.config.get()`、storage 和其他宿主服务仍经过相同契约及授权检查。

完全信任要求有效签名和安装时单独同意；未签名仅允许用户手动添加的本地开发文件，并仍需开发模式与单独确认。权限的 `reason` 必须为 10–300 字符纯文本。界面显示宿主固定警告、签名发布者、开发者说明和原生模块列表，必须勾选风险确认。`optional: true` 允许只安装受限部分；未同意时不启动独立进程。之后可以在详情中开启或撤销。更换签名发布者或新增完全信任权限需要重新确认，运行时调用 `ctx.permissions.request('runtime.trusted')` 不能绕过安装确认。

撤销完全信任会取消该入口的在途宿主调用并终止独立进程。普通沙箱继续按其独立权限运行；不能把它的文件限制套用于已获完全信任授权的入口。

原生模块在 `entry.native` 中按平台映射资源 ID：

```json
{
  "entry": {
    "server": { "module": "server.main", "runtime": "node" },
    "native": [{ "name": "decoder.node", "platforms": { "win32-x64": "decoder.win64" } }]
  }
}
```

项目顶层 `resources` 使用 `{ "decoder.win64": { "type": "base64", "path": "native/win32-x64/decoder.node", "mime": "application/octet-stream" } }`。CLI 写入 SHA-256，签名覆盖内容和哈希；安装、解出与加载前都会检查。用 `ctx.native.load('decoder.node')` 加载声明模块，用 `ctx.paths.data` 存放插件数据。只支持 Node-API 模块，缺少当前平台时安装失败；字节哈希不能证明任意二进制满足 ABI 或安全要求，作者必须提供真实平台构建。带原生声明的 artifact 上限 50 MiB，单个解码资源仍受 32 MiB 限制。

## 可直接开发的加密音源脚手架

```sh
ceru-plugin init encrypted-demo --template encrypted-source --lang ts
cd encrypted-demo
npm install
npm run typecheck
npm run build
npm run validate
npm run dev
```

将输出的 `dist/plugin.js` 加入桌面的「设置 → 插件管理 → 管理设置 → 插件开发者模式」。`--lang js` 提供同样的三个 provider：AES-CTR 内置解密、WASM 字节变换、本机服务直接返回已解密 WAV。样例在本机生成三秒音频，支持 HEAD 和单 Range；无需第三方账号或公网音频。示例固定密钥及 XOR 算法只用于说明调用方式，不适合作为产品加密方案。

关闭、撤权和重复启动都应由作者在开发时验证。测试目录中的独立媒体 harness 另验证较长音频和跳播；三秒示例不代表所有格式都能随机定位。`seekable: false` 的自定义变换应禁止跳播。

## 内置解密播放

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

## worker 变换、WASM 与通用加解密

`ctx.streams.registerTransform(id, { seekable, create })` 注册的实现运行在插件 worker。输入和输出在主进程与 worker 间通过可转移的 ArrayBuffer 传输；分片或共享池 Buffer 先取得独立的精确范围，避免错误地转移整块底层缓冲区。单块上限 1 MiB，每个 worker 最多同时处理八块，每个插件最多十六个变换实例。取消、撤权、停用和读取结束释放实例。

`ctx.wasm.instantiate('resource-id')` 加载 `ceru.plugin.json` 中声明的 `type: "base64", mime: "application/wasm"` 资源；返回 `{ module, instance }`。v3 的 VM 允许 WebAssembly 编译，字符串代码生成仍关闭，冻结 v2 不变。真实 worker 测试中的 8 MiB WASM 变换达到 32.5–36.0 MiB/s，这只是该测试算法与本机的测量。

`ctx.crypto.createCipher(algorithm, key, iv, options?)` 和 `createDecipher` 返回 Web 标准 TransformStream。密钥和 IV 可传 Uint8Array，字符串默认使用 hex，可通过 `options.encoding` 选择 base64。`options.signal` 可取消流。五种内置算法的加密输出、分块解密和无效 CBC 尾块均与 Node 原生实现比对，密码计算直接在 worker 内调用，不经过主进程 RPC。

## 验证范围与历史记录

本地候选已验证沙箱 HTTP 服务、端口归属、撤权取消、完全信任同意与生命周期、Express/Koa 和 Node-API、内置加解密及 WASM 变换、下载/缓存和三个 provider 的 JS/TS 脚手架。具体日志与受测版本见 [运行验证范围](RUNTIME-VALIDATION.md) 和桌面 `docs/plugin-upgrade-local-qa.md`。物理 DLNA、第二台 LAN 设备、真实平台账号与旧版覆盖安装仍待人工验收；本地测试结果不替代这些检查。

旧的限制方案、失败日志及后续替换过程保留在 [历史验证记录](SERVER-AND-STREAMS-HISTORY.md)。
