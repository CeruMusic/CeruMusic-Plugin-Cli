import { createDecipheriv, getCiphers } from 'node:crypto'
import { Readable } from 'node:stream'
import { chacha20 } from './chacha20.js'
import {
  assertStreamSpec,
  type StreamSpec,
  type StreamTransformFactory,
} from '@shiqianjiang/ceru-plugin-sdk'

export interface MediaUpstream {
  status: number
  headers: Record<string, string | undefined>
  body: Readable
}
export type MediaFetch = (range: string | undefined, signal: AbortSignal) => Promise<MediaUpstream>
export interface MediaResponse extends MediaUpstream {
  headers: Record<string, string>
}
const nativeChacha20 = getCiphers().includes('chacha20')
const decipher = (algorithm: string, key: Buffer, iv: Buffer) =>
  algorithm === 'chacha20' && !nativeChacha20
    ? chacha20(key, iv)
    : createDecipheriv(algorithm, key, iv)
export class MediaRangeError extends Error {
  constructor(readonly length?: number) {
    super('Invalid media byte range')
  }
}

function byteRange(range: string | undefined, length: number | undefined) {
  if (!range)
    return { start: 0, end: length === undefined ? undefined : length - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match || (!match[1] && !match[2]) || length === 0) throw new MediaRangeError(length)
  let start: number, end: number | undefined
  if (!match[1]) {
    const suffix = Number(match[2])
    if (length === undefined || !Number.isSafeInteger(suffix) || suffix <= 0)
      throw new MediaRangeError(length)
    start = Math.max(0, length - suffix)
    end = length - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : length === undefined ? undefined : length - 1
  }
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    (end !== undefined && (!Number.isSafeInteger(end) || end < start)) ||
    (length !== undefined && start >= length)
  )
    throw new MediaRangeError(length)
  if (length !== undefined && end !== undefined) end = Math.min(end, length - 1)
  return { start, end, partial: true }
}
function increment(iv: Buffer, blocks: number, chacha: boolean) {
  const out = Buffer.from(iv)
  if (chacha) {
    const next = BigInt(out.readUInt32LE(0)) + BigInt(blocks)
    if (next > 0xffffffffn) throw Error('Stream counter overflow')
    out.writeUInt32LE(Number(next), 0)
  } else {
    let carry = BigInt(blocks)
    for (let index = 15; index >= 0; index--) {
      carry += BigInt(out[index])
      out[index] = Number(carry & 255n)
      carry >>= 8n
    }
    if (carry) throw Error('Stream counter overflow')
  }
  return out
}

/** Pull-based plaintext stream. Native crypto state stays in the Host process. */
export async function openMediaStream(
  spec: StreamSpec,
  fetch: MediaFetch,
  request: { range?: string; signal?: AbortSignal; transform?: StreamTransformFactory } = {},
): Promise<MediaResponse> {
  assertStreamSpec(spec)
  const lifetime = new AbortController()
  const signal = request.signal
    ? AbortSignal.any([lifetime.signal, request.signal])
    : lifetime.signal
  signal.throwIfAborted()
  const custom = 'transform' in spec
  if (custom && !request.transform) throw Error('Stream transform unavailable')
  const cbc = !custom && spec.decrypt.algorithm.endsWith('-cbc')
  const seekable = custom ? request.transform!.seekable : !cbc || spec.contentLength !== undefined
  let length = spec.contentLength
  // Unknown lengths and non-seekable transforms stream from zero and never guess byte offsets.
  const selection = byteRange(seekable && length !== undefined ? request.range : undefined, length)
  let cipherStart = 0,
    cipherEnd: number | undefined
  if (length !== undefined && selection.partial) {
    if (custom) cipherStart = selection.start
    else if (cbc) {
      const block = Math.floor(selection.start / 16) * 16
      cipherStart = Math.max(0, block - 16)
      cipherEnd =
        selection.end === length - 1 ? undefined : Math.ceil((selection.end! + 1) / 16) * 16 - 1
    } else {
      const block = spec.decrypt.algorithm === 'chacha20' ? 64 : 16
      cipherStart = Math.floor(selection.start / block) * block
      cipherEnd = selection.end
    }
  }
  const range =
    length !== undefined && selection.partial
      ? `bytes=${cipherStart}-${cipherEnd ?? ''}`
      : undefined
  const upstream = await fetch(range, signal)
  const abort = () =>
    upstream.body.destroy(
      signal.reason instanceof Error ? signal.reason : Error('Media stream cancelled'),
    )
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) {
    abort()
    throw signal.reason
  }
  try {
    if (![200, 206].includes(upstream.status))
      throw Error('Media upstream failed: ' + upstream.status)
    let actualStart = 0
    if (upstream.status === 206) {
      const header = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers['content-range'] ?? '')
      if (
        !header ||
        !range ||
        Number(header[1]) !== cipherStart ||
        Number(header[2]) < Number(header[1]) ||
        ![header[1], header[2], header[3]].every((value) => Number.isSafeInteger(Number(value))) ||
        Number(header[2]) >= Number(header[3])
      )
        throw Error('Invalid upstream content range')
      actualStart = cipherStart
      if (cipherEnd !== undefined && Number(header[2]) < cipherEnd)
        throw Error('Truncated upstream range')
      if (length === undefined && !cbc && !custom) length = Number(header[3])
    }
    if (length === undefined && !cbc && !custom) {
      const size = Number(upstream.headers['content-length'])
      if (Number.isSafeInteger(size) && size >= 0) length = size
    }
    const selected = byteRange(seekable ? request.range : undefined, length)
    if (selected.partial && length === undefined) throw new MediaRangeError()
    const headers: Record<string, string> = {
      'content-type':
        spec.contentType ?? upstream.headers['content-type'] ?? 'application/octet-stream',
      'accept-ranges': seekable ? 'bytes' : 'none',
      'cache-control': 'no-store',
    }
    if (length !== undefined) {
      headers['content-length'] = String(selected.end! - selected.start + 1)
      if (selected.partial)
        headers['content-range'] = `bytes ${selected.start}-${selected.end}/${length}`
    }
    const iterator = async function* () {
      let skip = selected.start - actualStart,
        remaining = selected.end === undefined ? Infinity : selected.end - selected.start + 1
      let cipher: ReturnType<typeof decipher> | undefined
      let previous = Buffer.alloc(0)
      let transform: Awaited<ReturnType<StreamTransformFactory['create']>> | undefined
      if (custom)
        transform = await request.transform!.create({
          offset: actualStart,
          info: spec.info,
          signal,
        })
      else {
        const { algorithm, key, iv, encoding = 'hex' } = spec.decrypt
        const init = (vector: Buffer) => {
          cipher = decipher(algorithm, Buffer.from(key, encoding), vector)
          if (cbc && cipherEnd !== undefined) cipher.setAutoPadding(false)
        }
        if (cbc) {
          if (actualStart === 0) init(Buffer.from(iv, encoding))
          else {
            skip -= 16
          }
        } else
          init(
            increment(
              Buffer.from(iv, encoding),
              actualStart / (algorithm === 'chacha20' ? 64 : 16),
              algorithm === 'chacha20',
            ),
          )
      }
      const slice = (value: Uint8Array) => {
        const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        const omitted = Math.min(skip, bytes.length)
        skip -= omitted
        const output = bytes.subarray(
          omitted,
          omitted + Math.min(remaining, bytes.length - omitted),
        )
        remaining -= output.length
        return output
      }
      try {
        for await (const piece of upstream.body) {
          signal.throwIfAborted()
          let bytes = Buffer.isBuffer(piece) ? piece : Buffer.from(piece)
          if (!custom && !cipher) {
            previous = Buffer.concat([previous, bytes])
            if (previous.length < 16) continue
            cipher = decipher(
              spec.decrypt.algorithm,
              Buffer.from(spec.decrypt.key, spec.decrypt.encoding ?? 'hex'),
              previous.subarray(0, 16),
            )
            if (cipherEnd !== undefined) cipher.setAutoPadding(false)
            bytes = previous.subarray(16)
            previous = Buffer.alloc(0)
          }
          const result = slice(custom ? await transform!.transform(bytes) : cipher!.update(bytes))
          if (result.length) yield result
          if (remaining === 0 && selected.partial && selected.end !== length! - 1) return
        }
        const tail = custom ? await transform!.flush?.() : cipher?.final()
        if (tail) {
          const result = slice(tail)
          if (result.length) yield result
        }
        if (skip > 0 || (remaining !== Infinity && remaining > 0))
          throw Error('Truncated plaintext stream')
      } finally {
        signal.removeEventListener('abort', abort)
        upstream.body.destroy()
        lifetime.abort()
        await transform?.dispose?.()
      }
    }
    const body = Readable.from(iterator())
    body.once('close', () => {
      signal.removeEventListener('abort', abort)
      upstream.body.destroy()
      lifetime.abort()
    })
    return { status: selected.partial ? 206 : 200, headers, body }
  } catch (error) {
    signal.removeEventListener('abort', abort)
    upstream.body.destroy()
    lifetime.abort()
    throw error
  }
}
