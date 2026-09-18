# Ceru Plugin Issuer

Node.js / TypeScript 静态验证、Ed25519 签名与缓存模板发放。

~~~ts
import { readFile } from 'node:fs/promises'
import { PreparedIssuer, readArtifact } from '@shiqianjiang/ceru-plugin-issuer'

const issuer = new PreparedIssuer(await readFile('template.js'), {
  issuerPrivateKey: await readFile('issuer.private.pem', 'utf8'),
  trustedPublicKeys: [await readFile('publisher.public.pem', 'utf8')],
})

const bytes = issuer.issue({ display: { name: '我的音源' } })
console.log(readArtifact(bytes).signatureStatus)
~~~

准备一次后，重复 issue 不重新构建或扫描核心代码。writeTo 支持背压与共享主体流式输出，调用者负责结束流、下载鉴权和缓存策略。

签名有效不等于发布者已被信任；未提供可信公钥时结果为 verified-untrusted。静态校验不执行插件，也不替代生产沙箱。个性化文件不得提交到公开社区仓库。

[完整协议与命令](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
