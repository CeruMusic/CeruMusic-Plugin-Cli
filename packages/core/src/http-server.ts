import { once } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'

export interface PluginHttpServerOptions {
  /** Host-owned proxy into the worker. Never pass plugin code to this callback. */
  handler: (request: Request) => Promise<Response>
  signal?: AbortSignal
  onListen?: (port: number) => void | (() => void)
}

export interface PluginHttpServerStartOptions {
  port?: number
  lan?: boolean
}

const hopByHop = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function endToEndHeaders(headers: Headers): Headers {
  const blocked = new Set(hopByHop)
  for (const token of (headers.get('connection') ?? '').split(','))
    blocked.add(token.trim().toLowerCase())
  const result = new Headers()
  for (const [name, value] of headers) if (!blocked.has(name)) result.append(name, value)
  // Headers iteration coalesces cookies; preserve their separate field values.
  if (!blocked.has('set-cookie')) {
    result.delete('set-cookie')
    for (const cookie of headers.getSetCookie()) result.append('set-cookie', cookie)
  }
  return result
}

function aborted(): DOMException {
  return new DOMException('HTTP server stopped or client disconnected', 'AbortError')
}

/** Own the upload adapter so an early response can detach its backpressure. */
function requestBody(incoming: IncomingMessage) {
  let controller: ReadableStreamDefaultController<Uint8Array>
  let detached = false
  const detach = () => {
    if (detached) return
    detached = true
    incoming.off('data', data)
    incoming.off('end', end)
    incoming.off('error', error)
  }
  const data = (chunk: Buffer) => {
    incoming.pause()
    controller.enqueue(chunk)
  }
  const end = () => {
    detach()
    controller.close()
  }
  const error = (reason: Error) => {
    detach()
    controller.error(reason)
  }
  const stream = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value
        incoming.pause()
        incoming.on('data', data)
        incoming.once('end', end)
        incoming.once('error', error)
        if (incoming.readableEnded) end()
      },
      pull() {
        if (!detached) incoming.resume()
      },
      cancel() {
        detach()
        incoming.destroy()
      },
    },
    { highWaterMark: 0 },
  )
  return {
    stream,
    discard() {
      if (!detached) {
        detach()
        controller.close()
      }
      // No data listener remains to pause the native stream when a Web queue fills.
      if (!incoming.destroyed) incoming.resume()
    },
  }
}

/** Race even an uncooperative worker proxy against cancellation, without leaking listeners. */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

/** Node HTTP transport only; plugin execution belongs in the handler's worker. */
export class PluginHttpServer {
  private server?: Server
  private lifetime?: AbortController
  private starting = false
  private stopping?: Promise<void>
  private readonly sockets = new Set<Socket>()
  private readonly requests = new Set<AbortController>()
  private disposeListen?: () => void
  private detachSignal?: () => void

  constructor(private readonly options: PluginHttpServerOptions) {}

  async start({ port = 0, lan = false }: PluginHttpServerStartOptions = {}): Promise<{
    url: string
    port: number
  }> {
    if (this.server || this.starting || this.stopping)
      throw new Error('Plugin HTTP server is already started or stopping')
    this.options.signal?.throwIfAborted()
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new RangeError('HTTP port must be an integer between 0 and 65535')

    this.starting = true
    const lifetime = new AbortController()
    this.lifetime = lifetime
    const server = createServer(
      {
        maxHeaderSize: 16 * 1024,
        headersTimeout: 10_000,
        requestTimeout: 120_000,
        keepAliveTimeout: 5_000,
        connectionsCheckingInterval: 1_000,
      },
      (request, response) => {
        void this.handle(request, response)
      },
    )
    this.server = server
    server.setTimeout(30_000, (socket) => socket.destroy())
    server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })
    // Reject tunnelling and protocol switching before the proxy can see them.
    const rejectProtocol = (_request: IncomingMessage, socket: Socket) => {
      socket.end(
        'HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      )
    }
    server.on('upgrade', rejectProtocol)
    server.on('connect', rejectProtocol)
    const onAbort = () => {
      void this.stop().catch(() => {})
    }
    this.options.signal?.addEventListener('abort', onAbort, { once: true })
    this.detachSignal = () => this.options.signal?.removeEventListener('abort', onAbort)

    try {
      const host = lan === true ? '0.0.0.0' : '127.0.0.1'
      try {
        await this.listen(server, lifetime.signal, host, port)
      } catch (error) {
        if (port === 0 || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
        await this.listen(server, lifetime.signal, host, 0)
      }
      lifetime.signal.throwIfAborted()
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('HTTP server has no TCP address')
      const cleanup = this.options.onListen?.(address.port)
      if (typeof cleanup === 'function') {
        if (lifetime.signal.aborted) cleanup()
        else this.disposeListen = cleanup
      }
      lifetime.signal.throwIfAborted()
      return { url: `http://127.0.0.1:${address.port}`, port: address.port }
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      this.starting = false
    }
  }

  private listen(server: Server, signal: AbortSignal, host: string, port: number): Promise<void> {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        server.off('error', onError)
        server.off('listening', onListening)
        signal.removeEventListener('abort', onAbort)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onListening = () => {
        cleanup()
        resolve()
      }
      const onAbort = () => {
        cleanup()
        reject(signal.reason)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        server.listen({ host, port, signal })
      } catch (error) {
        cleanup()
        reject(error)
      }
    })
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    const server = this.server
    if (!server) return Promise.resolve()
    // Defer teardown one microtask so reentrant stop() calls share this promise.
    this.stopping = Promise.resolve()
      .then(async () => {
        this.detachSignal?.()
        this.detachSignal = undefined
        this.lifetime?.abort(aborted())
        for (const controller of this.requests) controller.abort(aborted())
        this.requests.clear()
        const closed = new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING')
              reject(error)
            else resolve()
          })
        })
        for (const socket of this.sockets) socket.destroy()
        this.sockets.clear()
        const cleanup = this.disposeListen
        this.disposeListen = undefined
        try {
          cleanup?.()
        } finally {
          await closed
        }
      })
      .finally(() => {
        this.server = undefined
        this.lifetime = undefined
        this.stopping = undefined
      })
    return this.stopping
  }

  private async handle(incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
    const controller = new AbortController()
    const { signal } = controller
    this.requests.add(controller)
    const onDisconnect = () => controller.abort(aborted())
    const onClose = () => {
      if (!outgoing.writableFinished) onDisconnect()
    }
    incoming.once('aborted', onDisconnect)
    incoming.once('error', onDisconnect)
    outgoing.once('error', onDisconnect)
    outgoing.once('close', onClose)
    // Bounds handler work and responses too, not just Node's request upload timer.
    const timeout = setTimeout(() => {
      controller.abort(new DOMException('HTTP request timed out', 'TimeoutError'))
      outgoing.destroy()
    }, 300_000)
    timeout.unref()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let upload: ReturnType<typeof requestBody> | undefined
    try {
      const headers = new Headers()
      for (let index = 0; index < incoming.rawHeaders.length; index += 2)
        headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1])
      const origin = headers.get('origin')
      const port = incoming.socket.localPort
      // Browser writes need protection too. Do not trust Host here: an attacker
      // can point their own hostname at loopback (DNS rebinding).
      const sameOrigins = new Set([
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        `http://${incoming.socket.localAddress}:${port}`,
      ])
      if (origin !== null && !sameOrigins.has(origin)) {
        outgoing.writeHead(403, { connection: 'close' }).end()
        return
      }
      const method = incoming.method ?? 'GET'
      // Only origin-form request targets are accepted: never proxy absolute URLs.
      const target = incoming.url ?? '/'
      if (!target.startsWith('/') || target.startsWith('//')) {
        outgoing.writeHead(400, { connection: 'close' }).end()
        return
      }
      if (method !== 'GET' && method !== 'HEAD') upload = requestBody(incoming)
      const body = upload?.stream
      // Use the actual local endpoint, never an untrusted Host header, for the URL origin.
      const request = new Request(`http://127.0.0.1:${incoming.socket.localPort}${target}`, {
        method,
        headers: endToEndHeaders(headers),
        body,
        signal,
        ...(body ? { duplex: 'half' as const } : {}),
      })
      const pending = Promise.resolve(this.options.handler(request))
      // A late worker reply must not leave its body alive after disconnect/stop.
      void pending.then(
        (response) => {
          if (signal.aborted && response.body && !response.body.locked)
            void response.body.cancel(signal.reason).catch(() => {})
        },
        () => {},
      )
      const response = await withSignal(pending, signal)
      const clean = endToEndHeaders(response.headers)
      const declaredLength = clean.get('content-length')
      if (
        declaredLength !== null &&
        (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength)))
      )
        throw Error('Invalid HTTP response content-length')
      const expectedLength = declaredLength === null ? undefined : Number(declaredLength)
      const noBody =
        method === 'HEAD' ||
        response.status === 204 ||
        response.status === 205 ||
        response.status === 304
      if (!response.body && !noBody && expectedLength !== undefined && expectedLength !== 0)
        throw Error('HTTP response content-length mismatch')
      if ((response.status === 204 || response.status === 205) && expectedLength)
        throw Error('HTTP response content-length mismatch')
      let sentBytes = 0
      outgoing.statusCode = response.status
      for (const [name, value] of clean) if (name !== 'set-cookie') outgoing.setHeader(name, value)
      const cookies = clean.getSetCookie()
      if (cookies.length) outgoing.setHeader('set-cookie', cookies)
      if (noBody) {
        if (response.body) void response.body.cancel().catch(() => {})
      } else if (response.body) {
        reader = response.body.getReader()
        while (true) {
          const chunk = await withSignal(reader.read(), signal)
          if (chunk.done) break
          if (!(chunk.value instanceof Uint8Array)) throw Error('Invalid HTTP response chunk')
          sentBytes += chunk.value.byteLength
          if (expectedLength !== undefined && sentBytes > expectedLength)
            throw Error('HTTP response content-length mismatch')
          if (!outgoing.write(chunk.value)) await once(outgoing, 'drain', { signal })
        }
        if (expectedLength !== undefined && sentBytes !== expectedLength)
          throw Error('HTTP response content-length mismatch')
      }
      await withSignal(new Promise<void>((resolve) => outgoing.end(resolve)), signal)
    } catch (error) {
      controller.abort(error)
      if (reader) void reader.cancel(error).catch(() => {})
      if (!outgoing.destroyed) {
        if (outgoing.headersSent || incoming.aborted) outgoing.destroy()
        else {
          // Remove partially staged worker headers (especially content-length).
          for (const name of outgoing.getHeaderNames()) outgoing.removeHeader(name)
          outgoing.writeHead(500, {
            'content-type': 'text/plain; charset=utf-8',
            connection: 'close',
          })
          outgoing.end('Internal Server Error')
        }
      }
    } finally {
      clearTimeout(timeout)
      this.requests.delete(controller)
      incoming.off('aborted', onDisconnect)
      incoming.off('error', onDisconnect)
      outgoing.off('error', onDisconnect)
      outgoing.off('close', onClose)
      reader?.releaseLock()
      // Complete an early-response upload without buffering or closing the shared socket.
      upload?.discard()
      if (!upload && !incoming.complete && !incoming.destroyed) incoming.resume()
    }
  }
}
