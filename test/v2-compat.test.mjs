import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PluginCore } from '../packages/core/dist/index.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { readArtifact } from '../packages/issuer/dist/index.js'
import { assertLyricsDocument } from '../packages/sdk/dist/index.js'

const fixture = (name) => readFile(new URL(`./fixtures/v2-compat/${name}.js`, import.meta.url))

async function startWorker(context, name, onRegister = () => {}) {
  const artifact = readArtifact(await fixture(name))
  const worker = new NodePluginSandbox(
    async (method) => {
      throw new Error('Unexpected host request: ' + method)
    },
    (event, data) => {
      if (event === 'register') onRegister(data)
    },
  )
  context.after(() => worker.dispose())
  await worker.start(artifact)
  return { artifact, worker }
}

test('historical handwritten plugin activates and registers its declared action', async (context) => {
  const actions = []
  await startWorker(context, 'earliest-handwritten', ({ kind, id }) => {
    if (kind === 'action') actions.push(id)
  })
  assert.deepEqual(actions, ['hello.open'])
})

test('early schema surface still reads and activates', async (context) => {
  const { artifact } = await startWorker(context, 'earliest-schema-surface')
  const [surface] = artifact.header.manifest.modules.surfaces
  assert.equal(surface.kind, 'schema')
  assert.equal(artifact.resources[surface.entry].type, 'json')
})

test('comment-header plugin is rejected with the v2 migration message', async () => {
  const input = await fixture('legacy-comment')
  assert.throws(
    () => readArtifact(input),
    /Legacy comment-header plugins are recognized for migration/,
  )
})

test('top-level source methods work through the worker and Core result validation', async (context) => {
  const { worker } = await startWorker(context, 'earliest-source')
  const core = await PluginCore.load(await fixture('earliest-source'), {
    host: {
      async activate(_artifact, ctx) {
        const invoke =
          (method) =>
          (...args) => {
            const operation = args.pop()
            return worker.invoke('provider', 'early', `tracks.${method}`, args, operation.signal)
          }
        ctx.providers.register('early', {
          tracks: {
            search: invoke('search'),
            resolve: invoke('resolve'),
            lyrics: invoke('lyrics'),
          },
        })
      },
    },
  })
  context.after(() => core.dispose())
  const {
    items: [track],
  } = await core.invokeProvider('early', 'tracks.search', [{ query: '第一首歌' }])
  assert.deepEqual(track.metadata.artists, ['歌手'])
  assert.deepEqual(await core.invokeProvider('early', 'tracks.resolve', [track.ref, {}]), {
    ok: true,
    url: 'https://example.invalid/one.mp3',
  })
  assert.deepEqual(await core.invokeProvider('early', 'tracks.lyrics', [track.ref]), {
    format: 'crlyric',
    version: 1,
    track: track.ref,
    offsetMs: 0,
    lines: [{ startTimeMs: 0, text: '第一行' }],
  })
})

test('converter parse normalizes only legacy output; export and validation stay strict', async (context) => {
  const manifest = structuredClone(readArtifact(await fixture('earliest-source')).header.manifest)
  manifest.contributes.lyricConverters = [{ id: 'early', title: '早期歌词', formats: ['lrc'] }]
  const track = { pluginId: manifest.id, providerId: 'early', kind: 'track', id: 'one' }
  const legacy = Object.freeze({
    version: 1,
    track,
    offsetMs: 0,
    lines: [{ startTimeMs: 0, text: 'hello' }],
  })
  let output = legacy
  const core = await PluginCore.load(
    `exports.manifest = ${JSON.stringify(manifest)}; exports.activate = function () {};`,
    {
      host: {
        async activate(_artifact, ctx) {
          ctx.lyricConverters.register('early', { parse: () => output })
        },
      },
    },
  )
  context.after(() => core.dispose())
  const parse = () => core.convertLyrics('early', 'parse', { text: 'hello', format: 'lrc', track })
  assert.deepEqual(await parse(), { ...legacy, format: 'crlyric' })
  assert.throws(() => assertLyricsDocument(legacy), /Invalid lyrics document/)
  await assert.rejects(
    core.convertLyrics('early', 'export', { document: legacy, format: 'lrc' }),
    /Invalid lyrics document/,
  )
  for (const invalid of [{ format: 'lrc' }, { version: 2 }, { lines: [{}] }, { track: null }]) {
    output = { ...legacy, ...invalid }
    await assert.rejects(parse(), /Invalid/)
  }
})
