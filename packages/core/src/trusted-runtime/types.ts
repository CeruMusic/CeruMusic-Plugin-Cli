import type { RequestListener } from 'node:http'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'
import type { PermissionName, PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

export interface TrustedConsent {
  granted: true
  pluginId: string
  publisher: string
  /** Must explicitly match the unsigned development exception. */
  development?: boolean
  /** Required for an Electron utility process without Node permission enforcement. */
  fileAccess?: 'unrestricted'
  /** Abort on revocation, disable, uninstall, or host shutdown. */
  signal: AbortSignal
}
export interface TrustedVerification {
  /** Assertion supplied by the host AFTER signature/artifact verification. */
  signatureVerified: boolean
  codeDigest: string
  publisher: string
  /** Exact native declaration names vetted as Node-API by the package author/host.
   * Hash checks cannot prove the ABI or safety of arbitrary machine code. */
  nodeApiModules: readonly string[]
}
export interface TrustedServerRegistration {
  pluginId: string
  port: number
  host: '127.0.0.1' | '0.0.0.0'
  url: string
}
/** Host-owned transport adapter. Plugin code never supplies this object. */
export interface TrustedProcessTransport {
  readonly pid: number | undefined
  send(message: string, done: (error?: Error | null) => void): void
  kill(): void
  onMessage(listener: (message: unknown) => void): void
  onExit(listener: (code: number | null, signal?: string | null) => void): void
  onError(listener: (error: Error) => void): void
  onDisconnect(listener: () => void): void
  onStderr(listener: (data: unknown) => void): void
}
export interface TrustedProcessLaunch {
  runner: string
  directory: string
  token: string
}
export interface TrustedRuntimeOptions {
  artifact: Artifact
  verification: TrustedVerification
  consent: TrustedConsent
  /** Explicit local development exception; never inferred from an unsigned artifact. */
  development?: boolean
  /** Electron executable; regular Node is also supported by core/CLI tests. */
  executable: string
  /** Electron host only: launches utilityProcess and transfers a dedicated MessagePort.
   * Requires consent.fileAccess=unrestricted; never silently falls back to another mode. */
  launchUtilityProcess?: (launch: TrustedProcessLaunch) => TrustedProcessTransport
  /** Existing dedicated plugin data directory. */
  dataDir: string
  /** Existing host-owned directory for private, disposable runtime sessions. */
  nativeDir: string
  /** Optional host lifetime signal, in addition to consent revocation. */
  signal?: AbortSignal
  /** Use createDispatcher(services, hooks) here to retain normal host checks. */
  rpc(method: string, data: any, signal: AbortSignal): Promise<any>
  authorize(key: string, permission: PermissionName, signal: AbortSignal): Promise<void>
  /** Register the actual port with playback URL validation. Disposer must remove it. */
  onListen(server: TrustedServerRegistration, signal: AbortSignal): Promise<() => void> | (() => void)
  onLog?(entry: { level: string; message: string; data?: unknown }): void
  onExit?(error?: Error): void
  startupTimeoutMs?: number
}
export interface TrustedServerHandle {
  readonly port: number
  readonly url: string
  close(): Promise<void>
}
export interface TrustedServerContext extends Omit<PluginContext, 'server'> {
  server: {
    readonly url: string | undefined
    readonly port: number | undefined
    listen(listener: RequestListener, options?: { port?: number; lan?: boolean; permissionKey?: string; lanPermissionKey?: string }): Promise<TrustedServerHandle>
  }
  native: { load(name: string): unknown; path(name: string): string }
  paths: { data: string; native: string }
}
export type TrustedServerEntry = (ctx: TrustedServerContext) => void | (() => unknown) | Promise<void | (() => unknown)>
export function defineServer(entry: TrustedServerEntry): TrustedServerEntry { return entry }
