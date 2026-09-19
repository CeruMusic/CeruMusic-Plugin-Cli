import { Buffer } from 'buffer'
// The native bridge is captured here and deleted before any plugin code runs.
const bridge = (globalThis as any).__bridge
delete (globalThis as any).__bridge
const native = (kind: string, value: any) => {
  const result = JSON.parse(bridge(JSON.stringify({ kind, value })))
  if (result.error) throw new Error(result.error)
  return result.value
}
const listeners = new Set<(event: any) => unknown>()
const timers = new Map<number, { callback: Function; args: any[]; repeat: boolean }>()
let timerSequence = 0
class SafeURLSearchParams {
  private query: string
  constructor(
    value: any = '',
    private changed?: (query: string) => void,
  ) {
    this.query = native('params', { value, method: 'toString', args: [] })
  }
  private call(method: string, ...args: any[]) {
    const result = native('params', { value: this.query, method, args })
    if (['append', 'delete', 'set', 'sort'].includes(method)) {
      this.query = result
      this.changed?.(result)
    }
    return result
  }
  get(key: string) {
    return this.call('get', key)
  }
  getAll(key: string) {
    return this.call('getAll', key)
  }
  has(key: string) {
    return this.call('has', key)
  }
  append(key: string, value: string) {
    this.call('append', key, value)
  }
  set(key: string, value: string) {
    this.call('set', key, value)
  }
  delete(key: string) {
    this.call('delete', key)
  }
  sort() {
    this.call('sort')
  }
  entries(): IterableIterator<[string, string]> {
    return this.call('entries')[Symbol.iterator]()
  }
  [Symbol.iterator]() {
    return this.entries()
  }
  forEach(fn: Function) {
    for (const [key, value] of this.entries()) fn(value, key, this)
  }
  toString() {
    return this.query
  }
}
class SafeURL {
  private value: any
  constructor(url: string, base?: any) {
    this.value = native('url', {
      url: String(url),
      base: base === undefined ? undefined : String(base),
    })
  }
  get href() {
    return this.value.href
  }
  set href(value: string) {
    this.value = native('url', { url: value })
  }
  get origin() {
    return this.value.origin
  }
  get protocol() {
    return this.value.protocol
  }
  get hostname() {
    return this.value.hostname
  }
  get host() {
    return this.value.host
  }
  get port() {
    return this.value.port
  }
  get username() {
    return this.value.username
  }
  get password() {
    return this.value.password
  }
  get pathname() {
    return this.value.pathname
  }
  get hash() {
    return this.value.hash
  }
  get search() {
    return this.value.search
  }
  get searchParams() {
    return new SafeURLSearchParams(this.value.search, (query) => {
      this.value = native('url', { url: this.href, search: query })
    })
  }
  toString() {
    return this.href
  }
  toJSON() {
    return this.href
  }
}
class SafeAbortSignal {
  aborted = false
  reason: any
  private listeners = new Set<Function>()
  addEventListener(name: string, listener: Function) {
    if (name === 'abort') this.listeners.add(listener)
  }
  removeEventListener(_name: string, listener: Function) {
    this.listeners.delete(listener)
  }
  throwIfAborted() {
    if (this.aborted) throw this.reason
  }
  abort(reason = new Error('Operation aborted')) {
    if (this.aborted) return
    this.aborted = true
    this.reason = reason
    for (const listener of this.listeners) listener({ type: 'abort' })
    this.listeners.clear()
  }
}
Object.assign(globalThis, {
  URL: SafeURL,
  URLSearchParams: SafeURLSearchParams,
  AbortController: class {
    signal = new SafeAbortSignal()
    abort(reason?: any) {
      this.signal.abort(reason)
    }
  },
  Buffer,
  window: globalThis,
  self: globalThis,
  parent: { postMessage: (message: any) => native('message', message) },
  addEventListener: (name: string, listener: any) => {
    if (name === 'message') listeners.add(listener)
  },
  btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
  setTimeout: (callback: Function, ms: number, ...args: any[]) => {
    const id = ++timerSequence
    timers.set(id, { callback, args, repeat: false })
    native('timer', { id, ms, repeat: false })
    return id
  },
  setInterval: (callback: Function, ms: number, ...args: any[]) => {
    const id = ++timerSequence
    timers.set(id, { callback, args, repeat: true })
    native('timer', { id, ms, repeat: true })
    return id
  },
  clearTimeout: (id: number) => {
    timers.delete(id)
    native('clearTimer', id)
  },
  clearInterval: (id: number) => {
    timers.delete(id)
    native('clearTimer', id)
  },
  TextEncoder: class {
    encode(value: string) {
      return Uint8Array.from(Buffer.from(value, 'utf8'))
    }
  },
  TextDecoder: class {
    constructor(private encoding = 'utf-8') {}
    decode(value: any) {
      const bytes = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value ?? 0)
      return native('decode', { bytes: [...bytes], encoding: this.encoding })
    }
  },
  crypto: {
    getRandomValues: (value: Uint8Array) => {
      const random = native('random', value.byteLength)
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength).set(random)
      return value
    },
    randomUUID: () => native('uuid', null),
  },
  __receive: (encoded: string) => {
    const data = JSON.parse(encoded)
    if (data.type === 'timer') {
      const timer = timers.get(data.id)
      if (timer) {
        if (!timer.repeat) timers.delete(data.id)
        timer.callback(...timer.args)
      }
      return
    }
    for (const listener of listeners)
      Promise.resolve(listener({ source: (globalThis as any).parent, data })).catch((error) =>
        native('message', { type: 'log', data: { level: 'error', values: [String(error)] } }),
      )
  },
})
