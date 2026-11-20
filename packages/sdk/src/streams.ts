import type { JsonObject, MaybePromise } from './manifest.js'

export type StreamAlgorithm =
  | 'aes-128-ctr'
  | 'aes-256-ctr'
  | 'aes-128-cbc'
  | 'aes-256-cbc'
  | 'chacha20'
export interface StreamMetadata {
  contentType?: string
  /** Plaintext byte length, including any audio headers. */
  contentLength?: number
}
export type StreamSpec = StreamMetadata &
  (
    | {
        decrypt: {
          algorithm: StreamAlgorithm
          key: string
          iv: string
          encoding?: 'hex' | 'base64'
        }
      }
    | { transform: string; info?: JsonObject }
  )
export interface StreamTransform {
  transform(chunk: Uint8Array): MaybePromise<Uint8Array>
  flush?(): MaybePromise<Uint8Array | void>
  dispose?(): MaybePromise<void>
}
export interface StreamTransformFactory {
  seekable: boolean
  create(input: {
    offset: number
    info?: JsonObject
    signal?: AbortSignal
  }): MaybePromise<StreamTransform>
}
export interface StreamsAPI {
  registerTransform(id: string, factory: StreamTransformFactory): () => void
}

export function assertStreamSpec(value: unknown): asserts value is StreamSpec {
  const record = (row: unknown): row is Record<string, any> =>
    !!row && typeof row === 'object' && !Array.isArray(row)
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !['decrypt', 'transform', 'info', 'contentType', 'contentLength'].includes(key),
    )
  )
    throw Error('Invalid stream specification')
  if (
    value.contentType !== undefined &&
    (typeof value.contentType !== 'string' ||
      value.contentType.length > 256 ||
      !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;[\x20-\x7e]*)?$/.test(value.contentType))
  )
    throw Error('Invalid stream content type')
  if (
    value.contentLength !== undefined &&
    (!Number.isSafeInteger(value.contentLength) || value.contentLength < 0)
  )
    throw Error('Invalid stream content length')
  if (value.decrypt !== undefined) {
    const row = value.decrypt
    if (
      value.transform !== undefined ||
      value.info !== undefined ||
      !record(row) ||
      Object.keys(row).some((key) => !['algorithm', 'key', 'iv', 'encoding'].includes(key))
    )
      throw Error('Invalid stream decryption')
    if (
      !['aes-128-ctr', 'aes-256-ctr', 'aes-128-cbc', 'aes-256-cbc', 'chacha20'].includes(
        row.algorithm,
      )
    )
      throw Error('Invalid stream algorithm')
    const keyBytes = row.algorithm.startsWith('aes-128') ? 16 : 32
    if (row.encoding !== undefined && !['hex', 'base64'].includes(row.encoding))
      throw Error('Invalid stream encoding')
    for (const [name, bytes] of [
      ['key', keyBytes],
      ['iv', 16],
    ] as const) {
      const text = row[name]
      const symbols = Math.floor(bytes / 3) * 4 + (bytes % 3 ? (bytes % 3) + 1 : 0)
      const valid =
        typeof text === 'string' &&
        ((row.encoding ?? 'hex') === 'hex'
          ? new RegExp('^[a-fA-F0-9]{' + bytes * 2 + '}$').test(text)
          : new RegExp(
              '^[A-Za-z0-9+/]{' +
                symbols +
                '}' +
                (bytes % 3 ? '='.repeat(3 - (bytes % 3)) : '') +
                '$',
            ).test(text))
      if (!valid) throw Error('Invalid stream ' + name)
    }
  } else {
    if (typeof value.transform !== 'string' || !/^[\w.-]{1,128}$/.test(value.transform))
      throw Error('Invalid stream transform')
    if (
      value.info !== undefined &&
      (!record(value.info) || new TextEncoder().encode(JSON.stringify(value.info)).length > 65536)
    )
      throw Error('Invalid stream transform info')
  }
}
