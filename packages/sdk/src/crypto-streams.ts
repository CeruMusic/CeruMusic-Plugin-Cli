import type { StreamAlgorithm } from './streams.js'

export interface CryptoStreamOptions {
  /** String keys and IVs are hexadecimal unless base64 is specified. */
  encoding?: 'hex' | 'base64'
  signal?: AbortSignal
}
export interface CryptoStreamsAPI {
  createCipher(
    algorithm: StreamAlgorithm,
    key: string | Uint8Array,
    iv: string | Uint8Array,
    options?: CryptoStreamOptions,
  ): TransformStream<Uint8Array, Uint8Array>
  createDecipher(
    algorithm: StreamAlgorithm,
    key: string | Uint8Array,
    iv: string | Uint8Array,
    options?: CryptoStreamOptions,
  ): TransformStream<Uint8Array, Uint8Array>
}
