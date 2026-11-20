import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {buildProject,scaffoldProject} from '../packages/cli/dist/project.js'
import {readArtifact} from '../packages/issuer/dist/index.js'
import {createWebSurfaceDocument} from '../packages/core/dist/surface-document.js'
import {buildComponent} from '../packages/cli/dist/component.js'
import * as vue from 'vue'
import {renderToString} from 'vue/server-renderer'

for (const language of ['js','ts']) test(`ordinary ${language} Vue scripts retain their template and setup state`,async () => {
  const root=await mkdtemp(join(process.cwd(),'.test-tmp-'))
  try {
    const entry=join(root,'Options.vue')
    await writeFile(entry,`<script${language === 'ts' ? ' lang="ts"' : ''}>
import {defineComponent} from 'vue'
const render${language === 'ts' ? ': string' : ''} = 'track'
export const onEnter = () => 'enter'
export default defineComponent({props:{title:String},setup(){return {prefix:render}},computed:{caption(){return this.prefix+':'+this.title}}})
</script><template><p>{{ caption }}</p></template><style scoped>p{color:inherit}</style>`)
    const built=await buildComponent(root,entry,'OptionsSurface',{})
    const {default:factory}=await import('data:text/javascript;base64,'+Buffer.from('export default '+built).toString('base64'))
    let component
    const surface=factory({vue,sdk:{mountComponent:value=>{component=value}}})
    surface({root:{ownerDocument:{createElement:()=>({})},append(){}},onDispose(){}})
    assert.equal(surface.onEnter(),'enter')
    for (const title of ['first','second']) assert.match(await renderToString(vue.createSSRApp(component,{title})),new RegExp(`<p data-v-[a-z0-9]+>track:${title}</p>`))
  } finally { await rm(root,{recursive:true,force:true,maxRetries:3}) }
})

test('watch only reuses unchanged standalone SFCs, not imported views or CSS assets',async () => {
  const root=await mkdtemp(join(process.cwd(),'.test-tmp-'))
  const entry=join(root,'View.vue'), child=join(root,'Child.vue'), css=join(root,'palette.css')
  const cache=new Map(), compile=() => buildComponent(root,entry,'ViewSurface',{},cache)
  try {
    const view=text => `<template><main>${text}</main></template><style scoped>main{padding:1px}</style>`
    await writeFile(entry,view('initial'))
    const initial=await compile(), accepted=cache.get(entry)
    assert.ok(accepted)
    assert.equal(await compile(),initial)
    assert.equal(cache.get(entry),accepted)
    await writeFile(entry,view('updated'))
    const updated=await compile()
    const {default:factory}=await import('data:text/javascript;base64,'+Buffer.from('export default '+updated).toString('base64'))
    const html=await factory({vue,sdk:{mountComponent:component=>renderToString(vue.createSSRApp(component))}})({root:{ownerDocument:{createElement:()=>({})},append(){}},onDispose(){}})
    assert.match(html,/<main[^>]*>updated<\/main>/)
    await writeFile(entry,'<script setup>import Child from "./Child.vue"</script><template><Child /></template>')
    await writeFile(child,view('child-one'))
    assert.match(await compile(),/child-one/)
    assert.equal(cache.size,0)
    await writeFile(child,view('child-two'))
    assert.match(await compile(),/child-two/)
    await writeFile(entry,'<template><main /></template><style>@import "./palette.css";</style>')
    await writeFile(css,'main{color:blue}')
    assert.match(await compile(),/color: blue/)
    assert.equal(cache.size,0)
    await writeFile(css,'main{color:orange}')
    assert.match(await compile(),/color: orange/)
  } finally { await rm(root,{recursive:true,force:true,maxRetries:3}) }
})
test('the page extension builds JS and TS SFCs as self-contained factories with injected dependencies',async () => {
  for(const language of ['js','ts']) {
    const dir=await mkdtemp(join(process.cwd(),'.test-tmp-'))
    try {
      await scaffoldProject(dir,{template:'page-extension',language})
      const result=await buildProject(dir,{development:true})
      const artifact=readArtifact(await readFile(result.path))
      const slot = 'playlist.header.actions'
      const button = await createWebSurfaceDocument(artifact, 'button', 'session', { slot }, slot)
      assert.match(button.componentSource, /^export default \(/)
      assert.ok(button.componentSource.includes('mountComponent'))
      assert.deepEqual(button.init.mount, { kind: 'slot', slot, props: { slot } })
      assert.equal(button.init.viewKind, 'component')
      assert.deepEqual(button.init.catalog.assets, {})
      assert.ok(button.init.catalog.icons.search)
      const page = await createWebSurfaceDocument(artifact, 'search', 'page', { source: 'test' })
      assert.deepEqual(page.init.mount, { kind: 'page', props: { source: 'test' } })
      await assert.rejects(createWebSurfaceDocument(artifact, 'search', 'bad', {}, slot), /Undeclared component slot/)
      const source=artifact.modules['view.search']
      assert.ok(source.length<20000,'should not bundle Vue or TDesign')
      assert.match(source,/__ceruDeps/)
      const {default:factory}=await import('data:text/javascript;base64,'+Buffer.from(result.devModules['view.search']).toString('base64'))
      const styles=[],bridge={root:{ownerDocument:{createElement:()=>({})},append:style=>styles.push(style)},onDispose(){}}
      const mounted=[]
      const view=factory({vue:{defineComponent:value=>value},tdesign:{},sdk:{mountComponent:(component,host)=>mounted.push({component,host})}})
      view(bridge);assert.equal(mounted[0].host,bridge);assert.ok(mounted[0].component.setup);assert.ok(styles[0].textContent.includes('padding'))
      const {default:releaseFactory}=await import('data:text/javascript;base64,'+Buffer.from('export default '+source).toString('base64'))
      const marker=name=>vue.defineComponent({inheritAttrs:false,setup:()=>()=>vue.h('span',{'data-injected':name})})
      const state=vue.ref({items:[],searched:false})
      const render=releaseFactory({vue,tdesign:{Button:marker('button'),Input:marker('input')},sdk:{
        useAction:()=>()=>{},useViewState:()=>state,
        useHostComponents:()=>({PageHeader:marker('header'),EmptyState:marker('empty'),SongList:marker('songs')}),
        mountComponent:component=>renderToString(vue.createSSRApp(component)),
      }})
      const injected=async()=>Array.from((await render(bridge)).matchAll(/data-injected="([a-z]+)"/g),match=>match[1])
      assert.deepEqual(await injected(),['header','input','button','empty'])
      state.value={items:[{key:'demo',title:'Example'}],searched:true}
      assert.deepEqual(await injected(),['header','input','button','songs'])
    }finally{await rm(dir,{recursive:true,force:true,maxRetries:3})}
  }
})
