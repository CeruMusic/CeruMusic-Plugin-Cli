import type { HostIconName, PermissionName } from './catalog.js'
import type { MenuContribution } from './services.js'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export type MaybePromise<T> = T | Promise<T>
export type Disposable = () => MaybePromise<void>
export type IconRef = { kind: 'host'; name: HostIconName } | { kind: 'asset'; resource: string }
export interface PermissionDeclaration {
  key: string
  name: PermissionName
  scope?: JsonObject
  reason: string
  optional?: boolean
  requiredFor?: string[]
}
export interface ProviderDeclaration {
  id: string
  name: string
  protocols: string[]
  qualities?: string[]
  icon?: IconRef
  connectionMode?: 'none' | 'single' | 'multiple'
}
export interface SurfaceDeclaration {
  id: string
  kind: 'schema' | 'web'
  entry: string
}
export type HomeSectionKind = 'playlists' | 'charts' | 'custom'
export type UISlotName =
  | 'home.header'
  | 'home.content.before'
  | 'home.content.after'
  | 'search.source-selector.after'
  | 'playlist.header.actions'
  | 'playlist.item.actions'
  | 'player.actions'
  | 'settings.sections'
export interface HomeSectionContribution {
  id: string
  title: string
  kind: HomeSectionKind
  icon?: IconRef
  /** Required for custom sections; built-in playlist/chart sections keep the existing Host UI. */
  view?: string
  providerIds?: string[]
  order?: number
}
export interface UIExtensionContribution {
  id: string
  slot: UISlotName
  mode: 'append' | 'prepend' | 'wrap' | 'replace'
  /** Sandboxed visible Surface. Plugin JavaScript never runs in the application renderer. */
  view: string
  order?: number
  when?: { loggedIn?: boolean; route?: string }
}
export interface StyleContribution {
  id: string
  resource: string
  scope: 'surface' | 'slot' | 'application'
  slots?: UISlotName[]
  order?: number
}
export interface PluginManifest {
  manifestVersion: 2
  id: string
  name: string
  version: string
  description?: string
  author?: string
  publisher?: string
  license?: string
  homepage?: string
  /** Static defaults for ctx.config. Build-time @file sugar is expanded into this object. */
  config?: JsonObject
  engines: {
    hostApi: string
    logicRuntime: string
    uiSchema?: string
    libraries?: Partial<Record<'vue' | 'react' | 'react-dom', string>>
  }
  modules: {
    logic?: { entry: string; activation?: string[] }
    surfaces?: SurfaceDeclaration[]
  }
  contributes?: {
    providers?: ProviderDeclaration[]
    /** Home tabs exist only while at least one enabled plugin contributes them. */
    homeSections?: HomeSectionContribution[]
    /** Controlled UI composition. The Host owns the target DOM and lifecycle. */
    uiExtensions?: UIExtensionContribution[]
    /** Surface/slot styles are scoped. Application styles require ui.styles.global. */
    styles?: StyleContribution[]
    menus?: MenuContribution[]
    /** Entries for the application's existing playlist import menu/dialog. */
    playlistImporters?: {
      id: string
      title: string
      description?: string
      placeholder?: string
    }[]
    commands?: { id: string; title: string; action: string; view?: string }[]
    sidebarItems?: { id: string; group: string; title: string; view: string }[]
    settingsPages?: { id: string; title: string; view: string }[]
    guestAdapters?: {
      id: string
      format: string
      compatibilityProfile: string
      bootstrap: string
      runtime: string
      projectableProtocols: string[]
    }[]
  }
  permissions?: PermissionDeclaration[]
  guestPolicy?: {
    maxDepth: 1
    allowedCapabilities: string[]
    networkScopeMode: 'per-guest-user-approved'
    allowNativeCode: false
    allowRemoteCodeExecution: false
  }
  dataSchemas?: { config: number; state: number }
}
