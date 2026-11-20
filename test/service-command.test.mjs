import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { scaffoldProject } from '../packages/cli/dist/project.js'

test('author CLI runs mock service actions with declared grants and version matching', async () => {
  const project = await mkdtemp(join(process.cwd(), '.test-tmp-'))
  const run = () => promisify(execFile)(process.execPath, [resolve('packages/cli/dist/bin.js'), 'test-services', '--project', project], {windowsHide:true})
  const save = (name, value) => writeFile(join(project, name), JSON.stringify(value))
  try {
    await scaffoldProject(project, {template:'playback-hook', language:'js'})
    const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
    config.manifest.provides = {actions:[{id:'check', title:'Check dependency'}]}
    config.manifest.uses = {permissions:[{name:'services.consume', key:'consume', reason:'Test dependency'}],
      plugins:[{pluginId:'test.supplier',service:'echo',version:'^1.0'}, {pluginId:'test.optional',service:'echo',version:'^1.0',optional:true}]}
    await save('ceru.plugin.json', config)
    await writeFile(join(project, 'src/index.js'), `export default ctx => {ctx.actions.register('check', async input => {
      const api=await ctx.plugins.use(input.provider,'echo');return api ? api.reply({text:'input'}) : null
    })}`)
    const mock = {pluginId:'test.supplier',service:'echo',version:'1.2.0',returns:{reply:{text:'fixture'}}}
    await save('ceru.config.json', {mockServices:[mock]})
    const found = {action:'check',granted:true,input:{provider:'test.supplier'},expect:{text:'fixture'}}
    await save('tests/services.json', [found,{...found,input:{provider:'test.optional'},expect:null},
      {action:'check',granted:false,input:found.input,error:'Permission denied: services.consume'}])
    assert.match((await run()).stdout, /3 service scenarios passed/)
    await save('tests/services.json', [{...found, expect:'unexpected'}])
    await assert.rejects(run(), /Service scenario .* failed/)
    await save('ceru.config.json', {mockServices:[{...mock,version:'2.0.0'}]})
    await assert.rejects(run(), /Missing plugin dependency: test.supplier \/ echo \^1.0/)
  } finally { await rm(project,{recursive:true,force:true,maxRetries:3}) }
})
