import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { cp, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.npm_execpath) throw Error('Use npm run verify:devkit after pack:all')
const root = fileURLToPath(new URL('../', import.meta.url)),
  temp = await realpath(tmpdir()),
  scratch = await mkdtemp(join(temp, 'ceru-devkit-'))
const kit = join(scratch, 'kit'),
  author = join(scratch, 'author'),
  moved = join(scratch, 'portable')
const hostProfile = process.env.CERU_DEVKIT_HOST_PROFILE
  ? resolve(process.env.CERU_DEVKIT_HOST_PROFILE)
  : undefined
const run = (args, cwd) =>
  execFileSync(process.execPath, args, {
    cwd,
    windowsHide: true,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
const npm = (args, cwd) => run([process.env.npm_execpath, ...args], cwd)
async function verifyInstalledWatcher(cwd, skinLanguage) {
  const source = join(cwd, skinLanguage ? 'src/Artwork.vue' : 'src/index.ts'), output = join(cwd, 'dist/plugin.js')
  const original = await readFile(source, 'utf8')
  const marker = '[portable-watch-check]'
  const edited = skinLanguage ? original.replace('</template>', '<span>' + marker + '</span></template>') : original.replace('[拦截示例]', marker)
  const invalid = skinLanguage === 'ts' ? original.replace('</template>', '<span>{{ missingPortableArtwork }}</span></template>') : original.replace('</template>', '<span></template>')
  assert.notEqual(edited, original)
  const child = spawn(process.execPath, [join(cwd, 'node_modules/@shiqianjiang/ceru-plugin-cli/dist/bin.js'), 'dev'], {
    cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'],
  })
  const ended = new Promise(resolve => child.once('close', resolve))
  let failure
  child.once('error', error => { failure = error })
  const timer = setTimeout(() => child.kill(), 60000)
  const lines = createInterface({input: child.stdout})
  let phase = 'initial', accepted
  try {
    for await (const line of lines) {
      if (line.startsWith('CERU_ERROR ')) {
        if (phase !== 'invalid' || (skinLanguage === 'ts' && !line.includes('missingPortableArtwork'))) throw Error(line)
        assert.deepEqual(await readFile(output), accepted)
        phase = 'edited'
        await writeFile(source, edited)
        continue
      }
      if (!line.startsWith('CERU_BUILD_READY ')) continue
      assert.equal(line.slice('CERU_BUILD_READY '.length), output)
      if (phase === 'initial') {
        accepted = await readFile(output)
        assert.ok(!accepted.includes(marker))
        phase = skinLanguage ? 'invalid' : 'edited'
        await writeFile(source, skinLanguage ? invalid : edited)
      } else if (phase === 'invalid' && !(await readFile(output)).equals(accepted)) {
        throw Error('Installed watcher published an invalid template')
      } else if (phase === 'edited' && (await readFile(output, 'utf8')).includes(marker)) {
        return
      }
    }
    throw failure ?? Error('Installed dev watcher exited before rebuilding edited source')
  } finally {
    clearTimeout(timer)
    child.kill()
    await ended
    lines.close()
    await writeFile(source, original)
  }
}
const install = (cwd) =>
  npm(
    [
      'install',
      process.env.CERU_PRIME_NPM_CACHE === '1' ? '--prefer-offline' : '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    cwd,
  )
try {
  if (process.argv[2]) await cp(await realpath(process.argv[2]), kit, { recursive: true, errorOnExist: true, force: false })
  else run([join(root, 'scripts/build-devkit.mjs'), kit], root)
  await assert.rejects(realpath(join(kit, 'node_modules')), {code:'ENOENT'})
  install(kit)
  const templates = npm(['run', '--silent', 'templates'], kit).trim().split(/\r?\n/)
  const packaged = await readdir(join(kit, 'node_modules/@shiqianjiang/ceru-plugin-cli/templates'), {withFileTypes: true})
  assert.deepEqual([...templates].sort(), packaged.filter(entry => entry.isDirectory()).map(entry => entry.name).sort())
  for (const name of ['page-extension', 'playback-hook', 'player-skin', 'connected-library', 'encrypted-source']) assert.ok(templates.includes(name))
  const selectedTemplates = process.env.CERU_DEVKIT_TEMPLATES
    ? process.env.CERU_DEVKIT_TEMPLATES.split(',').map(name => name.trim())
    : templates
  assert.ok(selectedTemplates.length && selectedTemplates.every(name => templates.includes(name)), 'Unknown template filter')
  assert.equal(new Set(selectedTemplates).size, selectedTemplates.length, 'Duplicate template filter')
  const matrix = selectedTemplates.flatMap(template => ['js', 'ts'].map(language => [template, language]))
  for (const [template, language] of matrix) {
    console.log('Checking portable ' + template + ' ' + language)
    const project = template === 'playback-hook' && language === 'ts' ? author : join(scratch, template === 'player-skin' ? (language === 'ts' ? '黑胶歌词' : '桌面歌词') : template+'-'+language)
    npm(['run', 'create', '--', project, '--template', template, '--lang', language], kit)
    const pkg = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'))
    if (template === 'player-skin') {
      const {manifest} = JSON.parse(await readFile(join(project,'ceru.plugin.json'),'utf8'))
      assert.equal(manifest.name,basename(project))
      assert.equal(manifest.id,'local.'+pkg.name)
      assert.notEqual(manifest.id,'local.my-plugin')
    }
    for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }))
      if (name.startsWith('@shiqianjiang/')) assert.ok(spec.startsWith('file:.ceru-toolchain/'))
    if (template === 'connected-library') {
      const logic = await readFile(join(project,'src','index.'+language),'utf8')
      const { manifest } = JSON.parse(await readFile(join(project,'ceru.plugin.json'),'utf8'))
      assert.match(logic,/ctx\.accounts\.register\('catalog'/)
      assert.match(logic,/await ctx\.entries\.invalidate\(\)/)
      assert.deepEqual(manifest.ui.pages.find(page => page.id === 'connected')?.when,{selectedSource:'catalog',predicate:'connection.visible'})
      assert.ok(manifest.ui.pages.some(page => page.mount === 'settings' && !page.when))
    }
    if (template === 'page-extension' || template === 'player-skin') {
      assert.equal(pkg.devDependencies['tdesign-vue-next'], '1.15.4')
      assert.equal(pkg.devDependencies.vue, '^3.5.21')
    }
    let cwd = project
    if (project === author) {
      assert.equal(dirname(await realpath(author)), scratch)
      assert.equal(dirname(moved), scratch)
      await rename(author, moved)
      cwd = moved
    }
    const before=await readFile(join(cwd,'package.json'),'utf8')
    npm(['run','create','--',cwd,'--help'],kit)
    assert.equal(await readFile(join(cwd,'package.json'),'utf8'),before)
    install(cwd)
    const compatibility = JSON.parse(npm(['run', '--silent', 'check:compat', '--', '--json'], cwd))
    assert.equal(compatibility.compatible, true, JSON.stringify(compatibility.issues))
    assert.equal(compatibility.target, 'bundled-runtime-reference')
    if (hostProfile) {
      const actualHost = JSON.parse(npm(['run', '--silent', 'check:compat', '--', '--host', hostProfile, '--json'], cwd))
      assert.equal(actualHost.compatible, true, JSON.stringify(actualHost.issues))
      assert.equal(actualHost.target, 'host-profile')
      console.log('PASS target host ' + template + ' ' + language + ': Vue ' + actualHost.host.componentLibraries.vue)
    }
    assert.match(npm(['run','typecheck'],cwd),/Typecheck passed/)
    await assert.rejects(readFile(join(cwd,'dist/plugin.js')),{code:'ENOENT'})
    if (template === 'playback-hook') {
      assert.equal(pkg.scripts.dev, 'ceru-plugin dev')
      if (cwd === moved) {
        await verifyInstalledWatcher(cwd)
        console.log('PASS moved author project: installed dev watcher rebuilt edited TS source at the printed absolute path')
      }
      const cases = JSON.parse(await readFile(join(cwd,'tests/hooks.json'),'utf8'))
      const result = npm(['test'], cwd)
      for (const scenario of cases) assert.ok(result.includes('PASS ' + scenario.name), scenario.name)
      assert.ok(result.includes(cases.length + ' hook scenarios passed'))
      const expected = ['player.play','player.resolve','queue.add','player.pause','player.resume','player.next','player.previous','player.seek','player.setVolume','player.setMode','queue.remove','queue.clear','player.queueEnded','queue.shuffle','track.like','playlist.create','playlist.delete']
      const installed = JSON.parse(run(['--input-type=module','-e',
        "import {PLAYBACK_OPERATIONS,RESOLVE_OPERATIONS,ACCOUNT_OPERATIONS,SEARCH_OPERATIONS,LIBRARY_OPERATIONS,WINDOW_OPERATIONS,LYRIC_OPERATIONS,DOWNLOAD_OPERATIONS,SHARING_OPERATIONS,SYSTEM_OPERATIONS} from '@shiqianjiang/ceru-plugin-core/operations';console.log(JSON.stringify(Object.keys({...PLAYBACK_OPERATIONS,...RESOLVE_OPERATIONS,...ACCOUNT_OPERATIONS,...SEARCH_OPERATIONS,...LIBRARY_OPERATIONS,...WINDOW_OPERATIONS,...LYRIC_OPERATIONS,...DOWNLOAD_OPERATIONS,...SHARING_OPERATIONS,...SYSTEM_OPERATIONS})))"], cwd))
      for (const name of expected) assert.ok(installed.includes(name), 'Missing packaged operation: ' + name)
      for (const name of ['playlist.addTracks','playlist.removeTracks','playlist.export','playlist.import','window.close','lyrics.load','lyrics.transform','download.create','download.filename','share.create','link.open','notification.show']) assert.ok(installed.includes(name), 'Missing packaged operation: ' + name)
      const guide = await readFile(join(kit,'docs','OPERATIONS.md'),'utf8')
      const documented = guide.split(/\r?\n/).filter(line => line.startsWith('| `')).map(line => line.split('`')[1])
      assert.deepEqual(documented.sort(), installed.sort())
    }
    else npm(['run', 'build'], cwd)
    npm(['run', 'validate'], cwd)
    if (template === 'page-extension') {
      await writeFile(join(cwd,'src','DevkitLabel.vue'),'<template><span>portable</span></template>')
      await writeFile(join(cwd,'src','Search.vue'),`<script>
import DevkitLabel from './DevkitLabel.vue'
export default {components:{DevkitLabel},props:{title:String},computed:{caption(){return 'options:'+this.title}}}
</script><template><p><DevkitLabel />{{ caption }}</p></template>`)
      npm(['run','build'],cwd)
      npm(['run','validate'],cwd)
      const html = run(['--input-type=module','-e',`
        import * as vue from 'vue'; import {renderToString} from 'vue/server-renderer';
        import {readFileSync} from 'node:fs'; import {readPluginArtifact} from '@shiqianjiang/ceru-plugin-core';
        const code=readPluginArtifact(readFileSync('dist/plugin.js')).artifact.modules['view.search'];
        const {default:factory}=await import('data:text/javascript;base64,'+Buffer.from('export default '+code).toString('base64'));
        await factory({vue,sdk:{mountComponent:async component=>console.log(await renderToString(vue.createSSRApp(component,{title:'updated'})))}})({});
      `],cwd)
      assert.equal(html.trim(),'<p><span>portable</span>options:updated</p>')
      console.log('PASS author package: ordinary Vue script and template-only child render from dist/plugin.js')
    }
    if (template === 'player-skin') {
      const configFile = join(cwd, 'ceru.plugin.json')
      await verifyInstalledWatcher(cwd, language)
      console.log('PASS installed ' + language + ' skin watcher: invalid template retained the artifact, repaired artwork rebuilt without restarting')
      const config = JSON.parse(await readFile(configFile, 'utf8'))
      assert.equal(config.entries['view.lyrics'], 'src/BuiltinLyrics.vue')
      const sourceFile = join(cwd, config.entries['view.lyrics'])
      const typed = language === 'ts'
      const annotation = typed ? ': RegionTransitionHook' : ''
      const hooks = [typed ? '<script lang="ts">' : '<script>',
        ...(typed ? ["import type { RegionTransitionHook } from '@shiqianjiang/ceru-plugin-sdk/vue'"] : []),
        ...['onEnter', 'onLeave'].map(name => `export const ${name}${annotation} = ({ root, reason, signal }) => { if (!signal.aborted) root.host.setAttribute('data-phase', '${name}:' + reason) }`),
        '</script>', ''].join('\n')
      await writeFile(sourceFile, hooks + await readFile(sourceFile, 'utf8'))
      npm(['run', 'build'], cwd)
      npm(['run', 'validate'], cwd)
      const {modules,preview,image} = JSON.parse(run(['--input-type=module', '-e',
        "import {readFileSync} from 'node:fs';import {readPluginArtifact} from '@shiqianjiang/ceru-plugin-core';const {artifact,header}=readPluginArtifact(readFileSync('dist/plugin.js'));const preview=header.manifest.ui.skins[0].preview;console.log(JSON.stringify({modules:artifact.modules,preview,image:artifact.resources[preview.resource]}))"], cwd))
      assert.deepEqual(preview,{kind:'asset',resource:'studio.preview'})
      assert.deepEqual(image,{type:'text',mime:'image/svg+xml',value:await readFile(join(cwd,'assets','studio-preview.svg'),'utf8')})
      assert.match(modules['view.lyrics'], /__ceruDeps\.sdk\["useHostComponents"\]/)
      assert.match(modules['view.lyrics'], /\bLyricAdapter\b/)
      assert.match(modules['view.artwork'], /\bVinylRecord\b/)
      assert.match(modules['view.artwork'], /\bSquareCover\b/)
      assert.doesNotMatch(JSON.stringify(modules), /lyric-scroll-container|--yrc-mask-x|label-shine|visualizer-canvas/)
      const { default: factory } = await import('data:text/javascript;base64,' + Buffer.from('export default ' + modules['view.lyrics']).toString('base64'))
      const entry = factory({vue:{defineComponent: options => options}, sdk:{}, tdesign:{}})
      const phases = []
      const root = {host:{setAttribute: (key, value) => phases.push([key, value])}}
      const controller = new AbortController()
      entry.onEnter({root, reason:'skin', signal:controller.signal})
      entry.onLeave({root, reason:'track', signal:controller.signal})
      controller.abort()
      entry.onEnter({root, reason:'track', signal:controller.signal})
      assert.deepEqual(phases, [['data-phase','onEnter:skin'], ['data-phase','onLeave:track']])
      console.log('PASS packaged ' + language + ' skin: desktop-component entry and both exported animation hooks')
    }
    const preview = npm(['run','preview'],cwd)
    assert.ok(preview.includes(join(cwd,'dist/plugin.js')))
    assert.match(preview,/插件开发者模式/)
    if (template === 'playback-hook') {
      const configFile = join(cwd,'ceru.plugin.json'), config = JSON.parse(await readFile(configFile,'utf8'))
      config.manifest.provides = {actions:[{id:'lookup',title:'检查模拟服务'}]}
      config.manifest.uses = {permissions:[{name:'services.consume',key:'consume',reason:'检查离线服务'}],plugins:[{pluginId:'sample.catalog',service:'lookup',version:'^1'}]}
      await writeFile(configFile, JSON.stringify(config))
      await writeFile(join(cwd,config.entries['logic.main']), `import {definePlugin} from '@shiqianjiang/ceru-plugin-sdk';export default definePlugin(ctx=>{ctx.actions.register('lookup',async()=>{const service=await ctx.plugins.use('sample.catalog','lookup');return service ? service.find(null) : null})})`)
      await writeFile(join(cwd,'ceru.config.json'),JSON.stringify({mockServices:[{pluginId:'sample.catalog',service:'lookup',version:'1.2.0',returns:{find:{title:'fixture'}}}]}))
      await writeFile(join(cwd,'tests/services.json'),JSON.stringify([{action:'lookup',granted:true,expect:{title:'fixture'}},{action:'lookup',granted:false,error:'Permission denied: services.consume'}]))
      assert.match(npm(['exec','--offline','--','ceru-plugin','test-services'],cwd),/2 service scenarios passed/)
      console.log('PASS packaged CLI: service action uses configured JSON fixture and denies missing grant')
    }
    console.log(
      'PASS portable ' +
        template +
        ' ' +
        language +
        ': independent install, build and artifact validation',
    )
  }
  console.log('PASS ' + matrix.length + ' independently installed template/language combinations')
} finally {
  const actual = await realpath(scratch)
  if (
    dirname(actual) !== temp ||
    !basename(actual).startsWith('ceru-devkit-') ||
    actual !== resolve(scratch)
  )
    throw Error('Unexpected temporary directory')
  await rm(actual, { recursive: true, force: true, maxRetries: 3 })
}
