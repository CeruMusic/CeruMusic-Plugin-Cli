import { Worker, isMarkedAsUntransferable } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { HostIconName, StreamTransformFactory } from '@shiqianjiang/ceru-plugin-sdk'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'

let hostIcons: Record<string, string> | undefined
export function hostIconDataUrl(name: HostIconName): string | undefined {
  hostIcons ??= createRequire(import.meta.url)('../assets/catalog.json').icons as Record<
    string,
    string
  >
  if (!Object.hasOwn(hostIcons, name)) return undefined
  return 'data:image/svg+xml;base64,' + Buffer.from(hostIcons[name], 'utf8').toString('base64')
}

export interface GuestBoot {
  id: string
  script: string
  info: { name: string; version: string; author?: string; description?: string; homepage?: string }
}

interface HttpRequestState {
  request: Request
  reader?: ReadableStreamDefaultReader<Uint8Array>
  remainder?: Uint8Array
  reading: boolean
  sequence: number
  response?: ReadableStreamDefaultController<Uint8Array>
  resolve: (response: Response) => void
  reject: (error: Error) => void
  pull?: { sequence: number; resolve: () => void; reject: (error: Error) => void }
  timer?: ReturnType<typeof setTimeout>
  abort: () => void
  headersReceived: boolean
  expectedLength?: number
  receivedLength: number
}

/** Node worker + realm-local SDK. No Node modules or host objects enter plugin globals. */
export class NodePluginSandbox {
  private worker?: Worker
  private generation = randomUUID()
  private failure?: string
  private streamTransforms = new Map<string, boolean>()
  private streamCalls = 0
  private httpRequests = new Map<string, HttpRequestState>()
  private serverPort?: number
  private serverAddress?: { url: string; port: number }
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(
    private readonly rpc: (method: string, data: any) => Promise<any>,
    private readonly event: (type: string, data: any) => void,
  ) {}
  async start(
    artifact: Artifact,
    guest?: GuestBoot,
    lifecycleOnly?: 'onInstall' | 'onUpdate' | 'onUninstall',
  ): Promise<void> {
    const declared = artifact.header.manifest.entry
    const entries = [
      ...new Set(
        [
          declared.logic?.module,
          ...(!guest && !lifecycleOnly && declared.server?.runtime === 'sandbox'
            ? [declared.server.module]
            : []),
        ].filter((id): id is string => !!id),
      ),
    ]
    if (!entries.length) return
    const worker = new Worker(new URL('./node-worker.js', import.meta.url), {
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    })
    this.worker = worker
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          reject(new Error('Plugin activation timed out'))
          this.dispose()
        },
        guest ? 120000 : 30000,
      )
      worker.on('error', (error) => {
        this.failure = error.message
        clearTimeout(timer)
        reject(error)
        this.dispose()
      })
      worker.on('exit', () => {
        clearTimeout(timer)
        reject(new Error('Plugin runtime stopped'))
        this.dispose()
        this.event('closed', { reason: this.failure })
      })
      worker.on('message', (message) => {
        if (message?.generation !== this.generation) return
        const { type, data } = message
        try {
          if (type === 'active') {
            clearTimeout(timer)
            resolve()
            return
          }
          if (type === 'failed') {
            this.failure = String(data.message)
            clearTimeout(timer)
            reject(new Error(String(data.message)))
            this.dispose()
            return
          }
          if (type === 'rpc') {
            void this.rpc(String(data.method), data.data)
              .then(
                (value) => {
                  if (data.method === 'server.start' && Number.isInteger(value?.port)) {
                    if (this.worker !== worker) {
                      void this.rpc('server.stop', { port: value.port }).catch(() => {})
                      return
                    }
                    this.serverPort = value.port
                  }
                  if (data.method === 'server.stop') this.serverPort = undefined
                  return this.send('rpc-result', { id: data.id, value })
                },
                (error) =>
                  this.send('rpc-result', {
                    id: data.id,
                    error: error instanceof Error ? error.message : 'Host request failed',
                  }),
              )
              .catch(() => {})
            return
          }
          if (type.startsWith('http-')) {
            this.receiveHttp(type, data)
            return
          }
          if (type === 'stream-transform') {
            if (typeof data?.id !== 'string' || !/^[\w.-]{1,128}$/.test(data.id)) return
            if (data.removed) this.streamTransforms.delete(data.id)
            else if (typeof data.seekable === 'boolean' && this.streamTransforms.size < 32)
              this.streamTransforms.set(data.id, data.seekable)
            return
          }
          if (type === 'stream-result') {
            const call = this.pending.get(data?.id)
            if (!call) return
            this.pending.delete(data.id)
            clearTimeout(call.timer)
            if (data.error) call.reject(Error(String(data.error)))
            else if (!(data.buffer instanceof ArrayBuffer) || data.buffer.byteLength > 1024 * 1024)
              call.reject(Error('Invalid stream reply'))
            else call.resolve(new Uint8Array(data.buffer))
            return
          }
          if (type === 'invoke-result') {
            const call = this.pending.get(data.id)
            if (!call) return
            this.pending.delete(data.id)
            clearTimeout(call.timer)
            data.error ? call.reject(new Error(String(data.error))) : call.resolve(data.value)
            return
          }
          this.event(type, data)
        } catch (error) {
          clearTimeout(timer)
          reject(error)
          this.dispose()
        }
      })
      worker.postMessage({
        type: 'boot',
        lifecycleOnly,
        generation: this.generation,
        manifest: artifact.header.manifest,
        resources: artifact.resources,
        entries: entries.map((id) => artifact.modules[id]),
        serverAddress: this.serverAddress,
        guest,
      })
    })
  }
  async send(type: string, data: any): Promise<void> {
    if (type === 'server-stopped') {
      this.serverAddress = undefined
      this.serverPort = undefined
      for (const id of this.httpRequests.keys())
        this.finishHttp(id, Error('HTTP server stopped by the Host'), true)
    }
    if (type === 'server-listening') this.serverAddress = { url: data.url, port: data.port }
    this.worker?.postMessage({ type, data, generation: this.generation })
  }
  /** Cache a trusted server address before activation, or update a running worker. */
  setServerAddress(address: { url: string; port: number } | undefined): void {
    if (
      address &&
      (typeof address.url !== 'string' ||
        !Number.isInteger(address.port) ||
        address.port < 1 ||
        address.port > 65535)
    )
      throw Error('Invalid server address')
    this.serverAddress = address ? { ...address } : undefined
    if (this.worker) void this.send(address ? 'server-listening' : 'server-stopped', address ?? {})
  }
  /**
   * Host HTTP bridge. Headers cross as JSON; bodies use pull-driven transferable
   * ArrayBuffers (1 MiB maximum, eight live requests). Request abort, response
   * cancellation, server.close(), and disposal release both sides of the stream.
   * The Host owns listener permissions, URL/origin policy, and CORS decisions.
   */
  handleHttp(request: Request): Promise<Response> {
    if (!this.worker) return Promise.reject(Error('Plugin runtime is not active'))
    if (request.signal.aborted) return Promise.reject(Error('HTTP request aborted'))
    if (this.httpRequests.size >= 8) return Promise.reject(Error('HTTP request capacity exceeded'))
    const id = randomUUID()
    return new Promise<Response>((resolve, reject) => {
      const state: HttpRequestState = {
        request,
        reading: false,
        sequence: 0,
        resolve,
        reject,
        headersReceived: false,
        receivedLength: 0,
        abort: () => this.finishHttp(id, Error('HTTP request aborted'), true),
      }
      this.httpRequests.set(id, state)
      request.signal.addEventListener('abort', state.abort, { once: true })
      this.httpTimeout(id, state)
      try {
        if (request.body) state.reader = request.body.getReader()
        this.worker!.postMessage({
          type: 'http-request',
          generation: this.generation,
          data: {
            id,
            url: request.url,
            method: request.method,
            headers: [...request.headers],
            body: !!request.body,
          },
        })
      } catch (error) {
        this.finishHttp(id, error instanceof Error ? error : Error(String(error)))
      }
    })
  }
  private httpTimeout(id: string, state: HttpRequestState) {
    clearTimeout(state.timer)
    state.timer = setTimeout(() => this.finishHttp(id, Error('HTTP operation timed out')), 30000)
  }
  private releaseHttpInput(state: HttpRequestState, error?: Error, cancel = false) {
    const reader = state.reader
    state.reader = undefined
    state.remainder = undefined
    // Canceling a Readable.toWeb(IncomingMessage) destroys its socket, including
    // a response still being written. The HTTP host owns draining an unread
    // upload after a successful response; only explicit cancellation kills it.
    if (cancel) void reader?.cancel(error).catch(() => {})
    try {
      reader?.releaseLock()
    } catch {}
  }
  private finishHttp(id: string, error?: Error, cancelInput = false) {
    const state = this.httpRequests.get(id)
    if (!state) return
    this.httpRequests.delete(id)
    clearTimeout(state.timer)
    state.request.signal.removeEventListener('abort', state.abort)
    this.releaseHttpInput(state, error, cancelInput || state.request.signal.aborted)
    if (error) {
      state.reject(error)
      state.pull?.reject(error)
      try {
        state.response?.error(error)
      } catch {}
    } else state.pull?.resolve()
    void this.send('http-cancel', { id, reason: error?.message })
  }
  private receiveHttp(type: string, data: any) {
    if (type === 'http-server-stopped') {
      for (const id of this.httpRequests.keys())
        this.finishHttp(id, Error('HTTP server stopped'), true)
      return
    }
    const state = this.httpRequests.get(data?.id)
    if (!state) return
    const id = data.id
    if (type === 'http-request-cancel') {
      this.releaseHttpInput(state)
    } else if (type === 'http-request-pull') {
      if (state.reading || !Number.isSafeInteger(data.sequence)) {
        this.finishHttp(id, Error('Invalid HTTP request pull'))
        return
      }
      state.reading = true
      void (async () => {
        let chunk = state.remainder
        state.remainder = undefined
        let done = false
        if (!chunk) {
          const reader = state.reader
          let result: ReadableStreamReadResult<Uint8Array> | undefined
          try {
            result = await reader?.read()
          } catch (error) {
            if (state.reader !== reader) return
            throw error
          }
          if (state.reader !== reader) return
          done = result?.done ?? true
          chunk = result?.value
        }
        if (this.httpRequests.get(id) !== state) return
        if (chunk !== undefined && !(chunk instanceof Uint8Array))
          throw Error('Invalid HTTP request body')
        if (chunk && chunk.byteLength > 1024 * 1024) state.remainder = chunk.subarray(1024 * 1024)
        const buffer = Uint8Array.from(chunk?.subarray(0, 1024 * 1024) ?? []).buffer
        this.worker?.postMessage(
          {
            type: 'http-request-chunk',
            generation: this.generation,
            data: { id, sequence: data.sequence, done, buffer },
          },
          [buffer],
        )
      })()
        .catch((error) =>
          this.finishHttp(id, error instanceof Error ? error : Error(String(error))),
        )
        .finally(() => {
          state.reading = false
        })
    } else if (type === 'http-head') {
      if (state.headersReceived) {
        this.finishHttp(id, Error('Duplicate HTTP response'))
        return
      }
      state.headersReceived = true
      clearTimeout(state.timer)
      try {
        const headers = new Headers(data.headers)
        const length = headers.get('content-length')
        if (length !== null) {
          if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
            throw Error('Invalid HTTP response content-length')
          if (data.body) state.expectedLength = Number(length)
          else if (state.request.method !== 'HEAD' && data.status !== 304 && Number(length) !== 0)
            throw Error('HTTP response content-length mismatch')
        }
        const body = data.body
          ? new ReadableStream<Uint8Array>(
              {
                start: (controller) => {
                  state.response = controller
                },
                pull: () =>
                  new Promise<void>((resolve, reject) => {
                    const sequence = ++state.sequence
                    state.pull = { sequence, resolve, reject }
                    this.httpTimeout(id, state)
                    void this.send('http-response-pull', { id, sequence })
                  }),
                cancel: () => {
                  this.finishHttp(id, Error('HTTP response cancelled'), true)
                },
              },
              { highWaterMark: 0 },
            )
          : null
        state.resolve(
          new Response(body, {
            status: data.status,
            statusText: data.statusText,
            headers,
          }),
        )
        if (!data.body) this.finishHttp(id)
      } catch (error) {
        this.finishHttp(id, error instanceof Error ? error : Error(String(error)))
      }
    } else if (type === 'http-response-chunk') {
      const pull = state.pull
      if (!pull || data.sequence !== pull.sequence) {
        this.finishHttp(id, Error('Invalid HTTP response pull'))
        return
      }
      state.pull = undefined
      clearTimeout(state.timer)
      if (
        data.error ||
        !(data.buffer instanceof ArrayBuffer) ||
        data.buffer.byteLength > 1024 * 1024
      ) {
        const error = Error(data.error ?? 'Invalid HTTP response chunk')
        pull.reject(error)
        this.finishHttp(id, error)
        return
      }
      if (data.done) {
        if (state.expectedLength !== undefined && state.receivedLength !== state.expectedLength) {
          const error = Error('HTTP response content-length mismatch')
          pull.reject(error)
          this.finishHttp(id, error)
          return
        }
        state.response?.close()
        pull.resolve()
        this.finishHttp(id)
      } else {
        state.receivedLength += data.buffer.byteLength
        if (state.expectedLength !== undefined && state.receivedLength > state.expectedLength) {
          const error = Error('HTTP response exceeds content-length')
          pull.reject(error)
          this.finishHttp(id, error)
          return
        }
        state.response?.enqueue(new Uint8Array(data.buffer))
        pull.resolve()
      }
    } else if (type === 'http-error') this.finishHttp(id, Error(String(data.error)))
  }
  streamTransform(id: string, lifetime?: AbortSignal): StreamTransformFactory | undefined {
    const seekable = this.streamTransforms.get(id)
    if (seekable === undefined) return undefined
    return {
      seekable,
      create: async (input) => {
        const signal =
          lifetime && input.signal
            ? AbortSignal.any([lifetime, input.signal])
            : (lifetime ?? input.signal)
        signal?.throwIfAborted()
        const instance = await this.invoke(
          'stream',
          id,
          'create',
          [{ offset: input.offset, info: input.info }],
          signal,
        )
        let closed = false
        const close = async () => {
          if (closed) return
          closed = true
          signal?.removeEventListener('abort', aborted)
          await this.invoke('stream', instance, 'close', []).catch(() => {})
        }
        const aborted = () => {
          void close()
        }
        signal?.addEventListener('abort', aborted, { once: true })
        if (signal?.aborted) {
          await close()
          signal.throwIfAborted()
        }
        return {
          transform: (chunk) => {
            if (closed) throw Error('Stream closed')
            return this.transformChunk(instance, chunk, false, signal)
          },
          flush: () => {
            if (closed) throw Error('Stream closed')
            return this.transformChunk(instance, new Uint8Array(), true, signal)
          },
          dispose: close,
        }
      },
    }
  }
  private transformChunk(
    instance: string,
    chunk: Uint8Array,
    flush: boolean,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    signal?.throwIfAborted()
    if (!this.worker) return Promise.reject(Error('Plugin runtime is not active'))
    if (chunk.byteLength > 1024 * 1024 || this.streamCalls >= 8)
      return Promise.reject(Error('Stream capacity exceeded'))
    const id = randomUUID(),
      worker = this.worker
    const buffer =
      chunk.buffer instanceof ArrayBuffer &&
      chunk.byteOffset === 0 &&
      chunk.byteLength === chunk.buffer.byteLength &&
      !isMarkedAsUntransferable(chunk.buffer)
        ? chunk.buffer
        : Uint8Array.from(chunk).buffer
    this.streamCalls++
    return new Promise<Uint8Array>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
        this.pending.delete(id)
        this.streamCalls--
      }
      const cancel = () => {
        done()
        void this.send('stream-cancel', { id })
        reject(Error('Stream operation cancelled'))
      }
      const timer = setTimeout(cancel, 30000)
      this.pending.set(id, {
        timer,
        resolve: (value) => {
          done()
          resolve(value)
        },
        reject: (error) => {
          done()
          reject(error)
        },
      })
      signal?.addEventListener('abort', cancel, { once: true })
      try {
        worker.postMessage(
          {
            type: 'stream-chunk',
            generation: this.generation,
            data: { id, instance, flush, buffer },
          },
          [buffer as ArrayBuffer],
        )
      } catch (error) {
        done()
        reject(error)
      }
    })
  }
  invoke(
    kind: string,
    target: string,
    method: string,
    args: any[],
    signal?: AbortSignal,
    operationId?: string,
    connectionId?: string,
  ): Promise<any> {
    const id = operationId ?? randomUUID()
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Plugin runtime is not active'))
        return
      }
      const cancel = () => {
        void this.send('cancel', { id })
        done()
        this.pending.delete(id)
        reject(new Error('Plugin operation cancelled'))
      }
      // A deadline belongs to this operation only. Disposing the worker here
      // makes a slow importer look like a crashed plugin and causes the Host
      // to persistently disable an otherwise healthy plugin.
      const timer = setTimeout(
        cancel,
        kind === 'account' &&
          method === 'login' &&
          ['qrcode', 'oauth', 'browser'].includes(args[0]?.method)
          ? 305000
          : 120000,
      )
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
      }
      this.pending.set(id, {
        timer,
        resolve: (value) => {
          done()
          resolve(value)
        },
        reject: (error) => {
          done()
          reject(error)
        },
      })
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) {
        cancel()
        return
      }
      void this.send('invoke', {
        id,
        kind,
        target,
        method,
        args,
        ...(connectionId === undefined ? {} : { connectionId }),
      })
    })
  }
  dispose(): void {
    const worker = this.worker
    this.worker = undefined
    this.serverAddress = undefined
    for (const id of this.httpRequests.keys())
      this.finishHttp(id, Error(this.failure ?? 'Plugin runtime stopped'), true)
    if (this.serverPort !== undefined) {
      const port = this.serverPort
      this.serverPort = undefined
      void this.rpc('server.stop', { port }).catch(() => {})
    }
    for (const call of this.pending.values()) {
      clearTimeout(call.timer)
      call.reject(new Error(this.failure ?? 'Plugin runtime stopped'))
    }
    this.pending.clear()
    this.streamTransforms.clear()
    void worker?.terminate()
  }
}
