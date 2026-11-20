import test from 'node:test'
import assert from 'node:assert/strict'
import { MusicRegistry } from '@shiqianjiang/ceru-plugin-core/music'
import { createDispatcher } from '@shiqianjiang/ceru-plugin-core/dispatch'
const op = () => ({
  id: crypto.randomUUID(),
  deadlineAt: Date.now() + 5000,
  signal: new AbortController().signal,
})
const request = { query: 'track', kinds: ['track'], filters: {}, limit: 10 }
const ref = {
  id: 'one',
  providerId: 'same',
  scope: 'provider',
  kind: 'track',
  pluginId: 'owner.one',
  data: { token: 'opaque' },
}
const source = (pluginId, runtime) => ({
  pluginId,
  runtime,
  ownerId: 'owner.' + pluginId,
  providerId: 'same',
  methods: ['tracks.search', 'tracks.resolve', 'tracks.lyrics'],
  declaration: {
    id: 'same',
    name: pluginId,
    protocols: ['music.search@1'],
    qualities: ['standard'],
  },
})
test('stream resolves pass through host preparation and never expose keys to a consumer', async () => {
  const resolved = {
    ok: true,
    url: 'https://music.example/encrypted',
    stream: { decrypt: { algorithm: 'aes-128-ctr', key: '00'.repeat(16), iv: '00'.repeat(16) } },
  }
  const seen = []
  const registry = new MusicRegistry(undefined, (owner, result) => {
    seen.push([owner.pluginId, result])
    return { ok: true, url: 'ceru-media://test-token' }
  })
  registry.register(source('one', 3), async () => resolved)
  assert.deepEqual(
    await registry.invoke('music.tracks.resolve', [ref, 'standard', {}], 'reader', op()),
    { ok: true, url: 'ceru-media://test-token', expiresAt: undefined },
  )
  assert.equal(seen[0][0], 'one')
  assert.equal(seen[0][1].stream.decrypt.key, resolved.stream.decrypt.key)
  const unavailable = new MusicRegistry()
  unavailable.register(source('one', 3), async () => resolved)
  await assert.rejects(
    unavailable.invoke('music.tracks.resolve', [ref, 'standard', {}], 'reader', op()),
    /Host media streaming is unavailable/,
  )
  registry.register(source('two', 3), async () => ({ ...resolved, url: 'ceru-media://untrusted' }))
  await assert.rejects(
    registry.invoke(
      'music.tracks.resolve',
      [{ ...ref, scope: undefined, pluginId: 'owner.two' }, 'standard', {}],
      'reader',
      op(),
    ),
  )
})
test('music routes public refs by method preference but pins private refs and strips opaque identity', async () => {
  const registry = new MusicRegistry((_source, method, owners) =>
    method === 'tracks.resolve' ? [...owners].reverse() : owners,
  )
  const seen = []
  const run = async (method, [incoming]) => {
    if (method === 'tracks.search')
      return {
        items: [ref, { ...ref, scope: undefined, connectionId: 'account' }].map((ref) => ({
          ref,
          title: 'track',
          metadata: { artists: [] },
          extensions: { secret: true },
          capabilities: ['play'],
        })),
      }
    seen.push(incoming)
    return {
      ok: true,
      url: 'https://music.example/audio',
      requestHeaders: { Authorization: 'private' },
    }
  }
  registry.register(source('one', 2), run)
  registry.register(source('two', 3), run)
  assert.equal(registry.sources().length, 1)
  const [item] = (await registry.invoke('music.search', ['same', request, {}], 'reader', op()))
    .items
  assert.deepEqual(item.ref, {
    id: 'one',
    providerId: 'same',
    scope: 'provider',
    kind: 'track',
    pluginId: 'owner.one',
  })
  assert.equal(item.extensions, undefined)
  const result = await registry.invoke(
    'music.tracks.resolve',
    [ref, 'standard', {}],
    'reader',
    op(),
  )
  assert.deepEqual(seen[0], {
    id: 'one',
    providerId: 'same',
    scope: 'provider',
    kind: 'track',
    pluginId: 'owner.two',
  })
  assert.equal(result.requestHeaders, undefined)
  const privateRef = { ...ref, scope: undefined, connectionId: 'account' }
  await assert.rejects(
    registry.invoke('music.tracks.resolve', [privateRef, undefined, {}], 'reader', op()),
    /unavailable/,
  )
  await registry.invoke('music.tracks.resolve', [privateRef, undefined, {}], 'one', op())
  assert.equal(seen.at(-1).data.token, 'opaque')
  assert.throws(() => registry.playbackRef(privateRef, 'two'), /unavailable/)
  assert.equal(registry.resolveProvider({ ...privateRef, pluginId: 'missing' }), undefined)
})
test('registration disposers cannot remove replacements and listeners cannot mutate snapshots', async () => {
  const registry = new MusicRegistry(),
    events = []
  const off = registry.on('sources.changed', (list) => {
    events.push(list.length)
    list[0]?.qualities.pop()
  })
  const old = registry.register(source('one', 2), async () => {}),
    current = registry.register(source('one', 3), async () => {})
  old()
  assert.deepEqual(events, [1, 1])
  assert.deepEqual(registry.sources()[0].qualities, ['standard'])
  assert.equal(registry.sources()[0].runtime, 3)
  const item = { pluginId: 'one', runtime: 2, declaration: { id: 'import', title: 'Import' } }
  const before = registry.registerImporter(item, async () => {
      throw Error('stale')
    }),
    after = registry.registerImporter(item, async () => ({ items: [] }))
  before()
  assert.deepEqual(
    (
      await registry.invoke(
        'music.importers.parse',
        ['import', 'value', undefined, {}],
        'reader',
        op(),
      )
    ).items,
    [],
  )
  after()
  await assert.rejects(
    registry.invoke('music.importers.parse', ['import', 'value', undefined, {}], 'reader', op()),
    /Unknown/,
  )
  current()
  off()
  assert.deepEqual(events, [1, 1, 0])
})
test('music dispatch uses the declared key for discovery and validates search, cancellation and deadline', async () => {
  const keyLog = [],
    registry = new MusicRegistry(),
    entered = Promise.withResolvers()
  registry.register(source('one', 3), async (_method, _args, operation) => {
    entered.resolve(operation.signal)
    return new Promise((resolve) =>
      operation.signal.addEventListener('abort', () => resolve({ items: [] })),
    )
  })
  const dispatch = createDispatcher(
    {
      'music.sources': async () => registry.sources(),
      'operations.cancel': async () => {},
      'music.search': (data, ctx) =>
        registry.invoke('music.search', data.args, 'reader', {
          ...data.args[2].operation,
          signal: ctx.signal,
        }),
    },
    {
      manifest: { uses: { permissions: [{ name: 'music.read', key: 'catalog' }] } },
      pluginId: 'reader',
      log: { debug() {}, warn() {} },
      authorize: async (key) => {
        keyLog.push(key)
        if (key !== 'catalog') throw Error('Denied')
      },
    },
  )
  await dispatch('music.sources', { args: [], permissionKey: 'forged' })
  assert.deepEqual(keyLog, ['catalog'])
  const operation = op(),
    call = { permissionKey: 'catalog', operation }
  await assert.rejects(
    dispatch('music.search', {
      args: ['same', request, { ...call, permissionKey: 'wrong' }],
      permissionKey: 'catalog',
    }),
    /Denied/,
  )
  await assert.rejects(
    dispatch('music.search', { args: ['same', { ...request, limit: 0 }, call] }),
    /Invalid music search/,
  )
  await assert.rejects(
    dispatch('music.search', {
      args: ['same', request, { ...call, operation: { ...operation, deadlineAt: 0 } }],
    }),
    /deadline/,
  )
  const pending = dispatch('music.search', { args: ['same', request, call] })
  const signal = await entered.promise
  await dispatch('operations.cancel', { id: operation.id })
  await assert.rejects(pending, /abort/i)
  assert.ok(signal.aborted)
})
