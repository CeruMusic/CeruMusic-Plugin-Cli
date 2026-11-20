import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, readFile, writeFile, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { Writable } from 'node:stream'
import ts from 'typescript'
import {
  readArtifact,
  signArtifact,
  createTemplate,
  generateSigningKeys,
  PreparedIssuer,
  parseJsonStrict,
  encodeArtifact,
  DEFAULT_PERSONALIZATION_SCHEMA,
  resolveArtifactConfig,
} from '../packages/issuer/dist/index.js'
import { scaffoldProject, buildProject, TEMPLATES } from '../packages/cli/dist/index.js'

const workspace = fileURLToPath(new URL('../', import.meta.url))
const temp = await mkdtemp(join(workspace, '.test-tmp-'))
const cli = resolve(workspace, 'packages/cli/dist/bin.js')
const fixtures = new Map()
function parseEditorConfig(file, text) {
  // VS Code config files are JSONC; Prettier may preserve trailing commas.
  const result = ts.parseConfigFileTextToJson(file, text)
  assert.equal(result.error, undefined)
  return result.config
}
async function fixture(name, template = 'source', language = 'ts') {
  const root = join(temp, name)
  await scaffoldProject(root, { template, language })
  const sdk = join(root, 'node_modules/@shiqianjiang/ceru-plugin-sdk')
  await mkdir(sdk, { recursive: true })
  await cp(resolve(workspace, 'packages/sdk/dist'), join(sdk, 'dist'), { recursive: true })
  await cp(resolve(workspace, 'packages/sdk/package.json'), join(sdk, 'package.json'))
  await mkdir(join(root, 'node_modules/@types'), { recursive: true })
  await cp(
    resolve(workspace, 'node_modules/@types/lodash'),
    join(root, 'node_modules/@types/lodash'),
    { recursive: true },
  )
  return realpath(root)
}
for (const template of TEMPLATES) {
  for (const language of ['ts', 'js']) {
    test(language + ' scaffold builds one JS: ' + template, async () => {
      const root = await fixture(template + '-' + language, template, language)
      const built = await buildProject(root)
      const bytes = await readFile(built.path)
      const artifact = readArtifact(bytes)
      assert.equal(artifact.header.syntax, 'js')
      assert.equal(artifact.signatureStatus, 'unsigned')
      assert.ok(Object.keys(artifact.modules).length >= 1)
      assert.equal(built.path, join(root, 'dist/plugin.js'))
      assert.ok(!artifact.body.includes('sourceMappingURL'))
      assert.equal(artifact.header.manifest.engines.libraries, undefined)
      assert.equal(artifact.sourceFormat, 'exports-v2')
      assert.match(artifact.body, /exports\.(activate|surfaces|modules)/)
      if (template === 'player-skin') {
        assert.equal(artifact.header.manifest.entry.logic, undefined)
        assert.doesNotMatch(artifact.body, /exports\.activate/)
        assert.match(artifact.body, /exports\.surfaces = surfaces/)
        assert.ok(Object.values(artifact.modules).every(module => module.includes('__ceruDeps')))
      } else {
        assert.match(artifact.body, /async function [A-Za-z][A-Za-z0-9]*\(ctx\)/)
        assert.match(artifact.body, /const [A-Za-z][A-Za-z0-9]* = \/\* @ceru-self-contained \*\/ async function/)
      }
      assert.doesNotMatch(artifact.body, /exports\.activate = async function/)
      const publicExports = artifact.body.indexOf('// Public plugin exports')
      assert.ok(publicExports > 0)
      assert.ok(artifact.body.indexOf('exports.resources = resources') > publicExports)
      assert.doesNotMatch(artifact.body, /\nvar __ceru_entry =/)
      assert.ok(!artifact.body.includes('__ceruSharedRequire'))
      const editor = parseEditorConfig(
        'launch.json',
        await readFile(join(root, '.vscode/launch.json'), 'utf8'),
      )
      for (const entry of editor.configurations) {
        assert.equal(entry.request, 'launch')
        assert.equal(entry.type, 'node')
        assert.deepEqual(entry.args, ['dev'])
        assert.equal(entry.port, undefined)
      }
      assert.deepEqual(
        parseEditorConfig(
          'ceru-plugin.code-workspace',
          await readFile(join(root, 'ceru-plugin.code-workspace'), 'utf8'),
        ).folders,
        [{ path: '.' }],
      )
      if (template === 'web-dist') {
        const original = await readFile(
          resolve(workspace, 'packages/cli/templates/web-dist', language, 'web-dist/sample.png'),
        )
        assert.deepEqual(await readFile(join(root, 'web-dist/sample.png')), original)
        assert.ok(artifact.body.includes('data:image/png;base64,'))
      }
      if (language === 'ts') fixtures.set(template, { root, bytes, artifact })
    })
  }
}
test('generated JS and TS hook projects exercise real workers and report a failing scenario by name', async () => {
  const { testHooks } = await import('../packages/cli/dist/test-hooks.js')
  for (const language of ['ts','js']) {
    const project = await fixture('hook-scenarios-'+language,'playback-hook',language), log=[]
    await testHooks(project,undefined,text=>log.push(text))
    assert.equal(log.filter(text=>text.startsWith('PASS ')).length,14)
    for (const name of ['主源成功不重试','主源失败后用备用歌曲解析','备用源失败不重复尝试','未授权时不向备用源重试']) assert.ok(log.includes('PASS '+name))
    const cases=JSON.parse(await readFile(join(project,'tests/hooks.json'),'utf8'))
    await writeFile(join(project,'bad-source.json'), JSON.stringify([{...cases[1], source:{kind:'plugin',pluginId:'invalid caller',runtime:1}}]))
    await assert.rejects(testHooks(project,'bad-source.json',()=>{}),/Invalid hook source/)
    cases[1].expect={prevented:false,input:cases[1].input}
    await writeFile(join(project,'wrong.json'),JSON.stringify([cases[1]]))
    await assert.rejects(testHooks(project,'wrong.json',()=>{}),/授权后拦截标记歌曲/)
    const entry = join(project, 'src/index.' + language)
    const original = await readFile(entry, 'utf8')
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'", "ctx.hooks.on('player.error', async (op,next)=>{if(op.source.kind==='system' && op.input.error==='media') op.preventDefault();else await next()});\n  ctx.hooks.on('player.play'"))
    const failure = {track:cases[1].input.track,error:'media'}, systemFailure = {kind:'system',location:'playback'}
    const startFailure = {...failure,error:'start'}
    await writeFile(join(project,'failure.json'),JSON.stringify([
      {name:'block failed playback advance',operation:'player.error',source:systemFailure,granted:true,input:failure,expect:{prevented:true}},
      {name:'continue failed start',operation:'player.error',source:systemFailure,granted:true,input:startFailure,expect:{prevented:false,input:startFailure}},
      {name:'revoked error handler',operation:'player.error',source:systemFailure,granted:false,input:failure,expect:{prevented:false,input:failure}},
    ]))
    await testHooks(project,'failure.json',()=>{})
    const endHook="ctx.hooks.on('player.queueEnded',op=>{if(op.source.kind!=='system')return;if(op.source.location==='stop')op.preventDefault();else if(op.source.location==='extend')return {tracks:[{ref:{kind:'track',id:'new',providerId:'catalog'},title:'New',metadata:{artists:[]}}]}});\n  "
    await writeFile(entry, original.replace("ctx.hooks.on('player.play'",endHook+"ctx.hooks.on('player.play'"))
    const extension={tracks:[{ref:{kind:'track',id:'new',providerId:'catalog'},title:'New',metadata:{artists:[]}}]}
    const endings=[['stop',true,{prevented:true}],['extend',true,{prevented:false,input:extension}],['pass',true,{prevented:false,input:{}}],['extend',false,{prevented:false,input:{}}]]
    await writeFile(join(project,'end.json'),JSON.stringify(endings.map(([location,granted,expect])=>({name:location+' '+granted,operation:'player.queueEnded',source:{kind:'system',location},granted,input:{},expect}))))
    await testHooks(project,'end.json',()=>{})
    const shuffleHook = "ctx.hooks.on('queue.shuffle', async (op,next)=>{const items=[...op.input.items]; await next({items:items[0].title==='invalid' ? items.slice(1) : items.reverse()})});\n  "
    await writeFile(entry, original.replace("ctx.hooks.on('player.play'", shuffleHook+"ctx.hooks.on('player.play'"))
    const first = failure.track, second = {...first,title:'another',ref:{...first.ref,id:'another'}}
    const mixed = {items:[first,first,second]}, invalid = {items:[{...first,title:'invalid'},second]}
    await writeFile(join(project,'shuffle.json'),JSON.stringify([
      {name:'reorder with duplicates',operation:'queue.shuffle',source:systemFailure,granted:true,input:mixed,expect:{prevented:false,input:{items:[second,first,first]}}},
      {name:'revoked shuffle handler',operation:'queue.shuffle',source:systemFailure,granted:false,input:mixed,expect:{prevented:false,input:mixed}},
    ]))
    await testHooks(project,'shuffle.json',()=>{})
    await writeFile(join(project,'invalid-shuffle.json'),JSON.stringify([
      {name:'reject removed track',operation:'queue.shuffle',source:systemFailure,granted:true,input:invalid,expect:{prevented:false,input:invalid}},
    ]))
    await assert.rejects(testHooks(project,'invalid-shuffle.json',()=>{}),/reject removed track.*Hook timed out or threw an error/)
    await writeFile(entry, original.replace("ctx.hooks.on('player.play'", "ctx.hooks.on('player.resume', op => { if (op.source.kind === 'system') op.preventDefault() });\n  ctx.hooks.on('player.play'"))
    const system = {...cases[4], expect: {prevented: true}}
    const plugin = {...cases[4], source: cases[5].source}
    await writeFile(join(project,'transport.json'),JSON.stringify([system, plugin]))
    await testHooks(project, 'transport.json', () => {})
    const configPath=join(project,'ceru.plugin.json'),config=JSON.parse(await readFile(configPath,'utf8'))
    config.manifest.uses.permissions.push({key:'accountGuard',name:'account.intercept',reason:'确认子账号切换'})
    await writeFile(configPath,JSON.stringify(config))
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'", "ctx.hooks.on('account.switch', async (op,next)=>{if(op.input.connectionId==='review')op.preventDefault();else await next()});\n  ctx.hooks.on('player.play'"))
    const input={pluginId:'example.account',accountId:'people',fromConnectionId:'current',connectionId:'review'},allowed={...input,connectionId:'allowed'}
    await writeFile(join(project,'account.json'),JSON.stringify([
      {name:'cancel switch',operation:'account.switch',granted:true,input,expect:{prevented:true}},
      {name:'allow switch',operation:'account.switch',granted:true,input:allowed,expect:{prevented:false,input:allowed}},
      {name:'revoke switch',operation:'account.switch',granted:false,input,expect:{prevented:false,input}},
    ]))
    await testHooks(project,'account.json',()=>{})
    config.manifest.uses.permissions.push({key:'windowGuard',name:'window.intercept',reason:'确认关闭窗口'})
    await writeFile(configPath,JSON.stringify(config))
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'", "ctx.hooks.on('window.close', op=>{op.preventDefault()});\n  ctx.hooks.on('player.play'"))
    await writeFile(join(project,'window.json'),JSON.stringify([
      {operation:'window.close',granted:true,input:{},expect:{prevented:true}},
      {operation:'window.close',granted:false,input:{},expect:{prevented:false,input:{}}}
    ]))
    await testHooks(project,'window.json',()=>{})
      config.manifest.uses.permissions.push({key:'lyricGuard',name:'lyrics.intercept',reason:'补充歌词和翻译'})
      await writeFile(configPath,JSON.stringify(config))
      const lyricTrack={ref:{kind:'track',providerId:'demo',id:'song'},title:'Song',metadata:{artists:['Artist']}}
      const lyricDocument={format:'crlyric',version:1,track:lyricTrack.ref,offsetMs:0,lines:[{startTimeMs:0,text:'Original'}]}
      const lyricHook="ctx.hooks.on('lyrics.load',async(op,next)=>{const value=await next();return value ?? {format:'crlyric',version:1,track:op.input.track.ref,offsetMs:0,lines:[{startTimeMs:0,text:'Fallback'}]}});\n  ctx.hooks.on('lyrics.transform',async(op,next)=>{const value=await next();return value ? {...value,lines:value.lines.map(line=>({...line,translation:'译文'}))} : null});\n  "
      await writeFile(entry,original.replace("ctx.hooks.on('player.play'",lyricHook+"ctx.hooks.on('player.play'"))
      await writeFile(join(project,'lyrics.json'),JSON.stringify([
        {operation:'lyrics.load',granted:true,input:{track:lyricTrack},defaultResult:null,expect:{prevented:false,input:{track:lyricTrack},result:{...lyricDocument,lines:[{startTimeMs:0,text:'Fallback'}]}}},
        {operation:'lyrics.load',granted:false,input:{track:lyricTrack},defaultResult:null,expect:{prevented:false,input:{track:lyricTrack},result:null}},
        {operation:'lyrics.transform',granted:true,input:{track:lyricTrack,lyric:lyricDocument},defaultResult:lyricDocument,expect:{prevented:false,input:{track:lyricTrack,lyric:lyricDocument},result:{...lyricDocument,lines:[{startTimeMs:0,text:'Original',translation:'译文'}]}}}
      ]))
      await testHooks(project,'lyrics.json',()=>{})
      config.manifest.uses.permissions.push({key:'downloadGuard',name:'downloads.intercept',reason:'过滤下载和重命名'})
      await writeFile(configPath,JSON.stringify(config))
      const downloadHook="ctx.hooks.on('download.create',async(op,next)=>{if(op.input.quality==='cancel')op.preventDefault();else await next({...op.input,tracks:op.input.tracks.slice(1),quality:'flac'})});\n  ctx.hooks.on('download.filename',op=>({...op.input,name:'Renamed.mp3'}));\n  "
      await writeFile(entry,original.replace("ctx.hooks.on('player.play'",downloadHook+"ctx.hooks.on('player.play'"))
      const downloadInput={tracks:[lyricTrack,{...lyricTrack,ref:{...lyricTrack.ref,id:'other'}}],quality:'128k'}
      await writeFile(join(project,'downloads.json'),JSON.stringify([
        {operation:'download.create',granted:true,input:downloadInput,expect:{prevented:false,input:{...downloadInput,tracks:downloadInput.tracks.slice(1),quality:'flac'}}},
        {operation:'download.create',granted:true,input:{...downloadInput,quality:'cancel'},expect:{prevented:true}},
        {operation:'download.create',granted:false,input:downloadInput,expect:{prevented:false,input:downloadInput}},
        {operation:'download.filename',granted:true,input:{track:lyricTrack,name:'Original.mp3'},expect:{prevented:false,input:{track:lyricTrack,name:'Renamed.mp3'}}}
      ]))
      await testHooks(project,'downloads.json',()=>{})
      config.manifest.uses.permissions.push({key:'shareGuard',name:'sharing.intercept',reason:'替换分享链接'})
      await writeFile(configPath,JSON.stringify(config))
      const shareHook="ctx.hooks.on('share.create',async(op,next)=>{if(op.input.track.title==='cancel'){op.preventDefault();return}if(op.input.track.title==='replace')return {id:'custom',url:'https://example.test/custom'};const value=await next();return value?{...value,template:'Wrapped'}:null});\n  "
      await writeFile(entry,original.replace("ctx.hooks.on('player.play'",shareHook+"ctx.hooks.on('player.play'"))
      const shareInput={track:lyricTrack}, defaultShare={id:'original',url:'https://example.test/original'}
      await writeFile(join(project,'sharing.json'),JSON.stringify([
        {operation:'share.create',granted:true,input:shareInput,defaultResult:defaultShare,expect:{prevented:false,input:shareInput,result:{...defaultShare,template:'Wrapped'}}},
        {operation:'share.create',granted:true,input:{track:{...lyricTrack,title:'cancel'}},expect:{prevented:true,result:null}},
        {operation:'share.create',granted:true,input:{track:{...lyricTrack,title:'replace'}},expect:{prevented:false,input:{track:{...lyricTrack,title:'replace'}},defaultCalled:false,result:{id:'custom',url:'https://example.test/custom'}}},
        {operation:'share.create',granted:false,input:shareInput,defaultResult:defaultShare,expect:{prevented:false,input:shareInput,result:defaultShare}}
      ]))
      await testHooks(project,'sharing.json',()=>{})
        config.manifest.uses.permissions.push({key:'links',name:'links.intercept',reason:'处理公开链接'},{key:'notices',name:'notifications.intercept',reason:'处理界面提示'})
        await writeFile(configPath,JSON.stringify(config))
        const systemHooks="ctx.hooks.on('link.open',async(op,next)=>{if(!Object.isFrozen(op.state)||op.state.player!==null||op.state.route!==null||op.state.account!==null)throw Error('Invalid default operation state');if(op.input.url.endsWith('/cancel')){op.preventDefault();return}await next({...op.input,url:'https://example.test/rewritten'})});ctx.hooks.on('notification.show',op=>({...op.input,body:'Rewritten'}));\n  "
        await writeFile(entry,original.replace("ctx.hooks.on('player.play'",systemHooks+"ctx.hooks.on('player.play'"))
        const linkInput={url:'https://example.test/list',from:'paste'},notice={title:'Test',body:'Original',level:'info'}
        await writeFile(join(project,'system.json'),JSON.stringify([
          {operation:'link.open',granted:true,input:linkInput,expect:{prevented:false,input:{...linkInput,url:'https://example.test/rewritten'}}},
          {operation:'link.open',granted:true,input:{...linkInput,url:'https://example.test/cancel'},expect:{prevented:true}},
          {operation:'link.open',granted:false,input:linkInput,expect:{prevented:false,input:linkInput}},
          {operation:'notification.show',granted:true,input:notice,expect:{prevented:false,input:{...notice,body:'Rewritten'}}},
          {operation:'notification.show',granted:false,input:notice,expect:{prevented:false,input:notice}}
        ]))
        await testHooks(project,'system.json',()=>{})
    const searchHook = "ctx.hooks.on('search.query', async (op,next)=>{if(op.input.query==='blocked')op.preventDefault();else await next({...op.input,query:op.input.query+' live'})});\n  "
    await writeFile(entry, original.replace("ctx.hooks.on('player.play'", searchHook+"ctx.hooks.on('player.play'"))
    const search = {query:'blue',sourceId:'local',kinds:['track','playlist']}
    await writeFile(join(project,'search.json'),JSON.stringify([
      {name:'rewrite search',operation:'search.query',granted:true,input:search,expect:{prevented:false,input:{...search,query:'blue live'}}},
      {name:'cancel search',operation:'search.query',granted:true,input:{...search,query:'blocked'},expect:{prevented:true}},
      {name:'revoke search',operation:'search.query',granted:false,input:search,expect:{prevented:false,input:search}},
    ]))
    await assert.rejects(testHooks(project,'search.json',()=>{}),/undeclared operation hook/)
    config.manifest.uses.permissions.push({key:'searchGuard',name:'search.intercept',reason:'改写搜索词'})
    await writeFile(configPath,JSON.stringify(config))
    await testHooks(project,'search.json',()=>{})
    const suggestHook = "ctx.hooks.on('search.suggest', async (op,next)=>{if(op.input.query==='keep')op.preventDefault();else await next({...op.input,items:['prefix',...op.input.items.slice().reverse()]})});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",suggestHook+"ctx.hooks.on('player.play'"))
    const suggestions = {query:'blue',items:['left','right']}
    await writeFile(join(project,'suggest.json'),JSON.stringify([
      {operation:'search.suggest',granted:true,input:suggestions,expect:{prevented:false,input:{...suggestions,items:['prefix','right','left']}}},
      {operation:'search.suggest',granted:false,input:suggestions,expect:{prevented:false,input:suggestions}},
      {operation:'search.suggest',granted:true,input:{...suggestions,query:'keep'},expect:{prevented:false,input:{...suggestions,query:'keep'}}},
    ]))
    await testHooks(project,'suggest.json',()=>{})
    const resultHook="ctx.hooks.on('search.results', async (op,next)=>{await next({...op.input,page:{...op.input.page,items:op.input.page.items.filter(item=>!item.title.includes('live')).reverse()}})});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",resultHook+"ctx.hooks.on('player.play'"))
    const row = title=>({title,ref:{kind:'track',id:title,providerId:'catalog'}})
    const results={query:'blue',sourceId:'catalog',page:{kind:'track',items:['first','live','last'].map(row)}}
    await writeFile(join(project,'results.json'),JSON.stringify([
      {operation:'search.results',granted:true,input:results,expect:{prevented:false,input:{...results,page:{...results.page,items:['last','first'].map(row)}}}},
      {operation:'search.results',granted:false,input:results,expect:{prevented:false,input:results}},
    ]))
    await testHooks(project,'results.json',()=>{})
    const likeHook="ctx.hooks.on('track.like',async(op,next)=>{if(op.input.track.title==='cancel')op.preventDefault();if(op.input.track.title==='replace')await next({...op.input,track:{...op.input.track,title:'other',ref:{...op.input.track.ref,id:'other'}}})});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",likeHook+"ctx.hooks.on('player.play'"))
    const like=title=>({liked:true,track:{title,ref:{kind:'track',id:title,providerId:'catalog'},metadata:{artists:[]}}})
    await writeFile(join(project,'likes.json'),JSON.stringify([
      {operation:'track.like',granted:true,input:like('observe'),expect:{prevented:false,input:like('observe')}},
      {operation:'track.like',granted:true,input:like('replace'),expect:{prevented:false,input:like('other')}},
      {operation:'track.like',granted:true,input:like('cancel'),expect:{prevented:true}},
      {operation:'track.like',granted:false,input:like('cancel'),expect:{prevented:false,input:like('cancel')}},
    ]))
    await assert.rejects(testHooks(project,'likes.json',()=>{}),/undeclared operation hook/)
    config.manifest.uses.permissions.push({key:'libraryGuard',name:'library.intercept',reason:'控制收藏'})
    await writeFile(configPath,JSON.stringify(config))
    await testHooks(project,'likes.json',()=>{})
    const createHook="ctx.hooks.on('playlist.create', async(op,next)=>{if(op.input.name==='cancel')op.preventDefault();else await next({...op.input,name:'Renamed'})});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",createHook+"ctx.hooks.on('player.play'"))
    const create=name=>({name,location:'local'})
    await writeFile(join(project,'create.json'),JSON.stringify([
      {operation:'playlist.create',granted:true,input:create('original'),expect:{prevented:false,input:create('Renamed')}},
      {operation:'playlist.create',granted:true,input:create('cancel'),expect:{prevented:true}},
      {operation:'playlist.create',granted:false,input:create('cancel'),expect:{prevented:false,input:create('cancel')}},
    ]))
    await testHooks(project,'create.json',()=>{})
    const deleteHook="ctx.hooks.on('playlist.delete',async(op,next)=>{if(op.input.playlist.name==='cancel')op.preventDefault();else await next()});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",deleteHook+"ctx.hooks.on('player.play'"))
    const deletion=name=>({playlist:{id:'list-1',name,location:'local'}})
    await writeFile(join(project,'delete.json'),JSON.stringify([
      {operation:'playlist.delete',granted:true,input:deletion('normal'),expect:{prevented:false,input:deletion('normal')}},
      {operation:'playlist.delete',granted:true,input:deletion('cancel'),expect:{prevented:true}},
      {operation:'playlist.delete',granted:false,input:deletion('cancel'),expect:{prevented:false,input:deletion('cancel')}},
    ]))
    await testHooks(project,'delete.json',()=>{})
    const exportHook="ctx.hooks.on('playlist.export',async(op,next)=>{if(op.input.playlist.name==='cancel')op.preventDefault();else await next({...op.input,format:'cpl'})});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",exportHook+"ctx.hooks.on('player.play'"))
    const exported={...deletion('portable'),format:'cmpl'},cancelExport={...deletion('cancel'),format:'cmpl'}
    await writeFile(join(project,'export.json'),JSON.stringify([
      {operation:'playlist.export',granted:true,input:exported,expect:{prevented:false,input:{...exported,format:'cpl'}}},
      {operation:'playlist.export',granted:true,input:cancelExport,expect:{prevented:true}},
      {operation:'playlist.export',granted:false,input:exported,expect:{prevented:false,input:exported}}
    ]))
    await testHooks(project,'export.json',()=>{})
    const importHook="ctx.hooks.on('playlist.import',async(op,next)=>{if(op.input.value==='cancel')op.preventDefault();else await next({value:'rewritten',importerId:'test.other:lists'})});\n  "
    await writeFile(entry,original.replace("ctx.hooks.on('player.play'",importHook+"ctx.hooks.on('player.play'"))
    const imported={value:'original',importerId:'test.source:lists'}
    await writeFile(join(project,'import.json'),JSON.stringify([
      {operation:'playlist.import',granted:true,input:imported,expect:{prevented:false,input:{value:'rewritten',importerId:'test.other:lists'}}},
      {operation:'playlist.import',granted:true,input:{value:'cancel'},expect:{prevented:true}},
      {operation:'playlist.import',granted:false,input:imported,expect:{prevented:false,input:imported}}
    ]))
    await testHooks(project,'import.json',()=>{})
    for (const operation of ['playlist.addTracks','playlist.removeTracks']) {
      const hook = `ctx.hooks.on('${operation}', async(op,next)=>{if(op.input.playlist.name==='cancel')op.preventDefault();else await next({...op.input,tracks:op.input.tracks.slice(1)})});\n  `
      await writeFile(entry,original.replace("ctx.hooks.on('player.play'",hook+"ctx.hooks.on('player.play'"))
      const tracks = [like('first').track,like('second').track]
      const input = {...deletion('normal'),tracks}, canceled = {...deletion('cancel'),tracks}
      await writeFile(join(project,'tracks.json'),JSON.stringify([
        {operation,granted:true,input,expect:{prevented:false,input:{...input,tracks:tracks.slice(1)}}},
        {operation,granted:true,input:canceled,expect:{prevented:true}},
        {operation,granted:false,input:canceled,expect:{prevented:false,input:canceled}}
      ]))
      await testHooks(project,'tracks.json',()=>{})
    }
  }
})
test('standalone typecheck generates fresh config types and rejects invalid Vue templates without emitting a plugin',async()=>{
  const {typecheckProject}=await import('../packages/cli/dist/project.js')
  const project=await fixture('first-check','page-extension','ts'), file=join(project,'src/Search.vue'), original=await readFile(file,'utf8')
  const configPath=join(project,'ceru.plugin.json'),config=JSON.parse(await readFile(configPath,'utf8'));config.config={label:'demo'}
  await writeFile(configPath,JSON.stringify(config))
  const contents=original.replace('<script setup lang="ts">','<script setup lang="ts">\nimport type {PluginConfig} from "@ceru/plugin-config"\nconst title: PluginConfig["label"] = "demo"')
  await writeFile(file,contents);await typecheckProject(project)
  await assert.rejects(readFile(join(project,'dist/plugin.js')),{code:'ENOENT'})
  const invalid = contents.replace('<template>', '<template><p>{{ title.nonexistentMethod() }}</p>')
  assert.notEqual(invalid, contents)
  await writeFile(file,invalid)
  await assert.rejects(typecheckProject(project),/nonexistentMethod/)
  await assert.rejects(readFile(join(project,'dist/plugin.js')),{code:'ENOENT'})
})
test('JavaScript authoring also builds', async () => {
  const root = await fixture('plain-js', 'source', 'js')
  const result = await buildProject(root)
  assert.equal(readArtifact(await readFile(result.path)).header.manifest.id, 'local.plain-js')
})
test('inline and referenced plugin config become one static object', async () => {
  const root = await fixture('config-reference')
  await writeFile(
    join(root, 'src/commands.json'),
    JSON.stringify([{ id: 'hello', title: 'Hello' }]),
  )
  await writeFile(
    join(root, 'src/plugin.config.ts'),
    [
      "import { definePluginConfig } from '@shiqianjiang/ceru-plugin-sdk'",
      "const lossless = ['flac'] as const",
      "export default definePluginConfig({ kg: { name: '酷狗', qualities: ['320k', ...lossless] } })",
    ].join('\n'),
  )
  const file = join(root, 'ceru.plugin.json')
  const config = JSON.parse(await readFile(file, 'utf8'))
  config.manifest.provides.actions = '@./src/commands.json'
  config.config = {
    displayName: 'Config Test',
    previewUrl: '',
    apiOrigin: 'https://source.example.com',
    sources: '@./src/plugin.config.ts',
    literalAt: '@@customer-name',
  }
  await writeFile(file, JSON.stringify(config, null, 2))
  const built = await buildProject(root)
  const artifact = readArtifact(await readFile(built.path))
  assert.deepEqual(JSON.parse(JSON.stringify(artifact.header.manifest.config)), {
    displayName: 'Config Test',
    previewUrl: '',
    apiOrigin: 'https://source.example.com',
    sources: { kg: { name: '酷狗', qualities: ['320k', 'flac'] } },
    literalAt: '@customer-name',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(artifact.header.manifest.provides.actions)), [
    { id: 'hello', title: 'Hello' },
  ])
  assert.doesNotMatch(await readFile(built.path, 'utf8'), /exports\.config\s*=/)
  assert.match(await readFile(built.path, 'utf8'), /\n\s+apiOrigin: "https:\/\/source\.example\.com"/)
  assert.doesNotMatch(await readFile(built.path, 'utf8'), /@\.\/src\/plugin\.config\.ts/)
  const generatedTypes = await readFile(
    join(root, '.ceru-dev/types/plugin-config.d.ts'),
    'utf8',
  )
  assert.match(generatedTypes, /declare module '@ceru\/plugin-config'/)
  assert.match(generatedTypes, /readonly "apiOrigin": string/)
})
test('delivery config recursively overrides build defaults', () => {
  const header = {
    formatVersion: 2,
    syntax: 'js',
    manifest: {
      config: {
        apiOrigin: 'https://default.example.com',
        sources: { kg: { qualities: ['320k'] }, wy: { qualities: ['flac'] } },
      },
    },
    signature: null,
    delivery: {
      payload: {
        personalization: {
          config: {
            apiKey: 'delivery-key',
            sources: { kg: { qualities: ['flac'] } },
          },
        },
      },
      signature: {},
    },
  }
  assert.deepEqual(JSON.parse(JSON.stringify(resolveArtifactConfig(header))), {
    apiOrigin: 'https://default.example.com',
    apiKey: 'delivery-key',
    sources: { kg: { qualities: ['flac'] }, wy: { qualities: ['flac'] } },
  })
})
test('legacy Vue sharedLibraries settings produce a self-contained release', async () => {
  const root = await fixture('legacy-vue', 'vue', 'ts')
  const file = join(root, 'ceru.plugin.json')
  const config = JSON.parse(await readFile(file, 'utf8'))
  config.sharedLibraries = { vue: '^3.5.43' }
  config.manifest.engines.libraries = { vue: '^3.5.43' }
  await writeFile(file, JSON.stringify(config))
  const result = await buildProject(root)
  const artifact = readArtifact(await readFile(result.path))
  assert.equal(artifact.header.manifest.engines.libraries, undefined)
  assert.ok(!artifact.body.includes('__ceruSharedRequire'))
  assert.ok(artifact.body.includes('function createApp'))
})
test('scaffold refuses to replace a populated directory', async () => {
  const root = fixtures.get('source').root
  const before = await readFile(join(root, 'src/index.ts'))
  await assert.rejects(scaffoldProject(root), /not empty/)
  assert.deepEqual(await readFile(join(root, 'src/index.ts')), before)
})
test('type errors fail before emitting an artifact', async () => {
  const root = await fixture('bad-types')
  await writeFile(
    join(root, 'src/index.ts'),
    "import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'\nexport default definePlugin(() => { const value: number = 'wrong' })\n",
  )
  await assert.rejects(buildProject(root), /not assignable/)
  await assert.rejects(readFile(join(root, 'dist/plugin.js')), /ENOENT/)
})
test('entry must default-export a callable function', async () => {
  const root = await fixture('no-default')
  await writeFile(join(root, 'src/index.ts'), 'export const unrelated = 1\n')
  await assert.rejects(buildProject(root), /default-export/)
})
test('TSX is compiled with an explicit local JSX factory', async () => {
  const root = await fixture('tsx', 'web-surface')
  const config = JSON.parse(await readFile(join(root, 'ceru.plugin.json')))
  config.entries['view.main'] = 'src/view-demo.tsx'
  await writeFile(join(root, 'ceru.plugin.json'), JSON.stringify(config))
  const tsconfig = JSON.parse(await readFile(join(root, 'tsconfig.json')))
  tsconfig.compilerOptions.jsx = 'react'
  tsconfig.compilerOptions.jsxFactory = 'h'
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify(tsconfig))
  await writeFile(
    join(root, 'src/view-demo.tsx'),
    [
      "import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'",
      'declare global { namespace JSX { interface IntrinsicElements { div: { children?: string } } } }',
      'function h(tag: string, _props: unknown, text: string) { const el = document.createElement(tag); el.textContent = text; return el }',
      'export default defineSurface((ctx) => { ctx.root.replaceChildren(<div>Hello TSX</div>) })',
    ].join('\n'),
  )
  const result = await buildProject(root)
  const artifact = readArtifact(await readFile(result.path))
  assert.ok(artifact.modules['view.main'].includes('Hello TSX'))
  assert.ok(!artifact.modules['view.main'].includes('<div>'))
})
test('input escape is rejected', async () => {
  const root = await fixture('escaped-input')
  const config = JSON.parse(await readFile(join(root, 'ceru.plugin.json')))
  config.entries['logic.main'] = '../source-ts/src/index.ts'
  await writeFile(join(root, 'ceru.plugin.json'), JSON.stringify(config))
  await assert.rejects(buildProject(root), /escapes project/)
})
test('static verification never executes module code', () => {
  const { artifact } = fixtures.get('source')
  const body =
    'CeruPlugin.define({ modules: { "logic.main": function(ctx) { globalThis.__ceruUnsafe = true; throw new Error("do not run") } }, resources: {} })'
  readArtifact(encodeArtifact(artifact.header, body))
  assert.equal(globalThis.__ceruUnsafe, undefined)
})
test('rejects extra execution, getters and duplicate keys', () => {
  const { artifact } = fixtures.get('source')
  assert.throws(
    () => readArtifact(encodeArtifact(artifact.header, artifact.body + '\nprocess.exit(0)')),
    /exports assignment/,
  )
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          artifact.header,
          'CeruPlugin.define({ get modules() { return {} }, resources: {} })',
        ),
      ),
    /literal object/,
  )
  assert.throws(() => parseJsonStrict('{"id":1,"id":2}'), /Duplicate key/)
  assert.throws(() => parseJsonStrict('{"__proto__":{"admin":true}}'), /Unsafe/)
})
test('a hand-written exports plugin validates without npm or the CLI', () => {
  const { artifact } = fixtures.get('source')
  const manifest = structuredClone(artifact.header.manifest)
  const text =
    'exports.manifest = ' +
    JSON.stringify(manifest) +
    ';\nexports.package = {"formatVersion":2,"syntax":"js","signature":null};\n' +
    "const http = require('@ceru/http');\n" +
    'exports.activate = async function(core) { return http && core; };\n'
  const parsed = readArtifact(text)
  assert.equal(parsed.sourceFormat, 'exports-v2')
  assert.ok(parsed.modules[manifest.entry.logic.module])
})
test('the distributed hand-written example is a valid combined plugin', async () => {
  const artifact = readArtifact(
    await readFile(resolve(workspace, 'examples/handwritten/plugin.js')),
  )
  assert.equal(artifact.sourceFormat, 'exports-v2')
  assert.ok(artifact.modules['logic.main'])
  assert.ok(artifact.modules['view.hello'])
})
test('hand-written plugins may require only literal Host modules', () => {
  const { artifact } = fixtures.get('source')
  const header = artifact.header
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          header,
          "const name = '@ceru/http'; exports.activate = async function(core) { return require(name); };",
        ),
      ),
    /literal Host module/,
  )
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          header,
          "exports.activate = async function(core) { return require('axios'); };",
        ),
      ),
    /documented Host modules/,
  )
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          header,
          'const data = { value: globalThis.run() }; exports.activate = async function() {};',
        ),
      ),
    /literal object/,
  )
})
test('CLI bundles third-party CommonJS dependencies but keeps Host modules external', async () => {
  const root = await fixture('bundled-requires', 'source', 'js')
  await writeFile(
    join(root, 'src/index.js'),
    [
      "import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'",
      "const JSON5 = require('json5')",
      "const host = require('@ceru/http')",
      'export default definePlugin((ctx) => { ctx.log.info(String(JSON5.parse("{ok:true}").ok && !!host)) })',
    ].join('\n'),
  )
  await mkdir(join(root, 'node_modules/json5'), { recursive: true })
  await cp(resolve(workspace, 'node_modules/json5'), join(root, 'node_modules/json5'), {
    recursive: true,
  })
  const built = await buildProject(root)
  const artifact = readArtifact(await readFile(built.path))
  assert.ok(artifact.body.includes('__ceruRequire'))
  assert.ok(!artifact.body.includes("require('json5')"))
})
test('rejects runtime imports and malformed registration', () => {
  const { artifact } = fixtures.get('source')
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          artifact.header,
          'CeruPlugin.define({modules:{"logic.main":function(ctx){return import(ctx.url)}},resources:{}})',
        ),
      ),
    /import/,
  )
  assert.throws(
    () =>
      readArtifact(encodeArtifact(artifact.header, 'CeruPlugin.define({modules:{},resources:{}})')),
    /Missing module/,
  )
})
const publisher = generateSigningKeys()
const issuerKeys = generateSigningKeys()
let templateBytes
let issuer
test('Ed25519 verification distinguishes cryptographic validity from trust', () => {
  const signed = signArtifact(fixtures.get('source').bytes, publisher.privateKey)
  assert.equal(readArtifact(signed).signatureStatus, 'verified-untrusted')
  assert.equal(
    readArtifact(signed, { trustedPublicKeys: [publisher.publicKey] }).signatureStatus,
    'verified-trusted',
  )
  assert.throws(
    () => readArtifact(signed, { trustedPublicKeys: [issuerKeys.publicKey] }),
    /trust store/,
  )
  const artifact = readArtifact(signed)
  artifact.header.manifest.name = 'tampered'
  assert.throws(
    () => readArtifact(encodeArtifact(artifact.header, artifact.body)),
    /Signature verification/,
  )
  assert.throws(
    () => readArtifact(Buffer.concat([signed, Buffer.from('\n/* modified */')])),
    /Signature verification/,
  )
})
test('prepares a delegated template and issues personalized files', () => {
  const schema = structuredClone(DEFAULT_PERSONALIZATION_SCHEMA)
  schema.properties.config.properties.apiOrigin = {
    type: 'string',
    maxLength: 200,
    enum: ['https://source.example.com'],
  }
  templateBytes = createTemplate(fixtures.get('source').bytes, {
    privateKey: publisher.privateKey,
    issuerPublicKeys: [issuerKeys.publicKey],
    personalizationSchema: schema,
  })
  issuer = new PreparedIssuer(templateBytes, {
    issuerPrivateKey: issuerKeys.privateKey,
    trustedPublicKeys: [publisher.publicKey],
  })
  const name = 'Hello */\nprocess.exit(1) "中文"'
  const output = issuer.issue(
    { display: { name }, config: { apiOrigin: 'https://source.example.com' } },
    { deliveryId: 'known-delivery' },
  )
  const result = readArtifact(output, { trustedPublicKeys: [publisher.publicKey] })
  assert.equal(result.header.delivery.payload.personalization.display.name, name)
  assert.equal(result.header.delivery.payload.deliveryId, 'known-delivery')
  assert.equal(result.body, readArtifact(templateBytes).body)
})
test('issuer rejects privilege expansion and an undelegated key', () => {
  assert.throws(() => issuer.issue({ permissions: ['network.request'] }), /Invalid personalization/)
  assert.throws(
    () => issuer.issue({ config: { apiOrigin: 'http://127.0.0.1' } }),
    /Invalid personalization/,
  )
  assert.throws(
    () => new PreparedIssuer(templateBytes, { issuerPrivateKey: publisher.privateKey }),
    /not delegated/,
  )
})
test('personalization signature cannot be replaced or modified', () => {
  const output = issuer.issue({ display: { name: 'Original' } })
  const parsed = readArtifact(output)
  parsed.header.delivery.payload.personalization.display.name = 'Different'
  assert.throws(
    () => readArtifact(encodeArtifact(parsed.header, parsed.body)),
    /Signature verification/,
  )
  const badCore = parsed.body + '\n/* changed core */'
  assert.throws(() => readArtifact(encodeArtifact(parsed.header, badCore)), /digest mismatch/)
})
test('expiry is an activation policy, not loss of cryptographic validity', () => {
  const issued = issuer.issue(
    {
      activation: { mode: 'one-time-code', code: 'test-code' },
      activationExpiresAt: '2030-01-02T00:00:00Z',
    },
    { now: new Date('2030-01-01T00:00:00Z') },
  )
  assert.equal(
    readArtifact(issued, { now: new Date('2031-01-01T00:00:00Z') }).signatureStatus,
    'verified-untrusted',
  )
  assert.throws(
    () =>
      readArtifact(issued, {
        now: new Date('2031-01-01T00:00:00Z'),
        requireUnexpiredActivation: true,
      }),
    /expired/,
  )
})
test('streaming issuance preserves core and propagates destination failures', async () => {
  const chunks = []
  const out = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  await issuer.writeTo(out, { display: { name: 'Stream' } })
  out.end()
  assert.equal(
    readArtifact(Buffer.concat(chunks)).header.delivery.payload.personalization.display.name,
    'Stream',
  )
  const failing = new Writable({
    write(_chunk, _enc, cb) {
      cb(new Error('destination closed'))
    },
  })
  await assert.rejects(issuer.writeTo(failing, {}), /destination closed/)
})
test('repeat issuance isolates customer data and reuses the same core bytes', () => {
  const core = readArtifact(templateBytes).body
  for (let i = 0; i < 20; i++) {
    const output = issuer.issue(
      { display: { name: 'customer-' + i } },
      { deliveryId: 'delivery-' + i },
    )
    const parsed = readArtifact(output)
    assert.equal(parsed.body, core)
    assert.equal(parsed.header.delivery.payload.personalization.display.name, 'customer-' + i)
  }
})
test('CLI validates files without printing activation secrets', async () => {
  const path = join(temp, 'personalized.js')
  await writeFile(
    path,
    issuer.issue({ activation: { mode: 'one-time-code', code: 'SHOULD-NOT-PRINT' } }),
  )
  const result = spawnSync(process.execPath, [cli, 'validate', path, '--json'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.stdout.includes('SHOULD-NOT-PRINT'))
  assert.equal(JSON.parse(result.stdout).personalized, true)
})
test('create CLI is runnable and build error exits nonzero', () => {
  const create = resolve(workspace, 'packages/create/dist/bin.js')
  const result = spawnSync(
    process.execPath,
    [create, join(temp, 'cli-create'), '--template', 'source'],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const bad = spawnSync(process.execPath, [cli, 'build', '--project', join(temp, 'bad-types')], {
    encoding: 'utf8',
  })
  assert.equal(bad.status, 1)
})
test('preview validates an artifact and exits with desktop instructions instead of starting a server', async () => {
  const file = resolve(workspace, 'examples/handwritten/plugin.js')
  const preview = path => spawnSync(process.execPath,[cli,'preview',path],{encoding:'utf8',timeout:10000})
  const result = preview(file)
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.stdout.includes(file)); assert.match(result.stdout,/插件开发者模式/); assert.doesNotMatch(result.stdout,/127\.0\.0\.1|playground/i)
  const invalid = join(temp,'invalid-preview.js'); await writeFile(invalid,'invalid plugin')
  assert.notEqual(preview(invalid).status,0)
  assert.equal(spawnSync(process.execPath,[cli,'preview',file,'--no-open'],{timeout:10000}).status,0)
})
