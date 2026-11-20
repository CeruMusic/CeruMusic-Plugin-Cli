import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { buildComponent } from '../packages/cli/dist/component.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test('a Vue SFC keeps its exported region transition hooks in the author factory', async () => {
  const root = await mkdtemp(join(process.cwd(), '.test-tmp-'))
  try {
    const entry = join(root, 'Motion.vue')
    await writeFile(entry, '<script>export const onEnter = () => "enter"; export const onLeave = () => "leave";</script><script setup>const title="motion"</script><template>{{title}}</template>')
    const text = await buildComponent(root,entry,'MotionView',{})
    const {default: factory} = await import('data:text/javascript;base64,' + Buffer.from('export default '+text).toString('base64'))
    const view = factory({vue:{},sdk:{},tdesign:{}})
    assert.equal(view.onEnter(), 'enter')
    assert.equal(view.onLeave(), 'leave')
  } finally { await rm(root,{recursive:true,force:true,maxRetries:3}) }
})

test('region transitions expire, cancel on disposal, and respect reduced motion', async context => {
  const output = await build({ entryPoints:['packages/core/runtime/region-transition.ts'], bundle:true,format:'esm',write:false })
  const {connectRegionTransition} = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'))
  const messages = [], signals = [], root = {}, parent = {postMessage:message => messages.push(message)}, frame = new EventTarget(), motion = new EventTarget()
  frame.parent = parent
  Object.assign(globalThis, {window:frame,document:{hidden:false},matchMedia:()=>motion})
  context.after(() => { delete globalThis.window; delete globalThis.document; delete globalThis.matchMedia })
  const dispose = connectRegionTransition(root,'session',{onLeave:({root:local,signal,reason}) => {
    assert.equal(local,root); assert.equal(reason,'track'); signals.push(signal); return new Promise(()=>{})
  }})
  const request = (id,generation='session') => frame.dispatchEvent(Object.assign(new Event('message'),{source:parent,data:{type:'region-transition',generation,data:{id,phase:'onLeave',reason:'track'}}}))
  context.mock.timers.enable({apis:['setTimeout']})
  request(0,'obsolete'); request(1)
  context.mock.timers.tick(599); assert.equal(signals[0].aborted,false)
  context.mock.timers.tick(1); await new Promise(resolve=>setImmediate(resolve))
  assert.equal(signals[0].aborted,true); assert.deepEqual(messages.map(message=>message.data.id),[1])
  motion.matches=true; request(2); await new Promise(resolve=>setImmediate(resolve)); assert.equal(signals.length,1)
  motion.matches=false; request(3); dispose(); request(4); await new Promise(resolve=>setImmediate(resolve))
  assert.equal(signals[1].aborted,true); assert.deepEqual(messages.map(message=>message.data.id),[1,2,3])
})
