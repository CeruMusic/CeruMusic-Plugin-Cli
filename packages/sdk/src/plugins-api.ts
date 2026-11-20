import type { JsonValue, OperationContext, ServiceDeclaration } from './index.js'
export type ServiceHandler = (
  input: JsonValue,
  call: { callerPluginId: string; operation: OperationContext },
) => JsonValue | void | Promise<JsonValue | void>
export interface PluginsAPI {
  use<T = Record<string, (input: JsonValue) => Promise<JsonValue>>>(
    pluginId: string,
    service: string,
  ): Promise<T | null>
  list(): Promise<{ pluginId: string; services: ServiceDeclaration[] }[]>
  on(
    event: 'available' | 'unavailable',
    handler: (info: { pluginId: string; service: string }) => void,
  ): () => void
}
