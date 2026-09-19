import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginCore } from '../packages/core/dist/index.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { readArtifact } from '../packages/issuer/dist/index.js'
import { createServer } from 'node:http'
import { requestNetwork } from '../packages/core/dist/network.js'

const manifest = {
  manifestVersion: 2,
  id: 'test.core-node',
  name: 'Core test',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: {
    providers: [{ id: 'test', name: 'test', protocols: ['music.list@1'] }],
    commands: [{ id: 'environment', title: 'Environment', action: 'environment' }],
  },
}
const artifact =
  'exports.manifest = ' +
  JSON.stringify(manifest) +
  ';\nexports.activate = async function(ctx) { ctx.actions.register("environment", async () => { let escape = false; try { Buffer.constructor("return process")(); escape = true } catch {} let filesystem = false; try { ctx.modules.require("node:fs"); filesystem = true } catch {} const crypto = ctx.modules.require("@ceru/crypto"); return { process: typeof process, bridge: typeof __bridge, filesystem, escape, digest: crypto.createHash("sha256").update(Buffer.from("test")).digest("hex") } }); ctx.providers.register("test", { playlists: { list: async (ref, cursor, operation) => { operation.signal.throwIfAborted(); return { items: [], nextCursor: cursor || undefined }; } } }); };\n'

test('pure Node runtime runs SDK helpers without exposing Node or native bridge', async () => {
  const runtime = new NodePluginSandbox(
    async () => {
      throw Error('No Host authority')
    },
    () => {},
  )
  try {
    await runtime.start(readArtifact(artifact))
    const value = await runtime.invoke('action', 'environment', '', [{}])
    assert.equal(value.process, 'undefined')
    assert.equal(value.bridge, 'undefined')
    assert.equal(value.filesystem, false)
    assert.equal(value.escape, false)
    assert.equal(value.digest, '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
  } finally {
    runtime.dispose()
  }
})

test('Core pads omitted optional cursor before passing OperationContext and rejects shifted arguments', async () => {
  const core = await PluginCore.load(artifact, {
    host: {
      async activate(_artifact, ctx) {
        ctx.providers.register('test', {
          playlists: {
            async list(ref, cursor, operation) {
              operation.signal.throwIfAborted()
              assert.equal(cursor, undefined)
              return { items: [] }
            },
          },
        })
      },
    },
  })
  try {
    assert.deepEqual(await core.invokeProvider('test', 'playlists.list', [{}]), { items: [] })
    await assert.rejects(
      core.invokeProvider('test', 'playlists.list', [{}, '1', { limit: 10 }]),
      /Invalid .* arguments/,
    )
  } finally {
    await core.dispose()
  }
})

test('network broker denies LAN until separately granted and aborts requests', async () => {
  const server = createServer((_req, res) => res.end('{"ok":true}'))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port
  try {
    await assert.rejects(
      requestNetwork({ url }, () => false),
      /局域网/,
    )
    assert.deepEqual((await requestNetwork({ url }, () => true)).body, { ok: true })
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(requestNetwork({ url }, () => true, controller.signal))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
