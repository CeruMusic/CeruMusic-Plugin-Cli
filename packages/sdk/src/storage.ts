import type { JsonValue } from './manifest.js'

export type PluginStorageReadKey = string | { key: string; pluginId?: string }
export type PluginStorageWriteKey =
  | string
  | {
      key: string
      pluginId?: string
      /** Omitted preserves the existing policy; new keys are private. Empty array revokes sharing. */
      readableBy?: '*' | string[]
    }

/** JSON storage. Structured keys and shared reads require a supporting desktop Host. */
export interface PluginStorageAPI {
  /** Missing local keys return null. Unauthorized shared reads reject. */
  get<T extends JsonValue = JsonValue>(key: PluginStorageReadKey): Promise<T | null>
  set(key: PluginStorageWriteKey, value: JsonValue): Promise<void>
  delete(key: PluginStorageReadKey): Promise<void>
}
