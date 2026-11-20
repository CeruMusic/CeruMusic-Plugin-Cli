import { Buffer } from 'buffer'
import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill'
// The native bridge is captured here and deleted before any plugin code runs.
const bridge = (globalThis as any).__bridge
delete (globalThis as any).__bridge
const native = (kind: string, value: any) => {
  const result = JSON.parse(bridge(JSON.stringify({ kind, value })))
  if (result.error) throw new Error(result.error)
  return result.value
}
;(globalThis as any).__ceruBinary = {
  cipher(
    mode: string,
    algorithm: string,
    key: string | Uint8Array,
    iv: string | Uint8Array,
    options: any = {},
  ) {
    const encode = (value: string | Uint8Array) =>
      typeof value === 'string' ? value : Buffer.from(value).toString(options.encoding ?? 'hex')
    const id = native('cipher.create', {
      mode,
      algorithm,
      key: encode(key),
      iv: encode(iv),
      encoding: options.encoding,
    })
    let closed = false
    const close = () => {
      if (!closed) {
        closed = true
        native('cipher.close', id)
        options.signal?.removeEventListener('abort', abort)
      }
    }
    let controller: any
    const abort = () => {
      close()
      controller?.error(Error('Cipher cancelled'))
    }
    const call = (kind: string, buffer?: ArrayBuffer) => {
      if (closed) throw Error('Cipher is closed')
      const value = bridge(JSON.stringify({ kind, value: id }), buffer)
      if (typeof value === 'string') {
        const result = JSON.parse(value)
        throw Error(result.error ?? 'Cipher failed')
      }
      return new Uint8Array(value)
    }
    const stream = new TransformStream({
      start(value) {
        controller = value
        options.signal?.addEventListener('abort', abort, { once: true })
        if (options.signal?.aborted) abort()
      },
      transform(chunk, value) {
        if (!(chunk instanceof Uint8Array)) {
          close()
          throw Error('Cipher input must be Uint8Array')
        }
        try {
          for (let offset = 0; offset < chunk.length; offset += 1024 * 1024) {
            const bytes = chunk.subarray(offset, offset + 1024 * 1024)
            const buffer =
              bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
                ? bytes.buffer
                : Uint8Array.from(bytes).buffer
            const result = call('cipher.update', buffer as ArrayBuffer)
            if (result.length) value.enqueue(result)
          }
        } catch (error) {
          close()
          throw error
        }
      },
      flush(value) {
        try {
          const result = call('cipher.final')
          if (result.length) value.enqueue(result)
        } finally {
          close()
        }
      },
      cancel() {
        close()
      },
    })
    return stream
  },
  take(id: string): Uint8Array {
    const bytes = bridge(JSON.stringify({ kind: 'stream.take', value: id }))
    return new Uint8Array(bytes)
  },
  httpSend(value: any, bytes = new Uint8Array()) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024)
      throw Error('HTTP chunk exceeds 1 MiB')
    // A copy also handles views and prevents detaching a plugin's reusable buffer.
    const buffer = Uint8Array.from(bytes).buffer
    const result = JSON.parse(bridge(JSON.stringify({ kind: 'http.send', value }), buffer))
    if (result.error) throw Error(result.error)
  },
  send(id: string, bytes?: Uint8Array, error?: string) {
    if (bytes !== undefined && (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024))
      throw Error('Invalid stream output')
    const buffer =
      bytes === undefined
        ? new ArrayBuffer(0)
        : bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : Uint8Array.from(bytes).buffer
    const result = JSON.parse(
      bridge(JSON.stringify({ kind: 'stream.send', value: { id, error } }), buffer),
    )
    if (result.error) throw Error(result.error)
  },
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

// These implementations are compiled into this realm. Injecting Node's native
// fetch classes would expose host Function constructors through their methods.
class SafeHeaders {
  private fields = new Map<string, string[]>()
  constructor(init?: any) {
    if (init == null) return
    if (typeof init[Symbol.iterator] === 'function') {
      for (const pair of init) {
        if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('Invalid header pair')
        this.append(pair[0], pair[1])
      }
    } else for (const key of Object.keys(init)) this.append(key, init[key])
  }
  private name(value: string) {
    const name = String(value).toLowerCase()
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) throw new TypeError('Invalid header name')
    return name
  }
  private value(value: string) {
    const text = String(value).replace(/^[\t ]+|[\t ]+$/g, '')
    if (/[\r\n\0]/.test(text) || [...text].some((char) => char.charCodeAt(0) > 255))
      throw new TypeError('Invalid header value')
    return text
  }
  append(name: string, value: string) {
    const key = this.name(name),
      text = this.value(value)
    this.fields.set(key, [...(this.fields.get(key) ?? []), text])
  }
  set(name: string, value: string) {
    this.fields.set(this.name(name), [this.value(value)])
  }
  get(name: string) {
    return this.fields.get(this.name(name))?.join(', ') ?? null
  }
  has(name: string) {
    return this.fields.has(this.name(name))
  }
  delete(name: string) {
    this.fields.delete(this.name(name))
  }
  getSetCookie() {
    return [...(this.fields.get('set-cookie') ?? [])]
  }
  *entries(): IterableIterator<[string, string]> {
    for (const name of [...this.fields.keys()].sort()) {
      for (const value of name === 'set-cookie' ? this.fields.get(name)! : [this.get(name)!])
        yield [name, value]
    }
  }
  *keys() {
    for (const [key] of this.entries()) yield key
  }
  *values() {
    for (const [, value] of this.entries()) yield value
  }
  [Symbol.iterator]() {
    return this.entries()
  }
  forEach(callback: Function, thisArg?: any) {
    for (const [key, value] of this) callback.call(thisArg, value, key, this)
  }
}
class SafeBody {
  readonly body: ReadableStream<Uint8Array> | null
  private consumed = false
  constructor(value: any, headers: SafeHeaders) {
    if (value == null) this.body = null
    else if (value instanceof ReadableStream) this.body = value
    else {
      let bytes: Uint8Array
      if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0))
      else if (ArrayBuffer.isView(value))
        bytes = Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
      else if (typeof value === 'string' || value instanceof SafeURLSearchParams) {
        bytes = Uint8Array.from(Buffer.from(String(value), 'utf8'))
        if (!headers.has('content-type'))
          headers.set(
            'content-type',
            value instanceof SafeURLSearchParams
              ? 'application/x-www-form-urlencoded;charset=UTF-8'
              : 'text/plain;charset=UTF-8',
          )
      } else throw new TypeError('Unsupported HTTP body')
      this.body = new ReadableStream({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      })
    }
  }
  get bodyUsed() {
    return this.consumed || !!this.body?.locked
  }
  async arrayBuffer() {
    if (this.bodyUsed) throw new TypeError('Body already used')
    this.consumed = true
    if (!this.body) return new ArrayBuffer(0)
    const reader = this.body.getReader(),
      chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!(value instanceof Uint8Array)) throw new TypeError('Body must contain bytes')
        chunks.push(value)
        size += value.byteLength
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return bytes.buffer
  }
  async bytes() {
    return new Uint8Array(await this.arrayBuffer())
  }
  async text() {
    return Buffer.from(await this.arrayBuffer()).toString('utf8')
  }
  async json() {
    return JSON.parse(await this.text())
  }
  protected split() {
    if (this.bodyUsed) throw new TypeError('Body already used')
    if (!this.body) return null
    const [original, clone] = this.body.tee()
    Object.defineProperty(this, 'body', { value: original, configurable: true })
    return clone
  }
}
class SafeRequest extends SafeBody {
  readonly url: string
  readonly method: string
  readonly headers: SafeHeaders
  readonly signal: SafeAbortSignal
  readonly duplex = 'half'
  constructor(input: string | SafeRequest, init: any = {}) {
    const source = input instanceof SafeRequest ? input : undefined
    const headers = new SafeHeaders(init.headers ?? source?.headers)
    const method = String(init.method ?? source?.method ?? 'GET')
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method) || /^(CONNECT|TRACE|TRACK)$/i.test(method))
      throw new TypeError('Invalid request method')
    const normalized = /^(DELETE|GET|HEAD|OPTIONS|POST|PUT)$/i.test(method)
      ? method.toUpperCase()
      : method
    const body = init.body !== undefined ? init.body : source?.body
    if (body != null && (normalized === 'GET' || normalized === 'HEAD'))
      throw new TypeError('GET/HEAD cannot have a body')
    super(body, headers)
    const url = new SafeURL(source?.url ?? String(input))
    if (url.username || url.password) throw new TypeError('Request URL contains credentials')
    this.url = url.href
    this.method = normalized
    this.headers = headers
    this.signal = init.signal ?? source?.signal ?? new SafeAbortSignal()
  }
  clone() {
    return new SafeRequest(this, { body: this.split() })
  }
}
class SafeResponse extends SafeBody {
  readonly headers: SafeHeaders
  readonly status: number
  readonly statusText: string
  readonly url = ''
  readonly redirected = false
  readonly type: string = 'default'
  constructor(body: any = null, init: any = {}) {
    const status = init.status ?? 200,
      headers = new SafeHeaders(init.headers)
    if (!Number.isInteger(status) || status < 200 || status > 599)
      throw new RangeError('Invalid response status')
    if (body != null && [204, 205, 304].includes(status))
      throw new TypeError('Response status forbids a body')
    if (/[^\t\x20-\x7e\x80-\xff]/.test(String(init.statusText ?? '')))
      throw new TypeError('Invalid status text')
    super(body, headers)
    this.headers = headers
    this.status = status
    this.statusText = String(init.statusText ?? '')
  }
  get ok() {
    return this.status >= 200 && this.status < 300
  }
  clone() {
    return new SafeResponse(this.split(), this)
  }
  static json(value: any, init: any = {}) {
    const headers = new SafeHeaders(init.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    const text = JSON.stringify(value)
    if (text === undefined) throw new TypeError('Value is not JSON serializable')
    return new SafeResponse(text, { ...init, headers })
  }
  static redirect(url: string, status = 302) {
    if (![301, 302, 303, 307, 308].includes(status)) throw new RangeError('Invalid redirect status')
    return new SafeResponse(null, { status, headers: { location: new SafeURL(url).href } })
  }
  static error() {
    const response = new SafeResponse()
    Object.defineProperties(response, { status: { value: 0 }, type: { value: 'error' } })
    return response
  }
}
Object.assign(globalThis, {
  ReadableStream,
  WritableStream,
  TransformStream,
  Headers: SafeHeaders,
  Request: SafeRequest,
  Response: SafeResponse,
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
