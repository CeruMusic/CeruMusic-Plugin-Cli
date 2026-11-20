import assert from 'node:assert/strict'
import test from 'node:test'
import {OperationBus} from '../packages/core/dist/operation-bus.js'

test('operation events precede hooks, report final input and cancellation, and observe in safe mode', async () => {
  const bus = new OperationBus(), log = []
  let granted = true, cancel = false
  const observer = bus.connect('observer', () => true, async () => ({}), {
    granted: () => granted,
    invoke: async (name, done, payload) => { log.push([done ? 'done' : 'before', payload]); return {prevented: cancel} },
  })
  observer.registerEvent('player.setMode', false, true)
  observer.registerEvent('player.setMode', true, true)
  observer.attach()
  const hook = bus.connect('rewrite', () => true, async (_name, _token, input) => {
    log.push(['hook']); return {input: {...input, mode: 'random'}}
  })
  hook.register('player.setMode', 'normal'); hook.attach()
  const run = () => bus.run('player.setMode', {mode:'sequence'}, {kind:'ui'}, async input => log.push(['default', input]))
  await run()
  assert.deepEqual(log.map(row=>row[0]), ['before','hook','default','done'])
  assert.deepEqual(log.at(-1)[1], {input:{mode:'random'}, source:{kind:'ui'}, result:null, prevented:false, handledBy:['rewrite'], failed:false})
  log.length = 0; cancel = true
  assert.equal((await run()).prevented, true)
  assert.deepEqual(log.map(row=>row[0]), ['before','done'])
  assert.deepEqual(log.at(-1)[1].handledBy, ['observer'])
  log.length = 0; bus.setPaused(true)
  assert.deepEqual(bus.names(), ['player.setMode'])
  await run()
  assert.deepEqual(log.map(row=>row[0]), ['default','done'])
  granted = false; log.length = 0
  assert.deepEqual(bus.names(), [])
  await run(); assert.deepEqual(log.map(row=>row[0]), ['default'])
  observer.dispose(); hook.dispose()
})

test('event timeouts fail open, late cancellations are ignored, and failed defaults still emit done', async () => {
  const bus = new OperationBus(undefined, undefined, 10), log = []
  const observer = bus.connect('observer', () => true, async () => ({}), {
    granted: () => true,
    invoke: async (_name, done, payload) => {
      if (!done) { await new Promise(resolve=>setTimeout(resolve, 40)); return {prevented:true} }
      log.push(payload); return {}
    },
  })
  observer.registerEvent('player.pause', false, true); observer.registerEvent('player.pause', true, true); observer.attach()
  let count = 0
  await bus.run('player.pause', {}, {kind:'system'}, async () => { count++ })
  assert.equal(count, 1); assert.equal(log[0].prevented, false)
  await assert.rejects(bus.run('player.pause', {}, {kind:'system'}, async()=>{throw Error('host failure')}), /host failure/)
  assert.equal(log.at(-1).failed, true)
  assert.throws(()=>observer.registerEvent('player.seek', false, true), /Invalid operation event/)
  observer.dispose()
})

test('revocation discards in-flight cancellation, failed listeners pause and resume, and unload removes observation', async () => {
  const bus=new OperationBus(), warnings=[]
  let granted=true, defaults=0, invocations=0, behavior='revoke'
  const owner=bus.connect('observer',()=>true,async()=>({}),{
    granted:()=>granted,
    invoke:async()=>{
      invocations++
      if(behavior==='revoke'){granted=false;return {prevented:true}}
      throw Error('listener failed')
    },
  })
  owner.registerEvent('player.pause',false,true);owner.attach()
  const run=()=>bus.run('player.pause',{}, {kind:'ui'},async()=>{defaults++})
  assert.equal((await run()).prevented,false);assert.equal(defaults,1)
  granted=true;behavior='fail'
  for(let i=0;i<4;i++)await run()
  assert.equal(invocations,4)
  assert.deepEqual(bus.names(),[])
  bus.resume('observer','player.pause');await run();assert.equal(invocations,5)
  owner.dispose();await run();assert.equal(invocations,5)
  assert.equal(defaults,7)
})
