import type {
  HookPriority,
  LibraryOperationName,
  OperationInputs,
  OperationSource,
  OperationTrack,
  PlaybackOperationName,
  SearchOperationName,
  ResolveStatus,
  LyricOperationName,
  OperationLyric,
} from '@shiqianjiang/ceru-plugin-sdk'
import { assertLyricsDocument } from '@shiqianjiang/ceru-plugin-sdk'
export { DOWNLOAD_OPERATIONS, downloadInput, isDownloadOperation } from './download-operations.js'
export { SYSTEM_OPERATIONS, systemInput, isSystemOperation } from './system-operations.js'
export const SHARING_OPERATIONS = {'share.create':{intercept:'sharing.intercept',cancelable:true,hookTimeoutMs:3000,defaultIn:'renderer',announce:true}} as const
export function shareInput(_name:'share.create',value:unknown,original?:OperationInputs['share.create']):OperationInputs['share.create'] {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('track' in value))throw Error('Invalid share input')
  const input=resolveInput('player.resolve',{track:value.track,quality:''},original?{...original,quality:''}:undefined)
  return {track:input.track}
}
export function shareResult(_name:'share.create',value:unknown):import('@shiqianjiang/ceru-plugin-sdk').ShareOperationResult|null {
  if(value===null)return null
  if(!value||typeof value!=='object'||Array.isArray(value)||!('url' in value)||!('id' in value)||typeof value.url!=='string'||value.url.length>8192||typeof value.id!=='string'||!value.id||value.id.length>4096||Object.keys(value).some(key=>!['url','id','template'].includes(key)))throw Error('Invalid share result')
  const url=new URL(value.url)
  if(!['https:','http:','cerumusic:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid share link')
  if('template' in value && (typeof value.template!=='string'||value.template.length>16384))throw Error('Invalid share text')
  return {id:value.id,url:url.href,...('template' in value?{template:value.template as string}:{})}
}
export function isLyricOperation(name:unknown): name is LyricOperationName {
  return name==='lyrics.load' || name==='lyrics.transform'
}

const lyricOperation = {intercept:'lyrics.intercept',cancelable:false,hookTimeoutMs:3000,defaultIn:'main',announce:false} as const
export const LYRIC_OPERATIONS = {'lyrics.load':lyricOperation,'lyrics.transform':lyricOperation} as const
export type LyricInput = OperationInputs[LyricOperationName]
/** Only the public identity and lyric fields cross the hook boundary. */
export function lyricResult(_name:LyricOperationName,value:unknown,input:LyricInput):OperationLyric | null {
  if(value===null) return null
  if(!value || typeof value!=='object' || !('track' in value) || !value.track || typeof value.track!=='object' ||
      Object.keys(value.track).length!==3 || !Object.entries(input.track.ref).every(([key,expected])=>Reflect.get(value.track as object,key)===expected)) throw Error('Cannot replace lyric track')
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength > 1024 * 1024) throw Error('Lyrics exceed 1 MiB')
  const document={...value,track:{...input.track.ref,scope:'provider'}}
  assertLyricsDocument(document)
  const words = (items:NonNullable<OperationLyric['lines'][number]['words']>) => items.map(({startTimeMs,endTimeMs,text,translation,romanization})=>({startTimeMs,endTimeMs,text,...(translation===undefined?{}:{translation}),...(romanization===undefined?{}:{romanization})}))
  const sublines = (items:NonNullable<OperationLyric['lines'][number]['translations']>) => items.map(({text,language,words:timing})=>({text,...(language===undefined?{}:{language}),...(timing===undefined?{}:{words:words(timing)})}))
  return {format:'crlyric',version:1,track:{...input.track.ref},offsetMs:document.offsetMs,
    ...(document.plainText===undefined?{}:{plainText:document.plainText}),
    lines:document.lines.map(({startTimeMs,endTimeMs,text,translation,romanization,translations,romanizations,words:timing,isBackground,isDuet})=>({startTimeMs,text,...(endTimeMs===undefined?{}:{endTimeMs}),...(translation===undefined?{}:{translation}),...(romanization===undefined?{}:{romanization}),...(translations===undefined?{}:{translations:sublines(translations)}),...(romanizations===undefined?{}:{romanizations:sublines(romanizations)}),...(timing===undefined?{}:{words:words(timing)}),...(typeof isBackground==='boolean'?{isBackground}:{}),...(typeof isDuet==='boolean'?{isDuet}:{})}))}
}
export function lyricInput(name:LyricOperationName,value:unknown,original?:LyricInput):LyricInput {
  const packet=value as LyricInput
  if(!packet || typeof packet!=='object' || Object.keys(packet).some(key=>key!=='track' && !(name==='lyrics.transform' && key==='lyric'))) throw Error('Invalid lyric input')
  const selected=track(packet.track)
  if(original && JSON.stringify(selected)!==JSON.stringify(original.track)) throw Error('Cannot replace lyric track')
  const input={track:selected}
  return name==='lyrics.transform'?{...input,lyric:lyricResult(name,(packet as OperationInputs['lyrics.transform']).lyric,input)}:input
}

const playerOperation = {
  intercept: 'player.intercept', observe: 'player.read', cancelable: true,
  hookTimeoutMs: 800, defaultIn: 'renderer', announce: true,
} as const
export const WINDOW_OPERATIONS = {'window.close':{intercept:'window.intercept',cancelable:true,hookTimeoutMs:800,defaultIn:'renderer',announce:true}} as const
export function windowCloseInput(_name:'window.close', value:unknown):OperationInputs['window.close'] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw Error('Expected empty window close input')
  return {}
}
export const PLAYBACK_OPERATIONS = {
  'player.play': playerOperation,
  'queue.add': playerOperation,
  'queue.remove': playerOperation,
  'queue.clear': playerOperation,
  'queue.shuffle': { ...playerOperation, cancelable: false, announce: false },
  'player.pause': playerOperation,
  'player.resume': playerOperation,
  'player.previous': playerOperation,
  'player.next': playerOperation,
  'player.error': { ...playerOperation, announce: false },
  'player.queueEnded': { ...playerOperation, announce: false },
  'player.setMode': playerOperation,
  'player.seek': { ...playerOperation, cancelable: false },
  'player.setVolume': { ...playerOperation, cancelable: false },
} satisfies Record<PlaybackOperationName, Omit<typeof playerOperation, 'cancelable' | 'announce'> & { cancelable: boolean; announce: boolean }>
export type PlaybackInput = OperationInputs[PlaybackOperationName]
export const RESOLVE_OPERATIONS = {'player.resolve':{...playerOperation,cancelable:false,defaultIn:'main',announce:false}} as const
export function resolveInput(_name:'player.resolve',value:unknown,original?:OperationInputs['player.resolve']):OperationInputs['player.resolve'] {
  const packet=value as OperationInputs['player.resolve']
  if (!packet || Object.keys(packet).some(key=>key!=='track' && key!=='quality') || typeof packet.quality!=='string' || !/^[\w.-]{0,64}$/.test(packet.quality)) throw Error('Invalid resolve quality')
  const selected=track(packet.track)
  const ref=packet.track.ref
  if ('connectionId' in ref || 'data' in ref || ('pluginId' in ref && (!('scope' in ref) || ref.scope!=='provider'))) throw Error('Cannot substitute a private resource')
  if (selected.ref.providerId==='local' || (selected.ref.providerId==='private' && original && (original.track.ref.providerId!=='private' || selected.ref.id!==original.track.ref.id))) throw Error('Invalid resolve track handle')
  return {track:selected,quality:packet.quality}
}
const libraryOperation = {intercept:'library.intercept',cancelable:true,hookTimeoutMs:3000,defaultIn:'renderer',announce:true} as const
export const LIBRARY_OPERATIONS = {'track.like':{...libraryOperation,hookTimeoutMs:800},'playlist.create':libraryOperation,'playlist.delete':libraryOperation,'playlist.addTracks':libraryOperation,'playlist.removeTracks':libraryOperation,'playlist.export':libraryOperation,'playlist.import':libraryOperation} satisfies Record<LibraryOperationName, Omit<typeof libraryOperation,'hookTimeoutMs'> & {hookTimeoutMs:number}>
export function isLibraryOperation(name:unknown): name is LibraryOperationName {
  return typeof name==='string' && Object.hasOwn(LIBRARY_OPERATIONS,name)
}
export function libraryInput(name:LibraryOperationName,value:unknown,original?:OperationInputs[LibraryOperationName]):OperationInputs[LibraryOperationName] {
  if (name==='track.like') return likeInput(name,value,original && 'liked' in original ? original : undefined)
  if (name === 'playlist.import') {
    const input = value as OperationInputs['playlist.import']
    if (!input || typeof input.value !== 'string' || !input.value.trim() || input.value.length > 4096 ||
        /^(?:file:|[a-z]:[\\/]|[\\/])/i.test(input.value.trim()) ||
        Object.keys(input).some(key => key !== 'value' && key !== 'importerId') ||
        (input.importerId !== undefined && (typeof input.importerId !== 'string' || !/^[\w.-]{1,128}:[\w.-]{1,128}$/.test(input.importerId)))) throw Error('Invalid playlist import')
    return {value:input.value.trim(), ...(input.importerId === undefined ? {} : {importerId:input.importerId})}
  }
  if (name==='playlist.create') {
    const input=value as OperationInputs['playlist.create']
    if (!input || typeof input.name!=='string' || !input.name.trim() || input.name.length>512 || !['local','cloud'].includes(input.location) || Object.keys(input).some(key=>key!=='name' && key!=='location')) throw Error('Invalid playlist creation')
    if (original && 'location' in original && original.location!==input.location) throw Error('Cannot redirect playlist creation')
    return {name:input.name,location:input.location}
  }
  const input=value as OperationInputs['playlist.addTracks']
  const playlist=input?.playlist
  if (!playlist || Object.keys(playlist).some(key=>!['id','name','location'].includes(key)) || typeof playlist.id!=='string' || !playlist.id.trim() || playlist.id.length>256 || typeof playlist.name!=='string' || !playlist.name.trim() || playlist.name.length>512 || !['local','cloud','both'].includes(playlist.location)) throw Error('Invalid playlist')
  if (original && 'playlist' in original && (original.playlist.id!==playlist.id || original.playlist.name!==playlist.name || original.playlist.location!==playlist.location)) throw Error('Cannot redirect playlist operation')
  const target = {playlist:{id:playlist.id,name:playlist.name,location:playlist.location}}
  if (name === 'playlist.export') {
    const packet = value as OperationInputs['playlist.export']
    if (Object.keys(packet).length !== 2 || !Object.hasOwn(packet,'playlist') || !Object.hasOwn(packet,'format') || (packet.format !== 'cmpl' && packet.format !== 'cpl')) throw Error('Invalid playlist export')
    return {...target, format:packet.format}
  }
  if (name === 'playlist.delete') {
    if (Object.keys(input).length !== 1 || !Object.hasOwn(input,'playlist')) throw Error('Invalid playlist deletion')
    return target
  }
  if (Object.keys(input).length !== 2 || !Object.hasOwn(input,'playlist') || !Object.hasOwn(input,'tracks') || !Array.isArray(input.tracks) || input.tracks.length > 1000) throw Error('Invalid playlist tracks')
  const keyOf = (item: OperationTrack) => JSON.stringify([item.ref.providerId, item.ref.id])
  const allowed = original && 'tracks' in original ? new Map(original.tracks.map(item => [keyOf(item), item])) : undefined
  const seen = new Set<string>()
  const tracks = Array.from(input.tracks, item => {
    const projected = track(item)
    if (projected.ref.providerId === 'local' || !/^[\w.-]{1,256}$/.test(projected.ref.id)) throw Error('Expected a public track reference or private handle')
    const key = keyOf(projected)
    if (seen.has(key) || (allowed && !allowed.has(key))) throw Error('Track outside original playlist selection or repeated')
    seen.add(key)
    return allowed?.get(key) ?? projected
  })
  return {...target, tracks}
}
export function likeInput(_name:'track.like',value:unknown,original?:OperationInputs['track.like']):OperationInputs['track.like'] {
  const input=value as OperationInputs['track.like']
  if (!input || typeof input.liked!=='boolean' || Object.keys(input).some(key=>key!=='track' && key!=='liked')) throw Error('Invalid favorite operation')
  const selected=track(input.track)
  if (original && selected.ref.providerId==='private' && (original.track.ref.providerId!=='private' || selected.ref.id!==original.track.ref.id)) throw Error('Invalid private track handle')
  return {track:selected,liked:input.liked}
}
const searchOperation = {intercept:'search.intercept',hookTimeoutMs:800,defaultIn:'renderer',announce:false} as const
export const SEARCH_OPERATIONS = { 'search.query': {...searchOperation,cancelable:true}, 'search.suggest': {...searchOperation,cancelable:false}, 'search.results': {...searchOperation,cancelable:false} } satisfies Record<SearchOperationName,typeof searchOperation & {cancelable:boolean}>
export function isSearchOperation(name:unknown): name is SearchOperationName {
  return typeof name === 'string' && Object.hasOwn(SEARCH_OPERATIONS,name)
}
export function searchInput(name:SearchOperationName,value:unknown,original?:OperationInputs[SearchOperationName]):OperationInputs[SearchOperationName] {
  if (name === 'search.query') return searchQueryInput(name,value,original && 'kinds' in original ? original : undefined)
  if (name === 'search.results') return searchResultsInput(value,original && 'page' in original ? original : undefined)
  const packet = value as OperationInputs['search.suggest']
  if (!packet || typeof packet !== 'object' || Object.keys(packet).length !== 2 ||
      typeof packet.query !== 'string' || !packet.query.trim() || packet.query.length > 4096 ||
      !Array.isArray(packet.items) || packet.items.length > 100 ||
      !Array.from(packet.items).every(item => typeof item === 'string' && item.trim() && item.length <= 512)) throw Error('Invalid search suggestions')
  if (original && packet.query !== original.query) throw Error('Cannot replace the suggestion query')
  return {query:packet.query,items:[...packet.items]}
}
type Results = OperationInputs['search.results']
export function searchResultsInput(value:unknown,original?:Results):Results {
  const packet=value as Results
  const identifier=(entry:unknown,limit:number)=>typeof entry==='string' && entry.length<=limit && /^[\w.-]+$/.test(entry)
  const text=(entry:unknown,limit:number)=>typeof entry==='string' && entry.length<=limit
  if (!packet || !text(packet.query,4096) || !packet.query.trim() || !identifier(packet.sourceId,128) ||
      !['track','playlist'].includes(packet.page?.kind) || !Array.isArray(packet.page.items) || packet.page.items.length>500) throw Error('Invalid search results')
  if (original && (packet.query!==original.query || packet.sourceId!==original.sourceId || packet.page.kind!==original.page.kind)) throw Error('Cannot replace search scope')
  const privateIds = new Set(original?.page.items.filter(item=>item.ref.providerId==='private').map(item=>item.ref.id))
  const items=Array.from(packet.page.items,item=>{
    const ref=item?.ref
    if (!ref || ref.kind!==packet.page.kind || !identifier(ref.providerId,128) || !identifier(ref.id,256) ||
        ref.providerId==='local' || (original && ref.providerId==='private' && !privateIds.has(ref.id)) ||
        !text(item.title,512) || (item.subtitle!==undefined && !text(item.subtitle,512)) ||
        (item.metadata!==undefined && (!Array.isArray(item.metadata?.artists) || item.metadata.artists.length>32 ||
          !Array.from(item.metadata.artists).every(artist=>text(artist,256))))) throw Error('Invalid search result item')
    return {ref:{kind:ref.kind,providerId:ref.providerId,id:ref.id},title:item.title,
      ...(item.subtitle===undefined?{}:{subtitle:item.subtitle}),...(item.metadata?{metadata:{artists:[...item.metadata.artists]}}:{})}
  })
  return {query:packet.query,sourceId:packet.sourceId,page:{kind:packet.page.kind,items}}
}
export function searchQueryInput(_name:'search.query', value:unknown, original?:OperationInputs['search.query']):OperationInputs['search.query'] {
  const packet = value as OperationInputs['search.query']
  if (!packet || typeof packet !== 'object' || Object.keys(packet).length !== 3 ||
      typeof packet.query !== 'string' || !packet.query.trim() || packet.query.length > 4096 ||
      typeof packet.sourceId !== 'string' || !/^[\w.-]{1,128}$/.test(packet.sourceId) ||
      !Array.isArray(packet.kinds) || !packet.kinds.length || packet.kinds.length > 32 ||
      !Array.from(packet.kinds).every(kind => typeof kind === 'string' && /^[\w.-]{1,64}$/.test(kind))) throw Error('Invalid search query')
  if (original && (packet.sourceId !== original.sourceId || packet.kinds.length !== original.kinds.length ||
      packet.kinds.some((kind,index) => kind !== original.kinds[index]))) throw Error('Cannot replace the selected search scope')
  return {query:packet.query,sourceId:packet.sourceId,kinds:[...packet.kinds]}
}
export const ACCOUNT_OPERATIONS = { 'account.switch': {intercept:'account.intercept',cancelable:true,hookTimeoutMs:3000,defaultIn:'main',announce:false} } as const
export function accountSwitchInput(_name:'account.switch', value:unknown, original?:OperationInputs['account.switch']):OperationInputs['account.switch'] {
  const packet=value as OperationInputs['account.switch']
  const identifier=(entry:unknown)=>typeof entry==='string' && !!entry && entry.length<=128
  if (!packet || typeof packet!=='object' || Object.keys(packet).length!==4 || !identifier(packet.pluginId) || !identifier(packet.accountId) || !identifier(packet.connectionId) || (packet.fromConnectionId!==null && !identifier(packet.fromConnectionId))) throw Error('Invalid account switch')
  const {pluginId,accountId,fromConnectionId,connectionId}=packet
  if (original && (pluginId!==original.pluginId || accountId!==original.accountId || fromConnectionId!==original.fromConnectionId || connectionId!==original.connectionId)) throw Error('Cannot replace the selected account identity')
  return {pluginId,accountId,fromConnectionId,connectionId}
}
export function isPlaybackOperation(value: unknown): value is PlaybackOperationName {
  return typeof value === 'string' && Object.hasOwn(PLAYBACK_OPERATIONS, value)
}
function track(value: any): OperationTrack {
  const ref = value?.ref
  if (
    ref?.kind !== 'track' ||
    typeof ref.id !== 'string' ||
    !ref.id ||
    ref.id.length > 512 ||
    typeof ref.providerId !== 'string' ||
    !/^[\w.-]{1,128}$/.test(ref.providerId)
  )
    throw Error('Invalid operation track')
  if (
    typeof value.title !== 'string' ||
    value.title.length > 512 ||
    !Array.isArray(value.metadata?.artists) ||
    value.metadata.artists.length > 32 ||
    !value.metadata.artists.every(
      (artist: unknown) => typeof artist === 'string' && artist.length <= 256,
    )
  )
    throw Error('Invalid operation metadata')
  return {
    ref: { kind: 'track', id: ref.id, providerId: ref.providerId },
    title: value.title,
    metadata: { artists: [...value.metadata.artists] },
  }
}
export function playbackInput(name: PlaybackOperationName, value: any): PlaybackInput {
  if (name === 'player.queueEnded') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'tracks')) throw Error('Invalid queue end input')
    if (!Object.hasOwn(value,'tracks')) return {}
    if (!Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > 1000) throw Error('Expected continuation tracks')
    return {tracks:Array.from(value.tracks, item => {
      if (!item || typeof item!=='object' || !('ref' in item) || !item.ref || typeof item.ref!=='object') throw Error('Expected a continuation track')
      const selected = track(item)
      if (['local','private'].includes(selected.ref.providerId) || !/^[\w.-]{1,256}$/.test(selected.ref.id) || Object.keys(item.ref).some(key=>!['kind','providerId','id','scope'].includes(key)) || ('scope' in item.ref && item.ref.scope!=='provider')) throw Error('Expected a public continuation track')
      return selected
    })}
  }
  if (name === 'queue.shuffle') {
    if (!value || Object.keys(value).length !== 1 || !Array.isArray(value.items) || value.items.length > 1000) throw Error('Invalid shuffle items')
    return {items:Array.from(value.items, track)}
  }
  if (name === 'player.error') {
    if (!value || Object.keys(value).some(key => key !== 'error' && key !== 'track') || !['resolve','start','media','playback'].includes(value.error)) throw Error('Invalid playback failure')
    return {track:track(value.track),error:value.error}
  }
  if (name === 'queue.remove' || name === 'queue.clear') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'tracks')) throw Error('Invalid queue removal')
    if (name === 'queue.clear' && !Object.hasOwn(value, 'tracks')) return {}
    if (!Object.hasOwn(value, 'tracks') || !Array.isArray(value.tracks) || value.tracks.length > 1000) throw Error('Expected queue tracks')
    return { tracks: value.tracks.map(track) }
  }
  if (name === 'player.setMode') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'mode') || !['sequence','random','single'].includes(value.mode)) throw Error('Invalid playback mode')
    return { mode: value.mode }
  }
  if (name === 'player.seek' || name === 'player.setVolume') {
    const key = name === 'player.seek' ? 'positionMs' : 'volume'
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, key)) throw Error('Invalid ' + name + ' input')
    const number = value[key]
    if (!Number.isFinite(number) || number < 0 || (key === 'volume' ? number > 1 : !Number.isSafeInteger(number))) throw Error('Invalid ' + name + ' value')
    return name === 'player.seek' ? { positionMs: number } : { volume: number }
  }
  if (name === 'player.next') {
    if (!value || !['user','ended','error'].includes(value.reason) || Object.keys(value).some(key => key !== 'reason' && key !== 'track')) throw Error('Invalid next operation')
    return { reason: value.reason, ...(value.track === undefined ? {} : { track: track(value.track) }) }
  }
  if (name === 'player.pause' || name === 'player.resume' || name === 'player.previous') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) throw Error('Expected empty playback input')
    return {}
  }
  if (name === 'player.play') {
    const index = value?.queueIndex
    if (index !== undefined && (!Number.isSafeInteger(index) || index < 0))
      throw Error('Invalid queue index')
    return { track: track(value?.track), ...(index === undefined ? {} : { queueIndex: index }) }
  }
  if (
    name !== 'queue.add' ||
    !['next', 'end'].includes(value?.position) ||
    !Array.isArray(value.tracks) ||
    !value.tracks.length ||
    value.tracks.length > 1000
  )
    throw Error('Invalid queue operation')
  return { position: value.position, tracks: value.tracks.map(track) }
}
type Priority = HookPriority
type Reply = { input?: unknown; prevented?: boolean; result?: unknown }
type Invoke<Name extends string, Input> = (
  name: Name,
  token: string,
  input: Input,
  source: OperationSource,
  signal: AbortSignal,
) => Promise<Reply>
type Registration = { priority: Priority; failures: number[]; paused: boolean }
const priorities = { early: 0, normal: 1, late: 2 }
type Trace<Name extends string> = { owner: string; name: Name }
export class OperationEngine<Name extends string, Input, Result = null | ResolveStatus> {
  private owners = new Set<ReturnType<OperationEngine<Name,Input,Result>['connect']>>()
  private active = new Map<
    string,
    { owner: object; trace: Trace<Name>[]; next: (input: unknown) => Promise<Result> }
  >()
  private paused = false
  constructor(
    private readonly catalog: Record<Name,{cancelable:boolean;hookTimeoutMs:number}>,
    private readonly parse: (name: Name, value: unknown, original?: Input) => Input,
    private readonly changed: () => void = () => {},
    private readonly warn: (
      owner: string,
      name: Name,
      paused: boolean,
    ) => void = () => {},
    private readonly timeoutMs?: number,
    private readonly suspended: (owner: string, name: Name) => boolean = () =>
      false,
    private readonly report: (
      owner: string,
      name: Name,
      action: 'rewrite' | 'cancel',
      source: OperationSource,
      /** Ephemeral validated snapshots for host-side sanitization; never store these as activity. */
      change?: { target: 'input' | 'result'; before: unknown; after: unknown },
    ) => void = () => {},
    private readonly parseResult?: (name:Name,value:unknown,input:Input) => Result,
  ) {}
  resume(ownerId: string, name: Name) {
    for (const owner of this.owners)
      if (owner.id === ownerId) {
        const row = owner.row(name)
        if (row) {
          row.paused = false
          row.failures = []
        }
        for (const done of [false, true]) {
          const event = owner.eventRow(name, done)
          if (event) { event.paused = false; event.failures = [] }
        }
      }
    this.changed()
  }
  setPaused(paused: boolean) {
    this.paused = paused
    this.changed()
  }
  names() {
    return Object.keys(this.catalog).filter((name) => [...this.owners].some(owner =>
      (!this.paused && (owner.enabled(name as Name) || owner.eventEnabled(name as Name, false))) || owner.eventEnabled(name as Name, true)))
  }
  refresh() {
    this.changed()
  }
  connect(id: string, granted: () => boolean, invoke: Invoke<Name,Input>, events?: {
    granted(name: Name, done: boolean): boolean
    invoke(name: Name, done: boolean, payload: unknown, signal: AbortSignal): Promise<{ prevented?: boolean }>
  }) {
    const rows = new Map<Name, Registration>(),
      life = new AbortController()
    const eventRows = new Map<string, Registration>()
    const owner = {
      id,
      invoke,
      life,
      register: (name: Name, priority: unknown) => {
        if (
          life.signal.aborted ||
          !Object.hasOwn(this.catalog,name) ||
          (priority !== null &&
            (typeof priority !== 'string' || !Object.hasOwn(priorities, priority)))
        )
          throw Error('Invalid hook registration')
        if (priority === null) rows.delete(name)
        else if (rows.has(name)) throw Error('Hook already registered')
        else rows.set(name, { priority: priority as Priority, failures: [], paused: false })
        this.changed()
      },
      enabled: (name: Name) =>
        !life.signal.aborted &&
        granted() &&
        rows.has(name) &&
        !rows.get(name)!.paused &&
        !this.suspended(id, name),
      row: (name: Name) => rows.get(name),
      eventRow: (name: Name, done: boolean) => eventRows.get(name + (done ? ':done' : '')),
      eventEnabled: (name: Name, done: boolean) => {
        const row = eventRows.get(name + (done ? ':done' : ''))
        return !life.signal.aborted && !!row && !row.paused && !!events?.granted(name, done) && (done || !this.suspended(id, name))
      },
      invokeEvent: events?.invoke,
      registerEvent: (name: Name, done: boolean, active: boolean) => {
        if (!events || life.signal.aborted || !Object.hasOwn(this.catalog, name) || (!done && !this.catalog[name].cancelable) || typeof active !== 'boolean') throw Error('Invalid operation event')
        const key = name + (done ? ':done' : '')
        if (!active) eventRows.delete(key)
        else if (!eventRows.has(key)) eventRows.set(key, { priority: 'normal', failures: [], paused: false })
        this.changed()
      },
      attach: () => {
        if (!life.signal.aborted) {
          this.owners.add(owner)
          this.changed()
        }
      },
      dispose: () => {
        life.abort()
        this.owners.delete(owner)
        this.changed()
      },
      next: (token: string, input: unknown) => {
        const pending = this.active.get(token)
        if (!pending || pending.owner !== owner || !granted())
          throw Error('Inactive hook invocation')
        return pending.next(input)
      },
    }
    return owner
  }
  async run(
    name: Name,
    raw: unknown,
    source: OperationSource,
    localDefault: (input: Input) => Promise<void | Result>,
  ) {
    const original = this.parse(name, raw)
    const inherited =
      source.kind === 'plugin'
        ? ([...this.active.values()]
            .map((entry) => entry.trace)
            .filter((trace) => trace.at(-1)?.owner === source.pluginId)
            .sort((first, second) => second.length - first.length)[0] ?? [])
        : []
    const chain =
      this.paused || inherited.length >= 3
        ? []
        : [...this.owners]
            .filter(
              (owner) =>
                owner.enabled(name) &&
                !inherited.some((parent) => parent.name === name && parent.owner === owner.id),
            )
            .sort(
              (first, second) =>
                priorities[first.row(name)!.priority] - priorities[second.row(name)!.priority],
            )
    const handledBy = new Set<string>()
    let prevented = false
    let retried = false
    let finalInput = original
    const emit = async (done: boolean, result: Result | null = null, failed = false) => {
      for (const owner of this.owners) {
        if ((!done && this.paused) || inherited.length >= 3 || inherited.some(parent => parent.name === name && parent.owner === owner.id) || !owner.eventEnabled(name, done)) continue
        const row = owner.eventRow(name, done)!, timeout = new AbortController()
        const signal = AbortSignal.any([timeout.signal, owner.life.signal])
        const token = crypto.randomUUID()
        const timer = setTimeout(() => timeout.abort(), this.timeoutMs ?? this.catalog[name].hookTimeoutMs)
        let onAbort = () => {}
        this.active.set(token, {owner, trace: [...inherited, {owner: owner.id, name}], next: async () => {throw Error('Events cannot call next')} })
        try {
          const payload = {input: structuredClone(finalInput), source: structuredClone(source), ...(done ? {result, prevented, handledBy: [...handledBy], failed} : {})}
          const reply = await Promise.race([
            owner.invokeEvent!(name, done, payload, signal),
            new Promise<never>((_, reject) => { onAbort = () => reject(Error('Operation event aborted')); signal.addEventListener('abort', onAbort, {once: true}) }),
          ])
          if (!done && reply.prevented && !this.paused && owner.eventEnabled(name, done) && owner.eventRow(name, done) === row) {
            prevented = true
            handledBy.add(owner.id)
            this.report(owner.id, name, 'cancel', source)
          }
        } catch {
          if (owner.eventEnabled(name, done) && owner.eventRow(name, done) === row) {
            const now = Date.now()
            row.failures = row.failures.filter(time => now - time < 600000)
            row.failures.push(now); row.paused = row.failures.length >= 3
            this.warn(owner.id, name, row.paused)
            if (row.paused) this.changed()
          }
        } finally {
          clearTimeout(timer); signal.removeEventListener('abort', onAbort); this.active.delete(token)
        }
      }
    }
    const walk = async (index: number, input: Input): Promise<Result> => {
      finalInput = input
      const owner = chain[index]
      if (!owner) {
        const result = await localDefault(input)
        if(this.parseResult) return this.parseResult(name,result,input)
        if (name !== 'player.resolve') return null as Result
        if (!result || typeof result!=='object' || !('ok' in result) || typeof result.ok !== 'boolean') throw Error('Expected host resolve status')
        return {ok:result.ok} as Result
      }
      const row = owner.row(name)
      if (!row || this.paused || !owner.enabled(name)) return walk(index + 1, input)
      const token = crypto.randomUUID(),
        timeout = new AbortController()
      const signal = AbortSignal.any([timeout.signal, owner.life.signal])
      let downstream: Promise<Result> | undefined, failed = false, lastInput: Input | undefined
      let remaining = this.timeoutMs ?? this.catalog[name].hookTimeoutMs
      let started = performance.now(),
        finished = false
      let timer = setTimeout(() => timeout.abort(), remaining)
      const resumeBudget = () => {
        if (finished || signal.aborted) return
        started = performance.now()
        timer = setTimeout(() => timeout.abort(), remaining)
      }
      const validated = (value: unknown) => {
        if (value === undefined) return input
        return this.parse(name, value, original)
      }
      const mark = (next: Input) => {
        if (JSON.stringify(next) !== JSON.stringify(input)) {
          handledBy.add(owner.id)
          this.report(owner.id, name, 'rewrite', source, { target: 'input', before: input, after: next })
        }
      }
      this.active.set(token, {
        owner,
        trace: [...inherited, { owner: owner.id, name }],
        next: (value) => {
          if (signal.aborted || this.paused || !owner.enabled(name) || (downstream && (!failed || retried || name !== 'player.resolve')))
            throw Error('Hook next is no longer available')
          const next = validated(value)
          if (downstream) {
            if (JSON.stringify(next)===JSON.stringify(lastInput)) throw Error('Resolve retry requires a different input')
            retried=true
          }
          lastInput=next
          failed=false
          mark(next)
          clearTimeout(timer)
          remaining = Math.max(0, remaining - (performance.now() - started))
          downstream = walk(index + 1, next).then(status=>{failed=(status as ResolveStatus | null)?.ok===false;return status}).finally(resumeBudget)
          void downstream.catch(() => {})
          return downstream
        },
      })
      let onAbort: () => void = () => {}
      let selected = input
      try {
        const cancelled = new Promise<never>((_, reject) => {
          onAbort = () => reject(Error('Hook aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
        })
        const reply = await Promise.race([
          cancelled,
          owner.invoke(name, token, structuredClone(input), structuredClone(source), signal),
        ])
        if(this.parseResult && Object.hasOwn(reply,'result') && !this.paused && owner.enabled(name) && owner.row(name)===row) {
          const result=this.parseResult(name,reply.result,input)
          const previous = downstream ? await downstream : undefined
          if(!downstream || JSON.stringify(result)!==JSON.stringify(previous)) {
            handledBy.add(owner.id)
            this.report(owner.id,name,'rewrite',source, { target: 'result', before: previous, after: result })
          }
          return result
        }
        if (!downstream && !this.paused && owner.enabled(name) && owner.row(name) === row) {
          if (reply.prevented && this.catalog[name].cancelable) {
            prevented = true
            handledBy.add(owner.id)
            this.report(owner.id, name, 'cancel', source)
            return null as Result
          }
          selected = validated(reply.input)
          mark(selected)
        }
      } catch {
        if (!owner.life.signal.aborted && owner.row(name) === row && owner.enabled(name)) {
          const now = Date.now()
          row.failures = row.failures.filter((time) => now - time < 600000)
          row.failures.push(now)
          row.paused = row.failures.length >= 3
          this.warn(owner.id, name, row.paused)
          if (row.paused) this.changed()
        }
      } finally {
        finished = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.active.delete(token)
      }
      return downstream ?? walk(index + 1, selected)
    }
    let result: Result | null = null, failed = true
    try {
      if (this.catalog[name].cancelable) await emit(false)
      if (!prevented) result = await walk(0, original)
      failed = false
      return { prevented, handledBy: [...handledBy], ...(this.parseResult ? {result} : {}) }
    } finally { await emit(true, result, failed) }
  }
}

type EngineOptions<Name extends string, Input> = ConstructorParameters<typeof OperationEngine<Name, Input>> extends [unknown, unknown, ...infer Options] ? Options : never
export class OperationBus extends OperationEngine<PlaybackOperationName, PlaybackInput> {
  constructor(...options: EngineOptions<PlaybackOperationName,PlaybackInput>) {
    super(PLAYBACK_OPERATIONS,(name,value,original) => {
      if (name === 'queue.shuffle' && original && 'items' in original) {
        const parsed = playbackInput(name,value) as OperationInputs['queue.shuffle']
        const counts = new Map<string,number>()
        for (const item of original.items) { const key = JSON.stringify(item); counts.set(key,(counts.get(key) ?? 0) + 1) }
        for (const item of parsed.items) {
          const key = JSON.stringify(item), remaining = counts.get(key)
          if (!remaining) throw Error('Shuffle must preserve queue items')
          if (remaining === 1) counts.delete(key); else counts.set(key,remaining - 1)
        }
        if (counts.size) throw Error('Shuffle omitted queue items')
        return parsed
      }
      if (original && name === 'player.error') {
        const parsed = playbackInput(name,value)
        if (JSON.stringify(original) !== JSON.stringify(parsed)) throw Error('Cannot replace a playback failure')
        return parsed
      }
      if (original && name === 'player.next' && value && typeof value === 'object') {
        const reason = (original as OperationInputs['player.next']).reason
        if ('reason' in value && value.reason !== reason) throw Error('Cannot change advance reason')
        return playbackInput(name,{reason,...value})
      }
      return playbackInput(name,value)
    },...options)
  }
}
