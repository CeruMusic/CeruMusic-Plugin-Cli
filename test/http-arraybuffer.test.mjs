import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { NodePluginSandbox } from '@shiqianjiang/ceru-plugin-core/node'
import { requestNetwork } from '@shiqianjiang/ceru-plugin-core/network'
import { readArtifact } from '@shiqianjiang/ceru-plugin-issuer'

test('binary HTTP Range survives the network broker and logic VM byte for byte', async t => {
  const bytes = Buffer.alloc(1127)
  bytes.writeUInt32BE(24)
  bytes.write('ftyp', 4)
  bytes.writeUInt32BE(1103, 24)
  bytes.write('moov', 28)
  for (let i = 32; i < bytes.length; i++) bytes[i] = i % 256
  const server = createServer((req, res) => {
    if (req.url === '/json') return res.end('{"count":2}')
    if (req.url === '/text') return res.end('plain text')
    if (req.url === '/oversized') return res.end(Buffer.alloc(1024 * 1024 + 1))
    assert.equal(req.headers.range, 'bytes=0-1126')
    res.writeHead(206, { 'Content-Range': 'bytes 0-1126/2048' }).end(bytes)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = 'http://127.0.0.1:' + server.address().port
  const worker = new NodePluginSandbox(async (method, data) => {
    if (method === 'config.get') return {}
    assert.equal(method, 'http.request')
    return requestNetwork(data, () => true)
  }, () => {})
  t.after(() => worker.dispose())
  const manifest = { manifestVersion:3, id:'fixture.http-bytes', name:'HTTP bytes', version:'1.0.0',
    engines:{ hostApi:'^3.0.0', logicRuntime:'ceru-js@1' }, entry:{ logic:{ module:'main' } },
    provides:{ actions:[{ id:'read', title:'Read' }] } }
  const artifact = readArtifact('exports.manifest=' + JSON.stringify(manifest) + `;
    exports.activate = ctx => ctx.actions.register('read', async (input, operation) => {
      const result = await ctx.http.request({ ...input, permissionKey:'network', operation })
      if (!input.responseType) return result.body
      if (!(result.body instanceof ArrayBuffer)) throw Error('Expected an ArrayBuffer in the plugin realm')
      return { status:result.status, range:result.headers['content-range'], length:result.body.byteLength,
        bytes:Array.from(new Uint8Array(result.body)) }
    })`)
  await worker.start(artifact)
  const read = input => worker.invoke('action', 'read', '', [input])
  const result = await read({url:base, headers:{Range:'bytes=0-1126'}, responseType:'arraybuffer'})
  assert.deepEqual(result, {status:206, range:'bytes 0-1126/2048', length:1127, bytes:Array.from(bytes)})
  assert.deepEqual(await read({url:base+'/json'}), {count:2})
  assert.equal(await read({url:base+'/text'}), 'plain text')
  await assert.rejects(read({url:base+'/oversized', responseType:'arraybuffer'}))
})
