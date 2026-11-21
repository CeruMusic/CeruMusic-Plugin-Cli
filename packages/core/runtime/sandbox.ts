import * as lodash from 'lodash-es'
import { HOST_ICON_NAMES, HOST_ASSET_NAMES, LODASH_METHODS } from '../../sdk/src/catalog'
import { createHttpClient } from '../../sdk/src/http'
import { HOST_SERVICE_EVENT_NAMES } from '../../sdk/src/services'
import { operationEventPermission } from '../../sdk/src/events'
import { isLibraryOperation, isSearchOperation, isLyricOperation, isDownloadOperation, PLAYBACK_OPERATION_NAMES } from '../../sdk/src/hooks'
import { LIFECYCLE_NAMES } from '../../sdk/src/lifecycle'
import * as cryptoTools from '../../sdk/src/compat/crypto.js'
import * as compressionTools from '../../sdk/src/compat/zlib.js'
import * as encodingTools from '../../sdk/src/compat/encoding.js'
import { createLegacyHttpBridge } from '../../sdk/src/legacy-http'
import { createRpcMethods, RPC } from '../src/contract'
import { prepareRpcPayload } from './rpc'
import { assertNavigationRequest } from '../../sdk/src/navigation'
import { observeSurfaceSize } from './surface-size'

const binary = (globalThis as any).__ceruBinary
delete (globalThis as any).__ceruBinary
const streamFactories = new Map<string, any>()
const streamInstances = new Map<string, any>()
let streamSequence = 0
let serverAddress: { url: string; port: number } | undefined
let serverRegistration:
  | {
      handler: (request: Request) => any
      port?: number
      address?: { url: string; port: number }
      stopped: boolean
      close: () => Promise<void>
    }
  | undefined
const httpRequests = new Map<
  string,
  {
    abort: AbortController
    input?: ReadableStreamDefaultController<Uint8Array>
    inputPending?: { sequence: number; resolve: () => void; reject: (error: Error) => void }
    output?: ReadableStreamDefaultReader<Uint8Array>
    sequence: number
    busy: boolean
  }
>()

function finishHttp(id: string, reason?: string) {
  const state = httpRequests.get(id)
  if (!state) return
  httpRequests.delete(id)
  const error = Error(reason ?? 'HTTP request finished')
  if (reason) {
    try {
      state.abort.abort(error)
    } catch (error) {
      console.error(error)
    }
  }
  state.inputPending?.reject(error)
  try {
    state.input?.error(error)
  } catch {}
  void state.output?.cancel(error).catch(() => {})
  send('http-request-cancel', { id })
}

async function serveHttp(handler: (request: Request) => any, options: any = {}) {
  if (
    !binary ||
    initialized.kind !== 'logic' ||
    initialized.lifecycleOnly ||
    disposed ||
    initialized.manifest.entry.server?.runtime === 'node'
  )
    throw Error('HTTP server is unavailable in this runtime')
  if (typeof handler !== 'function' || serverRegistration)
    throw Error('HTTP server already registered or invalid handler')
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !['port', 'lan', 'permissionKey', 'lanPermissionKey'].includes(key),
    )
  )
    throw Error('Invalid HTTP server options')
  let closing: Promise<void> | undefined
  const registration = {
    handler,
    port: undefined as number | undefined,
    address: undefined as { url: string; port: number } | undefined,
    stopped: false,
    close: () => {
      if (registration.stopped) return Promise.resolve()
      if (closing) return closing
      for (const id of httpRequests.keys()) finishHttp(id, 'HTTP server stopped')
      // Keep the slot occupied until the Host has actually closed its listener.
      closing = rpc('server.stop', { port: registration.port }).finally(() => {
        registration.stopped = true
        if (serverAddress === registration.address) serverAddress = undefined
        if (serverRegistration === registration) serverRegistration = undefined
      })
      send('http-server-stopped')
      return closing
    },
  }
  serverRegistration = registration
  try {
    const defaults = initialized.manifest.entry.server
    const result = await rpc('server.start', {
      ...(defaults?.port === undefined ? {} : { port: defaults.port }),
      ...(defaults?.lan === undefined ? {} : { lan: defaults.lan }),
      ...options,
    })
    if (!Number.isInteger(result?.port) || typeof result?.url !== 'string')
      throw Error('Invalid HTTP server registration')
    registration.port = result.port
    if (registration.stopped) throw Error('HTTP server was stopped by the Host')
    if (disposed || serverRegistration !== registration) {
      await registration.close()
      throw Error('HTTP server stopped during registration')
    }
    serverAddress = registration.address = { url: result.url, port: result.port }
    return Object.freeze({ url: result.url, port: result.port, close: registration.close })
  } catch (error) {
    if (serverRegistration === registration) {
      serverRegistration = undefined
      for (const id of httpRequests.keys()) finishHttp(id, 'HTTP server registration failed')
    }
    throw error
  }
}

async function receiveHttp(type: string, data: any) {
  const { id } = data
  if (type === 'http-cancel') {
    finishHttp(id, data.reason ?? 'HTTP request cancelled')
    return
  }
  if (type === 'http-request-chunk') {
    const bytes = binary.take(id + ':' + data.sequence)
    const state = httpRequests.get(id),
      pending = state?.inputPending
    if (!state || !pending || pending.sequence !== data.sequence) return
    state.inputPending = undefined
    if (data.error) {
      const error = Error(data.error)
      state.input?.error(error)
      pending.reject(error)
    } else {
      if (data.done) state.input?.close()
      else state.input?.enqueue(bytes)
      pending.resolve()
    }
    return
  }
  if (type === 'http-request') {
    if (!serverRegistration || disposed || httpRequests.size >= 8 || httpRequests.has(id)) {
      send('http-error', { id, error: 'HTTP server unavailable or capacity exceeded' })
      return
    }
    const registration = serverRegistration
    const state: typeof httpRequests extends Map<string, infer T> ? T : never = {
      abort: new AbortController(),
      sequence: 0,
      busy: false,
    }
    httpRequests.set(id, state)
    try {
      const body = data.body
        ? new ReadableStream<Uint8Array>(
            {
              start(controller) {
                state.input = controller
              },
              pull() {
                return new Promise<void>((resolve, reject) => {
                  const sequence = ++state.sequence
                  state.inputPending = { sequence, resolve, reject }
                  send('http-request-pull', { id, sequence })
                })
              },
              cancel() {
                state.inputPending?.resolve()
                state.inputPending = undefined
                send('http-request-cancel', { id })
              },
            },
            { highWaterMark: 0 },
          )
        : undefined
      const request = new Request(data.url, {
        method: data.method,
        headers: data.headers,
        body,
        signal: state.abort.signal,
        ...(body ? { duplex: 'half' } : {}),
      } as RequestInit)
      const response = await registration.handler(request)
      if (!(response instanceof Response)) throw Error('HTTP handler must return a Response')
      if (httpRequests.get(id) !== state || serverRegistration !== registration) {
        await response.body?.cancel()
        return
      }
      if (response.status < 200) throw Error('Invalid HTTP response status')
      const hasBody = !!response.body && data.method !== 'HEAD'
      if (hasBody) state.output = response.body!.getReader()
      else void response.body?.cancel().catch(() => {})
      send('http-head', {
        id,
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
        body: hasBody,
      })
      if (!hasBody) finishHttp(id)
    } catch (error) {
      send('http-error', { id, error: error instanceof Error ? error.message : String(error) })
      finishHttp(id, 'HTTP handler failed')
    }
    return
  }
  if (type === 'http-response-pull') {
    const state = httpRequests.get(id)
    try {
      if (!state?.output || state.busy) throw Error('HTTP response unavailable or busy')
      state.busy = true
      const { value, done } = await state.output.read()
      if (httpRequests.get(id) !== state) return
      binary.httpSend({ id, sequence: data.sequence, done }, value)
      if (done) finishHttp(id)
    } catch (error) {
      binary.httpSend({
        id,
        sequence: data.sequence,
        error: error instanceof Error ? error.message : String(error),
      })
      finishHttp(id, 'HTTP response failed')
    } finally {
      if (state) state.busy = false
    }
  }
}

let initialized: any
let entry: any
let started = false
let sequence = 0
let guestHandler: ((method: string, input: any, operation: any) => unknown) | undefined
let guestReady = false
let latestState: any
let disposed = false
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void; timer: any }
>()
const providers = new Map<string, any>()
const playlistImporters = new Map<string, any>()
const lyricConverters = new Map<string, any>()
const actions = new Map<string, any>()
const accountHandlers = new Map<string, Map<string, Function>>()
const qrPolls = new Map<string, { accountId:string; run:Function }>()
const serviceHandlers = new Map<string, Map<string, Function>>()
const playbackHooks = new Map<string, Function>()
const startupRegistrations: Promise<unknown>[] = []
let activationComplete = false
let serviceDepth = 0
function serviceRequest(method: typeof RPC.plugins.use | typeof RPC.plugins.list | typeof RPC.plugins.invoke, data: any) {
  if (serviceDepth) return Promise.reject(Error('Nested plugin service calls are not allowed'))
  return rpc(method, data)
}
function registerServiceJob(job: Promise<unknown>) {
  if (!activationComplete) startupRegistrations.push(job)
  void job.catch(error => console.error(error))
}
const operations = new Map<string, AbortController>()
const subscriptions = new Set<(state: any) => void>()
const hostEvents = new Map<string, Set<(value: any) => void>>()
const lifecycleListeners = new Map<string, Set<(...args: any[]) => unknown>>()
const lifecycle = Object.fromEntries(LIFECYCLE_NAMES.map(name => [name, (handler: (...args: any[]) => unknown) => {
  if (typeof handler !== 'function' || disposed) throw Error('Invalid lifecycle listener')
  if (initialized.lifecycleOnly && name !== initialized.lifecycleOnly) return () => {}
  const group = lifecycleListeners.get(name) ?? new Set()
  lifecycleListeners.set(name, group)
  const first = group.size === 0
  group.add(handler)
  if (name === 'onBeforeQuit' && first) send('quit-listener', { active: true })
  return () => {
    if (group.delete(handler) && !group.size && name === 'onBeforeQuit' && !disposed)
      send('quit-listener', { active: false })
  }
}]))
const idleListeners = new Map<number, Set<() => unknown>>()
lifecycle.onIdle = (milliseconds: number, handler: () => unknown) => {
  if (disposed || typeof handler !== 'function' || !Number.isSafeInteger(milliseconds) || milliseconds < 60000)
    throw Error('Idle threshold must be an integer of at least 60000 ms')
  if (initialized.lifecycleOnly) return () => {}
  let group = idleListeners.get(milliseconds)
  if (!group) {
    if (idleListeners.size >= 64) throw Error('Too many idle thresholds')
    group = new Set()
    idleListeners.set(milliseconds, group)
    send('idle-listener', { milliseconds, active: true })
  }
  const callback = () => handler()
  group.add(callback)
  return () => {
    if (group.delete(callback) && !group.size && !disposed) {
      idleListeners.delete(milliseconds)
      send('idle-listener', { milliseconds, active: false })
    }
  }
}
const routeObservers = new Set<(to: any, from: any) => unknown>()
const routeGuards = new Set<(to:any, from:any) => unknown>()
const disposers: (() => unknown)[] = []
const socketHandlers = new Map<string, Map<string, Set<(value: any) => void>>>()
function providerMethod(implementation: any, method: string): unknown {
  const parts = method.split('.')
  const owner = parts.slice(0, -1).reduce((value, key) => value?.[key], implementation)
  const nested = owner?.[parts.at(-1)!]
  return parts.length === 2 && typeof nested === 'function' ? nested.bind(owner) : undefined
}
function providerMethods(implementation: any): string[] {
  const methods = new Set<string>()
  for (const [group, value] of Object.entries(implementation ?? {})) {
    if (value && typeof value === 'object')
      for (const [method, handler] of Object.entries(value))
        if (typeof handler === 'function') methods.add(group + '.' + method)
  }
  return [...methods]
}
const clean = (value: any): any => {
  const seen = new WeakSet()
  try {
    return JSON.parse(
      JSON.stringify(value, (key, v) => {
        if (/password|secret|api.?key|authorization|token|credential/i.test(key))
          return '[redacted]'
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack }
        if (typeof v === 'object' && v) {
          if (seen.has(v)) return '[circular]'
          seen.add(v)
        }
        if (typeof v === 'function') return '[function]'
        if (typeof v === 'bigint') return String(v)
        return v
      }) ?? 'null',
    )
  } catch {
    return String(value)
  }
}
const send = (type: string, data: any = {}) =>
  parent.postMessage({ type, data, generation: initialized?.generation }, '*')
for (const level of ['debug', 'log', 'info', 'warn', 'error'] as const) {
  const original = console[level].bind(console)
  console[level] = (...data) => {
    original(...data)
    send('log', { level, values: clean(data) })
  }
}
const formatPluginLog = (message: unknown, data?: unknown) => {
  const text = String(message ?? '')
  if (data === undefined) return text
  // ctx.log always emits one console argument. This prevents the transport's
  // argument array from becoming visible as `["message", {...}]` in the Host.
  const encoded = JSON.stringify(clean(data))
  if (encoded.length <= 2200) return `${text} | ${encoded}`
  const edge = 1000
  return `${text} | ${encoded.slice(0, edge)}…[truncated ${encoded.length - edge * 2} chars]…${encoded.slice(-edge)}`
}
function rpc(method: string, data: any = {}): Promise<any> {
  const id = 'rpc-' + ++sequence
  return new Promise((resolve, reject) => {
    const payload = prepareRpcPayload(data)
    const listeners: { signal: AbortSignal; abort: () => void }[] = []
    const cleanup = () => {
      const request = pending.get(id)
      if (request) clearTimeout(request.timer)
      pending.delete(id)
      for (const { signal, abort } of listeners) signal.removeEventListener('abort', abort)
    }
    const finish = (error: unknown, value?: any) => {
      cleanup()
      error ? reject(error) : resolve(value)
    }
    pending.set(id, {
      resolve: (value) => finish(null, value),
      reject: (error) => finish(error),
      timer: setTimeout(() => {
        finish(new Error('Host RPC timed out: ' + method))
      }, [RPC.accounts.qrcode,RPC.accounts.oauth,RPC.accounts.browser].some(name=>method===name) ? 305000 : 120000),
    })
    for (const { signal, id: operationId } of payload.operations) {
      const abort = () => {
        finish(new Error('Host RPC cancelled: ' + method))
        void rpc(RPC.operations.cancel, { id: operationId }).catch(() => {})
      }
      listeners.push({ signal, abort })
      signal.addEventListener('abort', abort, { once: true })
    }
    try {
      send('rpc', { id, method, data: payload.data })
    } catch (error) {
      finish(error)
    }
  })
}
function shared() {
  const utils: Record<string, unknown> = {}
  for (const method of LODASH_METHODS) utils[method] = (lodash as any)[method]
  return {
    host: Object.freeze({
      apiVersion: '3.0.0',
      libraries: {
        lodash: '4.18.1',
        icons: '1.0.0',
        assets: '1.0.0',
        ...initialized.catalog.libraries,
      },
      mode: initialized.mode ?? 'development',
    }),
    utils: { lodash: Object.freeze(utils) },
    icons: {
      list: () => HOST_ICON_NAMES,
      url: async (name: string) => {
        const svg = initialized.catalog.icons[name]
        if (!svg) throw new Error('Unknown Host icon: ' + name)
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
      },
    },
    assets: {
      list: () => HOST_ASSET_NAMES,
      url: async (input: any) => {
        if (typeof input === 'string') {
          const url = initialized.catalog.assets[input]
          if (!url) throw new Error('Unknown Host asset: ' + input)
          return url
        }
        const resource = initialized.resources[input.id]
        if (!resource || resource.type === 'json') throw new Error('Unknown image/text resource')
        return (
          'data:' +
          (resource.mime || 'text/plain') +
          ';base64,' +
          (resource.type === 'base64'
            ? resource.value
            : btoa(unescape(encodeURIComponent(resource.value))))
        )
      },
    },
  }
}
function applySurfaceStyles(): void {
  if (initialized.kind !== 'web') return
  for (const contribution of initialized.manifest.ui?.styles ?? []) {
    const applies =
      contribution.scope === 'surface' ||
      (contribution.scope === 'slot' &&
        initialized.mount?.kind === 'slot' &&
        contribution.slots?.includes(initialized.mount.slot))
    if (!applies) continue
    const resource = initialized.resources[contribution.resource]
    if (resource?.type !== 'text') continue
    const style = document.createElement('style')
    style.dataset.ceruStyle = contribution.id
    style.textContent = resource.value
    document.head.append(style)
  }
}
let surfaceTokenNames: string[] = []
function applySurfaceTheme(value: any): void {
  if (initialized.kind !== 'web' || !value || typeof value !== 'object') return
  const root = document.documentElement
  for (const name of surfaceTokenNames) root.style.removeProperty(name)
  surfaceTokenNames = []
  for (const [name, token] of Object.entries(value.tokens ?? {})) {
    if (!/^--(?:td|ceru)-[\w-]+$/.test(name) || typeof token !== 'string') continue
    root.style.setProperty(name, token)
    surfaceTokenNames.push(name)
  }
  if (value.mode === 'dark' || value.mode === 'light') {
    root.dataset.theme = value.mode
    root.style.colorScheme = value.mode
  }
}
function requestHttp(data: any) {
  const signal: AbortSignal | undefined = data.operation?.signal
  signal?.throwIfAborted()
  const id = data.operation?.id ?? 'http-' + ++sequence
  const cancel = () => {
    void rpc(RPC.operations.cancel, { id }).catch(() => {})
  }
  signal?.addEventListener('abort', cancel, { once: true })
  return rpc(RPC.http.request, {
    ...data,
    operation: { id, deadlineAt: data.operation?.deadlineAt },
  }).finally(() => signal?.removeEventListener('abort', cancel))
}
function context() {
  const base = shared()
  if (initialized.kind === 'web') {
    applySurfaceTheme(initialized.surfaceTheme)
    applySurfaceStyles()
    const root = document.getElementById('plugin-root')!
    disposers.push(observeSurfaceSize(root, (height) => send('resize', { height }), initialized.viewKind === 'component'))
    // Keyboard events do not bubble out of the isolated login document.
    if (initialized.mount?.props?.login?.kind === 'qrcode') {
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        send('close-view')
      }
      window.addEventListener('keydown', closeOnEscape)
      disposers.push(() => window.removeEventListener('keydown', closeOnEscape))
    }
    return {
      ...base,
      root,
      mount: initialized.mount ?? { kind: 'page' },
      ...(initialized.viewKind === 'component' ? { initialTheme: initialized.theme, inspectComponent: initialized.inspectComponent === true } : {}),
      invoke: (action: string, input: any) => rpc(RPC.surface.invoke, { action, input }),
      close: async () => {
        send('close-view')
      },
      subscribe: (handler: (state: any) => void) => {
        subscriptions.add(handler)
        if (latestState !== undefined) handler(latestState)
        return () => subscriptions.delete(handler)
      },
    }
  }
  if (initialized.kind === 'guest')
    return {
      host: base.host,
      utils: base.utils,
      guestId: initialized.guest?.id ?? 'development-guest',
      scriptInfo: initialized.guest?.info ?? {},
      ready: (metadata: any) => {
        if (guestReady) throw new Error('Guest already initialized')
        if (!guestHandler) throw new Error('Guest did not register a request handler')
        guestReady = true
        send('guest-metadata', metadata)
        send('active')
      },
      handle: (handler: typeof guestHandler) => {
        guestHandler = handler
        return () => {
          guestHandler = undefined
        }
      },
      expose: (name: string, value: any) => {
        if (['__proto__', 'constructor', 'prototype'].includes(name))
          throw new Error('Unsafe global')
        ;(globalThis as any)[name] = value
      },
      invokeHost: (method: string, data: any) => rpc('guest.' + method, data),
    }
  const declared = initialized.manifest
  const services = createRpcMethods(rpc)
  services.music.on = (event: string, listener: (value: unknown) => void) => {
    if (event !== 'sources.changed' || typeof listener !== 'function') throw Error('Invalid music subscription')
    const listeners = hostEvents.get('music.sources.changed') ?? new Set()
    listeners.add(listener)
    hostEvents.set('music.sources.changed', listeners)
    return () => { listeners.delete(listener) }
  }
  services.hotkeys.register = async (...args: any[]) => {
    const registrationId = await rpc(RPC.services.hotkeys.register, { args })
    let registered = true
    return async () => {
      if (!registered) return
      registered = false
      await rpc(RPC.services.hotkeys.unregister, { args: [registrationId] })
    }
  }
  return {
    ...base,
    ...services,
    server: {
      serve: serveHttp,
      get url() { return serverAddress?.url },
      get port() { return serverAddress?.port },
    },
    crypto: {
      createCipher:(algorithm:string,key:string|Uint8Array,iv:string|Uint8Array,options?:any)=>binary.cipher('encrypt',algorithm,key,iv,options),
      createDecipher:(algorithm:string,key:string|Uint8Array,iv:string|Uint8Array,options?:any)=>binary.cipher('decrypt',algorithm,key,iv,options),
    },
    wasm: {
      async instantiate(resource: string | {id:string}, imports: WebAssembly.Imports = {}) {
        if(initialized.kind!=='logic'||initialized.lifecycleOnly||disposed)throw Error('WebAssembly unavailable')
        const stored=initialized.resources[typeof resource==='string'?resource:resource?.id]
        if(stored?.type!=='base64'||stored.mime!=='application/wasm')throw Error('Unknown WebAssembly resource')
        const bytes=Uint8Array.from(atob(stored.value),value=>value.charCodeAt(0))
        return WebAssembly.instantiate(bytes,imports)
      }
    },
    streams: {
      registerTransform(id: string, factory: any) {
        if(initialized.kind!=='logic'||initialized.lifecycleOnly||disposed)throw Error('Stream registration unavailable')
        if(!/^[\w.-]{1,128}$/.test(id)||typeof factory?.seekable!=='boolean'||typeof factory?.create!=='function'||streamFactories.has(id)||streamFactories.size>=32)throw Error('Invalid stream transform')
        streamFactories.set(id,factory)
        send('stream-transform',{id,seekable:factory.seekable})
        return ()=>{
          if(streamFactories.get(id)!==factory)return
          streamFactories.delete(id)
          send('stream-transform',{id,removed:true})
          for(const [key,entry] of streamInstances)if(entry.factory===factory){streamInstances.delete(key);void Promise.resolve(entry.transform.dispose?.()).catch(console.error)}
        }
      }
    },
    lifecycle,
    router: {
      beforeEach: (handler: (to:any, from:any) => unknown) => {
        if (typeof handler !== 'function' || disposed || !declared.uses?.permissions?.some((row:any)=>row.name==='navigation.intercept')) throw Error('Undeclared navigation guard')
        if (initialized.lifecycleOnly) return () => {}
        const callback = (to:any, from:any) => handler(to, from)
        routeGuards.add(callback)
        if (routeGuards.size === 1) send('route-guard',{active:true})
        return () => { if (routeGuards.delete(callback) && !routeGuards.size && !disposed) send('route-guard',{active:false}) }
      },
      afterEach: (handler: (to:any, from:any) => unknown) => {
        if (typeof handler !== 'function' || disposed) throw Error('Invalid navigation observer')
        if (initialized.lifecycleOnly) return () => {}
        const callback = (to:any, from:any) => handler(to, from)
        routeObservers.add(callback)
        if (routeObservers.size === 1) send('route-observer', { active:true })
        return () => { if (routeObservers.delete(callback) && !routeObservers.size && !disposed) send('route-observer',{active:false}) }
      },
      current: () => rpc(RPC.router.current),
      push: (to: unknown) => rpc(RPC.router.push,to)
    },
    hooks: { on: (name: string, handler: Function, options: { priority?: string } = {}) => {
      const priority = options.priority ?? 'normal'
      const permission = name==='link.open' ? 'links.intercept' : name==='notification.show' ? 'notifications.intercept' : name==='share.create' ? 'sharing.intercept' : isDownloadOperation(name) ? 'downloads.intercept' : isLyricOperation(name) ? 'lyrics.intercept' : name === 'window.close' ? 'window.intercept' : name === 'account.switch' ? 'account.intercept' : isLibraryOperation(name) ? 'library.intercept' : isSearchOperation(name) ? 'search.intercept' : name==='player.resolve' || (PLAYBACK_OPERATION_NAMES as readonly string[]).includes(name) ? 'player.intercept' : null
      if (!permission || !['early','normal','late'].includes(priority) || typeof handler !== 'function' || playbackHooks.has(name) || !declared.uses?.permissions?.some((row:any)=>row.name===permission)) throw Error('Invalid or undeclared operation hook')
      playbackHooks.set(name,handler)
      registerServiceJob(rpc(RPC.hooks.register,{name,priority}))
      return () => {if(playbackHooks.get(name)===handler){playbackHooks.delete(name);registerServiceJob(rpc(RPC.hooks.register,{name,priority:null}))}}
    } },
    plugins: {
      use: async (pluginId: string, service: string) => {
        const methods = await serviceRequest(RPC.plugins.use, {pluginId,service})
        if (methods === null) return null
        const client = Object.create(null)
        for (const method of methods) client[method] = (input: unknown = null) => serviceRequest(RPC.plugins.invoke, {pluginId, service, method, input})
        return Object.freeze(client)
      },
      list: () => serviceRequest(RPC.plugins.list, {}),
      on: (event:string, listener:(value:any)=>void) => {
        if (!['available','unavailable'].includes(event) || typeof listener !== 'function') throw Error('Invalid plugin service subscription')
        const key = 'plugins.' + event, group = hostEvents.get(key) ?? new Set()
        group.add(listener); hostEvents.set(key,group)
        return () => {group.delete(listener)}
      }
    },
    accounts: { current: (accountId: string) => rpc(RPC.accounts.current, {accountId}),
      reportExpired: (accountId: string, connectionId: string, credential: unknown) => rpc(RPC.accounts.reportExpired, {accountId,connectionId,credential}),
      register(id: string, implementation: Record<string, any>) {
      const declaration=declared.provides?.accounts?.find((item:any)=>item.id===id)
      if (!declaration || accountHandlers.has(id) ||
        typeof implementation?.login !== 'function' || typeof implementation?.profile !== 'function') throw Error('Invalid account implementation')
      const handlers = new Map<string, Function>()
      for (const method of ['login','profile','validate','logout']) {
        if (implementation[method] !== undefined && typeof implementation[method] !== 'function') throw Error('Invalid account method')
        if (implementation[method]) handlers.set(method, implementation[method].bind(implementation))
      }
      for (const name of ['likes','playlists','history','recommend']) {
        const collection=implementation[name]
        if (!declaration.capabilities?.includes(name)) {
          if (collection!==undefined) throw Error('Undeclared account collection: '+name)
          continue
        }
        if (typeof collection?.list!=='function') throw Error('Missing account collection: '+name)
        handlers.set(name+'.list',collection.list.bind(collection))
        if(name==='likes' && collection.set!==undefined){if(typeof collection.set!=='function')throw Error('Invalid likes.set');handlers.set('likes.set',collection.set.bind(collection))}
      }
      accountHandlers.set(id, handlers)
      return () => { if (accountHandlers.get(id) === handlers) accountHandlers.delete(id) }
    } },
    services: { register: (id: string, handlers: Record<string,Function>) => {
      const declaration = declared.provides?.services?.find((item:any) => item.id === id)
      const methods = Object.keys(handlers)
      if (!declaration || serviceHandlers.has(id) || methods.length !== declaration.methods.length || !methods.every(name => declaration.methods.includes(name) && typeof handlers[name] === 'function' && !['then','__proto__','constructor','prototype'].includes(name))) throw Error('Invalid plugin service handlers')
      const map = new Map(Object.entries(handlers)); serviceHandlers.set(id,map)
      registerServiceJob(rpc(RPC.plugins.registerService,{id,methods}))
      return () => { if(serviceHandlers.get(id)===map){serviceHandlers.delete(id);registerServiceJob(rpc(RPC.plugins.registerService,{id,methods:null}))} }
    } },
    events: {
      on: (name: string, listener: (value: any) => void) => {
        const operationEvent = !(HOST_SERVICE_EVENT_NAMES as readonly string[]).includes(name) && !!operationEventPermission(name)
        if (!(HOST_SERVICE_EVENT_NAMES as readonly string[]).includes(name) && !operationEvent)
          throw new Error('Event is not connected by this Host')
        if (typeof listener !== 'function') throw Error('Invalid event listener')
        const listeners = hostEvents.get(name) ?? new Set<(value: any) => void>()
        const first = listeners.size === 0
        listeners.add(listener)
        hostEvents.set(name, listeners)
        if (operationEvent && first) registerServiceJob(rpc(RPC.events.register, {name, active: true}))
        return () => {
          if (listeners.delete(listener) && !listeners.size && operationEvent && !disposed)
            registerServiceJob(rpc(RPC.events.register, {name, active: false}))
        }
      },
    },
    plugin: { id: declared.id, version: declared.version, manifest: declared },
    playlistImporters: {
      register: (id: string, implementation: any) => {
        if (!declared.provides?.importers?.some((p: any) => p.id === id))
          throw new Error('Undeclared playlist importer: ' + id)
        playlistImporters.set(id, implementation)
        send('register', { kind: 'playlist-importer', id, methods: Object.keys(implementation) })
        return () => {
          playlistImporters.delete(id)
          send('unregister', { kind: 'playlist-importer', id })
        }
      },
    },
    lyricConverters: {
      register: (id: string, implementation: any) => {
        if (!declared.provides?.lyricConverters?.some((item: any) => item.id === id))
          throw new Error('Undeclared lyric converter')
        lyricConverters.set(id, implementation)
        send('register', { kind: 'lyric-converter', id, methods: ['parse', 'export'] })
        return () => {
          lyricConverters.delete(id)
          send('unregister', { kind: 'lyric-converter', id })
        }
      },
    },
    providers: {
      register: (id: string, implementation: any) => {
        if (!declared.provides?.providers?.some((p: any) => p.id === id))
          throw new Error('Undeclared provider: ' + id)
        providers.set(id, implementation)
        send('register', {
          kind: 'provider',
          id,
          methods: providerMethods(implementation),
        })
        return () => {
          providers.delete(id)
          send('unregister', { kind: 'provider', id })
        }
      },
    },
    actions: {
      register: (id: string, handler: any) => {
        if (!declared.provides?.actions?.some((p: any) => p.id === id))
          throw new Error('Undeclared action: ' + id)
        actions.set(id, handler)
        send('register', { kind: 'action', id })
        return () => {
          actions.delete(id)
          send('unregister', { kind: 'action', id })
        }
      },
    },
    permissions: {
      getGranted: () => rpc(RPC.permissions.getGranted),
      requestGroup: (data: any) => rpc(RPC.permissions.requestGroup, data),
      query: (data: any) => rpc(RPC.permissions.query, data),
      request: (data: any) => rpc(RPC.permissions.request, data),
    },
    http: {
      create: (options: any) =>
        createHttpClient(
          {
            http: {
              request: requestHttp,
            },
            permissions: {
              query: (data: any) => rpc(RPC.permissions.query, data),
              request: (data: any) => rpc(RPC.permissions.request, data),
            },
          },
          options,
        ),
      request: requestHttp,
    },
    credentials: { get: (connectionId: string) => rpc(RPC.credentials.get,{connectionId}) },
    sockets: {
      connect: async (data: any) => {
        const permissionKey = data.permissionKey ?? 'network.socket'
        let permission = await rpc(RPC.permissions.query, { key: permissionKey })
        if (permission.status === 'prompt')
          permission = await rpc(RPC.permissions.request, {
            key: permissionKey,
            intent: data.operation?.userIntent,
          })
        if (permission.status !== 'granted') throw new Error('Socket permission is not granted')
        data.operation?.signal?.throwIfAborted()
        const { id } = await rpc(RPC.sockets.connect, {
          ...data,
          permissionKey,
          operation: { id: data.operation?.id, deadlineAt: data.operation?.deadlineAt },
        })
        const handlers = new Map<string, Set<(value: any) => void>>()
        socketHandlers.set(id, handlers)
        const disconnect = async () => {
          socketHandlers.delete(id)
          await rpc(RPC.sockets.disconnect, { id })
        }
        disposers.push(disconnect)
        return {
          id,
          on: (event: string, handler: (value: any) => void) => {
            let listeners = handlers.get(event)
            if (!listeners) {
              listeners = new Set()
              handlers.set(event, listeners)
            }
            listeners.add(handler)
            return () => {
              listeners?.delete(handler)
            }
          },
          emit: (event: string, value: any) => rpc(RPC.sockets.send, { id, event, data: value }),
          send: (value: any) => rpc(RPC.sockets.send, { id, event: 'message', data: value }),
          disconnect,
        }
      },
    },
    playback: { failure: (error: any) => ({ ok: false, error }) },
    ui: {
      ...services.ui,
      views:{...services.ui.views,on:(event:string,handler:(value:unknown)=>void)=>{
        if(!['mounted','unmounted'].includes(event)||typeof handler!=='function')throw Error('Invalid view subscription')
        const key='ui.views.'+event,listeners=hostEvents.get(key) ?? new Set();listeners.add(handler);hostEvents.set(key,listeners);return ()=>{listeners.delete(handler)}
      }},
      navigation: {
        open: (data: any) => {
          assertNavigationRequest(data, declared)
          return rpc(RPC.ui.navigation.open, data)
        },
      },
      notifications: {
        show: (data: any, call: any) => rpc(RPC.ui.notifications.show, { ...data, call }),
      },
      toast: (message: any) => {
        send('notify', { key: 'toast', level: 'info', ...message })
        return Promise.resolve()
      },
      setState: (surfaceId: string, state: any) => {
        send('state', { surfaceId, state })
        return Promise.resolve()
      },
      notify: (notification: any) => {
        send('notify', notification)
        return Promise.resolve()
      },
      openView: (surfaceId: string) => {
        send('open-view', { surfaceId })
        return Promise.resolve()
      },
      closeView: async (surfaceId: string) => {
        send('close-view', { surfaceId })
      },
    },
    storage: {
      get: (key: string) => rpc(RPC.storage.get, { key }),
      set: (key: string, value: any) => rpc(RPC.storage.set, { key, value }),
      delete: (key: string) => rpc(RPC.storage.delete, { key }),
    },
    guests: {
      list: () => rpc(RPC.guests.list),
      import: (adapterId: string) => rpc(RPC.guests.import, { adapterId }),
      select: (guestId: string | null) => rpc(RPC.guests.select, { guestId }),
      remove: (guestId: string) => rpc(RPC.guests.remove, { guestId }),
      prepareInstall: () =>
        Promise.reject(
          new Error(
            'Guest installation requires the production Host; inspect the bootstrap module separately in this playground.',
          ),
        ),
      requestInstall: () =>
        Promise.reject(new Error('Guest installation is unavailable in this playground.')),
      invoke: (guestId: string, method: string, input: any, operation: any) =>
        rpc(RPC.guests.invoke, {
          guestId,
          method,
          input,
          operation: { id: operation?.id, deadlineAt: operation?.deadlineAt },
        }),
    },
    log: Object.fromEntries(
      ['debug', 'info', 'warn', 'error'].map((level) => [
        level,
        (message: string, data?: any) => (console as any)[level](formatPluginLog(message, data)),
      ]),
    ),
    effects: { add: (dispose: () => unknown) => disposers.push(dispose) },
  }
}
function exposeModuleContext(ctx: ReturnType<typeof context>) {
  const builtinModules: Record<string, any> = {
    ceru: ctx,
    '@ceru/tools': ctx.utils,
    lodash: ctx.utils?.lodash,
    '@ceru/crypto': cryptoTools,
    '@ceru/compression': compressionTools,
    '@ceru/encoding': encodingTools,
    '@ceru/legacy-http': { createLegacyHttpBridge },
  }
  if (initialized.kind === 'logic')
    Object.assign(builtinModules, {
      '@ceru/http': (ctx as any).http,
      '@ceru/ui': (ctx as any).ui,
      '@ceru/socket': (ctx as any).sockets,
      '@ceru/library': (ctx as any).library,
      '@ceru/account': (ctx as any).account,
      '@ceru/player': (ctx as any).player,
    })
  const requireBuiltin = (name: string) => {
    if (!Object.hasOwn(builtinModules, name))
      throw new Error('Module is not provided by this Host: ' + name)
    return builtinModules[name]
  }
  ;(ctx as any).modules = { require: requireBuiltin }
  ;(globalThis as any).__ceruRequire = requireBuiltin
  ;(globalThis as any).require = requireBuiltin
  ;(globalThis as any).__ceruContext = ctx
}
async function start() {
  if (!initialized || !entry || started) return
  started = true
  try {
    const ctx = context()
    if (initialized.lifecycleOnly) {
      Object.defineProperty(ctx, 'lifecycleOnly', { value: initialized.lifecycleOnly })
      const ignore = () => () => {}
      for (const group of [ctx.providers, ctx.actions, ctx.playlistImporters, ctx.lyricConverters, ctx.services]) group.register = ignore
      ctx.hooks.on = ignore
    }
    if (initialized.kind === 'web' && initialized.viewKind === 'component') {
      delete (globalThis as any).__ceruStart
    } else {
      exposeModuleContext(ctx)
    }
    let mountMs: number | undefined
    for (const activate of Array.isArray(entry) ? entry : [entry]) {
      const dispose = initialized.kind === 'web' && initialized.mount?.kind === 'slot'
        ? await activate(ctx, (elapsed: number) => { mountMs = elapsed })
        : await activate(ctx)
      if (typeof dispose === 'function') disposers.push(dispose)
    }
    await Promise.all(startupRegistrations)
    activationComplete = true
    startupRegistrations.length = 0
    send(initialized.kind === 'guest' ? 'bootstrap-ready' : 'active', mountMs === undefined ? {} : { mountMs })
  } catch (error) {
    console.error(error)
    send('failed', { message: String(error) })
  }
}
;(globalThis as any).__ceruStart = (value: any) => {
  entry = value
  void start()
}
window.addEventListener('message', async (event) => {
  if (event.source !== parent) return
  const message = event.data
  if (message?.type === 'init' && !initialized) {
    initialized = message.data
    serverAddress = message.data.serverAddress
    void start()
    return
  }
  if (!initialized || message?.generation !== initialized.generation) return
  if (message.type === 'rpc-result') {
    const item = pending.get(message.data.id)
    if (item) {
      clearTimeout(item.timer)
      pending.delete(message.data.id)
      if (message.data.binaryKey) message.data.value.body = binary.take(message.data.binaryKey).buffer
      message.data.error
        ? item.reject(new Error(message.data.error))
        : item.resolve(message.data.value)
    }
  }
  if (message.type === 'dispose') {
    await dispose()
    return
  }
  if (disposed) return
  if (message.type === 'surface-theme') {
    applySurfaceTheme(message.data)
    return
  }
  if (message.type === 'server-listening') {
    const { url, port } = message.data ?? {}
    if (typeof url === 'string' && Number.isInteger(port) && port > 0 && port <= 65535)
      serverAddress = { url, port }
    return
  }
  if (message.type === 'server-stopped') {
    if (serverRegistration) serverRegistration.stopped = true
    serverRegistration = undefined
    serverAddress = undefined
    for (const id of httpRequests.keys()) finishHttp(id, 'HTTP server stopped by the Host')
    send('http-server-stopped')
    return
  }
  if (message.type.startsWith('http-') && binary) {
    await receiveHttp(message.type, message.data)
    return
  }
  if (message.type === 'state') {
    latestState = message.data
    for (const handler of subscriptions) handler(message.data)
  }
  if (message.type === 'router-after' && initialized.kind === 'logic') {
    for (const observer of [...routeObservers]) {
      try { Promise.resolve(observer(message.data.to,message.data.from)).catch(console.error) } catch (error) { console.error(error) }
    }
    return
  }
  if (message.type === 'idle' && initialized.kind === 'logic') {
    for (const handler of [...(idleListeners.get(message.data.milliseconds) ?? [])]) {
      try { Promise.resolve(handler()).catch(console.error) } catch (error) { console.error(error) }
    }
    return
  }
  if (message.type === 'lifecycle' && initialized.kind === 'logic') {
    const {name, args} = message.data
    for (const handler of [...(lifecycleListeners.get(name) ?? [])]) {
      try { Promise.resolve(handler(...args)).catch(console.error) } catch (error) { console.error(error) }
    }
    return
  }
  if (message.type === 'host-event')
    for (const handler of hostEvents.get(message.data.event) ?? []) handler(message.data.value)
  if (message.type === 'socket-event') {
    const { id, event, data } = message.data
    for (const handler of socketHandlers.get(id)?.get(event) ?? []) {
      try {
        handler(data)
      } catch (error) {
        console.error(error)
      }
    }
  }
  if (message.type === 'cancel') {
    operations.get(message.data.id)?.abort()
    void rpc(RPC.operations.cancel, { id: message.data.id }).catch(() => {})
  }
  if(message.type==='stream-chunk') {
    const {id,instance,flush}=message.data
    try {
      const bytes=binary.take(id)
      const entry=streamInstances.get(instance)
      if(!entry||entry.busy||disposed)throw Error('Stream transform unavailable or busy')
      entry.busy=true
      try {
        const output=flush?await entry.transform.flush?.():await entry.transform.transform(bytes)
        if(output!==undefined && !(output instanceof Uint8Array))throw Error('Stream transform must return Uint8Array')
        binary.send(id,output)
      } finally {entry.busy=false}
    } catch(error) {binary.send(id,undefined,error instanceof Error?error.message:String(error))}
    return
  }
  if (message.type === 'invoke') {
    const { id, kind, target, method, args, connectionId } = message.data
    const abort = new AbortController()
    operations.set(id, abort)
    const budget = kind === 'account' && method === 'login' && ['qrcode','oauth','browser'].includes(args[0]?.method) ? 305000 : 120000
    const timeout = setTimeout(() => abort.abort(), budget)
    const operation = {
      id,
      deadlineAt: Date.now() + budget,
      ...(kind === 'provider' && typeof connectionId === 'string' ? { connectionId } : {}),
      signal: abort.signal,
      userIntent: { kind: 'user-intent', id },
    }
    try {
      const fn = kind === 'stream' && initialized.kind === 'logic' ? async (input:any) => {
        if(method==='close') {
          const entry=streamInstances.get(target)
          streamInstances.delete(target)
          await entry?.transform.dispose?.()
          return null
        }
        if(method!=='create'||streamInstances.size>=16||!Number.isSafeInteger(input?.offset)||input.offset<0)throw Error('Invalid stream request')
        const factory=streamFactories.get(target)
        if(!factory)throw Error('Stream transform unavailable')
        const instance='stream-'+(++streamSequence)
        const transform=await factory.create(input)
        if(typeof transform?.transform!=='function')throw Error('Invalid stream implementation')
        if(disposed||abort.signal.aborted||streamFactories.get(target)!==factory){await transform.dispose?.();throw Error('Stream registration expired')}
        streamInstances.set(instance,{factory,transform,busy:false})
        return instance
      } : kind === 'lifecycle' && ['onBeforeQuit','onInstall','onUninstall','onEnable','onDisable','onUpdate'].includes(target) && initialized.kind === 'logic' && (!initialized.lifecycleOnly || initialized.lifecycleOnly === target) ? async () => {
        const handlers = [...(lifecycleListeners.get(target) ?? [])]
        await Promise.all(handlers.map(async handler => {
          try { await handler(...args) } catch (error) { console.error(error) }
        }))
      } : kind === 'account' && initialized.kind === 'logic' && !initialized.lifecycleOnly ? async (input: any) => {
        if (method === 'qrPoll') {
          const poll = qrPolls.get(input.ticket)
          if (!poll || poll.accountId !== target) throw Error('QR code is no longer active')
          return poll.run(operation)
        }
        const handlers = accountHandlers.get(target)
        if (!handlers) throw Error('Account is not registered')
        const handler = handlers.get(method)
        if (!handler && method === 'logout') return null
        if (!handler && method === 'validate') return { valid: true }
        if (!handler) throw Error('Account method is not registered')
        if (method.endsWith('.list') || method==='likes.set') return handler(input.account,input.request,{...operation,connectionId:input.account.id})
        if (method !== 'login') return handler(input, { ...operation, connectionId: input.id })
        if (!['form','qrcode','oauth','browser'].includes(input.method)) throw Error('Unsupported account login method')
        const expired = Symbol('expired')
        try {
          return await handler({ method: input.method, auth: {
            form: (form: any) => rpc(RPC.accounts.form, { ticket: input.ticket, form }),
            oauth: (options:any) => rpc(RPC.accounts.oauth,{ticket:input.ticket,options}),
            browser: (options:any) => rpc(RPC.accounts.browser,{ticket:input.ticket,options}),
            qrcode: async ({image,url,view,expiresInMs,poll}:any) => {
              if (input.method !== 'qrcode' || typeof poll !== 'function' || qrPolls.has(input.ticket)) throw Error('Invalid QR login')
              qrPolls.set(input.ticket,{accountId:target,run:poll})
              try {
                const reply = await rpc(RPC.accounts.qrcode,{ticket:input.ticket,image,url,view,expiresInMs})
                if (reply?.expired === true) throw expired
                return reply
              } finally { qrPolls.delete(input.ticket) }
            }
          } }, operation)
        } catch (error) { if (error === expired) return null; throw error }
      } : kind === 'route-guard' && initialized.kind === 'logic' ? async (to:any,from:any) => {
        for (const handler of [...routeGuards]) {
          if (operation.signal.aborted) throw Error('Navigation guard expired')
          const decision = await handler(JSON.parse(JSON.stringify(to)),JSON.parse(JSON.stringify(from)))
          if (decision !== undefined) return decision
        }
        return null
      } : kind === 'operation-event' ? async (payload:any) => {
        let prevented = false
        const freeze=(value:any):any=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
        const done = target.endsWith(':done')
        const event = Object.freeze({...freeze(payload), ...(!done ? {preventDefault:()=>{if(!operation.signal.aborted)prevented=true}} : {})})
        let failure: unknown
        for (const listener of [...(hostEvents.get(target) ?? [])]) {
          operation.signal.throwIfAborted()
          try { await listener(event) } catch(error) { failure ??= error }
        }
        if (failure) throw failure
        return {prevented}
      } : kind === 'operation-hook' ? async (token:string,input:any,source:any,state:any={player:null,route:null,account:null}) => {
        const handler = playbackHooks.get(target)
        if (!handler) return {}
        if(!state||!Object.hasOwn(state,'player')||!Object.hasOwn(state,'route')||!Object.hasOwn(state,'account'))state={player:null,route:null,account:null}
        let prevented = false, called = false, responded = false, response:unknown
        const resultOperation=isLyricOperation(target)||target==='share.create'
        const freeze=(value:any):any=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
        const context = {input,source:Object.freeze(source),state:freeze(state),operation,preventDefault:()=>{prevented=true},respondWith:(result:unknown)=>{if(resultOperation){responded=true;response=result}else{if(result!==null)throw Error('Playback operations return null');prevented=true}}}
        Object.defineProperty(context,'state',{writable:false,configurable:false})
        const next = (value = context.input) => {
          if ((called && target!=='player.resolve') || operation.signal.aborted) return Promise.reject(Error('Hook next is no longer available'))
          called=true;return rpc(target==='link.open'?RPC.hooks.linksNext:target==='notification.show'?RPC.hooks.notificationsNext:target==='share.create'?RPC.hooks.sharingNext:isDownloadOperation(target)?RPC.hooks.downloadsNext:isLyricOperation(target)?RPC.hooks.lyricsNext:target==='window.close'?RPC.hooks.windowNext:target==='player.resolve'?RPC.hooks.resolveNext:target==='account.switch'?RPC.hooks.accountNext:isLibraryOperation(target)?RPC.hooks.libraryNext:isSearchOperation(target)?RPC.hooks.searchNext:RPC.hooks.next,{token,input:value})
        }
        const result=await handler(context,next)
        if(resultOperation && responded) return {result:response}
        if(resultOperation && (called ? result!==undefined : result===null || (target==='share.create'?typeof result?.url==='string':result?.format==='crlyric'))) return {result}
        return called ? {} : prevented ? {prevented:true} : {input:result === undefined ? context.input : result}
      } : kind === 'plugin-service' ? async (input:any, callerPluginId:string, deadlineAt:number) => {
        const handler = serviceHandlers.get(target)?.get(method)
        if (!handler) throw Error('Plugin service method unavailable')
        serviceDepth++
        try {return await handler(input,{callerPluginId,operation:{...operation, deadlineAt: Math.min(deadlineAt,operation.deadlineAt)}})} finally {serviceDepth--}
      } :
        kind === 'guest'
          ? (input: any, operation: any) => guestHandler?.(method, input, operation)
          : kind === 'action'
            ? actions.get(target)
            : kind === 'playlist-importer'
              ? playlistImporters.get(target)?.[method]
              : kind === 'lyric-converter'
                ? lyricConverters.get(target)?.[method]
                : providerMethod(providers.get(target), method)
      if (typeof fn !== 'function') throw new Error('Method is not registered')
      const value = await fn(...args, operation)
      send('invoke-result', { id, value })
    } catch (error) {
      send('invoke-result', {
        id,
        error:
          `[${kind}:${target}${method ? '.' + method : ''}] ` +
          (error instanceof Error ? error.message : String(error)),
      })
    } finally {
      clearTimeout(timeout)
      operations.delete(id)
    }
  }
})
async function dispose() {
  if (disposed) return
  disposed = true
  serverAddress = undefined
  for (const id of httpRequests.keys()) finishHttp(id, 'Plugin runtime stopped')
  if (serverRegistration) void serverRegistration.close().catch(console.error)
  for(const entry of streamInstances.values()) {try{await entry.transform.dispose?.()}catch(error){console.error(error)}}
  streamInstances.clear()
  streamFactories.clear()
  for (const operation of operations.values()) operation.abort()
  for (const item of pending.values()) {
    clearTimeout(item.timer)
    item.reject(new Error('Surface disposed'))
  }
  pending.clear()
  subscriptions.clear()
  lifecycleListeners.clear()
  idleListeners.clear()
  routeObservers.clear()
  routeGuards.clear()
  for (const cleanup of disposers.splice(0).reverse()) {
    try {
      await cleanup()
    } catch (error) {
      console.error(error)
    }
  }
  send('disposed')
}
window.addEventListener('pagehide', () => {
  void dispose()
})
window.addEventListener('error', (event) => send('failed', { message: event.message }))
window.addEventListener('unhandledrejection', (event) => console.error(event.reason))
send('ready')
