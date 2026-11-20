import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from 'ajv'
import { OPERATION_CATALOG } from '../packages/core/dist/operation-catalog.js'
import {
  operationTool,
  listOperationTools,
  toolInput,
  toolResult,
} from '../packages/core/dist/operation-tools.js'

const playlist = { id: 'list-1', name: 'Playlist', location: 'local' }
const track = {
  ref: { kind: 'track', providerId: 'demo', id: 'one' },
  title: 'One',
  metadata: { artists: [] },
}
const examples = {
  'playlist.create': { name: 'Playlist', location: 'cloud' },
  'playlist.delete': { playlist },
  'playlist.addTracks': { playlist, tracks: [track] },
  'playlist.removeTracks': { playlist, tracks: [track] },
  'playlist.import': { value: 'https://example.test/list', importerId: 'demo:lists' },
  'playlist.export': { playlist, format: 'cpl' },
}
const permissions = [
  'library.write',
  'library.delete',
  'library.write',
  'library.delete',
  'library.write',
  'library.read',
]

test('six public playlist tools use catalog schemas, actual method permissions, and null completion results', () => {
  const ajv = new Ajv({ strict: false })
  assert.equal(listOperationTools().length, 23)
  for (const [index, [name, input]] of Object.entries(examples).entries()) {
    const tool = operationTool(name)
    assert.equal(tool.permission, permissions[index])
    assert.deepEqual(tool.inputSchema, OPERATION_CATALOG[name].inputSchema)
    assert.deepEqual(tool.outputSchema, OPERATION_CATALOG[name].outputSchema)
    assert.equal(ajv.compile(tool.inputSchema)(input), true)
    assert.deepEqual(toolInput(name, input), input)
    assert.doesNotThrow(() => toolResult(name, null))
    for (const result of [undefined, false, { id: 'list-1' }, { cancelled: true }])
      assert.throws(() => toolResult(name, result))
    assert.throws(() => toolInput(name, { ...input, extra: 'ignored' }))
    tool.inputSchema.properties = {}
    assert.notDeepEqual(operationTool(name).inputSchema, tool.inputSchema)
  }
  for (const name of [
    'player.error',
    'player.resolve',
    'queue.shuffle',
    'account.switch',
    'download.filename',
  ])
    assert.throws(() => operationTool(name), /not callable/)
})

test('playlist tool validation rejects private handles, duplicates, paths and invalid destinations', () => {
  for (const name of ['playlist.addTracks', 'playlist.removeTracks']) {
    for (const providerId of ['private', 'local'])
      assert.throws(() =>
        toolInput(name, { playlist, tracks: [{ ...track, ref: { ...track.ref, providerId } }] }),
      )
    assert.throws(() => toolInput(name, { playlist, tracks: [track, track] }))
    assert.throws(() =>
      toolInput(name, {
        playlist,
        tracks: [{ ...track, ref: { ...track.ref, connectionId: 'secret' } }],
      }),
    )
    assert.throws(() =>
      toolInput(name, { playlist, tracks: [{ ...track, ref: { ...track.ref, id: 'C:/secret' } }] }),
    )
    assert.throws(() => toolInput(name, { playlist, tracks: Array(1001).fill(track) }))
  }
  for (const value of ['file:///private/list', 'C:\\private\\list', '\\\\server\\list', '  '])
    assert.throws(() => toolInput('playlist.import', { value }))
  assert.deepEqual(toolInput('playlist.import', { value: '  public-code  ' }), {
    value: 'public-code',
  })
  assert.throws(() => toolInput('playlist.create', { name: ' ', location: 'local' }))
  assert.throws(() => toolInput('playlist.create', { name: 'New', location: 'both' }))
  assert.throws(() => toolInput('playlist.export', { playlist, format: 'html' }))
  assert.throws(() => toolInput('playlist.delete', { playlist: { ...playlist, name: ' ' } }))
})
