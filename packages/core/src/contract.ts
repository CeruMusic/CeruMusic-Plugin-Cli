import { assertContentPage } from '@shiqianjiang/ceru-plugin-sdk/music'
import { assertRemovableTracks, assertSearchRequest } from '@shiqianjiang/ceru-plugin-sdk/validate'
import { assertNavigationRequest, validatePluginRouteTarget } from '@shiqianjiang/ceru-plugin-sdk/navigation'
import type { PermissionName, PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'
import {operationTool, toolInput, toolResult} from './operation-tools.js'
export {listOperationTools,operationTool,toolInput} from './operation-tools.js'
export {OPERATION_CATALOG} from './operation-catalog.js'

export interface ContractEntry {
  permission: PermissionName | null | ((data: any) => PermissionName | null)
  keyIndex?: number
  internal?: boolean
  positional?: boolean
  implicitKey?: boolean
  validate?: (data: any, manifest: PluginManifest) => void
  validateResult?: (value: any, data: any) => void
  dedupe?: (data: any) => string
  timeoutMs?: number
}
function externalUrl(data: any) {
  const url = new URL(data.args?.[0])
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw Error('Invalid external URL')
}
function validateImport(data: any) {
  if (typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 128)
    throw Error('Invalid playlist import requestId')
  assertContentPage({ items: data.items })
}
function viewOperation(kind: 'open' | 'close' | 'state'): NonNullable<ContractEntry['validate']> {
  return ({ args }, manifest) => {
    const id = args[0]
    const viewId = kind === 'state' ? id : manifest.ui?.pages?.find(page => page.id === id)?.view ?? id
    const view = manifest.entry.views?.find(item => item.id === viewId)
    if (!view || (kind !== 'state' && !view.presentation)) throw Error('Unknown or non-overlay view')
    if (kind === 'close' && args.length === 1) return
    if (kind === 'open' && args.length === 1) return
    const value = args[1]
    if (kind === 'close' || args.length !== 2 || !value || typeof value !== 'object' || Array.isArray(value) || new TextEncoder().encode(JSON.stringify(value)).length > 256 * 1024) throw Error('Invalid view payload')
  }
}
export const CONTRACT = {
  'entries.selection': { permission: null, positional: true, validate: ({ args }) => {
    if (args.length) throw Error('entries.selection takes no arguments')
  } },
  'entries.invalidate': { permission: null, positional: true, dedupe: () => 'own', validate: ({ args }) => {
    if (args.length) throw Error('entries.invalidate takes no arguments')
  } },
  'music.sources': { permission: 'music.read', positional: true, implicitKey: true },
  'music.search': {
    permission: 'music.read',
    positional: true,
    keyIndex: 2,
    validate: ({ args }) => assertSearchRequest(args[1]),
  },
  'music.suggest': { permission: 'music.read', positional: true, keyIndex: 2 },
  'music.hotSearch': { permission: 'music.read', positional: true, keyIndex: 1 },
  'music.tracks.resolve': { permission: 'music.control', positional: true, keyIndex: 2 },
  'music.tracks.lyrics': { permission: 'music.read', positional: true, keyIndex: 1 },
  'music.tracks.artwork': { permission: 'music.read', positional: true, keyIndex: 1 },
  'music.playlists.search': {
    permission: 'music.read',
    positional: true,
    keyIndex: 2,
    validate: ({ args }) => assertSearchRequest(args[1]),
  },
  'music.playlists.categories': { permission: 'music.read', positional: true, keyIndex: 1 },
  'music.playlists.list': { permission: 'music.read', positional: true, keyIndex: 2 },
  'music.playlists.get': { permission: 'music.read', positional: true, keyIndex: 2 },
  'music.charts.list': { permission: 'music.read', positional: true, keyIndex: 1 },
  'music.charts.getTracks': { permission: 'music.read', positional: true, keyIndex: 2 },
  'music.importers.list': { permission: 'music.read', positional: true, implicitKey: true },
  'music.importers.parse': { permission: 'music.read', positional: true, keyIndex: 3 },
  'music.play': { permission: 'music.control', positional: true, keyIndex: 1 },
  'music.enqueue': { permission: 'music.control', positional: true, keyIndex: 2 },
  'services.capabilities.list': { permission: null },
  'services.capabilities.get': { permission: null },
  'services.account.getSession': { permission: 'account.profile', keyIndex: 0 },
  'services.account.getProfile': { permission: 'account.profile', keyIndex: 0 },
  'services.account.openLogin': { permission: null },
  'services.app.getInfo': { permission: null },
  'services.app.operations.list': {permission:null,validate:({args})=>{if(args.length)throw Error('Expected no arguments')}},
  'services.app.call': {permission:({args})=>operationTool(args[0]).permission,keyIndex:2,validate:({args})=>{
    if(args.length!==3 || typeof args[2]?.permissionKey!=='string' || (operationTool(args[0]).permission!==null && !args[2].permissionKey) || typeof args[2]?.operation?.id!=='string' || !args[2].operation.id || !Number.isFinite(args[2].operation.deadlineAt)) throw Error('Expected operation name, input and ServiceCall')
    toolInput(operationTool(args[0]).name,args[1])
  },validateResult:(value,{args})=>toolResult(operationTool(args[0]).name,value)},
  'services.app.openSettings': { permission: null },
  'services.app.openExternal': { permission: 'external.open', keyIndex: 1, validate: externalUrl },
  'services.player.getState': { permission: 'player.read', keyIndex: 0 },
  'services.player.play': { permission: 'player.control', keyIndex: 1 },
  'services.player.pause': { permission: 'player.control', keyIndex: 0 },
  'services.player.next': { permission: 'player.control', keyIndex: 0 },
  'services.player.previous': { permission: 'player.control', keyIndex: 0 },
  'services.player.seek': { permission: 'player.control', keyIndex: 1 },
  'services.player.setVolume': { permission: 'player.control', keyIndex: 1 },
  'services.player.setMode': { permission: 'player.control', keyIndex: 1 },
  'services.queue.get': { permission: 'player.read', keyIndex: 0 },
  'services.queue.append': { permission: 'player.control', keyIndex: 1 },
  'services.queue.replace': { permission: 'player.control', keyIndex: 1 },
  'services.queue.remove': { permission: 'player.control', keyIndex: 1 },
  'services.queue.reorder': { permission: 'player.control', keyIndex: 2 },
  'services.favorites.contains': { permission: 'library.read', keyIndex: 1 },
  'services.favorites.add': { permission: 'library.write', keyIndex: 1 },
  'services.favorites.remove': { permission: 'library.write', keyIndex: 1 },
  'services.history.list': { permission: 'player.read', keyIndex: 1 },
  'services.downloads.list': { permission: 'downloads.manage', keyIndex: 0 },
  'services.downloads.create': { permission: 'downloads.create', keyIndex: 1 },
  'services.downloads.pause': { permission: 'downloads.manage', keyIndex: 1 },
  'services.downloads.resume': { permission: 'downloads.manage', keyIndex: 1 },
  'services.downloads.cancel': { permission: 'downloads.manage', keyIndex: 1 },
  'services.downloads.retry': { permission: 'downloads.manage', keyIndex: 1 },
  'services.downloads.reveal': { permission: 'downloads.manage', keyIndex: 1 },
  'services.files.pick': { permission: null },
  'services.files.pickDirectory': { permission: null },
  'services.files.readText': { permission: 'files.read', keyIndex: 1 },
  'services.files.readBase64': { permission: 'files.read', keyIndex: 1 },
  'services.files.saveText': { permission: null },
  'services.files.writeText': { permission: 'files.write', keyIndex: 2 },
  'services.clipboard.readText': { permission: 'clipboard.read', keyIndex: 0 },
  'services.clipboard.writeText': { permission: 'clipboard.write', keyIndex: 1 },
  'services.localMusic.list': { permission: 'localMusic.read', keyIndex: 1 },
  'services.localMusic.scan': { permission: 'localMusic.read', keyIndex: 1 },
  'services.localMusic.getTags': { permission: 'localMusic.read', keyIndex: 1 },
  'services.localMusic.writeTags': { permission: 'localMusic.write', keyIndex: 2 },
  'services.settings.get': { permission: 'settings.read', keyIndex: 1 },
  'services.settings.update': { permission: 'settings.write', keyIndex: 1 },
  'services.window.control': { permission: 'window.control', keyIndex: 1 },
  'services.hotkeys.register': { permission: 'hotkeys.register', keyIndex: 1 },
  'services.hotkeys.unregister': { permission: null, internal: true },
  'services.sharing.create': { permission: 'sharing.publish', keyIndex: 1 },
  'services.sharing.revoke': { permission: 'sharing.revoke', keyIndex: 1 },
  'services.sharing.resolve': { permission: null },
  'services.rooms.getState': { permission: 'rooms.read', keyIndex: 0 },
  'services.rooms.join': { permission: 'rooms.control', keyIndex: 1 },
  'services.rooms.leave': { permission: 'rooms.control', keyIndex: 0 },
  'services.rooms.requestTrack': { permission: 'rooms.control', keyIndex: 1 },
  'services.devices.list': { permission: 'devices.control', keyIndex: 0 },
  'services.devices.select': { permission: 'devices.control', keyIndex: 1 },
  'services.ai.generate': { permission: 'ai.use', keyIndex: 1 },
  'services.tasks.schedule': { permission: 'background.run', keyIndex: 1 },
  'services.tasks.cancel': { permission: 'background.run', keyIndex: 1 },
  'library.playlists.list': { permission: 'library.read' },
  'library.playlists.getTracks': { permission: 'library.read', validateResult: assertContentPage },
  'library.playlists.import': {
    permission: 'library.write',
    validate: validateImport,
    dedupe: (data) => data.requestId,
  },
  'library.playlists.removeTracks': {
    permission: 'library.delete',
    validate: (data) => assertRemovableTracks(data.items),
  },
  'library.playlists.clearPlaylist': { permission: 'library.delete' },
  'config.get': { permission: null },
  'http.request': { permission: 'network.request' },
  'server.start': { permission: 'network.serve', implicitKey: true, internal: true, validate: (data, manifest) => {
    if (data.port !== undefined && (!Number.isInteger(data.port) || data.port < 0 || data.port > 65535)) throw Error('Invalid server port')
    if (data.lan !== undefined && typeof data.lan !== 'boolean') throw Error('Invalid server LAN mode')
    if (data.lan && !manifest.uses?.permissions?.some(row => row.name === 'network.serve.lan')) throw Error('Undeclared LAN server permission')
  } },
  'server.stop': { permission: null, internal: true },
  'permissions.query': { permission: null },
  'permissions.request': { permission: null },
  'permissions.getGranted': { permission: null },
  'permissions.requestGroup': { permission: null },
  'sockets.connect': { permission: 'network.socket', internal: true },
  'sockets.send': { permission: null, internal: true },
  'sockets.disconnect': { permission: null, internal: true },
  'storage.get': { permission: null },
  'storage.set': { permission: null },
  'storage.delete': { permission: null },
  'guests.list': { permission: null },
  'guests.import': { permission: 'guests.manage' },
  'guests.select': { permission: 'guests.manage' },
  'guests.remove': { permission: 'guests.manage' },
  'guests.invoke': { permission: 'guests.run' },
  'ui.pages.open': { permission: null, positional: true, validate: viewOperation('open') },
  'ui.pages.close': { permission: null, positional: true, validate: viewOperation('close') },
  'ui.views.setState': { permission: null, positional: true, validate: viewOperation('state') },
  'ui.dialogs.confirm': { permission: null },
  'ui.dialogs.prompt': { permission: null },
  'ui.dialogs.pickPlaylist': { permission: null },
  'ui.navigation.open': { permission: null, validate: assertNavigationRequest },
  'accounts.current': { permission: null, internal: true, validate: (data, manifest) => {
    if (!manifest.provides?.accounts?.some(account => account.id === data.accountId)) throw Error('Unknown account declaration')
  } },
  'accounts.reportExpired': { permission: 'credentials.use', implicitKey: true, internal: true, validate: (data, manifest) => {
    if (!manifest.provides?.accounts?.some(account => account.id === data.accountId)) throw Error('Unknown account declaration')
    if (typeof data.connectionId !== 'string' || !data.connectionId || data.connectionId.length > 128 || data.credential?.kind !== 'credential' || typeof data.credential.id !== 'string' || !data.credential.id || data.credential.id.length > 128) throw Error('Invalid account credential reference')
  } },
  'accounts.form': { permission: null, internal: true, timeoutMs: 120000 },
  'accounts.qrcode': { permission: null, internal: true, timeoutMs: 305000 },
  'accounts.oauth': { permission: null, internal: true, timeoutMs: 305000 },
  'accounts.browser': { permission: null, internal: true, timeoutMs: 305000 },
  'credentials.get': { permission: 'credentials.use', implicitKey: true, internal: true },
  'router.current': { permission: null },
  'router.push': { permission: null, validate: (data, manifest) => { validatePluginRouteTarget(data,manifest) } },
  'ui.playlistImport.open': { permission: null },
  'ui.pluginUpdate.request': { permission: null },
  'ui.notifications.show': { permission: 'notifications.system' },
  'ui.progress.create': { permission: null, positional: true },
  'ui.progress.update': { permission: null, positional: true },
  'ui.progress.close': { permission: null, positional: true },
  'operations.cancel': { permission: null, internal: true },
  'plugins.use': { permission: 'services.consume', internal: true, implicitKey: true },
  'plugins.list': { permission: 'services.consume', internal: true, implicitKey: true },
  'plugins.invoke': { permission: 'services.consume', internal: true, implicitKey: true, timeoutMs: 30000 },
  'plugins.registerService': { permission: null, internal: true },
  'hooks.register': { permission: null, internal: true },
  'events.register': { permission: null, internal: true },
  'hooks.resolveNext': {permission:'player.intercept',internal:true,implicitKey:true},
  'hooks.next': { permission: 'player.intercept', internal: true, implicitKey: true },
  'hooks.accountNext': { permission: 'account.intercept', internal: true, implicitKey: true },
  'hooks.windowNext': { permission: 'window.intercept', internal: true, implicitKey: true },
  'hooks.lyricsNext': { permission: 'lyrics.intercept', internal: true, implicitKey: true },
  'hooks.downloadsNext': { permission: 'downloads.intercept', internal: true, implicitKey: true },
  'hooks.sharingNext': { permission: 'sharing.intercept', internal: true, implicitKey: true },
  'hooks.linksNext': { permission: 'links.intercept', internal: true, implicitKey: true },
  'hooks.notificationsNext': { permission: 'notifications.intercept', internal: true, implicitKey: true },
  'hooks.libraryNext': { permission: 'library.intercept', internal: true, implicitKey: true },
  'hooks.searchNext': { permission: 'search.intercept', internal: true, implicitKey: true },
  'surface.invoke': { permission: null, internal: true },
} as const satisfies Record<string, ContractEntry>
export type RpcMethod = keyof typeof CONTRACT

type Branch<Path extends string, Value> = Path extends `${infer Parent}.${infer Child}`
  ? { [Key in Parent]: Branch<Child, Value> }
  : { [Key in Path]: Value }
type Intersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer U,
) => void
  ? U
  : never
type Names = Intersection<{ [Key in RpcMethod]: Branch<Key, Key> }[RpcMethod]>
function insert(root: Record<string, any>, path: string, value: unknown) {
  const parts = path.split('.')
  const leaf = parts.pop()!
  let target = root
  for (const part of parts) target = target[part] ??= Object.create(null)
  target[leaf] = value
}
const names = Object.create(null)
for (const method of Object.keys(CONTRACT)) insert(names, method, method)
export const RPC = names as Names
export function createRpcMethods(send: (method: RpcMethod, data: any) => Promise<any>) {
  const methods: Record<string, any> = Object.create(null)
  for (const method of Object.keys(CONTRACT) as RpcMethod[]) {
    const entry: ContractEntry = CONTRACT[method]
    if (entry.internal) continue
    const service = method.startsWith('services.')
    insert(methods, service ? method.slice(9) : method, (...args: any[]) =>
      send(method, service || entry.positional ? { args } : (args[0] ?? {})),
    )
  }
  return methods
}
