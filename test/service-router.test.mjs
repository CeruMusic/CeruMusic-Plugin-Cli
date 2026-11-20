import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServiceRouter, dependencyOrder } from '../packages/core/dist/service-router.js'
import {
  readMockServices,
  developmentPluginServices,
} from '../packages/cli/dist/dev-plugin-services.js'
import { createDispatcher } from '../packages/core/dist/dispatch.js'
import { RPC } from '../packages/core/dist/contract.js'
const dependency = { pluginId: 'demo.provider', service: 'echo', version: '^1', optional: true }
const declaration = { id: 'echo', version: '1.2.0', methods: ['reply'] }
const client = {
  id: 'demo.client',
  uses: { plugins: [dependency], permissions: [{ name: 'services.consume', key: 'allow' }] },
}
const signal = new AbortController().signal

test('router isolates by declaration, cancels on release, and detects only hard cycles', async () => {
  const router = new ServiceRouter(),
    events = []
  const receiver = router.connect(
    client,
    () => {},
    (event, info) => events.push([event, info.pluginId]),
  )
  receiver.attach()
  assert.equal(receiver.use(dependency.pluginId, 'echo'), null)
  assert.throws(() => receiver.use('foreign', 'echo'), /Undeclared/)
  const provider = router.connect(
    { id: dependency.pluginId, provides: { services: [declaration] } },
    async (_svc, _method, input, caller) => {
      assert.equal(caller, client.id)
      if (input === 'wait') return new Promise(() => {})
      return { echo: input }
    },
    () => {},
  )
  assert.throws(() => provider.register('echo', ['notDeclared']), /Invalid/)
  provider.register('echo', ['reply'])
  provider.attach()
  assert.deepEqual(receiver.use(dependency.pluginId, 'echo'), ['reply'])
  assert.deepEqual(
    await receiver.invoke(dependency.pluginId, 'echo', 'reply', { text: 'hi' }, signal),
    { echo: { text: 'hi' } },
  )
  await assert.rejects(
    receiver.invoke(dependency.pluginId, 'echo', 'other', {}, signal),
    /unavailable/,
  )
  await assert.rejects(
    receiver.invoke(dependency.pluginId, 'echo', 'reply', new Map(), signal),
    /JSON/,
  )
  await assert.rejects(
    receiver.invoke(dependency.pluginId, 'echo', 'reply', 'a'.repeat(128 * 1024 + 1), signal),
    /limit/,
  )
  const pending = receiver.invoke(dependency.pluginId, 'echo', 'reply', 'wait', signal)
  provider.register('echo', null)
  await assert.rejects(pending)
  assert.deepEqual(events, [
    ['available', dependency.pluginId],
    ['unavailable', dependency.pluginId],
  ])
  const ref = (id, dependencies) => ({
    id,
    dependencies: dependencies.map((pluginId) => ({ pluginId })),
  })
  const { ordered, cycles } = dependencyOrder([
    ref('child', ['parent']),
    ref('parent', []),
    ref('a', ['b']),
    ref('b', ['a']),
    { id: 'c', dependencies: [{ pluginId: 'c', optional: true }] },
  ])
  assert.ok(ordered.indexOf('parent') < ordered.indexOf('child'))
  assert.deepEqual([...cycles].sort(), ['a', 'b'])
})
test('development config supplies JSON replies through the real permission-checked contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-dev-services-'))
  try {
    assert.deepEqual(await readMockServices(root), [])
    await writeFile(
      join(root, 'ceru.config.json'),
      JSON.stringify({
        mockServices: [
          {
            pluginId: dependency.pluginId,
            service: 'echo',
            version: '1.1.0',
            returns: { reply: { text: 'fixture' } },
          },
        ],
      }),
    )
    let allowed = false,
      checks = 0
    const dispatch = createDispatcher(
      developmentPluginServices(client, await readMockServices(root)),
      {
        manifest: client,
        pluginId: client.id,
        log: { debug() {}, warn() {} },
        authorize: async (key, permission) => {
          checks++
          assert.equal(key, 'allow')
          assert.equal(permission, 'services.consume')
          if (!allowed) throw Error('denied')
        },
      },
    )
    const data = { pluginId: dependency.pluginId, service: 'echo' }
    await assert.rejects(dispatch(RPC.plugins.use, data), /denied/)
    allowed = true
    assert.deepEqual(await dispatch(RPC.plugins.use, data), ['reply'])
    assert.deepEqual(
      await dispatch(RPC.plugins.invoke, { ...data, method: 'reply', input: null }),
      { text: 'fixture' },
    )
    allowed = false
    await assert.rejects(
      dispatch(RPC.plugins.invoke, { ...data, method: 'reply', input: null }),
      /denied/,
    )
    assert.equal(checks, 4)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
