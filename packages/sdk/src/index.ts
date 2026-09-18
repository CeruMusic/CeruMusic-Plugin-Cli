/** This package defines the v2 wire/authoring contract. It does not grant Host permissions. */
import type { LoDashStatic } from 'lodash'
import type { HostIconName, HostAssetName, LODASH_METHODS } from './catalog.js'
export * from './catalog.js'
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
}
export interface AssetHandle {
  readonly kind: 'asset'
  readonly id: string
}
export interface MediaLease {
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
export type ResolveResult = { ok: true; media: MediaLease } | { ok: false; error: MusicFault }
export interface ProviderImplementation {
  search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>
  resolve?(
    resource: ResourceRef,
    quality: string | undefined,
    operation: OperationContext,
  ): Promise<ResolveResult>
  categories?(operation: OperationContext): Promise<Page<ContentEntity>>
  list?(
    resource: ResourceRef,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<Page<ContentEntity>>
  share?(
    resource: ResourceRef,
    policy: JsonObject,
    operation: OperationContext,
  ): Promise<JsonObject>
}
export interface PluginContext {
  readonly plugin: { id: string; version: string }
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
  config: { get<T extends JsonObject = JsonObject>(): Promise<T> }
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
    query(request: { key: string; scope?: JsonObject }): Promise<{ status: PermissionStatus }>
    request(request: {
      key: string
      scope?: JsonObject
      intent?: UserIntentHandle
    }): Promise<{ status: PermissionStatus }>
  }
  http: {
    request(request: {
      permissionKey: string
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
      credential?: CredentialRef
      operation: OperationContext
    }): Promise<{ status: number; headers: Record<string, string>; body: JsonValue }>
  }
  credentials: { get(connectionId: string): Promise<CredentialRef | null> }
  media: {
    createLease(request: {
      permissionKey: string
      url: string
      credential?: CredentialRef
      operation: OperationContext
      expiresAt?: number
    }): Promise<MediaLease>
  }
  playback: { failure(error: MusicFault): ResolveResult }
  ui: {
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
