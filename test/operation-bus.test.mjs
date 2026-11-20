import assert from 'node:assert/strict'
import test from 'node:test'
import { LIBRARY_OPERATIONS, libraryInput } from '../packages/core/dist/operation-bus.js'
import { WINDOW_OPERATIONS, windowCloseInput } from '../packages/core/dist/operation-bus.js'

test('window close cancels, resumes exactly once and ignores revoked or timed out hooks',async()=>{
  for(const input of [null,[],{quit:true},{force:true}]) assert.throws(()=>windowCloseInput('window.close',input))
  let granted=true, reply={prevented:true}, count=0
  const bus=new OperationEngine(WINDOW_OPERATIONS,windowCloseInput,undefined,undefined,20)
  const owner=bus.connect('test.window',()=>granted,async()=>reply)
  owner.register('window.close','normal');owner.attach()
  const run=()=>bus.run('window.close',{}, {kind:'ui',location:'titlebar'},async()=>{count++})
  assert.equal((await run()).prevented,true);assert.equal(count,0)
  granted=false;await run();assert.equal(count,1)
  granted=true;reply={input:{quit:true}};await run();assert.equal(count,2)
  owner.dispose()
  const slow=bus.connect('test.slow',()=>true,async()=>{await delay(50);return {prevented:true}})
  slow.register('window.close','normal');slow.attach()
  await run();assert.equal(count,3);slow.dispose()
})

test('playlist import validates public input, rewrites and cancels before any importer runs',async()=>{
  const input={value:'https://example.test/list/one',importerId:'test.source:lists'}, writes=[]
  for(const invalid of [null,{}, {value:' '},{value:'x'.repeat(4097)},{value:'file:///private/list'},
    {value:'C:\\private\\list'}, {value:'\\\\server\\list'}, {...input,secret:'x'}, {...input,importerId:'installation/path:lists'}]) {
    assert.throws(()=>libraryInput('playlist.import',invalid))
  }
  assert.deepEqual(libraryInput('playlist.import',{value:'  123  '}),{value:'123'})
  const revised={value:'https://example.test/list/two',importerId:'test.other:lists'}
  let reply={input:revised}, granted=true
  const bus=new OperationEngine(LIBRARY_OPERATIONS,libraryInput)
  const owner=bus.connect('test.import',()=>granted,async()=>reply);owner.register('playlist.import','normal');owner.attach()
  const run=()=>bus.run('playlist.import',input,{kind:'ui',location:'playlist-import'},async value=>writes.push(value))
  await run();reply={prevented:true};assert.equal((await run()).prevented,true)
  granted=false;await run();assert.deepEqual(writes,[revised,input]);owner.dispose()
})
test('playlist export binds the original playlist and permits only host file formats',async()=>{
  const playlist={id:'list-1',name:'Portable',location:'local'}, input={playlist,format:'cmpl'}
  for(const invalid of [{playlist,format:'html'},{...input,path:'hidden'},{...input,playlist:{...playlist,id:'another'}},{...input,playlist:{...playlist,location:'both'}}]) assert.throws(()=>libraryInput('playlist.export',invalid,input))
  const bus=new OperationEngine(LIBRARY_OPERATIONS,libraryInput), writes=[]
  let reply={input:{playlist,format:'cpl'}},granted=true
  const owner=bus.connect('test.export',()=>granted,async()=>reply);owner.register('playlist.export','normal');owner.attach()
  const run=()=>bus.run('playlist.export',input,{kind:'ui',location:'playlists'},async value=>writes.push(value))
  await run();reply={prevented:true};assert.equal((await run()).prevented,true);granted=false;await run()
  assert.deepEqual(writes,[{playlist,format:'cpl'},input]);owner.dispose()
})
for (const name of ['playlist.addTracks', 'playlist.removeTracks']) {
  test(`${name} restricts hooks to the original playlist and selected tracks`, async () => {
    const playlist = {id:'list-1', name:'QA', location:'both'}
    const selected = (providerId, id) => ({ref:{kind:'track', providerId, id}, title:id, metadata:{artists:[]}})
    const first = selected('catalog', 'one'), second = selected('private', 'temporary-2')
    const input = {playlist, tracks:[first, second]}
    for (const invalid of [
      {...input, playlist:{...playlist, location:'local'}}, {...input, playlist:{...playlist, id:'elsewhere'}},
      {...input, tracks:[selected('catalog','three')]}, {...input, tracks:[selected('private','stale')]},
      {...input, tracks:[first, first]}, {...input, tracks:[selected('local','disk')]},
      {...input, tracks:[selected('catalog','C:/music/one')]}, {...input, tracks:Array(1001).fill(first)}
    ]) assert.throws(() => libraryInput(name, invalid, input))
    assert.deepEqual(libraryInput(name, {playlist, tracks:[{...second, title:'replacement'}, first]}, input), {playlist, tracks:[second, first]})
    assert.deepEqual(libraryInput(name, {playlist, tracks:[{...first, url:'private', metadata:{artists:[], auth:'private'}}]}), {playlist, tracks:[first]})
    const bus = new OperationEngine(LIBRARY_OPERATIONS, libraryInput), writes = []
    let reply = {input:{playlist, tracks:[second]}}, granted = true
    const owner = bus.connect('test.library.tracks', () => granted, async () => reply)
    owner.register(name, 'normal'); owner.attach()
    const run = () => bus.run(name, input, {kind:'ui'}, async value => writes.push(value))
    await run(); reply = {prevented:true}; assert.equal((await run()).prevented, true)
    granted = false; await run()
    assert.deepEqual(writes, [{playlist, tracks:[second]}, input]); owner.dispose()
  })
}
test('playlist creation preserves destination, rejects extra data, and delegates exactly one write',async()=>{
  const bus=new OperationEngine(LIBRARY_OPERATIONS,libraryInput),source={kind:'ui',location:'playlists'},input={name:'Original',location:'local'},writes=[]
  let reply={input:{...input,name:'Changed'}}
  const owner=bus.connect('test.library',()=>true,async()=>reply)
  owner.register('playlist.create','normal');owner.attach()
  const run=()=>bus.run('playlist.create',input,source,async value=>writes.push(value))
  await run()
  for (const invalid of [{...input,location:'cloud'},{...input,description:'not shared'},{...input,name:' '},{...input,name:'x'.repeat(513)}]) {
    assert.throws(()=>libraryInput('playlist.create',invalid,input))
  }
  reply={input:{...input,location:'cloud'}};await run()
  reply={prevented:true};assert.equal((await run()).prevented,true)
  assert.deepEqual(writes,[{...input,name:'Changed'},input]);owner.dispose()
})
test('playlist deletion keeps the exact target and scope and can cancel without a write',async()=>{
  const bus=new OperationEngine(LIBRARY_OPERATIONS,libraryInput),input={playlist:{id:'local-1',name:'QA',location:'local'}},writes=[]
  for(const value of [{playlist:{...input.playlist,id:'other'}},{playlist:{...input.playlist,location:'both'}},{playlist:{...input.playlist,cloudId:'secret'}},{playlist:{...input.playlist,name:''}}]) assert.throws(()=>libraryInput('playlist.delete',value,input))
  let reply={input};const owner=bus.connect('test.library.delete',()=>true,async()=>reply);owner.register('playlist.delete','normal');owner.attach()
  const source={kind:'ui',location:'playlists'},run=()=>bus.run('playlist.delete',input,source,async value=>writes.push(value))
  await run();assert.deepEqual(writes,[input])
  reply={prevented:true};assert.equal((await run()).prevented,true);assert.deepEqual(writes,[input])
  owner.dispose()
})
import { OperationBus, OperationEngine, playbackInput, SEARCH_OPERATIONS, searchInput, RESOLVE_OPERATIONS, resolveInput } from '../packages/core/dist/operation-bus.js'
test('resolve returns only host status and permits one sequential retry after failure',async()=>{
  const bus=new OperationEngine(RESOLVE_OPERATIONS,resolveInput)
  const input={track:{ref:{kind:'track',providerId:'first',id:'song'},title:'Song',metadata:{artists:[]}},quality:'128k'}
  const alternate={...input,track:{...input.track,ref:{...input.track.ref,providerId:'second'}}}
  const attempts=[], statuses=[], errors=[]
  const owner=bus.connect('test.resolve',()=>true,async(name,token)=>{
    const first=owner.next(token,input)
    try{owner.next(token,alternate)}catch(error){errors.push(error.message)}
    statuses.push(await first)
    statuses.push(await owner.next(token,alternate))
    try{owner.next(token,input)}catch(error){errors.push(error.message)}
    return {}
  })
  owner.register('player.resolve','normal');owner.attach()
  await bus.run('player.resolve',input,{kind:'system'},async value=>{attempts.push(value.track.ref.providerId);return {ok:attempts.length===2,url:'host-only'}})
  assert.deepEqual(attempts,['first','second']);assert.deepEqual(statuses,[{ok:false},{ok:true}]);assert.equal(errors.length,2)
  for(const ref of [{providerId:'private',id:'forged'},{providerId:'local'},{connectionId:'secret'},{pluginId:'another'}]) {
    assert.throws(()=>resolveInput('player.resolve',{...input,track:{...input.track,ref:{...input.track.ref,...ref}}},input))
  }
  owner.dispose()
})
test('result pages project each hop and bind private handles and result kind to the initial request',()=>{
  const original={query:'needle',sourceId:'catalog',page:{kind:'track',items:[
    {ref:{kind:'track',id:'once',providerId:'private',connectionId:'account',data:{token:'x'}},title:'private title',metadata:{artists:['guest'],file:'private'},secret:true},
  ],nextCursor:'secret cursor'}}
  const safe=searchInput('search.results',original)
  assert.deepEqual(safe.page,{kind:'track',items:[{ref:{kind:'track',id:'once',providerId:'private'},title:'private title',metadata:{artists:['guest']}}]})
  for(const changed of [{...safe,sourceId:'other'},{...safe,query:'other'},
    {...safe,page:{kind:'playlist',items:[]}},
    {...safe,page:{kind:'track',items:[{title:'forged',ref:{kind:'track',providerId:'private',id:'other-request'}}]}}]) {
    assert.throws(()=>searchInput('search.results',changed,safe))
  }
})
test('suggestions accept empty and reordered lists but reject extra data, excessive payloads and changes to the query', () => {
  const input = {query:'night',items:['one','two']}
  for (const items of [[], ['two','one']]) assert.deepEqual(searchInput('search.suggest',{...input,items},input),{...input,items})
  for (const bad of [{...input,history:['private']},{...input,query:'other'}, {...input,items:[' '.repeat(2)]},
    {...input,items:['x'.repeat(513)]},{...input,items:Array(101).fill('x')},{...input,items:[{name:'track'}]}]) {
    assert.throws(()=>searchInput('search.suggest',bad,input))
  }
})
test('search rewrites compose in plugin order without exposing revoked queries or redirecting the source', async () => {
  const warnings = [], seen = [], defaults = []
  const bus = new OperationEngine(SEARCH_OPERATIONS,searchInput,()=>{},id=>warnings.push(id))
  const input = {query:'original',sourceId:'local',kinds:['track','playlist']}
  const connect = (id,granted,invoke) => {
    const owner = bus.connect(id,granted,invoke)
    owner.register('search.query','normal'); owner.attach()
    return owner
  }
  let granted = true
  const first = connect('first',()=>granted,async (_,token,value)=>{
    seen.push(value.query); await first.next(token,{...value,query:'normalized'}); return {}
  })
  connect('redirect',()=>true,async (_,token,value)=>({input:{...value,sourceId:'other'}}))
  connect('second',()=>true,async (_,token,value)=>{
    seen.push(value.query); return {input:{...value,query:value.query+' live'}}
  })
  const run = () => bus.run('search.query',input,{kind:'ui'},value=>defaults.push(value))
  assert.deepEqual((await run()).handledBy,['first','second'])
  assert.deepEqual(seen,['original','normalized'])
  assert.deepEqual(defaults,[{...input,query:'normalized live'}])
  assert.deepEqual(warnings,['redirect'])
  granted = false; seen.length = 0
  await run(); assert.deepEqual(seen,['original'])
  assert.deepEqual(defaults.at(-1),{...input,query:'original live'})
  bus.setPaused(true); seen.length = 0
  await run(); assert.deepEqual(seen,[]); assert.deepEqual(defaults.at(-1),input)
})
const name = 'queue.add',
  source = { kind: 'ui' },
  item = {
    ref: { id: '42', kind: 'track', providerId: 'wy', data: { token: 'secret' } },
    title: 'Test',
    metadata: { artists: [], cookie: 'secret' },
  }
const input = { tracks: [item], position: 'end' },
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function setup(bus, id, fn, granted = () => true, priority = 'normal') {
  const owner = bus.connect(id, granted, fn)
  owner.register(name, priority)
  owner.attach()
  return owner
}
test('fast path ignores stale owners, hook order and mutable snapshots cannot leak private track data', async () => {
  const bus = new OperationBus(),
    seen = []
  let grant = true
  const late = setup(
    bus,
    'late',
    async (_, token, value) => {
      seen.push(value.position)
      return {}
    },
    () => grant,
    'late',
  )
  setup(
    bus,
    'early',
    async (_, token, value) => {
      assert.deepEqual(value.tracks[0], {
        ref: { kind: 'track', id: '42', providerId: 'wy' },
        title: 'Test',
        metadata: { artists: [] },
      })
      value.position = 'next'
      return { input: value }
    },
    () => true,
    'early',
  )
  assert.deepEqual(bus.names(), [name])
  const result = await bus.run(name, input, source, async (value) => seen.push(value.position))
  assert.deepEqual(result, { prevented: false, handledBy: ['early'] })
  assert.deepEqual(seen, ['next', 'next'])
  assert.equal(input.position, 'end')
  grant = false
  late.dispose()
  bus.setPaused(true)
  assert.deepEqual(bus.names(), [])
  await bus.run(name, input, source, async (value) => assert.equal(value.position, 'end'))
})
test('invalid or late rewrites fail open and three recent failures suspend one hook', async () => {
  const warnings = [],
    bus = new OperationBus(
      () => {},
      (...args) => warnings.push(args),
      20,
    )
  let late,
    defaults = 0
  const owner = setup(bus, 'slow', async (_, token) => {
    late = token
    await delay(70)
    return { prevented: true }
  })
  for (let i = 0; i < 3; i++)
    await bus.run(name, input, source, async () => {
      defaults++
    })
  assert.equal(defaults, 3)
  assert.deepEqual(bus.names(), [])
  assert.equal(warnings.at(-1)[2], true)
  assert.throws(() => owner.next(late, input), /Inactive/)
  owner.register(name, null)
  owner.register(name, 'late')
  assert.deepEqual(bus.names(), [name])
  assert.throws(() => playbackInput('player.play', {}))
  assert.throws(() => playbackInput(name, { tracks: [], position: 'end' }))
})
test('next is owner-bound and exactly once, downstream failures propagate even if caught by hook', async () => {
  const bus = new OperationBus()
  let defaults = 0,
    other
  const first = setup(bus, 'first', async (_, token, value) => {
    assert.throws(() => other.next(token, value), /Inactive/)
    const inner = first.next(token, value)
    assert.throws(() => first.next(token, value), /no longer/)
    await inner.catch(() => {})
    return { prevented: true }
  })
  other = setup(bus, 'other', async () => ({}))
  await assert.rejects(
    bus.run(name, input, source, async () => {
      defaults++
      throw Error('default failure')
    }),
    /default failure/,
  )
  assert.equal(defaults, 1)
})
for (const [name, key, original, rewritten, invalid] of [
  ['player.seek', 'positionMs', 2000, 9000, [0.5, -1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '20']],
  ['player.setVolume', 'volume', 0.8, 0.25, [-1, 1.01, NaN, Infinity, '0.2']],
]) {
  test(name + ' validates numbers, does not cancel, and applies downstream rewrites once', async () => {
    const defaults = [], reports = [], bus = new OperationBus(undefined, undefined, undefined, undefined, (...row) => reports.push(row))
    for (const value of invalid) assert.throws(() => playbackInput(name, { [key]: value }))
    for (const input of [{}, { [key]: original, secret: 1 }, [], null]) assert.throws(() => playbackInput(name, input))
    const ignore = bus.connect('early', () => true, async () => ({ prevented: true }))
    const rewrite = bus.connect('late', () => true, async () => ({ input: { [key]: rewritten } }))
    for (const [owner, priority] of [[ignore, 'early'], [rewrite, 'late']]) { owner.register(name, priority); owner.attach() }
    const result = await bus.run(name, { [key]: original }, {kind: 'system'}, async value => { defaults.push(value) })
    assert.deepEqual(defaults, [{ [key]: rewritten }])
    assert.deepEqual(result, { prevented: false, handledBy: ['late'] })
    assert.deepEqual(reports.map(row => row[2]), ['rewrite'])
    ignore.dispose(); rewrite.dispose()
  })
}
test('clear may narrow to selected tracks; remove cannot widen to the entire queue', () => {
  assert.deepEqual(playbackInput('queue.clear', {}), {})
  for (const name of ['queue.clear','queue.remove']) {
    assert.deepEqual(playbackInput(name,{tracks:[]}),{tracks:[]})
    assert.ok(!JSON.stringify(playbackInput(name,{tracks:[item]})).includes('secret'))
    for (const invalid of [null, [], {all:true}, {tracks:null}, {tracks:[{}]}, {tracks:Array(1001).fill(item)}]) assert.throws(() => playbackInput(name,invalid))
  }
  assert.throws(() => playbackInput('queue.remove',{}))
})
test('shuffle accepts only permutations including repeated entries and cannot cancel playback',async()=>{
  const other = {...item,ref:{...item.ref,providerId:'private',id:'one-shot'}}, input = {items:[item,item,other]}
  const canonical = playbackInput('queue.shuffle',input), items = canonical.items
  for (const invalid of [null,{}, {items:[null]}, {items:Array(1001).fill(item)}, {items:[],extra:true}]) assert.throws(()=>playbackInput('queue.shuffle',invalid))
  for (const [reply,expected] of [[{input:{items:[items[2],items[0],items[1]]}},[items[2],items[0],items[1]]],[{prevented:true},items],
    [{input:{items:items.slice(0,2)}},items],[{input:{items:[items[0],items[2],items[2]]}},items],
    [{input:{items:[items[0],items[1],{...items[2],title:'forged'}]}},items]]) {
    const bus=new OperationBus(),owner=bus.connect('order',()=>true,async()=>reply),calls=[]
    owner.register('queue.shuffle','normal');owner.attach()
    const result=await bus.run('queue.shuffle',input,{kind:'system'},async value=>calls.push(value.items))
    assert.equal(result.prevented,false);assert.deepEqual(calls,[expected]);assert.doesNotMatch(JSON.stringify(calls),/secret/)
    owner.dispose()
  }
})
test('queue end cancels, continues with public tracks or falls back to the original default',async()=>{
  const song = {ref:{kind:'track',providerId:'demo',id:'next'},title:'Next',metadata:{artists:[]}}
  const continuation={tracks:[song]}
  const invalid = [{tracks:[]},{tracks:Array(1001).fill(song)},{tracks:[null]},{url:'file://hidden'}, ...[{providerId:'local'},{providerId:'private'},{id:'file:///private'},{connectionId:'hidden'},{scope:'plugin'}].map(ref=>({tracks:[{...song,ref:{...song.ref,...ref}}]}))]
  for (const input of invalid) assert.throws(()=>playbackInput('player.queueEnded',input))
  for (const [granted,reply,expected] of [[true,{prevented:true},[]],[true,{input:continuation},[continuation]],[true,{input:invalid[0]},[{}]],[false,{input:continuation},[{}]]]) {
    const bus=new OperationBus(),owner=bus.connect('extend',()=>granted,async()=>reply),calls=[]
    owner.register('player.queueEnded','normal');owner.attach()
    const outcome=await bus.run('player.queueEnded',{},{kind:'system',location:'playback'},async value=>calls.push(value))
    assert.deepEqual(calls,expected);assert.equal(outcome.prevented,expected.length===0);owner.dispose()
  }
})
test('playback mode is a single public enum, not a general player state patch', () => {
  for (const mode of ['sequence','random','single']) assert.deepEqual(playbackInput('player.setMode',{mode}),{mode})
  for (const invalid of [null, [], {}, {mode:1}, {mode:'off'}, {mode:'random',muted:true}]) assert.throws(() => playbackInput('player.setMode',invalid), /Invalid playback mode/)
})
test('playback failures can cancel an advance but cannot replace the failing track or disclose the raw error', async () => {
  const input = {track:item,error:'media'}, expected = playbackInput('player.error',input)
  assert.ok(!JSON.stringify(expected).includes('secret'))
  for (const value of [null,{...input,error:'file:///secret'},{...input,stack:'secret'}]) assert.throws(() => playbackInput('player.error',value))
  let granted = true, reply = {prevented:true}
  const bus = new OperationBus(), defaults = [], owner = bus.connect('guard', () => granted, async () => reply)
  owner.register('player.error','normal'); owner.attach()
  const run = () => bus.run('player.error',input,{kind:'system'},async value => {defaults.push(value)})
  assert.equal((await run()).prevented,true)
  assert.deepEqual(defaults,[])
  reply = {input:{...expected,error:'start'}}
  await run()
  reply = {input:{...expected,track:{...expected.track,title:'forged'}}}
  await run()
  granted = false
  reply = {prevented:true}
  assert.equal((await run()).prevented,false)
  assert.deepEqual(defaults,[expected,expected,expected])
  owner.dispose()
})
test('next preserves host reason when selecting a track and rejects a forged reason', async () => {
  const warnings = [], bus = new OperationBus(() => {}, (...warning) => warnings.push(warning))
  assert.throws(() => playbackInput('player.next', { reason: 'plugin' }), /Invalid next/)
  let reply = { track: item }
  const owner = bus.connect('selector', () => true, async () => ({input:reply}))
  owner.register('player.next','normal')
  owner.attach()
  const values = []
  const select = async input => { values.push(input) }
  await bus.run('player.next', {reason:'ended'}, {kind:'system'}, select)
  assert.equal(values[0].reason, 'ended')
  assert.equal(values[0].track.title, item.title)
  assert.ok(!JSON.stringify(values[0]).includes('secret'))
  reply = {reason:'user', track:item}
  await bus.run('player.next', {reason:'error'}, {kind:'system'}, select)
  assert.deepEqual(values[1], {reason:'error'})
  assert.equal(warnings.length, 1)
  owner.dispose()
})
for (const operation of ['player.pause', 'player.resume', 'player.previous']) {
  test(operation + ' accepts only empty input and resumes its default exactly once', async () => {
    const bus = new OperationBus()
    for (const invalid of [undefined, null, [], '', { track: item }]) {
      assert.throws(() => playbackInput(operation, invalid), /empty playback input/)
    }
    let executions = 0
    const owner = bus.connect('control', () => true, async (name, token, input, source) => {
      assert.equal(name, operation)
      assert.deepEqual(input, {})
      assert.deepEqual(source, { kind: 'system' })
      await owner.next(token, {})
      assert.throws(() => owner.next(token, {}), /no longer/)
      return { prevented: true }
    })
    owner.register(operation, 'normal')
    owner.attach()
    const result = await bus.run(operation, {}, { kind: 'system' }, async () => { executions++ })
    assert.equal(result.prevented, false)
    assert.equal(executions, 1)
    owner.dispose()
  })
}
test('waiting for the actual player inside next does not penalize a healthy hook', async () => {
  const warnings = [],
    bus = new OperationBus(
      () => {},
      (...args) => warnings.push(args),
      25,
    )
  const owner = setup(bus, 'wrap', async (_, token, value) => {
    await owner.next(token, value)
    return {}
  })
  for (let attempt = 0; attempt < 3; attempt++)
    await bus.run(name, input, source, async () => delay(60))
  assert.deepEqual(warnings, [])
  assert.deepEqual(bus.names(), [name])
  owner.dispose()
})
test('nested plugin requests skip own hook; cancellation, revoke-in-flight and stop fail safely', async () => {
  const bus = new OperationBus()
  let granted = true,
    defaults = 0,
    nested = 0
  const execute = async () => {
    defaults++
  }
  const owner = setup(
    bus,
    'owner',
    async () => {
      nested++
      await bus.run(name, input, { kind: 'plugin', pluginId: 'owner', runtime: 3 }, execute)
      return { prevented: true }
    },
    () => granted,
  )
  assert.equal((await bus.run(name, input, source, execute)).prevented, true)
  assert.equal(defaults, 1)
  assert.equal(nested, 1)
  owner.dispose()
  const stale = setup(
    bus,
    'old',
    async () => {
      granted = false
      return { prevented: true }
    },
    () => granted,
  )
  await bus.run(name, input, source, execute)
  assert.equal(defaults, 2)
  stale.dispose()
  assert.deepEqual(bus.names(), [])
})
