import type { OperationContext } from './index.js'
import type { CrLyric } from './music.js'

export const PLAYBACK_OPERATION_NAMES = ['player.play', 'queue.add', 'player.pause', 'player.resume', 'player.previous', 'player.next', 'player.error', 'player.queueEnded', 'player.seek', 'player.setVolume', 'player.setMode', 'queue.remove', 'queue.clear', 'queue.shuffle'] as const
export type PlaybackOperationName = (typeof PLAYBACK_OPERATION_NAMES)[number]
export type SearchOperationName = 'search.query' | 'search.suggest' | 'search.results'
const LIBRARY_OPERATION_NAMES = ['track.like', 'playlist.create', 'playlist.delete', 'playlist.addTracks', 'playlist.removeTracks', 'playlist.export', 'playlist.import'] as const
export type LibraryOperationName = (typeof LIBRARY_OPERATION_NAMES)[number]
export function isLibraryOperation(name: unknown): name is LibraryOperationName {
  return LIBRARY_OPERATION_NAMES.some(operation => operation === name)
}
export type LyricOperationName = 'lyrics.load' | 'lyrics.transform'
export type DownloadOperationName = 'download.create' | 'download.filename'
export function isDownloadOperation(name:unknown): name is DownloadOperationName {
  return name==='download.create' || name==='download.filename'
}
export function isLyricOperation(name: unknown): name is LyricOperationName {
  return name === 'lyrics.load' || name === 'lyrics.transform'
}
export type OperationLyric = Omit<CrLyric, 'track'> & { track: OperationTrack['ref'] }
export type SystemOperationName = 'link.open' | 'notification.show'
export type HookOperationName = PlaybackOperationName | 'player.resolve' | 'account.switch' | 'window.close' | 'share.create' | SystemOperationName | SearchOperationName | LibraryOperationName | LyricOperationName | DownloadOperationName
export interface ShareOperationResult { id: string; url: string; template?: string }
export interface ResolveStatus { readonly ok: boolean }
export type HookResult<Name extends HookOperationName> = Name extends 'share.create' ? ShareOperationResult | null : Name extends LyricOperationName ? OperationLyric | null : Name extends 'player.resolve' ? ResolveStatus : null
export function isSearchOperation(name: unknown): name is SearchOperationName {
  return name === 'search.query' || name === 'search.suggest' || name === 'search.results'
}
export type OperationSource =
  | { kind: 'ui' | 'system'; location?: string }
  | { kind: 'plugin'; pluginId: string; runtime: 2 | 3 }
export interface OperationTrack {
  ref: { kind: 'track'; id: string; providerId: string }
  title: string
  metadata: { artists: string[] }
}
export interface OperationInputs {
  'link.open': { url: string; readonly from: 'paste' | 'drop' | 'deeplink' }
  'notification.show': { title: string; body: string; level: 'info' | 'success' | 'warning' | 'error' }
  'share.create': { track: OperationTrack }
  'download.create': { tracks: OperationTrack[]; quality: string; readonly directory?: string }
  'download.filename': { readonly track: OperationTrack; name: string }
  'lyrics.load': { readonly track: OperationTrack }
  'lyrics.transform': { readonly track: OperationTrack; lyric: OperationLyric | null }
  'window.close': Record<string, never>
  'player.resolve': { track: OperationTrack; quality: string }
  'track.like': {track:OperationTrack;liked:boolean}
  'playlist.create': { name: string; readonly location: 'local' | 'cloud' }
  'playlist.delete': { readonly playlist: { readonly id: string; readonly name: string; readonly location: 'local' | 'cloud' | 'both' } }
  'playlist.addTracks': OperationInputs['playlist.delete'] & { tracks: OperationTrack[] }
  'playlist.removeTracks': OperationInputs['playlist.addTracks']
  'playlist.export': OperationInputs['playlist.delete'] & { format: 'cmpl' | 'cpl' }
  'playlist.import': { value: string; importerId?: string }
  'search.results': {readonly query:string; readonly sourceId:string; page:{readonly kind:'track'|'playlist'; items:SearchResultItem[]}}
  'search.query': { query: string; readonly sourceId: string; readonly kinds: readonly string[] }
  'search.suggest': { readonly query: string; items: string[] }
  'account.switch': { readonly pluginId: string; readonly accountId: string; readonly fromConnectionId: string | null; readonly connectionId: string }
  'player.pause': Record<string, never>
  'player.resume': Record<string, never>
  'player.previous': Record<string, never>
  'player.seek': { positionMs: number }
  'player.setMode': { mode: 'sequence' | 'random' | 'single' }
  'player.setVolume': { volume: number }
  'player.next': { reason: 'user' | 'ended' | 'error'; track?: OperationTrack }
  'player.error': { readonly track: OperationTrack; readonly error: 'resolve' | 'start' | 'media' | 'playback' }
  'player.queueEnded': { tracks?: OperationTrack[] }
  'player.play': { track: OperationTrack; queueIndex?: number }
  'queue.add': { tracks: OperationTrack[]; position: 'next' | 'end' }
  'queue.remove': { tracks: OperationTrack[] }
  'queue.clear': { tracks?: OperationTrack[] }
  'queue.shuffle': { items: OperationTrack[] }
}
export interface SearchResultItem {
  ref:{kind:'track'|'playlist';providerId:string;id:string}
  title:string
  subtitle?:string
  metadata?:{artists:string[]}
}
export type HookInput<Name extends HookOperationName> = OperationInputs[Name] | (Name extends 'player.next' ? { track: OperationTrack } : never)
export type HookPriority = 'early' | 'normal' | 'late'
type ReadonlyTree<T> = T extends object ? {readonly [Key in keyof T]:ReadonlyTree<T[Key]>} : T
export type OperationState = ReadonlyTree<{
  player: (Omit<import('./services.js').PlayerState,'track'> & {track:OperationTrack|null}) | null
  route: import('./navigation.js').PluginRoute | null
  account: import('./services.js').AccountSession | null
}>
export interface HookContext<Name extends HookOperationName> {
  input: OperationInputs[Name]
  readonly source: OperationSource
  readonly operation: OperationContext
  /** Missing read permission is represented by null; the snapshot cannot be mutated. */
  readonly state: OperationState
  preventDefault(): void
  respondWith(result: HookResult<Name>): void
}
export interface HooksAPI {
  on<Name extends HookOperationName>(
    name: Name,
    handler: (
      op: HookContext<Name>,
      next: (input?: HookInput<Name>) => Promise<HookResult<Name>>,
    ) => void | HookResult<Name> | HookInput<Name> | Promise<void | HookResult<Name> | HookInput<Name>>,
    options?: { priority?: HookPriority },
  ): () => void
}
