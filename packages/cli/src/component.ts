import {build} from 'esbuild'
import {parse} from 'acorn'
import {readFile} from 'node:fs/promises'
import {vuePlugin,stylesheetPlugin} from './frameworks.js'
import {assertBundledDependencies} from './dependencies.js'
const deps = new Map([['vue','vue'],['tdesign-vue-next','tdesign'],['@shiqianjiang/ceru-plugin-sdk/vue','sdk'],['@shiqianjiang/ceru-plugin-sdk/vue/region','sdk']])
export type WatchComponentCache = Map<string,{ source:string; name:string; factory:string }>
export async function buildComponent(root:string,entry:string,name:string,define:Record<string,string>, cache?: WatchComponentCache) {
  const cached = cache?.get(entry)
  if (cached && cached.name === name && cached.source === await readFile(entry,'utf8')) return cached.factory
  cache?.delete(entry)
  let standalone = entry.endsWith('.vue')
  let source: string | undefined
  const styles = new Set<string>()
  const track = cache ? { dependency: () => { standalone = false }, source: (file:string, text:string) => { if (file === entry) source = text } } : undefined
  const result=await build({absWorkingDir:root,entryPoints:[entry],outfile:'component.js',format:'esm',platform:'browser',bundle:true,write:false,metafile:!!cache,external:[...deps.keys()],define,target:'es2022',legalComments:'none',plugins:[vuePlugin(root,'vue',styles,track),stylesheetPlugin(styles)],loader:{'.png':'dataurl','.svg':'dataurl','.webp':'dataurl','.woff2':'dataurl'}})
  if(result.outputFiles.length!==1) throw Error('Component must build to a single module')
  const text=result.outputFiles[0].text
  const tree=parse(text,{ecmaVersion:'latest',sourceType:'module'}) as any
  const declarations:string[]=[]
  let exported:string|undefined
  const hooks:string[]=[]
  const body = tree.body.flatMap((statement:any) => {
    if(statement.type==='ImportDeclaration') {
      const key=deps.get(statement.source.value)
      if(!key) throw Error('Unexpected external component dependency: '+statement.source.value)
      for(const specifier of statement.specifiers) {
        const target='__ceruDeps.'+key
        const value=specifier.type==='ImportNamespaceSpecifier' ? target : specifier.type==='ImportDefaultSpecifier' ? target+'.default' : target+'['+JSON.stringify(specifier.imported.name ?? specifier.imported.value)+']'
        declarations.push('const '+specifier.local.name+' = '+value+';')
      }
      return []
    }
    if(statement.type==='ExportNamedDeclaration' && !statement.source && !statement.declaration) {
      for(const specifier of statement.specifiers) {
        if(specifier.exported.name==='default') exported=specifier.local.name
        else if(['onEnter','onLeave'].includes(specifier.exported.name)) hooks.push(specifier.exported.name+':'+specifier.local.name)
      }
      return []
    }
    if(statement.type.startsWith('Export')) throw Error('Component must have one default export')
    return [text.slice(statement.start,statement.end)]
  })
  if(!exported) throw Error('Missing default component export')
  const style=[...styles].join('\n')
  const mount = entry.endsWith('.vue') ? '__ceruDeps.sdk.mountComponent('+exported+',bridge)' : 'typeof '+exported+' === "function" ? '+exported+'(bridge) : __ceruDeps.sdk.mountComponent('+exported+',bridge)'
  const entryFunction='function(bridge){'+(style ? 'const style=bridge.root.ownerDocument.createElement("style");style.textContent='+JSON.stringify(style)+';bridge.root.append(style);bridge.onDispose(()=>style.remove());' : '')+'return '+mount+';}'
  const factory='function '+name+'(__ceruDeps){\n'+declarations.join('\n')+'\n'+body.join('\n')+'\nreturn '+(hooks.length?'Object.assign('+entryFunction+',{'+hooks.join(',')+'})':entryFunction)+';}'
  assertBundledDependencies('('+factory+')')
  if (standalone && source !== undefined && result.metafile && Object.keys(result.metafile.inputs).length === 1) cache?.set(entry,{source,name,factory})
  return factory
}
