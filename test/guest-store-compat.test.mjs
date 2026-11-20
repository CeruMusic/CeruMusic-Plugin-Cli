import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GuestStore } from '../packages/core/dist/guest-store.js'
import { readArtifact } from '../packages/issuer/dist/index.js'

test('v3 reopens actual 0.3.16 guest files without rewriting identity, grants or selection', async (context) => {
  const { index, script, body } = JSON.parse(
    await readFile(new URL('./fixtures/v2-wire/guest-store.json', import.meta.url)),
  )
  const [saved] = JSON.parse(index)
  const root = await mkdtemp(join(tmpdir(), 'ceru-guest-v3-read-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'index.json'), index)
  await writeFile(join(root, saved.id + '.js'), script)
  const manifest = {
    manifestVersion: 3,
    id: 'test.guest-host',
    name: 'Guest Host',
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: {},
    provides: {
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
  const unexpected = async () => {
    throw Error('unexpected request')
  }
  const store = new GuestStore({
    root,
    artifact: readArtifact('exports.manifest=' + JSON.stringify(manifest) + ';' + body),
    approve: unexpected,
    authorize: unexpected,
    request: unexpected,
    changed() {},
    event() {},
  })
  try {
    await store.initialize()
    assert.deepEqual(store.permissions(saved.id), ['network'])
    assert.deepEqual(store.list()[0].providers, saved.providers)
    assert.equal(store.list()[0].selected, true)
    assert.equal((await store.exportSelected('adapter')).script, script)
    assert.deepEqual(await store.invoke(saved.id, 'resolve', { id: '42' }), {
      method: 'resolve',
      input: { id: '42' },
    })
    assert.equal(await readFile(join(root, 'index.json'), 'utf8'), index)
  } finally {
    store.dispose()
  }
})
