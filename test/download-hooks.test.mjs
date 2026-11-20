import assert from 'node:assert/strict'
import test from 'node:test'
import { DOWNLOAD_OPERATIONS, downloadInput, OperationEngine } from '../packages/core/dist/operation-bus.js'
const tracks=['one','two'].map(id=>({ref:{kind:'track',providerId:'demo',id},title:id,metadata:{artists:['QA']}}))
const input={tracks,quality:'128k',directory:'01234567-89ab-cdef-0123-456789abcdef'}
test('download selection can filter and reorder but cannot add tracks, paths or directory access',async()=>{
  const bus=new OperationEngine(DOWNLOAD_OPERATIONS,downloadInput)
  let reply={input:{...input,quality:'flac',tracks:tracks.slice(1)}}
  const owner=bus.connect('filter',()=>true,async()=>reply);owner.register('download.create','normal');owner.attach()
  const calls=[];const run=()=>bus.run('download.create',input,{kind:'ui'},async value=>{calls.push(value)})
  await run();assert.deepEqual(calls[0],reply.input)
  reply={prevented:true};assert.equal((await run()).prevented,true);assert.equal(calls.length,1)
  for(const override of [{directory:'C:\\private'}, {directory:undefined}, {tracks:[tracks[0],tracks[0]]},{tracks:[{...tracks[0],ref:{...tracks[0].ref,id:'another'}}]},{quality:'../lossless'}])assert.throws(()=>downloadInput('download.create',{...input,...override},input))
  owner.dispose()
})
test('download filename is a basename of the original format, and cancellation cannot skip it',async()=>{
  const original={track:tracks[0],name:'Original.mp3'}
  const bus=new OperationEngine(DOWNLOAD_OPERATIONS,downloadInput)
  let reply={input:{...original,name:'Renamed.mp3'}},granted=true
  const owner=bus.connect('namer',()=>granted,async()=>reply);owner.register('download.filename','normal');owner.attach()
  let output;const run=()=>bus.run('download.filename',original,{kind:'ui'},async value=>{output=value.name})
  await run();assert.equal(output,'Renamed.mp3')
  granted=false;await run();assert.equal(output,'Original.mp3')
  granted=true;reply={prevented:true};await run();assert.equal(output,'Original.mp3')
  for(const name of ['../other.mp3','C:\\other.mp3','CON.mp3','LPT1.mp3','trailing.mp3.','name.mp3 ','x.exe','a\u0000.mp3'])assert.throws(()=>downloadInput('download.filename',{...original,name},original))
  owner.dispose()
})
