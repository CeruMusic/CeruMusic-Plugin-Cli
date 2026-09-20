import type { Disposable, JsonValue } from './manifest.js'
import type { OperationContext } from './index.js'

export interface GuestProvider {
  id: string
  name: string
  /** Lowest to highest, as declared by the imported script. */
  qualities: string[]
  protocols: string[]
}

export interface GuestInfo {
  id: string
  adapterId: string
  name: string
  version: string
  author?: string
  state: 'ready' | 'stopped' | 'error'
  selected: boolean
  providers: GuestProvider[]
  error?: string
}

/** Requires a Host with Guest management support; the SDK does not install Guest runtimes. */
export interface GuestAPI {
  list(): Promise<GuestInfo[]>
  /** The Host owns file selection and approval. Cancellation returns null. */
  import(adapterId: string): Promise<GuestInfo | null>
  select(guestId: string | null): Promise<void>
  remove(guestId: string): Promise<void>
  invoke(
    guestId: string,
    method: string,
    input: JsonValue,
    operation: OperationContext,
  ): Promise<JsonValue>
}

export interface GuestBootstrapAPI {
  readonly scriptInfo: Readonly<{
    name: string
    version: string
    author?: string
    description?: string
    homepage?: string
    rawScript: string
  }>
  ready(metadata: { providers: GuestProvider[] }): void
  handle(
    handler: (method: string, input: JsonValue, operation: OperationContext) => Promise<JsonValue>,
  ): Disposable
  invokeHost(method: string, input: JsonValue): Promise<JsonValue>
}
