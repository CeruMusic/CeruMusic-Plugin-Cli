import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SurfaceSession } from '../packages/core/dist/surface.js'
import { createWebSurfaceDocument } from '../packages/core/dist/surface-document.js'
import { DevelopmentStorage } from '../packages/cli/dist/storage.js'
import { readArtifact, validateManifest } from '../packages/issuer/dist/index.js'
import { GuestStore } from '../packages/core/dist/guest-store.js'

const config = JSON.parse(
  await readFile(
    new URL('../packages/cli/templates/web-surface/ts/ceru.plugin.json', import.meta.url),
  ),
)
const manifest = config.manifest
test('Surface contract validates lifecycle actions and presentation before installing', () => {
  assert.doesNotThrow(() => validateManifest(manifest))
  const invalid = structuredClone(manifest)
  invalid.modules.surfaces[0].lifecycle.closeAction = 'missing'
  assert.throws(() => validateManifest(invalid), /Unknown surface lifecycle/)
  invalid.modules.surfaces[0].lifecycle.closeAction = 'page.close'
  invalid.modules.surfaces[0].presentation.size = 99999
  assert.throws(() => validateManifest(invalid), /Invalid manifest/)
})

test('Surface closes once, cancels pending work and rejects old session actions', async () => {
  const events = []
  const surface = manifest.modules.surfaces[0]
  let pendingSignal
  const session = new SurfaceSession(surface, manifest, async (action, _input, signal) => {
    events.push(action)
    if (action === 'hello') {
      pendingSignal = signal
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
    }
  })
  await Promise.all([session.open(), session.open()])
  const call = session.invoke('hello', {})
  await assert.rejects(session.invoke('undeclared', {}), /Undeclared/)
  await Promise.all([session.close(), session.close()])
  await assert.rejects(call, /closed/)
  assert.equal(pendingSignal.aborted, true)
  assert.deepEqual(events, ['page.open', 'hello', 'page.close'])
  await assert.rejects(session.open(), /closed/)
  await assert.rejects(session.invoke('hello', {}), /closed/)
})

test('Core document embeds the shared runtime without passing manifest credentials to the view', async () => {
  const m = structuredClone(manifest)
  m.config = { cookie: 'private-fixture' }
  const artifact = readArtifact(`exports.manifest = ${JSON.stringify(m)};
    exports.activate = function() {};
    exports.surfaces = {page: function(ctx) {ctx.root.textContent = '</script>';}};`)
  const document = await createWebSurfaceDocument(artifact, 'page', 'session')
  assert.deepEqual(document.init.manifest.config, {})
  assert.ok(!document.html.includes('private-fixture'))
  assert.ok(document.html.includes("connect-src 'none'"))
  assert.equal(document.presentation.size, 480)
  await assert.rejects(createWebSurfaceDocument(artifact, 'missing', 'session'), /Unknown/)
})

test('development storage survives restart and keeps plugin namespaces separate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-storage-'))
  const a = new DevelopmentStorage(root, 'plugin.a')
  await a.invoke('set', 'account', { cookie: 'fixture', remember: true })
  const restarted = new DevelopmentStorage(root, 'plugin.a')
  assert.deepEqual(await restarted.invoke('get', 'account'), { cookie: 'fixture', remember: true })
  assert.equal(await new DevelopmentStorage(root, 'plugin.b').invoke('get', 'account'), null)
  await assert.rejects(a.invoke('get', { pluginId: 'plugin.b', key: 'account' }), /Cross-plugin/)
  await assert.rejects(a.invoke('set', 'account', 'x'.repeat(10 * 1024 * 1024)), /10 MiB/)
  assert.deepEqual(await a.invoke('get', 'account'), { cookie: 'fixture', remember: true })
  await a.invoke('delete', 'account')
  assert.equal(await new DevelopmentStorage(root, 'plugin.a').invoke('get', 'account'), null)
})

test('published Guest bootstrap remains executable after replacing the old local Core patch', async () => {
  const m = {
    manifestVersion: 2,
    id: 'test.guest-host',
    name: 'Guest Host',
    version: '1.0.0',
    engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
    modules: {},
    contributes: {
      guestAdapters: [
        {
          id: 'adapter',
          format: 'test',
          compatibilityProfile: 'test@1',
          bootstrap: 'guest.main',
          runtime: 'ceru-js@1',
          projectableProtocols: ['music.resolve@1'],
        },
      ],
    },
    guestPolicy: {
      maxDepth: 1,
      allowedCapabilities: ['network.request'],
      networkScopeMode: 'per-guest-user-approved',
      allowNativeCode: false,
      allowRemoteCodeExecution: false,
    },
  }
  const artifact = readArtifact(`exports.manifest=${JSON.stringify(m)};
    exports.modules={'guest.main':function(ctx){
      ctx.handle(async (method,input)=>({method,input}));
      ctx.expose('initializeGuest',()=>ctx.ready({providers:[{id:'source',name:'Source',qualities:['low'],protocols:['music.resolve@1']}]}));
    }};`)
  const store = new GuestStore({
    root: await mkdtemp(join(tmpdir(), 'ceru-guest-')),
    artifact,
    approve: async () => true,
    authorize: async () => false,
    request: async () => {
      throw Error('No network')
    },
    changed() {},
    event() {},
  })
  try {
    const info = await store.install(
      'adapter',
      '/* @name Fixture\n@version 1.0.0 */\ninitializeGuest();',
    )
    await store.select(info.id)
    assert.equal(store.list()[0].state, 'ready')
    assert.equal(store.list()[0].providers[0].id, 'source')
    assert.deepEqual(await store.invoke(info.id, 'resolve', { id: '42' }), {
      method: 'resolve',
      input: { id: '42' },
    })
    assert.ok((await store.exportSelected('adapter')).script.includes('initializeGuest'))
    await store.remove(info.id)
    assert.equal(store.list().length, 0)
  } finally {
    store.dispose()
  }
})
