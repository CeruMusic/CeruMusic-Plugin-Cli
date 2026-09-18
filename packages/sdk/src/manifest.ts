import type { HostIconName, PermissionName } from './catalog.js'

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
  icon?: IconRef
  connectionMode?: 'none' | 'single' | 'multiple'
}
export interface SurfaceDeclaration {
  id: string
  kind: 'schema' | 'web'
  entry: string
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
