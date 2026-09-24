import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertContentPage } from '../packages/sdk/dist/index.js'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/music-item-v1.json', import.meta.url), 'utf8'),
)

test('track metadata transports known sizes without inventing bytes or requiring an owner', () => {
  const track = {
    ref: { scope: 'provider', providerId: 'tx', kind: 'track', id: '004VR0Hn3bkqqE' },
    title: fixture.name,
    capabilities: [],
    metadata: {
      artists: [fixture.singer],
      durationMs: 239000,
      hash: 'optional-platform-hash',
      qualities: ['320k'],
      qualitySizeLabels: { '320k': '9.12 MB' },
    },
  }
  assert.doesNotThrow(() => assertContentPage({ items: [track] }))
  assert.throws(() =>
    assertContentPage({
      items: [{ ...track, metadata: { ...track.metadata, qualitySizes: { '320k': '9.12 MB' } } }],
    }),
  )
  assert.throws(() =>
    assertContentPage({
      items: [{ ...track, metadata: { ...track.metadata, qualitySizeLabels: { flac: '1 MB' } } }],
    }),
  )
})
