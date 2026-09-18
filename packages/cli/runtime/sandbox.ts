import * as lodash from 'lodash-es'
import { HOST_ICON_NAMES, HOST_ASSET_NAMES, LODASH_METHODS } from '../../sdk/src/catalog'

let initialized: any
;(globalThis as any).__ceruSharedModules = Object.create(null)
;(globalThis as any).__ceruSharedRequire = (name: string) => {
  const value = (globalThis as any).__ceruSharedModules[name]
  if (!value) throw new Error('Shared runtime is not declared/available: ' + name)
  return value
}
let entry: any
let started = false
let sequence = 0
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void; timer: any }
>()
const providers = new Map<string, any>()
const actions = new Map<string, any>()
const operations = new Map<string, AbortController>()
const subscriptions = new Set<(state: any) => void>()
const disposers: (() => unknown)[] = []
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
function rpc(method: string, data: any = {}): Promise<any> {
  const id = 'rpc-' + ++sequence
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      timer: setTimeout(() => {
        pending.delete(id)
        reject(new Error('Host RPC timed out: ' + method))
      }, 20000),
    })
    send('rpc', { id, method, data })
  })
}
function shared() {
  const utils: Record<string, unknown> = {}
  for (const method of LODASH_METHODS) utils[method] = (lodash as any)[method]
  return {
    host: Object.freeze({
      apiVersion: '2.0.0',
      libraries: {
        lodash: '4.18.1',
        icons: '1.0.0',
        assets: '1.0.0',
        ...initialized.catalog.libraries,
      },
      mode: 'development',
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
function context() {
  const base = shared()
  if (initialized.kind === 'web')
    return {
      ...base,
      root: document.getElementById('plugin-root'),
      invoke: (action: string, input: any) => rpc('surface.invoke', { action, input }),
      subscribe: (handler: (state: any) => void) => {
        subscriptions.add(handler)
        return () => subscriptions.delete(handler)
      },
    }
  if (initialized.kind === 'guest')
    return {
      host: base.host,
      utils: base.utils,
      guestId: 'development-guest',
      expose: (name: string, value: any) => {
        if (['__proto__', 'constructor', 'prototype'].includes(name))
          throw new Error('Unsafe global')
        ;(globalThis as any)[name] = value
      },
      invokeHost: (method: string, data: any) => rpc('guest.' + method, data),
    }
  const declared = initialized.manifest
  return {
    ...base,
    plugin: { id: declared.id, version: declared.version },
    config: { get: () => rpc('config.get') },
    providers: {
      register: (id: string, implementation: any) => {
        if (!declared.contributes?.providers?.some((p: any) => p.id === id))
          throw new Error('Undeclared provider: ' + id)
        providers.set(id, implementation)
        send('register', {
          kind: 'provider',
          id,
          methods: Object.keys(implementation).filter(
            (name) => typeof implementation[name] === 'function',
          ),
        })
        return () => {
          providers.delete(id)
          send('unregister', { kind: 'provider', id })
        }
      },
    },
    actions: {
      register: (id: string, handler: any) => {
        if (!declared.contributes?.commands?.some((p: any) => p.action === id))
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
      query: (data: any) => rpc('permissions.query', data),
      request: (data: any) => rpc('permissions.request', data),
    },
    http: {
      request: (data: any) =>
        rpc('http.request', {
          ...data,
          operation: { id: data.operation?.id, deadlineAt: data.operation?.deadlineAt },
        }),
    },
    credentials: { get: () => Promise.resolve(null) },
    media: {
      createLease: (data: any) =>
        rpc('media.createLease', { ...data, operation: { id: data.operation?.id } }),
    },
    playback: { failure: (error: any) => ({ ok: false, error }) },
    ui: {
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
    },
    storage: {
      get: (key: string) => rpc('storage.get', { key }),
      set: (key: string, value: any) => rpc('storage.set', { key, value }),
      delete: (key: string) => rpc('storage.delete', { key }),
    },
    guests: {
      list: () => Promise.resolve([]),
      prepareInstall: () =>
        Promise.reject(
          new Error(
            'Guest installation requires the production Host; inspect the bootstrap module separately in this playground.',
          ),
        ),
      requestInstall: () =>
        Promise.reject(new Error('Guest installation is unavailable in this playground.')),
      invoke: () => Promise.reject(new Error('No Guest instance is installed.')),
    },
    log: Object.fromEntries(
      ['debug', 'info', 'warn', 'error'].map((level) => [
        level,
        (message: string, data: any) => (console as any)[level](message, data),
      ]),
    ),
    effects: { add: (dispose: () => unknown) => disposers.push(dispose) },
  }
}
async function start() {
  if (!initialized || !entry || started) return
  started = true
  try {
    const ctx = context()
    ;(globalThis as any).__ceruContext = ctx
    const dispose = await entry(ctx)
    if (typeof dispose === 'function') disposers.push(dispose)
    send('active')
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
    void start()
    return
  }
  if (!initialized || message?.generation !== initialized.generation) return
  if (message.type === 'rpc-result') {
    const item = pending.get(message.data.id)
    if (item) {
      clearTimeout(item.timer)
      pending.delete(message.data.id)
      message.data.error
        ? item.reject(new Error(message.data.error))
        : item.resolve(message.data.value)
    }
  }
  if (message.type === 'state') for (const handler of subscriptions) handler(message.data)
  if (message.type === 'cancel') operations.get(message.data.id)?.abort()
  if (message.type === 'invoke') {
    const { id, kind, target, method, args } = message.data
    const abort = new AbortController()
    operations.set(id, abort)
    const timeout = setTimeout(() => abort.abort(), 15000)
    const operation = {
      id,
      deadlineAt: Date.now() + 15000,
      signal: abort.signal,
      userIntent: { kind: 'user-intent', id },
    }
    try {
      const fn = kind === 'action' ? actions.get(target) : providers.get(target)?.[method]
      if (typeof fn !== 'function') throw new Error('Method is not registered')
      const value = await fn(...args, operation)
      send('invoke-result', { id, value })
    } catch (error) {
      send('invoke-result', { id, error: error instanceof Error ? error.message : String(error) })
    } finally {
      clearTimeout(timeout)
      operations.delete(id)
    }
  }
})
window.addEventListener('error', (event) => send('failed', { message: event.message }))
window.addEventListener('unhandledrejection', (event) => console.error(event.reason))
send('ready')
