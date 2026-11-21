import vm from 'node:vm'
import { parentPort } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, getCiphers } from 'node:crypto'
import { assertStreamSpec } from '@shiqianjiang/ceru-plugin-sdk'
import { chacha20 } from './chacha20.js'
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let context: vm.Context
let generation = ''
let messages = 0
let guestScript: string | undefined
let guestStarted = false
const streamInputs = new Map<string, ArrayBuffer>()
const streamReplies = new Set<string>()
let realmArrayBufferPrototype: object
const ciphers = new Map<string, ReturnType<typeof createCipheriv> | ReturnType<typeof chacha20>>()
const nativeChacha20 = getCiphers().includes('chacha20')
function realmBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = Uint8Array.from(bytes).buffer
  Object.setPrototypeOf(buffer, realmArrayBufferPrototype)
  return buffer
}
setInterval(() => {
  messages = 0
}, 1000).unref()
const deliver = (value: any) =>
  vm.runInContext('globalThis.__receive(' + JSON.stringify(JSON.stringify(value)) + ')', context, {
    timeout: 5000,
  })
parentPort!.on('message', async (message) => {
  try {
    if (message.type !== 'boot') {
      if (context && message.generation === generation) {
        if (message.type === 'rpc-binary-result') {
          const { id, buffer, value } = message.data
          if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > 1024 * 1024)
            throw Error('Invalid HTTP response buffer')
          const key = 'http-result:' + id
          Object.setPrototypeOf(buffer, realmArrayBufferPrototype)
          streamInputs.set(key, buffer)
          try {
            deliver({ generation, type: 'rpc-result', data: { id, value, binaryKey: key } })
          } finally { streamInputs.delete(key) }
        } else if (message.type === 'stream-cancel') {
          streamInputs.delete(message.data.id)
          streamReplies.delete(message.data.id)
        } else if (message.type === 'http-request-chunk') {
          const { id, sequence, buffer } = message.data
          if (
            typeof id !== 'string' ||
            !Number.isSafeInteger(sequence) ||
            !(buffer instanceof ArrayBuffer) ||
            buffer.byteLength > 1024 * 1024 ||
            streamInputs.size >= 16
          )
            throw Error('Invalid HTTP chunk')
          Object.setPrototypeOf(buffer, realmArrayBufferPrototype)
          streamInputs.set(id + ':' + sequence, buffer)
          deliver({ ...message, data: { ...message.data, buffer: undefined } })
        } else if (message.type === 'http-cancel') {
          for (const key of streamInputs.keys())
            if (key.startsWith(message.data.id + ':')) streamInputs.delete(key)
          deliver(message)
        } else if (message.type === 'stream-chunk') {
          if (
            typeof message.data?.id !== 'string' ||
            !(message.data.buffer instanceof ArrayBuffer) ||
            message.data.buffer.byteLength > 1024 * 1024 ||
            streamReplies.size >= 8
          )
            throw Error('Invalid stream chunk')
          const buffer = message.data.buffer
          Object.setPrototypeOf(buffer, realmArrayBufferPrototype)
          streamInputs.set(message.data.id, buffer)
          streamReplies.add(message.data.id)
          deliver({ ...message, data: { ...message.data, buffer: undefined } })
        } else deliver(message)
      }
      return
    }
    generation = message.generation
    guestScript = message.guest?.script
    context = vm.createContext(
      {
        __bridge: (encoded: string, binary?: ArrayBuffer) => {
          try {
            if (typeof encoded !== 'string' || encoded.length > 8 * 1024 * 1024)
              throw new Error('Host message too large')
            const { kind, value } = JSON.parse(encoded)
            let result: any = null
            if (kind === 'cipher.create') {
              if (ciphers.size >= 128 || !['encrypt', 'decrypt'].includes(value.mode))
                throw Error('Cipher capacity exceeded')
              assertStreamSpec({
                decrypt: {
                  algorithm: value.algorithm,
                  key: value.key,
                  iv: value.iv,
                  encoding: value.encoding,
                },
              })
              const key = Buffer.from(value.key, value.encoding ?? 'hex'),
                iv = Buffer.from(value.iv, value.encoding ?? 'hex')
              const cipher =
                value.algorithm === 'chacha20' && !nativeChacha20
                  ? chacha20(key, iv)
                  : (value.mode === 'encrypt' ? createCipheriv : createDecipheriv)(
                      value.algorithm,
                      key,
                      iv,
                    )
              const id = randomUUID()
              ciphers.set(id, cipher)
              result = id
            } else if (kind === 'cipher.update' || kind === 'cipher.final') {
              const cipher = ciphers.get(value)
              if (!cipher) throw Error('Cipher is closed')
              try {
                if (kind === 'cipher.final') {
                  ciphers.delete(value)
                  return realmBytes(cipher.final())
                }
                const length = Object.getOwnPropertyDescriptor(
                  ArrayBuffer.prototype,
                  'byteLength',
                )!.get!.call(binary)
                if (length > 1024 * 1024) throw Error('Cipher chunk too large')
                return realmBytes(cipher.update(new Uint8Array(binary!)))
              } catch (error) {
                ciphers.delete(value)
                throw error
              }
            } else if (kind === 'cipher.close') {
              ciphers.delete(value)
            } else if (kind === 'stream.take') {
              const buffer = streamInputs.get(value)
              if (!buffer) throw Error('Stream chunk unavailable')
              streamInputs.delete(value)
              return buffer
            } else if (kind === 'http.send') {
              const length = Object.getOwnPropertyDescriptor(
                ArrayBuffer.prototype,
                'byteLength',
              )!.get!.call(binary)
              if (length > 1024 * 1024) throw Error('HTTP chunk exceeds 1 MiB')
              parentPort!.postMessage(
                { type: 'http-response-chunk', generation, data: { ...value, buffer: binary } },
                [binary!],
              )
            } else if (kind === 'stream.send') {
              if (!streamReplies.delete(value.id)) return JSON.stringify({ value: null })
              const length = Object.getOwnPropertyDescriptor(
                ArrayBuffer.prototype,
                'byteLength',
              )!.get!.call(binary)
              if (length > 1024 * 1024) throw Error('Invalid stream reply')
              streamInputs.delete(value.id)
              parentPort!.postMessage(
                {
                  type: 'stream-result',
                  generation,
                  data: { id: value.id, error: value.error, buffer: binary },
                },
                [binary!],
              )
            } else if (kind === 'message') {
              if (++messages > 1000) throw new Error('Plugin message rate exceeded')
              parentPort!.postMessage({ ...value, generation })
              if (value.type === 'bootstrap-ready' && guestScript !== undefined && !guestStarted) {
                guestStarted = true
                setImmediate(() => {
                  try {
                    vm.runInContext(guestScript!, context, { timeout: 5000, filename: 'guest.js' })
                  } catch (error) {
                    parentPort!.postMessage({
                      type: 'failed',
                      generation,
                      data: { message: error instanceof Error ? error.message : String(error) },
                    })
                  }
                })
              }
            } else if (kind === 'random') {
              if (!Number.isInteger(value) || value < 0 || value > 65536)
                throw new Error('Invalid random byte length')
              result = [...randomBytes(value)]
            } else if (kind === 'url') {
              const url = new URL(value.url, value.base)
              if (value.search !== undefined) url.search = value.search
              result = Object.fromEntries(
                [
                  'href',
                  'origin',
                  'protocol',
                  'hostname',
                  'host',
                  'port',
                  'username',
                  'password',
                  'pathname',
                  'hash',
                  'search',
                ].map((key) => [key, (url as any)[key]]),
              )
            } else if (kind === 'params') {
              const params = new URLSearchParams(value.value)
              const allowed = [
                'get',
                'getAll',
                'has',
                'set',
                'append',
                'delete',
                'sort',
                'entries',
                'toString',
              ]
              if (!allowed.includes(value.method)) throw new Error('Invalid URL operation')
              result = (params as any)[value.method](...value.args)
              if (value.method === 'entries') result = [...params.entries()]
              if (['set', 'append', 'delete', 'sort'].includes(value.method))
                result = params.toString()
            } else if (kind === 'uuid') result = randomUUID()
            else if (kind === 'decode')
              result = new TextDecoder(value.encoding).decode(Uint8Array.from(value.bytes))
            else if (kind === 'timer') {
              if (timers.size >= 256) throw new Error('Plugin timer limit exceeded')
              const callback = () => {
                if (!value.repeat) timers.delete(value.id)
                try {
                  deliver({ type: 'timer', id: value.id })
                } catch (error) {
                  parentPort!.postMessage({
                    type: 'failed',
                    generation,
                    data: { message: String(error) },
                  })
                }
              }
              timers.set(
                value.id,
                (value.repeat ? setInterval : setTimeout)(
                  callback,
                  Math.max(value.repeat ? 10 : 0, Math.min(Number(value.ms) || 0, 2147483647)),
                ),
              )
            } else if (kind === 'clearTimer') {
              clearTimeout(timers.get(value))
              clearInterval(timers.get(value))
              timers.delete(value)
            } else throw new Error('Unknown Host operation')
            return JSON.stringify({ value: result })
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : 'Host operation failed',
            })
          }
        },
      },
      { codeGeneration: { strings: false, wasm: true } },
    )
    realmArrayBufferPrototype = vm.runInContext('ArrayBuffer.prototype', context)
    const [globals, runtime, catalog] = await Promise.all(
      ['node-globals.js', 'sandbox.js', 'catalog.json'].map((name) =>
        readFile(new URL('../assets/' + name, import.meta.url), 'utf8'),
      ),
    )
    vm.runInContext(globals, context, { timeout: 5000 })
    vm.runInContext(runtime, context, { timeout: 5000 })
    deliver({
      type: 'init',
      data: {
        generation,
        kind: message.guest ? 'guest' : 'logic',
        lifecycleOnly: message.lifecycleOnly,
        guest: message.guest
          ? {
              id: message.guest.id,
              info: { ...message.guest.info, rawScript: message.guest.script },
            }
          : undefined,
        mode: 'production',
        manifest: message.manifest,
        serverAddress: message.serverAddress,
        resources: message.resources,
        catalog: JSON.parse(catalog),
      },
    })
    vm.runInContext('globalThis.__ceruStart([' + message.entries.join(',') + '])', context, {
      timeout: 5000,
    })
  } catch (error) {
    parentPort!.postMessage({
      type: 'failed',
      generation,
      data: { message: error instanceof Error ? error.message : String(error) },
    })
  }
})
