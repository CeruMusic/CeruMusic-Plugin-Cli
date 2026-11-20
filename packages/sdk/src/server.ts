import type { MaybePromise } from './manifest.js'
import type { Disposable } from './manifest.js'
import type { PluginContext } from './index.js'

/** Use an explicit context type for trusted Node entries supplied by the Host. */
export type ServerEntry<Context = PluginContext> = (ctx: Context) => MaybePromise<void | Disposable>

/** Identity helper shared by sandbox and explicitly typed trusted server entries. */
export function defineServer<Context = PluginContext>(
  entry: ServerEntry<Context>,
): ServerEntry<Context> {
  return entry
}

/** The handler and its Web streams stay inside the plugin's sandbox. */
export type ServerHandler = (request: Request) => MaybePromise<Response>

export interface ServerOptions {
  port?: number
  lan?: boolean
  permissionKey?: string
  lanPermissionKey?: string
}

export interface ServerHandle {
  readonly url: string
  readonly port: number
  /** Stops the listener and cancels its outstanding requests. Idempotent. */
  close(): Promise<void>
}

export interface ServerAPI {
  /** Current sandbox or trusted server address; undefined while stopped. */
  readonly url: string | undefined
  readonly port: number | undefined
  /**
   * Starts one HTTP listener per plugin. The Host checks network.serve and any
   * additional LAN permission. Bodies stream in chunks of at most 1 MiB;
   * no more than eight requests may be active in a sandbox at once.
   */
  serve(handler: ServerHandler, options?: ServerOptions): Promise<ServerHandle>
}
