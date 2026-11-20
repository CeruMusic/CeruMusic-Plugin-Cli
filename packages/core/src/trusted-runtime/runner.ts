// This module is an executable child entry point, never imported by the host.
import { createServer, type Server, type RequestListener } from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRpcMethods, type RpcMethod } from '../contract.js'
import { TrustedChannel } from './protocol.js'
import type { NativeFile } from './native.js'

const token = process.env.CERU_TRUSTED_TOKEN
delete process.env.CERU_TRUSTED_TOKEN
const parentPort = (process as any).parentPort
const utility = !!parentPort && !!process.versions.electron
if (!token || (!utility && (!process.send || !(process as any).permission || !process.execArgv.includes('--permission'))))
  throw Error('Trusted runner requires an authenticated host transport')
let port: any

let booted = false
let server: Server | undefined
let serverUrl: string | undefined
let serverPort: number | undefined
let starting = false
let closing: Promise<void> | undefined
const effects: (() => unknown)[] = []
const callbacks = new Map<string, (...args: any[]) => any>()
const listeners = new Map<string, Set<(data: any) => unknown>>()
const require = createRequire(process.argv[1])
const channel = new TrustedChannel(token,
  (message, done) => {
    if (!utility) { process.send!(message, done); return }
    try { if (!port) throw Error('Missing trusted MessagePort'); port.postMessage(message); done() }
    catch (error) { done(error instanceof Error ? error : Error(String(error))) }
  },
  async (name, data) => {
    if (name === 'boot' && !booted) { booted = true; await boot(data); return null }
    if (name === 'invoke' && booted) {
      const callback = callbacks.get(data?.target)
      if (!callback || !Array.isArray(data.args)) throw Error('Unknown trusted callback')
      return callback(...data.args)
    }
    throw Error('Unknown trusted runner request')
  },
  (name, data) => {
    if (name === 'shutdown') {
      void shutdown()
    } else if (name === 'event') {
      for (const listener of listeners.get(data?.name) ?? [])
        void Promise.resolve().then(() => listener(data.data)).catch(fatal)
    } else throw Error('Unknown trusted runner event')
  }, fatal,
)
if (utility) {
  parentPort.on('message', (event: any) => {
    if (port || event.data?.type !== 'ceru-trusted-port' || event.data?.token !== token || event.ports?.length !== 1)
      return fatal(Error('Invalid trusted MessagePort transfer'))
    port = event.ports[0]
    port.on('message', (message: any) => channel.receive(message.data))
    port.on('close', () => process.exit(0))
    port.start()
    port.postMessage({ type: 'ceru-trusted-ready', token })
  })
} else {
  process.on('message', message => channel.receive(message))
  process.on('disconnect', () => process.exit(0))
}
process.on('uncaughtException', fatal)
process.on('unhandledRejection', fatal)

function fatal(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).slice(0, 4096)
  void channel.notify('failed', { message }).finally(() => process.exit(1))
}
async function closeServer(): Promise<void> {
  if (closing) return closing
  if (!server) return
  const current = server
  closing = (async () => {
    server = undefined; serverUrl = undefined; serverPort = undefined
    await new Promise<void>(resolve => {
      current.close(() => resolve())
      current.closeAllConnections()
    })
    await channel.call('server.closed', {})
  })()
  try { await closing } finally { closing = undefined }
}
async function shutdown() {
  try {
    await closeServer()
    for (const effect of effects.reverse()) await effect()
  } finally { process.exit(0) }
}
async function bind(current: Server, port: number, host: string) {
  await new Promise<void>((resolve, reject) => {
    const error = (error: Error) => { current.off('listening', listening); reject(error) }
    const listening = () => { current.off('error', error); resolve() }
    current.once('error', error); current.once('listening', listening)
    current.listen(port, host)
  })
}
async function boot(data: any) {
  if (data.platform !== process.platform + '-' + process.arch)
    throw Error('Trusted executable platform does not match the host')
  const permission = (process as any).permission
  if (utility) {
    if (data.securityMode !== 'utility-unrestricted') throw Error('Utility runner requires unrestricted consent')
  } else if (data.securityMode !== 'node-permission' || permission.has('child') || permission.has('worker') || permission.has('addon') !== (data.native.length > 0))
    throw Error('Trusted runner permission configuration mismatch')
  const manifest = data.manifest
  const native = new Map<string, NativeFile>(data.native.map((item: NativeFile) => [item.name, item]))
  const nativeFile = (name: string) => {
    const item = native.get(name)
    if (!item) throw Error('Undeclared native module: ' + name)
    const hash = 'sha256:' + createHash('sha256').update(readFileSync(item.path)).digest('hex')
    if (hash !== item.sha256) throw Error('Extracted native SHA-256 mismatch: ' + name)
    return item.path
  }
  // Check extracted bytes again in the child before executing any plugin code.
  for (const name of native.keys()) nativeFile(name)
  const rpc = (name: RpcMethod, value: any) => channel.call(name, value)
  const services = createRpcMethods(rpc)
  const subscribe = (name: string, listener: (data: any) => unknown) => {
    if (typeof listener !== 'function') throw Error('Expected event listener')
    const group = listeners.get(name) ?? new Set()
    group.add(listener); listeners.set(name, group)
    return () => { group.delete(listener) }
  }
  const register = (target: string, handler: (...args: any[]) => any) => {
    if (callbacks.has(target) || callbacks.size >= 256 || typeof handler !== 'function') throw Error('Invalid trusted callback')
    callbacks.set(target, handler)
    return () => { callbacks.delete(target) }
  }
  const ctx: any = {
    ...services,
    plugin: { id: manifest.id, version: manifest.version, name: manifest.name },
    // Keep services.config.get(): config is an API, not the manifest defaults.
    permissions: {
      ...services.permissions,
      query: (value: string | { key: string; scope?: unknown }) => rpc('permissions.query', typeof value === 'string' ? { key: value } : value),
      request: (value: string | { key: string; scope?: unknown }) => rpc('permissions.request', typeof value === 'string' ? { key: value } : value),
    },
    paths: { data: data.dataDirectory, native: data.nativeDirectory },
    native: { path: nativeFile, load: (name: string) => require(nativeFile(name)) },
    effects: { add: (effect: () => unknown) => {
      if (typeof effect !== 'function' || effects.length >= 256) throw Error('Invalid cleanup effect')
      effects.push(effect)
    } },
    log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level,
      (message: string, value?: any) => { void channel.notify('log', { level, message, data: value }).catch(fatal) }])),
    storage: {
      get: (key: string) => rpc('storage.get', { key }),
      set: (key: string, value: any) => rpc('storage.set', { key, value }),
      delete: (key: string) => rpc('storage.delete', { key }),
    },
    events: { on: subscribe },
    actions: { register: (id: string, handler: (...args: any[]) => any) => {
      if (!manifest.provides?.actions?.some((item: any) => item.id === id)) throw Error('Undeclared action')
      return register('actions:' + id, handler)
    } },
    server: {
      get url() { return serverUrl },
      get port() { return serverPort },
      async listen(listener: RequestListener, options: any = {}) {
        if (typeof listener !== 'function' || server || starting || closing) throw Error('Only one trusted server is allowed')
        starting = true
        let current: Server | undefined
        try {
          const approved = await channel.call('server.authorize', options)
          current = createServer(listener)
          try { await bind(current, approved.port, approved.host) }
          catch (error) {
            if (!approved.port || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
            await bind(current, 0, approved.host)
          }
          const address = current.address()
          if (!address || typeof address === 'string') throw Error('Missing trusted server address')
          const port = address.port
          const url = 'http://127.0.0.1:' + port
          await channel.call('server.register', { port, host: approved.host, url })
          server = current; serverPort = port; serverUrl = url
          current.on('error', fatal)
          const owned = current
          return { port, url, close: () => server === owned ? closeServer() : Promise.resolve() }
        } catch (error) {
          current?.close(); current?.closeAllConnections()
          throw error
        } finally { starting = false }
      },
    },
  }
  services.music.on = (event: string, listener: (value: any) => unknown) => {
    if (event !== 'sources.changed') throw Error('Unknown music event')
    return subscribe('music.sources.changed', listener)
  }
  const entry = createRequire(data.entryPath)(data.entryPath)
  if (typeof entry !== 'function') throw Error('Trusted server must export a function')
  const dispose = await entry(ctx)
  if (typeof dispose === 'function') effects.push(dispose)
}
