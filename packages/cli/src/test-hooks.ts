import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { NodePluginSandbox } from '@shiqianjiang/ceru-plugin-core/node'
import {
  OperationBus,
  OperationEngine,
  ACCOUNT_OPERATIONS,
  WINDOW_OPERATIONS, windowCloseInput,
  LYRIC_OPERATIONS, lyricInput, lyricResult, isLyricOperation,
  DOWNLOAD_OPERATIONS, downloadInput, isDownloadOperation,
  SHARING_OPERATIONS, shareInput, shareResult,
  SYSTEM_OPERATIONS, systemInput, isSystemOperation,
  RESOLVE_OPERATIONS, resolveInput,
  LIBRARY_OPERATIONS, libraryInput, isLibraryOperation,
  accountSwitchInput,
  SEARCH_OPERATIONS,
  searchInput, isSearchOperation,
  isPlaybackOperation,
  playbackInput,
} from '@shiqianjiang/ceru-plugin-core/operations'
import { parseJsonStrict } from '@shiqianjiang/ceru-plugin-issuer'
import { buildProject } from './project.js'
import type { OperationSource } from '@shiqianjiang/ceru-plugin-sdk'
import { operationEventPermission } from '@shiqianjiang/ceru-plugin-sdk'

function scenarioSource(value: unknown): OperationSource {
  if (value === undefined) return { kind: 'ui', location: 'scaffold-test' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid hook source')
  const source = value as Record<string, unknown>
  if (source.kind === 'ui' || source.kind === 'system') {
    if (Object.keys(source).every(key => key === 'kind' || key === 'location') &&
        (source.location === undefined || typeof source.location === 'string'))
      return { kind: source.kind, ...(source.location === undefined ? {} : { location: source.location }) }
  } else if (source.kind === 'plugin' && typeof source.pluginId === 'string' &&
      /^[a-z0-9][a-z0-9._-]{2,127}$/.test(source.pluginId) && (source.runtime === 2 || source.runtime === 3) &&
      Object.keys(source).every(key => ['kind', 'pluginId', 'runtime'].includes(key))) {
    return { kind: 'plugin', pluginId: source.pluginId, runtime: source.runtime }
  }
  throw Error('Invalid hook source')
}

export async function testHooks(
  project: string,
  fixture = 'tests/hooks.json',
  report: (text: string) => void = console.log,
) {
  const path = resolve(project, fixture)
  if ((await stat(path)).size > 1024 * 1024) throw Error('Hook fixture must be at most 1 MiB')
  const cases = parseJsonStrict(await readFile(path, 'utf8'))
  if (!Array.isArray(cases) || !cases.length || cases.length > 100)
    throw Error('Expected 1–100 hook scenarios')
  const built = await buildProject(project),
    { artifact } = readPluginArtifact(await readFile(built.path))
  const manifest = artifact.header.manifest
  for (const [index, row] of cases.entries()) {
    const label = typeof row?.name === 'string' ? row.name : 'case ' + (index + 1)
    try {
      if (
        (!isPlaybackOperation(row.operation) && !isSystemOperation(row.operation) && row.operation !== 'share.create' && !isDownloadOperation(row.operation) && !isLyricOperation(row.operation) && row.operation !== 'window.close' && row.operation !== 'player.resolve' && row.operation !== 'account.switch' && !isLibraryOperation(row.operation) && !isSearchOperation(row.operation)) ||
        typeof row.granted !== 'boolean' ||
        !row.expect ||
        typeof row.expect.prevented !== 'boolean'
      )
        throw Error('Expected operation, granted and expect.prevented')
      const name = row.operation,
        parse = (value:unknown)=>isSystemOperation(name)?systemInput(name,value):name==='share.create'?shareInput(name,value):isDownloadOperation(name)?downloadInput(name,value):isLyricOperation(name)?lyricInput(name,value):name==='window.close'?windowCloseInput(name,value):name==='player.resolve'?resolveInput(name,value):name==='account.switch'?accountSwitchInput(name,value):isLibraryOperation(name)?libraryInput(name,value):isSearchOperation(name)?searchInput(name,value):playbackInput(name,value),
        input = parse(row.input),
        source = scenarioSource(row.source)
      if (!row.expect.prevented && !Object.hasOwn(row.expect, 'input'))
        throw Error('Expected default input when not prevented')
      if (row.expect.prevented && Object.hasOwn(row.expect, 'input'))
        throw Error('Prevented scenarios cannot expect a default input')
      const warnings: string[] = []
      const bus = new OperationBus(
        () => {},
        (id, op) => warnings.push(id + ': ' + op),
      )
      const accounts=new OperationEngine(ACCOUNT_OPERATIONS,accountSwitchInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const windows=new OperationEngine(WINDOW_OPERATIONS,windowCloseInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const lyrics=new OperationEngine(LYRIC_OPERATIONS,lyricInput,()=>{},(id,op)=>warnings.push(id+': '+op),undefined,undefined,undefined,lyricResult)
      const downloads=new OperationEngine(DOWNLOAD_OPERATIONS,downloadInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const sharing=new OperationEngine(SHARING_OPERATIONS,shareInput,()=>{},(id,op)=>warnings.push(id+': '+op),undefined,undefined,undefined,shareResult)
      const system=new OperationEngine(SYSTEM_OPERATIONS,systemInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const resolves=new OperationEngine(RESOLVE_OPERATIONS,resolveInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const library=new OperationEngine(LIBRARY_OPERATIONS,libraryInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const searches=new OperationEngine(SEARCH_OPERATIONS,searchInput,()=>{},(id,op)=>warnings.push(id+': '+op))
      const declares=(permission:string)=>manifest.uses?.permissions?.some(item=>item.name===permission)===true
      const operationPermission=(operation:string)=>isSystemOperation(operation)?SYSTEM_OPERATIONS[operation].intercept:operation==='share.create'?'sharing.intercept':isDownloadOperation(operation)?'downloads.intercept':isLyricOperation(operation)?'lyrics.intercept':operation==='window.close'?'window.intercept':operation==='account.switch'?'account.intercept':isLibraryOperation(operation)?'library.intercept':isSearchOperation(operation)?'search.intercept':'player.intercept'
      const permission=operationPermission(name)
      const worker: NodePluginSandbox = new NodePluginSandbox(
        async (method, data) => {
          if (method === 'events.register') {
            const done = typeof data.name === 'string' && data.name.endsWith(':done')
            const name = done ? data.name.slice(0, -5) : data.name
            const required = operationEventPermission(data.name)
            if (!required || !declares(required)) throw Error('Undeclared event permission')
            const selected = isSystemOperation(name) ? systemOwner : name === 'share.create' ? sharingOwner : isDownloadOperation(name) ? downloadOwner : isLyricOperation(name) ? lyricOwner : name === 'window.close' ? windowOwner : name === 'account.switch' ? accountOwner : name === 'player.resolve' ? resolveOwner : isLibraryOperation(name) ? libraryOwner : isSearchOperation(name) ? searchOwner : owner
            selected.registerEvent(name as never, done, data.active)
            return null
          }
          if (method === 'hooks.register' && declares(operationPermission(data.name))) {
            if (isSystemOperation(data.name)) systemOwner.register(data.name,data.priority)
            else if (data.name==='share.create') sharingOwner.register(data.name,data.priority)
            else if (isDownloadOperation(data.name)) downloadOwner.register(data.name,data.priority)
            else if (isLyricOperation(data.name)) lyricOwner.register(data.name,data.priority)
            else if (data.name==='window.close') windowOwner.register(data.name,data.priority)
            else if (data.name==='account.switch') accountOwner.register(data.name,data.priority)
            else if (data.name==='player.resolve') resolveOwner.register(data.name,data.priority)
            else if (isLibraryOperation(data.name)) libraryOwner.register(data.name,data.priority)
            else if (isSearchOperation(data.name)) searchOwner.register(data.name,data.priority)
            else owner.register(data.name, data.priority)
            return null
          }
          if (method === 'hooks.accountNext' && declares('account.intercept') && row.granted) return accountOwner.next(data.token,data.input)
          if (method === 'hooks.windowNext' && declares('window.intercept') && row.granted) return windowOwner.next(data.token,data.input)
          if (method === 'hooks.lyricsNext' && declares('lyrics.intercept') && row.granted) return lyricOwner.next(data.token,data.input)
          if (method === 'hooks.downloadsNext' && declares('downloads.intercept') && row.granted) return downloadOwner.next(data.token,data.input)
          if (method === 'hooks.sharingNext' && declares('sharing.intercept') && row.granted) return sharingOwner.next(data.token,data.input)
          if (method === 'hooks.linksNext' && declares('links.intercept') && row.granted) return systemOwner.next(data.token,data.input)
          if (method === 'hooks.notificationsNext' && declares('notifications.intercept') && row.granted) return systemOwner.next(data.token,data.input)
          if (method === 'hooks.resolveNext' && declares('player.intercept') && row.granted) return resolveOwner.next(data.token,data.input)
          if (method === 'hooks.libraryNext' && declares('library.intercept') && row.granted) return libraryOwner.next(data.token,data.input)
          if (method === 'hooks.searchNext' && declares('search.intercept') && row.granted) return searchOwner.next(data.token,data.input)
          if (method === 'hooks.next' && declares('player.intercept') && row.granted)
            return owner.next(data.token, data.input)
          if (method === 'config.get') return manifest.config ?? {}
          if (method === 'permissions.query')
            return {
              status: manifest.uses?.permissions?.some(
                (p) => p.key === data.key && p.name === permission,
              )
                ? row.granted
                  ? 'granted'
                  : 'denied'
                : 'undeclared',
            }
          throw Error('Unsupported hook test RPC: ' + method)
        },
        () => {},
      )
      const events = {
        granted: (name: string, done: boolean) => {
          const required = operationEventPermission(name + (done ? ':done' : ''))
          return !!required && declares(required) && row.granted
        },
        invoke: (name: string, done: boolean, payload: unknown, signal: AbortSignal) => worker.invoke('operation-event', name + (done ? ':done' : ''), '', [payload], signal),
      }
      const owner = bus.connect(
        manifest.id,
        () => declares('player.intercept') && row.granted,
        (op, token, value, source, signal) =>
          worker.invoke('operation-hook', op, '', [token, value, source], signal), events,
      )
      const accountOwner=accounts.connect(manifest.id,()=>declares('account.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const windowOwner=windows.connect(manifest.id,()=>declares('window.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const lyricOwner=lyrics.connect(manifest.id,()=>declares('lyrics.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const downloadOwner=downloads.connect(manifest.id,()=>declares('downloads.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const sharingOwner=sharing.connect(manifest.id,()=>declares('sharing.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const systemOwner=system.connect(manifest.id,()=>declares(permission) && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const resolveOwner=resolves.connect(manifest.id,()=>declares('player.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const searchOwner=searches.connect(manifest.id,()=>declares('search.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      const libraryOwner=library.connect(manifest.id,()=>declares('library.intercept') && row.granted,
        (op,token,value,source,signal)=>worker.invoke('operation-hook',op,'',[token,value,source],signal), events)
      try {
        await worker.start(artifact)
        owner.attach()
        resolveOwner.attach()
        accountOwner.attach()
        windowOwner.attach()
        lyricOwner.attach()
        downloadOwner.attach()
        sharingOwner.attach()
        systemOwner.attach()
        searchOwner.attach()
        libraryOwner.attach()
        const defaults: unknown[] = []
        const localDefault=async(value:unknown)=>{
          defaults.push(value)
          if(name==='share.create')return shareResult(name,row.defaultResult)
          if(isLyricOperation(name)) return lyricResult(name,row.defaultResult,input as import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['lyrics.load'])
          if (name==='player.resolve') {
            const ok=row.resolveResults?.[defaults.length-1]
            if (typeof ok!=='boolean') throw Error('Expected a boolean resolveResults entry for each attempt')
            return {ok}
          }
        }
        const outcome=isSystemOperation(name)?await system.run(name,input,source,localDefault as Parameters<typeof system.run>[3]):name==='share.create'?await sharing.run(name,input,source,localDefault as Parameters<typeof sharing.run>[3]):isDownloadOperation(name)?await downloads.run(name,input,source,localDefault as Parameters<typeof downloads.run>[3]):isLyricOperation(name)?await lyrics.run(name,input,source,localDefault as Parameters<typeof lyrics.run>[3]):name==='window.close'?await windows.run(name,input,source,localDefault as Parameters<typeof windows.run>[3]):name==='player.resolve'?await resolves.run(name,input,source,localDefault as Parameters<typeof resolves.run>[3]):name==='account.switch'?await accounts.run(name,input,source,localDefault as Parameters<typeof accounts.run>[3]):isLibraryOperation(name)?await library.run(name,input,source,localDefault as Parameters<typeof library.run>[3]):isSearchOperation(name)?await searches.run(name,input,source,localDefault as Parameters<typeof searches.run>[3]):await bus.run(name,input,source,localDefault as Parameters<typeof bus.run>[3])
        assert.deepEqual(warnings, [], 'Hook timed out or threw an error')
        assert.equal(outcome.prevented, row.expect.prevented)
        assert.deepEqual(
          defaults,
          row.expect.prevented || row.expect.defaultCalled===false ? [] : name==='player.resolve' && defaults.length===2 ? [input,parse(row.expect.input)] : [parse(row.expect.input)],
        )
        if(isLyricOperation(name)) assert.deepEqual(outcome.result,lyricResult(name,row.expect.result,input as import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['lyrics.load']))
        if(name==='share.create')assert.deepEqual(outcome.result,shareResult(name,row.expect.result))
        if(name==='player.resolve') assert.equal(defaults.length,row.resolveResults.length,'Unexpected resolve attempt count')
        report('PASS ' + label)
      } finally {
        owner.dispose()
        resolveOwner.dispose()
        accountOwner.dispose()
        windowOwner.dispose()
        lyricOwner.dispose()
        downloadOwner.dispose()
        sharingOwner.dispose()
        systemOwner.dispose()
        searchOwner.dispose()
        libraryOwner.dispose()
        worker.dispose()
      }
    } catch (error) {
      throw Error(
        'Hook scenario “' +
          label +
          '” failed: ' +
          (error instanceof Error ? error.message : String(error)),
      )
    }
  }
  report(cases.length + ' hook scenarios passed (local mock; no desktop or real playback).')
}
