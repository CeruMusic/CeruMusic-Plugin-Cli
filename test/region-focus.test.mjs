import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

test('host focus pauses region frames and resumes from the current playback snapshot', async t => {
  const built = await build({entryPoints:['packages/core/runtime/component-region.ts'],bundle:true,format:'esm',write:false,platform:'browser'})
  const {connectRegion,isRegionActive} = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
  const frames = new Map()
  let sequence=0, disconnects=0
  const parent={postMessage(){}}
  const frame=Object.assign(new EventTarget(),{parent,setTimeout,clearTimeout})
  const doc=Object.assign(new EventTarget(),{hidden:false,documentElement:{clientWidth:800,clientHeight:600,getBoundingClientRect(){return {}}}})
  const original=Object.fromEntries(['window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,globalThis[key]]))
  Object.assign(globalThis,{
    window:frame,document:doc,
    ResizeObserver:class {observe(){} disconnect(){disconnects++}},
    requestAnimationFrame:callback=>{frames.set(++sequence,callback);return sequence},
    cancelAnimationFrame:id=>frames.delete(id)
  })
  t.after(()=>{for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}})
  const connection=connectRegion('player.lyrics','focus-test',{positionMs:100,playing:true,active:false,content:{durationMs:30000}},Object.freeze)
  const calls=[]
  assert.equal(isRegionActive(connection.region),false)
  connection.region.onFrame(time=>calls.push(time))
  assert.equal(frames.size,0)
  const message=(type,data,generation='focus-test')=>frame.dispatchEvent(Object.assign(new Event('message'),{source:parent,data:{type,generation,data}}))
  message('region-active',true,'wrong')
  assert.equal(frames.size,0)
  message('region-active',true)
  assert.equal(isRegionActive(connection.region),true)
  assert.equal(frames.size,1)
  const run=async()=>{const [id,callback]=[...frames][0];frames.delete(id);await callback(performance.now())}
  await run();assert.equal(calls.length,1)
  message('region-active',false)
  assert.equal(isRegionActive(connection.region),false)
  assert.equal(frames.size,0)
  message('region-update',{positionMs:5000,playing:true})
  assert.equal(frames.size,0)
  message('region-active',true);await run()
  assert.equal(calls.length,2)
  assert.ok(connection.region.props.currentTime.value>=5000)
  assert.ok(connection.region.props.currentTime.value<5100)
  doc.hidden=true
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(isRegionActive(connection.region),false)
  assert.equal(connection.region.props.playing.value,true,'Playback state must survive suspension')
  doc.hidden=false
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(isRegionActive(connection.region),true)
  connection.dispose()
  assert.equal(isRegionActive(connection.region),false)
  assert.equal(frames.size,0)
  assert.equal(disconnects,1)
})
