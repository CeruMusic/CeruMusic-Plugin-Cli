import type { HostIconName, PermissionName } from './catalog.js'
import type { LyricInputFormat } from './lyrics.js'
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
  when?: EntryVisibilityRule
  beforeSelect?: string
  id: string
  name: string
  protocols: string[]
  /** Ordered from lowest to highest; names have no intrinsic rank. */
  qualities?: string[]
  icon?: IconRef
  connectionMode?: 'none' | 'single' | 'multiple'
}
export type UISlotName =
  | 'home.header'
  | 'home.content.before'
  | 'home.content.after'
  | 'search.source-selector.after'
  | 'playlist.header.actions'
  | 'playlist.item.actions'
  | 'player.actions'
  | 'settings.sections'
export interface StyleContribution {
  id: string
  resource: string
  scope: 'surface' | 'slot' | 'application'
  slots?: UISlotName[]
  order?: number
}
export interface GuestPolicy {
  maxDepth: 1
  allowedCapabilities: string[]
  networkScopeMode: 'per-guest-user-approved'
  allowNativeCode: false
  allowRemoteCodeExecution: false
}

export interface PluginManifestV3 {
  manifestVersion: 3
  id: string
  name: string
  version: string
  description?: string
  author?: string
  publisher?: string
  license?: string
  homepage?: string
  config?: JsonObject
  engines: {
    hostApi: string
    logicRuntime: string
    libraries?: Partial<Record<'vue' | 'react' | 'react-dom', string>>
  }

  entry: {
    logic?: { module: string; activation?: string[] }
    share?: {
      module: string
      configKeys?: string[]
      guestAdapterId?: string
      guestGlobals?: string[]
    }
    views?: ViewDeclaration[]

    server?: { module: string; runtime: 'sandbox' | 'node'; port?: number; lan?: boolean }

    native?: { name: string; platforms: Record<string, string> }[]
  }

  provides?: {
    providers?: ProviderDeclaration[]
    importers?: ImporterDeclaration[]
    lyricConverters?: LyricConverterDeclaration[]
    accounts?: AccountDeclaration[]
    guestAdapters?: GuestAdapterDeclaration[]
    services?: ServiceDeclaration[]
    actions?: ActionDeclaration[]
  }

  uses?: {
    permissions?: PermissionDeclaration[]
    plugins?: PluginDependency[]
  }

  ui?: {
    pages?: PageDeclaration[]
    homeSections?: HomeSectionDeclaration[]
    slots?: SlotDeclaration[]
    menus?: MenuContribution[]
    styles?: StyleContribution[]

    regions?: RegionDeclaration[]
    skins?: SkinDeclaration[]
  }

  guestPolicy?: GuestPolicy
  dataSchemas?: { config: number; state: number }
}

export interface ViewDeclaration {
  id: string
  kind: 'component' | 'web' | 'native'

  module: string
  title?: string
  presentation?: {
    kind: 'drawer' | 'modal'
    placement?: 'left' | 'right' | 'top' | 'bottom'
    size?: number
  }
  lifecycle?: { openAction?: string; closeAction?: string }
}

export interface ActionDeclaration {
  id: string
  title: string
  description?: string

  view?: string
}

export interface ImporterDeclaration {
  id: string
  title: string
  providerId?: string
  examples?: { label: string; value: string }[]
  instructions?: string[]
  description?: string
  placeholder?: string
}

export interface LyricConverterDeclaration {
  id: string
  title: string
  formats: LyricInputFormat[]
}

export interface AccountDeclaration {
  id: string
  title: string
  icon?: IconRef

  multiple?: boolean
  loginMethods: ('qrcode' | 'browser' | 'form' | 'oauth')[]

  capabilities?: ('profile' | 'likes' | 'playlists' | 'history' | 'recommend')[]

  providers?: string[]

  view?: string
}

export interface GuestAdapterDeclaration {
  id: string
  title?: string
  extensions?: string[]
  format: string
  badge?: { label: string; backgroundColor: string; textColor: string }
  compatibilityProfile: string
  bootstrap: string
  runtime: string
  projectableProtocols: string[]
}

export interface ServiceDeclaration {
  id: string
  version: string
  methods: string[]
  description?: string
}

export interface PluginDependency {
  pluginId: string
  service: string
  version: string
  optional?: boolean
}

export interface EntryVisibilityRule {
  loggedIn?: boolean
  selectedSource?: string
  predicate?: string
  combine?: 'all' | 'any'
}

export type EntryVisibilityDecision = boolean | 'force-show' | 'force-hide'
export type ProviderEntryDecision = EntryVisibilityDecision | { state: 'disabled'; reason?: string }
export interface ProviderEntryContext extends SourceSelection { providerId: string }
export type ProviderSelectionDecision = boolean | {
  login: { accountId: string; method?: AccountDeclaration['loginMethods'][number]; connectionId?: string }
}

export interface SourceSelection {
  selectedSource: string | null
  selectedProvider: string | null
}

export interface EntryVisibilityContext extends SourceSelection {
  pageId: string
}

export interface PageDeclaration {
  id: string
  title: string
  mount: 'sidebar' | 'settings' | 'home-tab' | 'playlist-section'
  view: string
  icon?: IconRef

  group?: 'discover' | 'library' | 'tools'
  order?: number
  when?: EntryVisibilityRule
}

export interface HomeSectionDeclaration {
  id: string
  title: string
  kind: 'playlists' | 'charts'
  providerIds?: string[]
  icon?: IconRef
  order?: number
}

export interface SlotDeclaration {
  id: string
  slot: UISlotName
  mode: 'append' | 'prepend' | 'wrap' | 'replace'
  view: string
  order?: number
  when?: { loggedIn?: boolean; route?: string }
}

export interface RegionDeclaration {
  region: string
  view: string
}

export interface SkinDeclaration {
  id: string
  title: string
  preview?: IconRef

  regions: string[]

  settings?: JsonObject
}

export type PluginManifest = PluginManifestV3
