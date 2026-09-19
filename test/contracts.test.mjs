import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManifest } from '../packages/issuer/dist/index.js'
import {
  assertContentPage,
  assertLyricsDocument,
  assertResolveResult,
  permissionGroup,
} from '../packages/sdk/dist/index.js'
import { networkPermissionKey } from '../packages/sdk/dist/http.js'

const workspace = fileURLToPath(new URL('../', import.meta.url))
const sourceConfig = JSON.parse(
  await readFile(resolve(workspace, 'packages/cli/templates/source/ts/ceru.plugin.json'), 'utf8'),
)

test('home sections are contribution-driven and reference declared providers', () => {
  const manifest = structuredClone(sourceConfig.manifest)
  manifest.contributes.homeSections = [
    {
      id: 'catalog-playlists',
      title: '歌单',
      kind: 'playlists',
      providerIds: ['catalog'],
    },
  ]
  assert.doesNotThrow(() => validateManifest(manifest))
  manifest.contributes.homeSections[0].providerIds = ['missing']
  assert.throws(() => validateManifest(manifest), /Unknown home section provider/)
})

test('manifest keeps standard provider metadata separate from custom config', () => {
  const manifest = structuredClone(sourceConfig.manifest)
  manifest.homepage = 'https://source.example.com'
  manifest.config = {
    apiKey: 'customer-key',
    customBusinessField: { enabled: true },
  }
  manifest.contributes.providers[0].qualities = ['128k', '320k', 'flac']
  assert.doesNotThrow(() => validateManifest(manifest))
  manifest.config = 'not-an-object'
  assert.throws(() => validateManifest(manifest), /Invalid manifest/)
})

test('application CSS requires its grouped high-impact permission', () => {
  const manifest = structuredClone(sourceConfig.manifest)
  manifest.contributes.styles = [{ id: 'theme', resource: 'theme.css', scope: 'application' }]
  assert.throws(() => validateManifest(manifest), /ui\.styles\.global/)
  manifest.permissions.push({
    key: 'appearance',
    name: 'ui.styles.global',
    reason: '应用用户选择的全局主题',
  })
  assert.doesNotThrow(() => validateManifest(manifest))
  assert.equal(permissionGroup('ui.styles.global'), 'uiAppearance')
})

test('public network authorization is capability-wide and private network is separate', () => {
  assert.equal(networkPermissionKey('https://one.example'), 'network')
  assert.equal(networkPermissionKey('http://another.example:8080'), 'network')
  assert.equal(permissionGroup('network.request'), 'network')
  assert.equal(permissionGroup('network.socket'), 'network')
  assert.equal(permissionGroup('network.private'), 'localNetwork')
})

test('standard tracks and millisecond lyric documents pass Core validation', () => {
  const ref = {
    pluginId: 'example.source',
    providerId: 'catalog',
    kind: 'track',
    id: '42',
    data: { platformId: '42' },
  }
  assert.doesNotThrow(() =>
    assertContentPage({
      items: [
        {
          ref,
          title: 'Example',
          capabilities: ['music.resolve@1'],
          metadata: { artists: ['Artist'], durationMs: 123000 },
        },
      ],
    }),
  )
  assert.doesNotThrow(() =>
    assertLyricsDocument({
      version: 1,
      track: ref,
      offsetMs: 0,
      lines: [
        {
          startTimeMs: 1000,
          endTimeMs: 2000,
          text: 'Hello',
          words: [{ startTimeMs: 1000, endTimeMs: 2000, text: 'Hello' }],
        },
      ],
    }),
  )
  assert.throws(
    () =>
      assertLyricsDocument({
        version: 1,
        track: ref,
        offsetMs: 0,
        lines: [
          { startTimeMs: 2000, text: 'Later' },
          { startTimeMs: 1000, text: 'Earlier' },
        ],
      }),
    /Invalid lyric line/,
  )
  assert.doesNotThrow(() =>
    assertResolveResult({ ok: true, url: 'https://media.example/song.mp3' }),
  )
  assert.doesNotThrow(() =>
    assertResolveResult({ ok: false, error: { code: 'RATE_LIMITED', message: 'Later' } }),
  )
})
