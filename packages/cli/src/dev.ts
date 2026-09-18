import { readFile, realpath } from 'node:fs/promises'
import { watch } from 'node:fs'
import { createServer, Agent as HttpAgent, type IncomingMessage } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import axios from 'axios'
import { SocketBroker } from './socket-broker.js'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomBytes, createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  readArtifact,
  parseJsonStrict,
  resolveArtifactConfig,
} from '@shiqianjiang/ceru-plugin-issuer'
import { buildProject } from './project.js'

const asset = (name: string) => fileURLToPath(new URL('../assets/' + name, import.meta.url))
function mergeConfig(base: Record<string, any>, override: Record<string, any>) {
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(override))
    result[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
        ? mergeConfig(result[key], value)
        : structuredClone(value)
  return result
}
async function readDebugTargets(port: number): Promise<any[]> {
  const response = await fetch('http://127.0.0.1:' + port + '/json/list', {
    signal: AbortSignal.timeout(750),
  })
  if (!response.ok) throw new Error('Debugger is not ready')
  const value = await response.json()
  return Array.isArray(value) ? value : []
}
async function waitForDebugger(origin: string, port: number, exited: () => boolean): Promise<void> {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline && !exited()) {
    try {
      const targets = await readDebugTargets(port)
      if (targets.some((t) => t.type === 'page' && t.url === origin + '/')) return
    } catch {}
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error('Electron debug target did not become ready at ' + origin)
}
const privateAddress = (address: string): boolean => {
  const value = address.toLowerCase()
  if (value.startsWith('::ffff:')) return privateAddress(value.slice('::ffff:'.length))
  if (value.includes(':'))
    return (
      value === '::1' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80')
    )
  const p = value.split('.').map(Number)
  return (
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168)
  )
}
async function bodyJson(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 256 * 1024) throw new Error('Request too large')
    chunks.push(chunk)
  }
  return parseJsonStrict(Buffer.concat(chunks).toString('utf8'))
}
async function allowedAddress(
  url: URL,
  privateAllowed: boolean,
  reservedPorts: number[],
): Promise<{ address: string; family: number }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true })
  if (!addresses.length) throw new Error('No address found')
  for (const { address } of addresses) {
    if (
      (address.startsWith('127.') || address === '::1') &&
      reservedPorts.includes(Number(url.port) || (url.protocol === 'https:' ? 443 : 80))
    )
      throw new Error('Development Host and debugger endpoints are reserved')
    if (privateAddress(address) && !privateAllowed)
      throw new Error('Private network access is not granted')
  }
  return addresses[0]
}
/** Development broker: capability-gated network, private-network split, pinned DNS, bounded response. */
async function fetchAllowed(
  input: any,
  privateAllowed: boolean,
  reservedPorts: number[] = [],
  signal?: AbortSignal,
  redirects = 0,
): Promise<any> {
  const url = new URL(input.url)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL')
  const method = String(input.method ?? 'GET').toUpperCase()
  const chosen = await allowedAddress(url, privateAllowed, reservedPorts)
  const headers: Record<string, string> = { 'Accept-Encoding': 'identity' }
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (
      /^(host|connection|content-length|transfer-encoding|accept-encoding|proxy-.*|upgrade)$/i.test(
        name,
      )
    )
      throw new Error('Reserved header: ' + name)
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('Invalid header')
    headers[name] = value
  }
  if (
    input.body !== undefined &&
    (typeof input.body !== 'string' || Buffer.byteLength(input.body) > 1024 * 1024)
  )
    throw new Error('Invalid request body')
  const pinLookup = ((_host: string, options: any, callback: any) =>
    options?.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family)) as any
  const httpAgent = new HttpAgent({ lookup: pinLookup })
  const httpsAgent = new HttpsAgent({ lookup: pinLookup })
  try {
    const response = await axios.request<ArrayBuffer>({
      url: url.href,
      method,
      headers,
      data: input.body,
      adapter: 'http',
      httpAgent,
      httpsAgent,
      proxy: false,
      maxRedirects: 0,
      timeout: Math.max(1000, Math.min(30000, Number(input.timeoutMs) || 15000)),
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      transformResponse: [(data) => data],
      signal,
    })
    const bytes = Buffer.from(response.data)
    const responseHeaders = Object.fromEntries(
      Object.entries(response.headers).filter(
        ([, value]) => value != null && typeof value !== 'function',
      ),
    )
    if (
      response.status >= 300 &&
      response.status < 400 &&
      typeof responseHeaders.location === 'string'
    ) {
      if (redirects >= 5) throw new Error('HTTP redirect limit exceeded')
      const nextMethod = response.status === 303 ? 'GET' : method
      return fetchAllowed(
        {
          ...input,
          url: new URL(responseHeaders.location, url).href,
          method: nextMethod,
          ...(nextMethod === 'GET' ? { body: undefined } : {}),
        },
        privateAllowed,
        reservedPorts,
        signal,
        redirects + 1,
      )
    }
    const text = bytes.toString('utf8')
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {}
    return { status: response.status, headers: responseHeaders, body }
  } catch (error) {
    // AxiosError includes config/headers: never send it through plugin logs or RPC.
    throw new Error(
      axios.isAxiosError(error)
        ? 'HTTP request failed (' + (error.code || 'NETWORK_ERROR') + ')'
        : 'HTTP request failed',
    )
  } finally {
    httpAgent.destroy()
    httpsAgent.destroy()
  }
}

export async function runDev(
  project: string,
  options: {
    port?: number
    noOpen?: boolean
    debugPort?: number
    hidden?: boolean
    electron?: string
    artifact?: string
    ensureRunning?: boolean
  } = {},
): Promise<void> {
  const root = await realpath(resolve(project))
  const port = options.port ?? 4179
  const debugPort = options.debugPort ?? 9223
  if (![port, debugPort].every((n) => Number.isInteger(n) && n >= 0 && n <= 65535))
    throw new Error('Invalid port')
  const projectKey = createHash('sha256')
    .update(process.platform === 'win32' ? root.toLowerCase() : root)
    .digest('hex')
  if (options.ensureRunning && port > 0) {
    let existing: any
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/__ceru_dev__/status', {
        signal: AbortSignal.timeout(750),
      })
      if (response.ok) existing = await response.json()
    } catch {}
    if (existing) {
      if (existing.projectKey !== projectKey || existing.debugPort !== debugPort)
        throw new Error(
          'This dev port belongs to another project or debug port. Stop it or select Attach to Ceru plugin with the correct ports.',
        )
      await waitForDebugger(existing.origin, debugPort, () => false)
      console.log('Reusing existing Ceru development Host.')
      console.log('CERU_DEBUG_READY ' + existing.origin + '/')
      return
    }
  }
  const prepare = async () => {
    if (!options.artifact) return buildProject(root, { development: true })
    const path = resolve(options.artifact)
    const bytes = await readFile(path)
    const parsed = readArtifact(bytes)
    if (Object.keys(parsed.header.manifest.engines.libraries ?? {}).length)
      throw new Error(
        'This artifact still requires Host frameworks. Rebuild it with CLI 0.2.0 or later.',
      )
    // Serve the verified release functions as scripts inside the same isolated
    // Surface. No project imports, transpiler, or framework is involved here.
    const devModules = Object.fromEntries(
      Object.entries(parsed.modules).map(([id, code]) => [
        id,
        'globalThis.__ceruStart(' + code + ');\n',
      ]),
    )
    return { path, bytes: bytes.length, devModules }
  }
  let build = await prepare()
  let artifact = readArtifact(await readFile(build.path))
  let revision = 1
  let error: string | null = null
  let running = false
  let dirty = false
  let timer: NodeJS.Timeout | undefined
  const token = randomBytes(24).toString('hex')
  const nonce = randomBytes(24).toString('base64')
  const catalog = JSON.parse(await readFile(asset('catalog.json'), 'utf8'))
  let configOverride: Record<string, unknown> = {}
  try {
    const configPath = resolve(root, '.ceru-dev/config.json')
    configOverride = parseJsonStrict(await readFile(configPath, 'utf8'))
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  const grants = new Map<string, { name: string }>()
  const effectiveConfig = () =>
    mergeConfig(resolveArtifactConfig(artifact.header), configOverride)
  const sockets = new SocketBroker()
  const operations = new Map<string, AbortController>()
  const storage = new Map<string, unknown>()
  const rebuild = async () => {
    if (running) {
      dirty = true
      return
    }
    running = true
    do {
      dirty = false
      try {
        build = await prepare()
        artifact = readArtifact(await readFile(build.path))
        revision++
        error = null
        sockets.closeAll()
        for (const operation of operations.values()) operation.abort()
        operations.clear()
        grants.clear()
        console.log('Reloaded plugin revision ' + revision)
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        console.error(error)
      }
    } while (dirty)
    running = false
  }
  const watchRoot = options.artifact ? dirname(resolve(options.artifact)) : root
  const watcher = watch(watchRoot, { recursive: !options.artifact }, (_event, path) => {
    if (!path) return
    const rel = path.toString().replaceAll('\\', '/')
    if (options.artifact) {
      if (resolve(watchRoot, path.toString()) !== resolve(options.artifact)) return
      clearTimeout(timer)
      timer = setTimeout(() => void rebuild(), 250)
      return
    }
    if (
      /^(node_modules|dist|\.git|\.keys|\.ceru-dev)(\/|$)/.test(rel) ||
      rel === relative(root, build.path).replaceAll('\\', '/') ||
      rel.includes('.tmp')
    )
      return
    if (!/\.(?:vue|html|tsx?|jsx?|json|css|svg|png|jpe?g|webp|woff2)$/.test(rel)) return
    clearTimeout(timer)
    timer = setTimeout(() => void rebuild(), 250)
  })
  let origin = ''
  const server = createServer(async (request, response) => {
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(JSON.stringify(value))
    }
    try {
      if (request.headers.host !== new URL(origin).host) {
        json(403, { error: 'Invalid Host' })
        return
      }
      const url = new URL(request.url ?? '/', origin)
      if (url.pathname === '/__ceru_dev__/status' && request.method === 'GET') {
        json(200, {
          protocol: 1,
          projectKey,
          origin,
          debugPort,
          mode: options.artifact ? 'preview' : 'dev',
        })
        return
      }
      if (url.pathname === '/plugin.js' && ['GET', 'HEAD'].includes(request.method ?? '')) {
        if (error) {
          json(503, { error })
          return
        }
        const bytes = await readFile(build.path)
        response.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin',
        })
        response.end(request.method === 'HEAD' ? undefined : bytes)
        return
      }
      if (url.pathname.startsWith('/api/')) {
        if (
          request.headers['x-ceru-dev-token'] !== token ||
          (request.headers.origin && request.headers.origin !== origin)
        ) {
          json(403, { error: 'Invalid development session' })
          return
        }
        if (url.pathname === '/api/socket-events' && request.method === 'GET') {
          json(200, { events: sockets.drain() })
          return
        }
        if (url.pathname === '/api/state' && request.method === 'GET') {
          json(200, {
            revision,
            error,
            manifest: artifact.header.manifest,
            migrationWarnings: artifact.migrationWarnings,
            resources: artifact.resources,
            catalog,
            config: effectiveConfig(),
            grants: Object.fromEntries(grants),
          })
          return
        }
        if (request.method !== 'POST') {
          json(405, { error: 'Method not allowed' })
          return
        }
        const input = await bodyJson(request)
        if (url.pathname === '/api/config') {
          if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Config must be an object')
          configOverride = input
          json(200, { ok: true })
          return
        }
        if (url.pathname === '/api/grant') {
          const declaration = artifact.header.manifest.permissions?.find((p) => p.key === input.key)
          if (!declaration) throw new Error('Permission was not declared')
          if (!input.allow) {
            grants.delete(input.key)
            sockets.revoke(input.key)
          } else {
            grants.set(input.key, { name: declaration.name })
          }
          json(200, { ok: true })
          return
        }
        if (url.pathname === '/api/rpc') {
          const data = input.data ?? {}
          if (input.method.startsWith('sockets.')) {
            if (input.method === 'sockets.closeAll') {
              sockets.closeAll()
              json(200, { value: null })
              return
            }
            if (input.method === 'sockets.connect') {
              const declaration = artifact.header.manifest.permissions?.find(
                (p) => p.key === data.permissionKey && p.name === 'network.socket',
              )
              const grant = declaration && grants.get(declaration.key)
              if (!grant) throw new Error('Socket permission is not granted')
              const privateAllowed =
                artifact.header.manifest.permissions?.some(
                  (permission) =>
                    permission.name === 'network.private' && grants.has(permission.key),
                ) ?? false
              const value = await sockets.connect(data, privateAllowed, [
                Number(new URL(origin).port),
                debugPort,
              ])
              // A pending handshake must not outlive a revoked grant or plugin reload.
              if (grants.get(declaration.key) !== grant) {
                sockets.disconnect(value.id)
                throw new Error('Socket permission was revoked')
              }
              json(200, { value })
              return
            }
            if (input.method === 'sockets.send') {
              sockets.send(data.id, data.event, data.data)
              json(200, { value: null })
              return
            }
            if (input.method === 'sockets.disconnect') {
              sockets.disconnect(data.id)
              json(200, { value: null })
              return
            }
            throw new Error('Unknown socket method')
          }
          if (input.method === 'operations.cancel') {
            operations.get(String(data.id))?.abort()
            json(200, { value: null })
            return
          }
          if (input.method.startsWith('library.playlists.')) {
            throw new Error(
              '此独立开发 Host 尚未连接澜音的歌单服务。本地歌单和云歌单由澜音管理；请在正式 Host 中调用此能力。开发环境不会创建替代歌单库。',
            )
          }
          if (input.method === 'config.get') {
            json(200, {
              value: effectiveConfig(),
            })
            return
          }
          if (input.method === 'storage.get') {
            json(200, { value: storage.get(data.key) ?? null })
            return
          }
          if (input.method === 'storage.set') {
            storage.set(String(data.key), data.value)
            json(200, { value: null })
            return
          }
          if (input.method === 'storage.delete') {
            storage.delete(String(data.key))
            json(200, { value: null })
            return
          }
          if (input.method === 'permissions.query') {
            json(200, {
              value: {
                status: !artifact.header.manifest.permissions?.some((p) => p.key === data.key)
                  ? 'undeclared'
                  : grants.has(data.key)
                    ? 'granted'
                    : 'prompt',
              },
            })
            return
          }
          if (input.method === 'permissions.getGranted') {
            json(200, {
              value: (artifact.header.manifest.permissions ?? [])
                .filter((permission) => grants.has(permission.key))
                .map((permission) => ({
                  key: permission.key,
                  name: permission.name,
                  scope: permission.scope ?? {},
                  status: 'granted',
                })),
            })
            return
          }
          if (input.method === 'services.capabilities.list') {
            json(200, {
              value: [
                'account',
                'library',
                'player',
                'queue',
                'favorites',
                'history',
                'downloads',
                'files',
                'clipboard',
                'localMusic',
                'settings',
                'window',
                'hotkeys',
                'sharing',
                'rooms',
                'devices',
                'ai',
                'tasks',
              ].map((service) => ({
                service,
                version: '1.0.0',
                available: false,
                reason: 'host-not-connected',
                permissionGroups: [],
              })),
            })
            return
          }
          if (input.method === 'services.capabilities.get') {
            const service = String(data.args?.[0] ?? '')
            json(200, {
              value: {
                service,
                version: '1.0.0',
                available: false,
                reason: 'host-not-connected',
                permissionGroups: [],
              },
            })
            return
          }
          if (input.method === 'http.request') {
            const declaration = artifact.header.manifest.permissions?.find(
              (p) => p.key === data.permissionKey && p.name === 'network.request',
            )
            const grant = declaration && grants.get(declaration.key)
            if (!grant) throw new Error('Network permission is not granted')
            const hasPrivate =
              artifact.header.manifest.permissions?.some(
                (permission) => permission.name === 'network.private' && grants.has(permission.key),
              ) ?? false
            const operationId = String(data.operation?.id ?? '')
            const controller = new AbortController()
            if (operationId) operations.set(operationId, controller)
            try {
              json(200, {
                value: await fetchAllowed(
                  data,
                  hasPrivate,
                  [Number(new URL(origin).port), debugPort],
                  controller.signal,
                ),
              })
            } finally {
              if (operations.get(operationId) === controller) operations.delete(operationId)
            }
            return
          }
          throw new Error(
            'Development Host does not implement ' +
              input.method +
              '. Use a mock or implement the production Host capability.',
          )
        }
        json(404, { error: 'Unknown endpoint' })
        return
      }
      if (request.method !== 'GET') {
        json(405, { error: 'Method not allowed' })
        return
      }
      let contents: string | Buffer
      let type: string
      if (url.pathname === '/') {
        contents = (await readFile(asset('index.html'), 'utf8'))
          .replaceAll('{{NONCE}}', nonce)
          .replace('{{TOKEN}}', JSON.stringify(token))
        type = 'text/html'
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self' 'nonce-" +
            nonce +
            "'; style-src 'self'; img-src 'self' data:; media-src 'self' http: https: data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
        )
      } else if (url.pathname === '/sandbox.html') {
        const moduleId = url.searchParams.get('module') ?? ''
        if (!Object.hasOwn(build.devModules, moduleId)) throw new Error('Unknown module')
        contents =
          '<!doctype html><meta charset="utf-8"><div id="plugin-root"></div><script nonce="' +
          nonce +
          '" src="/sandbox.js"></script>' +
          '<script nonce="' +
          nonce +
          '" src="/modules/' +
          encodeURIComponent(moduleId) +
          '.js"></script>'
        type = 'text/html'
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'nonce-" +
            nonce +
            "'; style-src 'unsafe-inline' data:; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
        )
      } else if (url.pathname.startsWith('/modules/')) {
        const moduleId = decodeURIComponent(url.pathname.slice('/modules/'.length, -3))
        if (!Object.hasOwn(build.devModules, moduleId)) throw new Error('Unknown module')
        contents = build.devModules[moduleId]
        type = 'application/javascript'
      } else {
        const file = (
          {
            '/playground.js': 'playground.js',
            '/core-contracts.js': 'core-contracts.js',
            '/style.css': 'style.css',
            '/sandbox.js': 'sandbox.js',
          } as Record<string, string>
        )[url.pathname]
        if (!file) {
          json(404, { error: 'Not found' })
          return
        }
        contents = await readFile(asset(file))
        type = file.endsWith('.css') ? 'text/css' : 'application/javascript'
      }
      response.writeHead(200, {
        'Content-Type': type + '; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(contents)
    } catch (e) {
      if (response.headersSent) {
        response.destroy()
        return
      }
      json(400, { error: e instanceof Error ? e.message : String(e) })
    }
  })
  let electron: ChildProcess | undefined
  try {
    await new Promise<void>((res, rej) => {
      server.once('error', rej)
      server.listen(port, '127.0.0.1', res)
    })
  } catch (e) {
    watcher.close()
    throw e
  }
  const address = server.address()
  origin = 'http://127.0.0.1:' + (typeof address === 'object' && address ? address.port : port)
  const close = () => {
    sockets.closeAll()
    for (const operation of operations.values()) operation.abort()
    clearTimeout(timer)
    watcher.close()
    electron?.kill()
    server.close()
    process.exitCode = 0
  }
  console.log('Dev playground: ' + origin + '/')
  console.log('Development artifact: ' + origin + '/plugin.js')
  if (!options.noOpen) {
    try {
      const executable =
        options.electron ?? (createRequire(resolve(root, 'package.json'))('electron') as string)
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        CERU_DEV_ORIGIN: origin,
        CERU_DEV_DEBUG_PORT: String(debugPort),
        CERU_DEV_HIDDEN: options.hidden ? '1' : '0',
      }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.NODE_OPTIONS
      delete env.NODE_PATH
      // Keep URLs out of positional arguments: Windows Electron rejects URL + trailing args.
      electron = spawn(executable, [asset('electron-app')], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
      })
      electron.stdout?.pipe(process.stdout, { end: false })
      electron.stderr?.pipe(process.stderr, { end: false })
      electron.once('error', (e) => {
        console.error(e.message)
        close()
      })
      electron.once('exit', (code) => {
        console.log('Electron exited: ' + code)
        close()
      })
      await waitForDebugger(origin, debugPort, () => electron?.exitCode !== null)
      console.log('Electron debugger: 127.0.0.1:' + debugPort + ' (VS Code: Attach to Ceru plugin)')
      console.log('CERU_DEBUG_READY ' + origin + '/')
    } catch (e) {
      console.error(
        'Electron could not start. Run npm install in the generated project, or use dev --no-open and open the playground URL.',
      )
      console.error(e instanceof Error ? e.message : String(e))
    }
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
