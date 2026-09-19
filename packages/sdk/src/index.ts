/// <reference path="./host-modules.d.ts" />
/** This package defines the v2 wire/authoring contract. It does not grant Host permissions. */
import type { LoDashStatic } from 'lodash'
import type { HostIconName, HostAssetName, LODASH_METHODS } from './catalog.js'
export * from './catalog.js'
export * from './http.js'
export * from './library.js'
export * from './sockets.js'
import type { SocketAPI } from './sockets.js'
import type { createHttpClient, HttpClientOptions } from './http.js'
export * from './music.js'
export * from './lyrics.js'
export * from './quality.js'
export * from './permissions.js'
export * from './services.js'
export * from './modules.js'
import type { PluginModules } from './modules.js'
import type { HostServices, HostUI } from './services.js'
import type {
  PermissionGrant,
  PermissionGroupRequest,
  PermissionGroupResult,
} from './permissions.js'
import type { ChartMetadata, LyricsDocument, PlaylistMetadata, TrackMetadata } from './music.js'
import type { LibraryAPI, PlaylistImporterImplementation } from './library.js'
/** 宿主在插件自己的隔离环境提供这些 Lodash 方法；不会打入插件发行文件。 */
export type HostLodash = Pick<LoDashStatic, (typeof LODASH_METHODS)[number]>
export * from './manifest.js'
import type { JsonValue, JsonObject, MaybePromise, Disposable, PluginManifest } from './manifest.js'

export interface ResourceRef {
  pluginId: string
  providerId: string
  connectionId?: string
  kind: string
  id: string
  /** Opaque plugin-owned JSON persisted by the Host and returned only to this plugin. */
  data?: JsonObject
}
export interface AssetHandle {
  readonly kind: 'asset'
  readonly id: string
}
export interface MediaLease {
  /** @deprecated v0.2 providers return direct playback URLs. */
  readonly kind: 'media'
  readonly id: string
}
export interface CredentialRef {
  readonly kind: 'credential'
  readonly id: string
}
export interface UserIntentHandle {
  readonly kind: 'user-intent'
  readonly id: string
}
export interface OperationContext {
  id: string
  deadlineAt: number
  signal: AbortSignal
  connectionId?: string
  userIntent?: UserIntentHandle
}
export interface ContentEntity {
  ref: ResourceRef
  title: string
  subtitle?: string
  artwork?: AssetHandle
  playable?: boolean
  durationMs?: number
  capabilities: string[]
  extensions?: JsonObject
  /** Standard metadata consumed directly by the Host; never raw platform response objects. */
  metadata?: TrackMetadata
  playlist?: PlaylistMetadata
  chart?: ChartMetadata
}
export interface Page<T> {
  items: T[]
  nextCursor?: string
  snapshotId?: string
  totalEstimate?: number
}
export interface SearchRequest {
  query: string
  kinds: string[]
  filters: JsonObject
  cursor?: string
  /** Requested size; providers may clamp to their upstream API's supported range. */
  limit: number
}
export interface MusicFault {
  code:
    | 'RATE_LIMITED'
    | 'AUTH_REQUIRED'
    | 'ENTITLEMENT_EXPIRED'
    | 'NOT_FOUND'
    | 'REGION_UNAVAILABLE'
    | 'NETWORK_ERROR'
    | 'PERMISSION_DENIED'
    | 'UNSUPPORTED'
    | 'CANCELLED'
    | 'INTERNAL'
  message: string
  retryAfterMs?: number
  retryable?: boolean
  recovery?: {
    mode: 'default' | 'retry-later' | 'await-user' | 'stop-current'
    maxWaitMs?: number
    actions?: (
      | { kind: 'retry' | 'choose-source' | 'cancel'; label?: string }
      | { kind: 'plugin-command'; commandId: string; label: string }
    )[]
  }
}
export type ResolveResult =
  | { ok: true; url: string; expiresAt?: number }
  | { ok: false; error: MusicFault }
export interface TrackProvider {
  search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>
  resolve?(
    resource: ResourceRef,
    quality: string | undefined,
    operation: OperationContext,
  ): Promise<ResolveResult>
  lyrics?(resource: ResourceRef, operation: OperationContext): Promise<LyricsDocument>
}
export interface PlaylistProvider {
  search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>
  categories?(operation: OperationContext): Promise<Page<ContentEntity>>
  list?(
    resource: ResourceRef,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<Page<ContentEntity>>
  get?(
    resource: ResourceRef,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<import('./library.js').PlaylistTrackPage>
}
export interface ChartProvider {
  list?(operation: OperationContext): Promise<Page<ContentEntity>>
  getTracks?(
    resource: ResourceRef,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<Page<ContentEntity>>
}
export interface SharingProvider {
  describe?(
    resource: ResourceRef,
    policy: JsonObject,
    operation: OperationContext,
  ): Promise<JsonObject>
}
export interface ProviderImplementation {
  tracks?: TrackProvider
  playlists?: PlaylistProvider
  charts?: ChartProvider
  sharing?: SharingProvider
  /** @deprecated Use tracks.lyrics. Kept for v2 preview compatibility. */
  lyrics?(resource: ResourceRef, operation: OperationContext): Promise<LyricsDocument>
  /** @deprecated Use tracks.search. */
  search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>
  /** @deprecated Use tracks.resolve. */
  resolve?(
    resource: ResourceRef,
    quality: string | undefined,
    operation: OperationContext,
  ): Promise<ResolveResult>
  /** @deprecated Use playlists.categories. */
  categories?(operation: OperationContext): Promise<Page<ContentEntity>>
  /** @deprecated Use playlists.list/get or charts.getTracks. */
  list?(
    resource: ResourceRef,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<Page<ContentEntity>>
  /** @deprecated Use sharing.describe. */
  share?(
    resource: ResourceRef,
    policy: JsonObject,
    operation: OperationContext,
  ): Promise<JsonObject>
}
export interface PluginContext extends HostServices {
  modules: PluginModules
  readonly plugin: {
    id: string
    version: string
    /** The validated installed manifest. Runtime configuration is manifest.config. */
    manifest: Readonly<PluginManifest>
  }
  /** 当前 Host 的协议版本与共享资源版本。 */
  readonly host: {
    apiVersion: string
    libraries: {
      lodash: string
      icons: string
      assets: string
      vue?: string
      react?: string
      'react-dom'?: string
    }
    mode: 'development' | 'production'
  }
  /** 本地纯计算工具，不通过 RPC 逐项执行。没有模板执行、mixin 或任意上下文构造能力。 */
  readonly utils: { readonly lodash: HostLodash }
  /** 使用宿主已经拥有的图标，无需将 SVG/PNG 打入插件。 */
  readonly icons: {
    list(): readonly HostIconName[]
    url(name: HostIconName): Promise<string>
  }
  /** Host 静态资源与本插件资源句柄；不是任意文件路径访问接口。 */
  readonly assets: {
    list(): readonly HostAssetName[]
    url(name: HostAssetName | AssetHandle): Promise<string>
  }
  /** 已验证的配置。凭据字段由 Host 替换为引用，不返回主密钥。 */
  config: { get<T = JsonObject>(): Promise<Readonly<T>> }
  /** Uses the application's own local/cloud playlists after Host permission checks. */
  library: LibraryAPI
  /** Host-provided Socket.IO / WebSocket; no socket library is bundled into the plugin. */
  sockets: SocketAPI
  playlistImporters: {
    register(id: string, implementation: PlaylistImporterImplementation): Disposable
  }
  lyricConverters: {
    register(id: string, implementation: import('./lyrics.js').LyricConverter): Disposable
  }
  providers: { register(id: string, implementation: ProviderImplementation): Disposable }
  actions: {
    register<
      TInput extends JsonValue = JsonValue,
      TResult extends JsonValue | void = JsonValue | void,
    >(
      id: string,
      handler: (input: TInput, operation: OperationContext) => MaybePromise<TResult>,
    ): Disposable
  }
  permissions: {
    getGranted(): Promise<PermissionGrant[]>
    requestGroup(request: PermissionGroupRequest): Promise<PermissionGroupResult>
    query(request: { key: string; scope?: JsonObject }): Promise<{ status: PermissionStatus }>
    request(request: {
      key: string
      scope?: JsonObject
      intent?: UserIntentHandle
    }): Promise<{ status: PermissionStatus }>
  }
  http: {
    /** Axios-backed Host client with JSON/form helpers and typed results. */
    create(options: HttpClientOptions): ReturnType<typeof createHttpClient>
    request(request: {
      permissionKey: string
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
      timeoutMs?: number
      credential?: CredentialRef
      operation: OperationContext
    }): Promise<{ status: number; headers: Record<string, string>; body: JsonValue }>
  }
  credentials: { get(connectionId: string): Promise<CredentialRef | null> }
  playback: { failure(error: MusicFault): ResolveResult }
  ui: HostUI & {
    toast(message: {
      message: string
      level?: 'info' | 'success' | 'warning' | 'error'
    }): Promise<void>
    /** Opens the application's existing import dialog. This does not create a plugin Surface. */
    playlistImport: {
      open(request: { importerId: string; initialValue?: string }): Promise<void>
    }
    setState(surfaceId: string, state: JsonObject): Promise<void>
    notify(message: {
      key: string
      level: 'info' | 'success' | 'warning' | 'error'
      message: string
    }): Promise<void>
    openView(surfaceId: string): Promise<void>
  }
  storage: {
    get<T extends JsonValue = JsonValue>(key: string): Promise<T | undefined>
    set(key: string, value: JsonValue): Promise<void>
    delete(key: string): Promise<void>
  }
  guests: {
    list(): Promise<{ id: string; name: string; state: string }[]>
    prepareInstall(request: {
      adapterId: string
      artifactHandle: string
      operation: OperationContext
    }): Promise<{ draftId: string }>
    requestInstall(
      draftId: string,
      operation: OperationContext,
    ): Promise<{ guestId: string } | null>
    invoke(
      guestId: string,
      method: string,
      input: JsonValue,
      operation: OperationContext,
    ): Promise<JsonValue>
  }
  log: {
    debug(message: string, data?: JsonValue): void
    info(message: string, data?: JsonValue): void
    warn(message: string, data?: JsonValue): void
    error(message: string, data?: JsonValue): void
  }
  effects: { add(dispose: Disposable): void }
}
export type PermissionStatus =
  | 'undeclared'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'expired'
  | 'restricted'
  | 'unavailable'
export interface SurfaceContext extends Pick<PluginContext, 'host' | 'utils' | 'icons' | 'assets'> {
  readonly root: HTMLElement
  readonly mount: {
    kind: 'page' | 'slot'
    slot?: import('./manifest.js').UISlotName
    mode?: 'append' | 'prepend' | 'wrap' | 'replace'
  }
  invoke(action: string, input: JsonValue): Promise<JsonValue>
  subscribe(handler: (state: JsonObject) => void): Disposable
}
export interface GuestContext extends Pick<PluginContext, 'host' | 'utils'> {
  readonly guestId: string
  expose(name: string, value: unknown): void
  invokeHost(method: string, input: JsonValue): Promise<JsonValue>
}
export type LogicEntry = (ctx: PluginContext) => MaybePromise<void | Disposable>
export type SurfaceEntry = (ctx: SurfaceContext) => MaybePromise<void | Disposable>
export type GuestEntry = (ctx: GuestContext) => MaybePromise<void | Disposable>
export function definePlugin(entry: LogicEntry): LogicEntry {
  return entry
}
export function defineSurface(entry: SurfaceEntry): SurfaceEntry {
  return entry
}
export function defineGuestAdapter(entry: GuestEntry): GuestEntry {
  return entry
}
export function defineManifest(manifest: PluginManifest): PluginManifest {
  return manifest
}
export function definePluginConfig<const T extends JsonObject>(config: T): T {
  return config
}
export function failure(error: MusicFault): ResolveResult {
  return { ok: false, error }
}

/** 基础声明式界面；由 Host 渲染，不会把插件函数放进主界面组件树。 */
export type UINode =
  | {
      type: 'section' | 'stack' | 'grid' | 'form'
      title?: string
      submitAction?: string
      children: UINode[]
    }
  | { type: 'text'; text?: string; label?: string; bind?: string }
  | { type: 'button'; label: string; action: string }
  | { type: 'host-content' }
  | {
      type: 'text-input' | 'input' | 'number' | 'toggle'
      label: string
      bind: string
      placeholder?: string
    }
  | { type: 'host-credential'; label: string; bind: string; permissionKey: string }
export interface UISchema {
  schemaVersion: '1.0'
  id?: string
  root: UINode
}
export function defineUISchema(schema: UISchema): UISchema {
  return schema
}
