import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, mkdir, cp, readFile, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {scaffoldProject, buildProject} from '../packages/cli/dist/project.js'
import {readArtifact} from '../packages/issuer/dist/index.js'
import {NodePluginSandbox} from '../packages/core/dist/node.js'
import {OperationBus} from '../packages/core/dist/operation-bus.js'

for (const language of ['js', 'ts']) test(`generated ${language} worker receives immutable operation events with live permissions`, async () => {
  const project = await mkdtemp(join(process.cwd(), '.test-tmp-events-'))
  await scaffoldProject(project, {template:'source', language})
  const manifestFile = join(project, 'ceru.plugin.json')
  const config = JSON.parse(await readFile(manifestFile, 'utf8')), manifest = config.manifest
  manifest.uses = {permissions:[{key:'observe',name:'player.read',reason:'Observe playback'},{key:'cancel',name:'player.intercept',reason:'Cancel pause'}]}
  manifest.provides = {actions:[{id:'events',title:'Events'},{id:'stop',title:'Stop'}]}
  delete manifest.ui
  manifest.entry.logic.activation = ['onCommand:events','onCommand:stop']
  await writeFile(manifestFile, JSON.stringify(config))
  const sdk = join(project,'node_modules/@shiqianjiang/ceru-plugin-sdk')
  await mkdir(sdk, {recursive:true})
  await cp(resolve('packages/sdk/dist'),join(sdk,'dist'),{recursive:true})
  await cp(resolve('packages/sdk/package.json'),join(sdk,'package.json'))
  await writeFile(join(project,`src/index.${language}`), `
    export default function activate(ctx${language==='ts'?': import("@shiqianjiang/ceru-plugin-sdk").PluginContext':''}) {
      const seen${language==='ts'?': unknown[]':''}=[];
      const stop=ctx.events.on('player.pause',e=>{if(!Object.isFrozen(e.input)||!Object.isFrozen(e.source))throw Error('Mutable before event');seen.push('before');e.preventDefault()});
      ctx.events.on('player.pause:done',e=>{seen.push(e);if(!Object.isFrozen(e.handledBy))throw Error('Mutable done event')});
      ctx.actions.register('events',()=>JSON.parse(JSON.stringify(seen)));
      ctx.actions.register('stop',()=>{stop();return null});
    }
  `)
  const artifact=readArtifact(await readFile((await buildProject(project)).path))
  const bus=new OperationBus(); let granted=true
  const worker=new NodePluginSandbox(async(method,data)=>{
    assert.equal(method,'events.register')
    const done=data.name.endsWith(':done')
    owner.registerEvent(done?data.name.slice(0,-5):data.name,done,data.active)
    return null
  },()=>{})
  const owner=bus.connect(manifest.id,()=>true,async()=>({}),{
    granted:()=>granted,
    invoke:(name,done,payload,signal)=>worker.invoke('operation-event',name+(done?':done':''),'',[payload],signal),
  })
  try {
    await worker.start(artifact);owner.attach()
    let defaults=0
    const run=()=>bus.run('player.pause',{}, {kind:'ui'},async()=>{defaults++})
    assert.equal((await run()).prevented,true);assert.equal(defaults,0)
    let seen=await worker.invoke('action','events','',[])
    assert.equal(seen[0],'before');assert.equal(seen[1].prevented,true)
    assert.deepEqual(seen[1].handledBy,[manifest.id])
    bus.setPaused(true);await run();assert.equal(defaults,1)
    seen=await worker.invoke('action','events','',[])
    assert.equal(seen.length,3);assert.equal(seen[2].prevented,false)
    granted=false;await run();assert.equal(defaults,2)
    assert.equal((await worker.invoke('action','events','',[])).length,3)
    granted=true;bus.setPaused(false)
    await worker.invoke('action','stop','',[])
    await run();assert.equal(defaults,3)
  } finally {owner.dispose();worker.dispose()}
})
