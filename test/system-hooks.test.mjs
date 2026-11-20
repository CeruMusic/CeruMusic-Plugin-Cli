import assert from 'node:assert/strict'
import test from 'node:test'
import {publicLink} from '../packages/sdk/dist/index.js'
import {OperationEngine,SYSTEM_OPERATIONS,systemInput} from '../packages/core/dist/operation-bus.js'

test('link hooks never accept credentials, authorization callbacks, installation or entire clipboard text',()=>{
  for(const url of ['https://user:secret@example.test/','cerumusic://oauth/callback?code=secret','cerumusic://plugin/add/link?url=https://example.test/a.js','https://example.test/?access_token=secret','https://example.test/?password=secret','https://example.test/#secret','hello https://example.test/','https://example.test/a\nhttps://example.test/b','file:///C:/private','javascript:alert(1)']) {
    assert.equal(publicLink(url),null,url)
    assert.throws(()=>systemInput('link.open',{url,from:'paste'}))
  }
  const input={url:'https://example.test/playlist?id=1',from:'paste'}
  assert.deepEqual(systemInput('link.open',input),input)
  assert.equal(publicLink('ceru://share/example'),'cerumusic://share/example')
  assert.throws(()=>systemInput('link.open',{...input,from:'drop'},input))
  assert.throws(()=>systemInput('link.open',{...input,clipboard:'secret'}))
})

test('system hooks cancel, rewrite and wrap once; revoked permission and invalid links fall back',async()=>{
  const bus=new OperationEngine(SYSTEM_OPERATIONS,systemInput)
  let mode='cancel',granted=true,calls=[]
  const owner=bus.connect('test.system',()=>granted,async(name,token,input)=>{
    if(mode==='cancel')return {prevented:true}
    const next={...input,...(name==='link.open'?{url:mode==='bad'?'file:///C:/private':'https://example.test/replaced'}:{body:'Rewritten'})}
    if(mode==='wrap'){await owner.next(token,next);return {}}
    return {input:next}
  })
  owner.register('link.open','normal');owner.register('notification.show','normal');owner.attach()
  const input={url:'https://example.test/playlist?id=1',from:'paste'}
  const run=()=>bus.run('link.open',input,{kind:'ui'},async value=>{calls.push(value)})
  assert.equal((await run()).prevented,true);assert.equal(calls.length,0)
  mode='wrap';await run();assert.equal(calls.length,1);assert.equal(calls[0].url,'https://example.test/replaced')
  mode='bad';await run();assert.deepEqual(calls.at(-1),input)
  granted=false;await run();assert.deepEqual(calls.at(-1),input)
  granted=true;mode='rewrite';await bus.run('notification.show',{title:'Title',body:'Body',level:'info'},{kind:'system'},async value=>{calls.push(value)})
  assert.equal(calls.at(-1).body,'Rewritten')
  owner.dispose()
})
