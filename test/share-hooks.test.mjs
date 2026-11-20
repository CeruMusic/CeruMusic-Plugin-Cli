import assert from 'node:assert/strict'
import test from 'node:test'
import {OperationEngine, SHARING_OPERATIONS, shareInput, shareResult} from '../packages/core/dist/operation-bus.js'

const input={track:{ref:{kind:'track',providerId:'demo',id:'one'},title:'One',metadata:{artists:[]}}}
const original={id:'original',url:'https://example.test/share/original'}
const replacement={id:'replacement',url:'https://example.test/share/replacement',template:'Share replacement'}

test('sharing can cancel, replace a link, wrap the default and fall back after invalid output or revocation',async()=>{
  const bus=new OperationEngine(SHARING_OPERATIONS,shareInput,undefined,undefined,undefined,undefined,undefined,shareResult)
  let reply={prevented:true},granted=true,calls=0
  const owner=bus.connect('test.share',()=>granted,async(name,token,value)=>{
    if(reply==='wrap'){const result=await owner.next(token,value);return {result:{...result,template:'Wrapped'}}}
    return reply
  })
  owner.register('share.create','normal');owner.attach()
  const run=()=>bus.run('share.create',input,{kind:'ui'},async()=>{calls++;return original})
  assert.equal((await run()).prevented,true);assert.equal(calls,0)
  reply={result:replacement};assert.deepEqual((await run()).result,replacement);assert.equal(calls,0)
  reply='wrap';assert.equal((await run()).result.template,'Wrapped');assert.equal(calls,1)
  reply={result:{...replacement,url:'javascript:alert(1)'}};assert.deepEqual((await run()).result,original)
  granted=false;reply={result:replacement};assert.deepEqual((await run()).result,original)
  owner.dispose()
})

test('sharing never substitutes another private handle or accepts file links and embedded credentials',()=>{
  const privateInput={track:{...input.track,ref:{...input.track.ref,providerId:'private',id:'temporary'}}}
  assert.deepEqual(shareInput('share.create',privateInput,privateInput),privateInput)
  assert.throws(()=>shareInput('share.create',{track:{...input.track,ref:{...privateInput.track.ref,id:'other'}}},privateInput))
  for(const url of ['file:///C:/private/file','https://name:password@example.test/share','data:text/html,hello','javascript:alert(1)'])assert.throws(()=>shareResult('share.create',{...original,url}))
  assert.throws(()=>shareInput('share.create',{...input,path:'C:/private'}))
})
