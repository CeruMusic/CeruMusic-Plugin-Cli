import assert from 'node:assert/strict'
import test from 'node:test'
import { defineManifest } from '../packages/sdk/dist/index.js'
import {
  readArtifact,
  sniffManifestVersion,
  validateManifest,
} from '../packages/issuer/dist/index.js'

const manifest = {
  manifestVersion: 3,
  id: 'test.source',
  name: 'Source',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: { logic: { module: 'logic.main' } },
}
const file =
  'exports.manifest = ' + JSON.stringify(manifest) + ';\nexports.activate = function () {};'

test('page conditions can match a selected provider ID without declaring or playing that provider', () => {
  const page = {id:'daily',title:'Daily',view:'view',mount:'home-tab'}
  const check = when => validateManifest({...manifest, entry:{views:[{id:'view',kind:'component',module:'view.main'}]},ui:{pages:[when === undefined ? page : {...page,when}]}})
  for (const when of [undefined,{loggedIn:false},{selectedSource:'wy'},{selectedSource:'local',loggedIn:true}]) check(when)
  for (const selectedSource of ['',false,' a', ['wy']]) assert.throws(() => check({selectedSource}),/selectedSource/)
})

test('a visibility predicate references a declared logic action and has a bounded merge mode', () => {
  const check = (when, logic = manifest.entry.logic) => validateManifest({...manifest,
    entry:{...(logic ? {logic} : {}),views:[{id:'panel',kind:'component',module:'view.main'}]},
    provides:{actions:[{id:'eligible',title:'Eligible'}]},
    ui:{pages:[{id:'daily',title:'Daily',view:'panel',mount:'home-tab',when}]}})
  check({predicate:'eligible'})
  for (const combine of ['all','any']) check({selectedSource:'wy',predicate:'eligible',combine})
  assert.throws(() => check({predicate:'missing'}),/Unknown visibility predicate/)
  assert.throws(() => check({predicate:'eligible'},null),/logic module/)
  assert.throws(() => check({combine:'any'}),/requires a predicate/)
  assert.throws(() => check({predicate:'eligible',combine:'one'}),/combine/)
})

test('provider entry conditions and selection hooks reference actions of their own manifest', () => {
  const check = fields => validateManifest({...manifest, provides:{
    providers:[{id:'catalog',name:'Catalog',protocols:['music.search@1'],...fields}],
    actions:[{id:'eligible',title:'Eligible'},{id:'select',title:'Select'}]}})
  check({})
  check({beforeSelect:'select'})
  check({when:{selectedSource:'local'}})
  for (const combine of ['all','any']) check({when:{predicate:'eligible',combine},beforeSelect:'select'})
  assert.throws(() => check({when:{predicate:'foreign'}}), /Unknown visibility predicate/)
  assert.throws(() => check({when:{combine:'any'}}), /requires a predicate/)
  assert.throws(() => check({beforeSelect:'foreign'}), /Unknown provider selection action/)
})

test('routes both generations from bytes, exports and JSON headers, without running logic', () => {
  for (const version of [2, 3]) {
    const value = { manifestVersion: version }
    const sources = [
      'exports.manifest = ' + JSON.stringify(value),
      'exports.manifest = ' + JSON.stringify(value) + ';',
      '/* @ceru-plugin-v2\n' +
        JSON.stringify({ formatVersion: 2, manifest: value }) +
        '\n@end-ceru-plugin */\n',
    ]
    for (const source of sources)
      for (const input of [source, Buffer.from('\ufeff' + source)]) {
        assert.equal(sniffManifestVersion(input), version)
      }
  }
  assert.equal(sniffManifestVersion('/*! @name LX\n * @version 1.0.0 */'), 'legacy-comment')
  assert.equal(sniffManifestVersion(file + 'throw Error();'), 3)
  for (const input of [
    'exports.manifest = {manifestVersion: unknown()};',
    'exports.manifest = {manifestVersion:2,manifestVersion:3};',
    'exports.manifest = {manifestVersion:4};',
    'not a plugin',
    new Uint8Array([255]),
  ])
    assert.equal(sniffManifestVersion(input), null)
})

test('v3 issuer keeps formatVersion 2 but rejects v2 fields with their names', () => {
  const artifact = readArtifact(file)
  assert.equal(artifact.header.formatVersion, 2)
  assert.ok(artifact.modules['logic.main'])
  for (const key of ['modules', 'contributes', 'permissions'])
    assert.throws(() => validateManifest({ ...manifest, [key]: {} }), new RegExp(key))
  assert.throws(() => validateManifest({ ...manifest, manifestVersion: 2 }), /manifestVersion/)
})

test('requires explicit account login methods and valid inter-plugin service versions', () => {
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        provides: { accounts: [{ id: 'demo', title: 'Demo', loginMethods: [] }] },
      }),
    /loginMethods/,
  )
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        provides: { services: [{ id: 'demo', version: 'tomorrow', methods: ['get'] }] },
      }),
    /services version/,
  )
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        uses: { plugins: [{ pluginId: 'test.supplier', service: 'demo', version: 'tomorrow' }] },
      }),
    /plugins version/,
  )
})

test('JS authors cannot use defineManifest to declare v2 fields', () => {
  assert.equal(defineManifest(manifest), manifest)
  assert.throws(() => defineManifest({ ...manifest, manifestVersion: 2 }), /v3/)
  assert.throws(() => defineManifest({ ...manifest, permissions: [] }), /permissions/)
})
