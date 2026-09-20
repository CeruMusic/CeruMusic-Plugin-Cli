import type { JsonObject, MaybePromise } from './manifest.js'

export interface ShareMusicInfo {
  songmid?: string | number
  hash?: string
  id?: string | number
  [key: string]: unknown
}

/** Context supplied by the separate share-resolver Host, not the desktop PluginContext. */
export interface ShareResolverContext<Config = JsonObject> {
  config: Readonly<Config>
  plugin: { name: string; version: string; author?: string }
  sources: Record<string, { name: string; qualitys: string[] }>
  request<T = unknown>(
    url: string,
    options?: {
      method?: string
      headers?: Record<string, string>
      body?: string
      timeout?: number
    },
  ): Promise<{ body: T; statusCode: number; headers: Record<string, string> }>
  /** Only available when the manifest declares a selected Guest adapter. */
  guest?: { name: string; version: string; author?: string; rawScript: string }
  runGuest?(bindings: Record<string, unknown>): void
  utils: {
    buffer: {
      from(data: unknown, encoding?: 'base64' | 'hex' | 'utf8'): Uint8Array
      bufToString(data: Uint8Array, encoding?: 'base64' | 'hex' | 'utf8'): string
    }
    crypto: {
      md5(value: string): string
      randomBytes(size: number): Uint8Array
      aesEncrypt(data: unknown, mode: string, key: unknown, iv?: unknown): Uint8Array
      rsaEncrypt(data: string, key: string): string
    }
  }
}

export interface ShareResolver {
  musicUrl(source: string, musicInfo: ShareMusicInfo, quality: string): Promise<string>
}

export type ShareResolverEntry<Config = JsonObject> = (
  context: ShareResolverContext<Config>,
) => MaybePromise<ShareResolver>
