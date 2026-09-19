import vm from 'node:vm'
import { parentPort } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let context: vm.Context
let generation = ''
let messages = 0
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
      if (context && message.generation === generation) deliver(message)
      return
    }
    generation = message.generation
    context = vm.createContext(
      {
        __bridge: (encoded: string) => {
          try {
            if (typeof encoded !== 'string' || encoded.length > 8 * 1024 * 1024)
              throw new Error('Host message too large')
            const { kind, value } = JSON.parse(encoded)
            let result: any = null
            if (kind === 'message') {
              if (++messages > 1000) throw new Error('Plugin message rate exceeded')
              parentPort!.postMessage({ ...value, generation })
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
      { codeGeneration: { strings: false, wasm: false } },
    )
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
        kind: 'logic',
        mode: 'production',
        manifest: message.manifest,
        resources: message.resources,
        catalog: JSON.parse(catalog),
      },
    })
    vm.runInContext('globalThis.__ceruStart(' + message.entry + ')', context, { timeout: 5000 })
  } catch (error) {
    parentPort!.postMessage({
      type: 'failed',
      generation,
      data: { message: error instanceof Error ? error.message : String(error) },
    })
  }
})
