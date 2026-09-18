import { readFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { satisfies } from 'semver'
import { readArtifact, parseJsonStrict } from '@shiqianjiang/ceru-plugin-issuer'
import { buildProject } from './project.js'

const asset = (name: string) => fileURLToPath(new URL('../assets/' + name, import.meta.url))
const privateAddress = (address: string): boolean => {
  const value = address.toLowerCase()
  if (value.includes(':'))
    return (
      value === '::1' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80') ||
      value.startsWith('::ffff:')
    )
  const p = value.split('.').map(Number)
  return (
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 169 ||
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
/** Narrow development broker: exact granted origin, no redirects, pinned DNS, bounded response. */
async function fetchAllowed(
  input: any,
  permission: any,
  privateAllowed: boolean,
  binary = false,
  reservedPorts: number[] = [],
): Promise<any> {
  const url = new URL(input.url)
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported URL')
  if (url.origin !== permission.origin) throw new Error('Origin is not granted: ' + url.origin)
  if (url.protocol === 'http:' && !privateAllowed)
    throw new Error('HTTP requires a separately granted network.private permission')
  const method = String(input.method ?? 'GET').toUpperCase()
  if (!permission.methods.includes(method)) throw new Error('Method is outside the declared scope')
  if (/%(?:2f|5c)/i.test(url.pathname)) throw new Error('Encoded path separator is not supported')
  if (
    !permission.paths.some(
      (path: string) =>
        url.pathname === path || url.pathname.startsWith(path.endsWith('/') ? path : path + '/'),
    )
  )
    throw new Error('Path is outside the declared scope')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true })
  if (!addresses.length) throw new Error('No address found')
  for (const { address } of addresses) {
    if (
      (address.startsWith('127.') || address === '::1') &&
      reservedPorts.includes(Number(url.port) || (url.protocol === 'https:' ? 443 : 80))
    ) {
      throw new Error('Development Host and debugger endpoints are reserved')
    }
    if (/^(169\.254\.|fe80:|::ffff:)/i.test(address))
      throw new Error('Sensitive/link-local address is blocked')
    if (privateAddress(address) && !privateAllowed)
      throw new Error('Private network access is not granted')
  }
  const chosen = addresses[0]
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
  return new Promise((resolveResponse, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method,
        headers,
        lookup: ((_host: string, options: any, callback: any) =>
          options?.all
            ? callback(null, [chosen])
            : callback(null, chosen.address, chosen.family)) as any,
      },
      (response) => {
        const chunks: Buffer[] = []
        let total = 0
        response.on('data', (chunk: Buffer) => {
          total += chunk.length
          if (total > (binary ? 32 : 2) * 1024 * 1024) {
            request.destroy(new Error('Response exceeds development limit'))
            return
          }
          chunks.push(chunk)
        })
        response.once('error', reject)
        response.once('end', () => {
          if (binary) {
            resolveResponse({
              status: response.statusCode,
              headers: response.headers,
              bytes: Buffer.concat(chunks),
            })
            return
          }
          const text = Buffer.concat(chunks).toString('utf8')
          let body: unknown = text
          try {
            body = JSON.parse(text)
          } catch {}
          resolveResponse({ status: response.statusCode, headers: response.headers, body })
        })
      },
    )
    request.setTimeout(15000, () => request.destroy(new Error('HTTP timeout')))
    request.once('error', reject)
    request.end(input.body)
  })
}
export async function runDev(
  project: string,
  options: {
    port?: number
    noOpen?: boolean
    debugPort?: number
    hidden?: boolean
    electron?: string
  } = {},
): Promise<void> {
  const root = resolve(project)
  const port = options.port ?? 4179
  const debugPort = options.debugPort ?? 9223
  if (![port, debugPort].every((n) => Number.isInteger(n) && n >= 0 && n <= 65535))
    throw new Error('Invalid port')
  let build = await buildProject(root, { development: true })
  let artifact = readArtifact(await readFile(build.path))
  let revision = 1
  let error: string | null = null
  let running = false
  let dirty = false
  let timer: NodeJS.Timeout | undefined
  const token = randomBytes(24).toString('hex')
  const nonce = randomBytes(24).toString('base64')
  const catalog = JSON.parse(await readFile(asset('catalog.json'), 'utf8'))
  const checkLibraries = () => {
    for (const [name, range] of Object.entries(artifact.header.manifest.engines.libraries ?? {})) {
      if (!catalog.libraries[name] || !satisfies(catalog.libraries[name], range))
        throw new Error(
          'Plugin requires Host ' +
            name +
            ' ' +
            range +
            '; dev Host provides ' +
            catalog.libraries[name],
        )
    }
  }
  checkLibraries()
  let config: Record<string, unknown> = {}
  const grants = new Map<string, { origin: string; methods: string[]; paths: string[] }>()
  const storage = new Map<string, unknown>()
  const leases = new Map<string, { url: string; permissionKey: string; expiresAt: number }>()
  const rebuild = async () => {
    if (running) {
      dirty = true
      return
    }
    running = true
    do {
      dirty = false
      try {
        build = await buildProject(root, { development: true })
        artifact = readArtifact(await readFile(build.path))
        checkLibraries()
        revision++
        error = null
        grants.clear()
        leases.clear()
        console.log('Reloaded plugin revision ' + revision)
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        console.error(error)
      }
    } while (dirty)
    running = false
  }
  const watcher = watch(root, { recursive: true }, (_event, path) => {
    if (!path) return
    const rel = path.toString().replaceAll('\\', '/')
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
      if (url.pathname.startsWith('/media/') && request.method === 'GET') {
        const lease = leases.get(url.pathname.slice('/media/'.length))
        const grant = lease && grants.get(lease.permissionKey)
        if (!lease || !grant || lease.expiresAt < Date.now())
          throw new Error('Media lease expired or revoked')
        const privateAllowed =
          artifact.header.manifest.permissions?.some(
            (p) => p.name === 'network.private' && grants.get(p.key)?.origin === grant.origin,
          ) ?? false
        const media = await fetchAllowed(
          {
            url: lease.url,
            headers: request.headers.range ? { Range: request.headers.range } : {},
          },
          grant,
          privateAllowed,
          true,
          [Number(new URL(origin).port), debugPort],
        )
        response.writeHead(media.status, {
          'Content-Type': media.headers['content-type'] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'Content-Length': media.bytes.length,
          ...(media.headers['content-range']
            ? { 'Content-Range': media.headers['content-range'] }
            : {}),
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(media.bytes)
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
        if (url.pathname === '/api/state' && request.method === 'GET') {
          json(200, {
            revision,
            error,
            manifest: artifact.header.manifest,
            resources: artifact.resources,
            catalog,
            config,
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
          config = input
          json(200, { ok: true })
          return
        }
        if (url.pathname === '/api/grant') {
          const declaration = artifact.header.manifest.permissions?.find((p) => p.key === input.key)
          if (!declaration) throw new Error('Permission was not declared')
          if (!input.allow) grants.delete(input.key)
          else {
            const scope = declaration.scope ?? {}
            const declaredOrigin = scope.origin
            const chosen = typeof declaredOrigin === 'string' ? declaredOrigin : input.origin
            if (declaration.name.startsWith('network.') && !chosen)
              throw new Error('Specify an exact origin')
            grants.set(input.key, {
              origin: chosen ? new URL(chosen).origin : '',
              methods: Array.isArray(scope.methods) ? (scope.methods as string[]) : ['GET', 'POST'],
              paths: Array.isArray(scope.pathPrefixes) ? (scope.pathPrefixes as string[]) : ['/'],
            })
          }
          json(200, { ok: true })
          return
        }
        if (url.pathname === '/api/rpc') {
          const data = input.data ?? {}
          if (input.method === 'config.get') {
            json(200, { value: config })
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
          if (input.method === 'media.createLease') {
            const declaration = artifact.header.manifest.permissions?.find(
              (p) => p.key === data.permissionKey && p.name === 'network.request',
            )
            const grant = declaration && grants.get(declaration.key)
            if (!grant || new URL(data.url).origin !== grant.origin)
              throw new Error('Media origin is not granted')
            const id = randomBytes(18).toString('hex')
            leases.set(id, {
              url: data.url,
              permissionKey: data.permissionKey,
              expiresAt: Math.min(Number(data.expiresAt) || Date.now() + 60000, Date.now() + 60000),
            })
            json(200, { value: { kind: 'media', id } })
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
                (p) => p.name === 'network.private' && grants.get(p.key)?.origin === grant.origin,
              ) ?? false
            json(200, {
              value: await fetchAllowed(data, grant, hasPrivate, false, [
                Number(new URL(origin).port),
                debugPort,
              ]),
            })
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
            "'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
        )
      } else if (url.pathname === '/sandbox.html') {
        const moduleId = url.searchParams.get('module') ?? ''
        if (!Object.hasOwn(build.devModules, moduleId)) throw new Error('Unknown module')
        const libraries = artifact.header.manifest.engines.libraries ?? {}
        const shared = [libraries.vue ? 'vue' : '', libraries.react ? 'react' : '']
          .filter(Boolean)
          .map((name) => '<script nonce="' + nonce + '" src="/shared/' + name + '.js"></script>')
          .join('')
        contents =
          '<!doctype html><meta charset="utf-8"><div id="plugin-root"></div><script nonce="' +
          nonce +
          '" src="/sandbox.js"></script>' +
          shared +
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
            '/style.css': 'style.css',
            '/sandbox.js': 'sandbox.js',
            '/shared/vue.js': 'shared-vue.js',
            '/shared/react.js': 'shared-react.js',
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
      console.log('Electron debugger: 127.0.0.1:' + debugPort + ' (VS Code: Attach to Ceru plugin)')
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
