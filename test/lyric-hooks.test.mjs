import assert from 'node:assert/strict'
import test from 'node:test'
import { OperationEngine, LYRIC_OPERATIONS, lyricInput, lyricResult } from '../packages/core/dist/operation-bus.js'

const track={ref:{kind:'track',providerId:'demo',id:'song'},title:'Song',metadata:{artists:['Artist']}}
const document={format:'crlyric',version:1,track:track.ref,offsetMs:0,lines:[{startTimeMs:0,text:'Original'}]}
const make=(warnings=[],timeout)=>new OperationEngine(LYRIC_OPERATIONS,lyricInput,()=>{},(...row)=>warnings.push(row),timeout,undefined,undefined,lyricResult)
const source={kind:'system',location:'lyrics'}
test('lyrics can fill missing results and wrap the default exactly once',async()=>{
  const bus=make();let count=0
  const owner=bus.connect('translator',()=>true,async(name,token)=>{
    const result=await owner.next(token,{track})
    assert.throws(()=>owner.next(token,{track}),/no longer/)
    return {result:result??document}
  })
  owner.register('lyrics.load','normal');owner.attach()
  const result=await bus.run('lyrics.load',{track},source,async()=>{count++;return null})
  assert.deepEqual(result.result,document);assert.deepEqual(result.handledBy,['translator']);assert.equal(count,1)
  owner.dispose()
})
test('lyrics preserves downstream results on malformed overrides, throws and revocation',async()=>{
  const warnings=[],bus=make(warnings);let granted=true,mode='invalid',count=0
  const owner=bus.connect('translator',()=>granted,async(name,token)=>{
    const result=await owner.next(token,{track})
    if(mode==='throw')throw Error('bad translator')
    if(mode==='revoke')granted=false
    return {result:{...result,track:{...track.ref,id:'another-song'}}}
  })
  owner.register('lyrics.load','normal');owner.attach()
  for(mode of ['invalid','throw','revoke']) {
    const result=await bus.run('lyrics.load',{track},source,async()=>{count++;return document})
    assert.deepEqual(result.result,document)
  }
  assert.equal(count,3);assert.equal(warnings.length,2);owner.dispose()
})
test('transform strips private extras, validates timings and cannot cancel lyrics',async()=>{
  const bus=make();let reply={prevented:true}
  const owner=bus.connect('translator',()=>true,async()=>reply)
  owner.register('lyrics.transform','normal');owner.attach()
  const input={track,lyric:document}
  assert.deepEqual((await bus.run('lyrics.transform',input,source,async value=>value.lyric)).result,document)
  const enriched={...document,secret:'hidden',lines:[{...document.lines[0],translation:'译文',secret:'hidden'}]}
  reply={result:enriched}
  const result=await bus.run('lyrics.transform',input,source,async value=>value.lyric)
  assert.equal(result.result.lines[0].translation,'译文');assert.ok(!JSON.stringify(result.result).includes('hidden'))
  for(const invalid of [{...document,lines:[{startTimeMs:-1,text:'bad'}]},{...document,track:{...track.ref,data:{secret:true}}},{...document,plainText:'文'.repeat(400000)}])assert.throws(()=>lyricResult('lyrics.transform',invalid,{track}))
  assert.throws(()=>lyricInput('lyrics.load',{track:{...track,title:'forged'}},{track}))
  owner.dispose()
})
test('slow lyric hook falls back and does not penalize time spent in the provider',async()=>{
  const warnings=[],bus=make(warnings,20);let slow=false
  const owner=bus.connect('translator',()=>true,async(name,token)=>{
    if(slow) await new Promise(resolve=>setTimeout(resolve,60))
    const result=await owner.next(token,{track})
    return {result}
  })
  owner.register('lyrics.load','normal');owner.attach()
  assert.deepEqual((await bus.run('lyrics.load',{track},source,async()=>{await new Promise(resolve=>setTimeout(resolve,50));return document})).result,document)
  assert.deepEqual(warnings,[])
  slow=true
  assert.deepEqual((await bus.run('lyrics.load',{track},source,async()=>document)).result,document)
  assert.equal(warnings.length,1);owner.dispose()
})
