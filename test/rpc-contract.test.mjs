import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { CONTRACT, RPC, createRpcMethods, listOperationTools } from '../packages/core/dist/contract.js'
import { createDispatcher } from '../packages/core/dist/dispatch.js'

const manifest = {
  manifestVersion: 3,
  id: 'test.rpc',
  name: 'Test',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: {},
}
const hooks = {
  manifest,
  pluginId: manifest.id,
  log: { debug() {}, warn() {} },
  async authorize(key) {
    if (key !== 'allowed') throw Error('Denied')
  },
}

test('callable operation discovery, permissions, payloads and deadlines', async () => {
  const executed = []
  const client = createRpcMethods(createDispatcher({
    [RPC.services.app.operations.list]: async () => listOperationTools(),
    [RPC.services.app.call]: async ({args}) => { executed.push(args[0]); return null },
  }, {...hooks, authorize: async (key, permission) => { if (key !== permission) throw Error('Denied') }}))
  const catalog = await client.app.operations.list()
  const samples = new Map([
    ['track.like', {track:{ref:{kind:'track',id:'song',providerId:'demo'},title:'Song',metadata:{artists:[]}},liked:true}],
    ['player.pause', {}], ['player.resume', {}], ['player.previous', {}], ['player.seek',{positionMs:42}],
    ['player.setVolume',{volume:0.5}], ['player.setMode',{mode:'single'}],
    ['player.play',{track:{ref:{kind:'track',id:'song',providerId:'demo'},title:'Song',metadata:{artists:[]}}}],
    ['player.next',{reason:'user'}], ['queue.add',{tracks:[{ref:{kind:'track',id:'song',providerId:'demo'},title:'Song',metadata:{artists:[]}}],position:'end'}], ['queue.remove',{tracks:[]}], ['queue.clear',{}],
    ['download.create',{tracks:[{ref:{kind:'track',id:'song',providerId:'demo'},title:'Song',metadata:{artists:[]}}],quality:'320k'}],
    ['share.create',{track:{ref:{kind:'track',id:'song',providerId:'demo'},title:'Song',metadata:{artists:[]}}}],
    ['notification.show',{title:'Notice',body:'Hello',level:'success'}],
    ['link.open',{url:'https://example.test/list',from:'drop'}],['window.close',{}],
    ['playlist.create',{name:'Example',location:'local'}],
    ['playlist.delete',{playlist:{id:'list',name:'Example',location:'local'}}],
    ['playlist.addTracks',{playlist:{id:'list',name:'Example',location:'local'},tracks:[]}],
    ['playlist.removeTracks',{playlist:{id:'list',name:'Example',location:'local'},tracks:[]}],
    ['playlist.import',{value:'https://example.test/list'}],
    ['playlist.export',{playlist:{id:'list',name:'Example',location:'local'},format:'cmpl'}],
  ])
  assert.deepEqual(catalog.map(tool=>tool.name).sort(), [...samples.keys()].sort())
  const call = permissionKey => ({permissionKey, operation:{id:'op',deadlineAt:Date.now()+5000}})
  for (const tool of catalog) {
    const permission = ({'track.like':'library.write','download.create':'downloads.create','share.create':'sharing.publish','notification.show':null,'link.open':'external.open','window.close':'window.control','playlist.create':'library.write','playlist.delete':'library.delete','playlist.addTracks':'library.write','playlist.removeTracks':'library.delete','playlist.import':'library.write','playlist.export':'library.read'})[tool.name] ?? (tool.name==='notification.show'?null:'player.control')
    assert.equal(tool.permission,permission)
    assert.equal(tool.inputSchema.type,'object'); assert.ok(tool.description)
    if(tool.name !== 'share.create') assert.equal(tool.outputSchema.type,'null')
    if(permission!==null) await assert.rejects(client.app.call(tool.name,samples.get(tool.name),call(permission==='library.write'?'player.control':'library.write')), /Denied/)
    assert.equal(await client.app.call(tool.name,samples.get(tool.name),call(permission ?? '')),null)
  }
  await assert.rejects(client.app.operations.list('extra'),/no arguments/)
  await assert.rejects(client.app.call('track.like',samples.get('track.like'),call('library.intercept')), /Denied/)
  for (const name of ['toString','constructor','unknown']) await assert.rejects(client.app.call(name,{},call('player.control')), /not callable/)
  for (const providerId of ['private','local']) {
    const input=structuredClone(samples.get('track.like')); input.track.ref.providerId=providerId
    await assert.rejects(client.app.call('track.like',input,call('library.write')), /public track/)
  }
  await assert.rejects(client.app.call('player.seek',{positionMs:-1},call('player.control')), /Invalid/)
  await assert.rejects(client.app.call('player.pause',{}, {permissionKey:'player.control'}), /ServiceCall/)
  await assert.rejects(client.app.call('player.pause',{}, {permissionKey:'player.control',operation:{id:'late',deadlineAt:Date.now()-1}}), /deadline exceeded/)
  assert.deepEqual(executed,catalog.map(tool=>tool.name))
})

test('operation results follow the selected tool and reject unsafe sharing output', async () => {
  let value = {id:'shared',url:'https://example.test/shared',template:'Shared'}
  const client = createRpcMethods(createDispatcher({
    [RPC.services.app.call]: async () => value,
  }, {...hooks, authorize:async()=>{}}))
  const input = {track:{ref:{kind:'track',providerId:'demo',id:'one'},title:'One',metadata:{artists:[]}}}
  const call = {permissionKey:'share',operation:{id:'share',deadlineAt:Date.now()+5000}}
  assert.deepEqual(await client.app.call('share.create',input,call),value)
  await assert.rejects(client.app.call('player.pause',{},call),/null operation result/)
  for(const url of ['file:///private','javascript:alert(1)','https://user:password@example.test/']) {
    value = {id:'bad',url}
    await assert.rejects(client.app.call('share.create',input,call))
  }
  value = null
  assert.equal(await client.app.call('share.create',input,call),null)
})

test('every public method is generated from the documented contract, with internal traffic kept private', async () => {
  const docs = await readFile(new URL('../docs/HOST-SERVICES.md', import.meta.url), 'utf8')
  const client = createRpcMethods(async (method, data) => ({ method, data }))
  for (const [method, entry] of Object.entries(CONTRACT)) {
    assert.ok(docs.includes('`' + method + '`'), method)
    const property = method
      .replace(/^services\./, '')
      .split('.')
      .reduce((parent, key) => parent?.[key], client)
    if (entry.internal) {
      assert.equal(property, undefined)
      continue
    }
    assert.deepEqual(await property({ sample: 1 }), {
      method,
      data:
        method.startsWith('services.') || entry.positional
          ? { args: [{ sample: 1 }] }
          : { sample: 1 },
    })
  }
})

test('dispatch checks own methods, authorization, validation and in-flight import identity', async () => {
  let calls = 0,
    release
  const services = {
    [RPC.library.playlists.import]: async () => {
      calls++
      await new Promise((resolve) => {
        release = resolve
      })
      return 'imported'
    },
    [RPC.services.player.play]: async () => true,
    [RPC.library.playlists.getTracks]: async () => ({ items: 'invalid' }),
  }
  const dispatch = createDispatcher(services, hooks)
  await assert.rejects(dispatch('toString', {}), /Unsupported/)
  await assert.rejects(dispatch(RPC.services.player.play, { args: [{}, {}] }), /Denied/)
  assert.equal(
    await dispatch(RPC.services.player.play, { args: [{}, { permissionKey: 'allowed' }] }),
    true,
  )
  await assert.rejects(
    dispatch(RPC.library.playlists.getTracks, { permissionKey: 'allowed' }),
    /Invalid/,
  )
  const input = { requestId: 'r1', permissionKey: 'allowed', items: [] }
  await assert.rejects(
    dispatch(RPC.library.playlists.import, { ...input, requestId: '' }),
    /requestId/,
  )
  const first = dispatch(RPC.library.playlists.import, input),
    second = dispatch(RPC.library.playlists.import, input)
  await assert.rejects(
    dispatch(RPC.library.playlists.import, { ...input, permissionKey: 'denied' }),
    /Denied/,
  )
  assert.equal(calls, 1)
  release()
  assert.deepEqual(await Promise.all([first, second]), ['imported', 'imported'])
})

test('cancellation and deadlines signal services and never cross dispatcher instances', async () => {
  let signal, started
  const ready = new Promise((resolve) => {
    started = resolve
  })
  const services = {
    [RPC.operations.cancel]: async () => null,
    [RPC.http.request]: async (_, hooks) => {
      signal = hooks.signal
      started()
      return new Promise(() => {})
    },
  }
  const first = createDispatcher(services, hooks),
    second = createDispatcher(services, hooks)
  const input = { permissionKey: 'allowed', operation: { id: 's', deadlineAt: Date.now() + 5000 } }
  const pending = first(RPC.http.request, input)
  await ready
  await second(RPC.operations.cancel, { id: 's' })
  assert.equal(signal.aborted, false)
  await first(RPC.operations.cancel, { id: 's' })
  await assert.rejects(pending, /abort/i)
  assert.equal(signal.aborted, true)
  await assert.rejects(
    first(RPC.http.request, { ...input, operation: { deadlineAt: Date.now() + 30 } }),
    /timed out/,
  )
  assert.equal(signal.aborted, true)
})

test('entry invalidation rejects targeting, coalesces in flight and stays scoped to the caller', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve }), owners = []
  const service = { [RPC.entries.invalidate]: async (_,context) => { owners.push(context.pluginId); await pending } }
  const first = createDispatcher(service,hooks), second = createDispatcher(service,{...hooks,pluginId:'another.plugin'})
  await assert.rejects(first(RPC.entries.invalidate,{args:['another.plugin']}), /no arguments/)
  const jobs = [first(RPC.entries.invalidate,{args:[]}),first(RPC.entries.invalidate,{args:[]}),second(RPC.entries.invalidate,{args:[]})]
  await Promise.resolve()
  assert.deepEqual(owners,[hooks.pluginId,'another.plugin'])
  release(); await Promise.all(jobs)
})
