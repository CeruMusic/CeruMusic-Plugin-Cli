import type { CredentialRef, OperationContext, PluginContext } from './index.js'

export type QueryValue = string | number | boolean | null | undefined
export interface HttpResponse<T> {
  status: number
  headers: Record<string, string>
  data: T
}
export interface HttpRequestOptions {
  operation: OperationContext
  permissionKey?: string
  query?: Record<string, QueryValue | QueryValue[]>
  headers?: Record<string, string>
  method?: string
  json?: unknown
  form?: Record<string, QueryValue>
  body?: string
  credential?: CredentialRef
  timeoutMs?: number
  /** Default: true. Set false to inspect non-2xx platform responses yourself. */
  throwHttpErrors?: boolean
}
export interface HttpClientOptions {
  baseURL?: string
  headers?: Record<string, string>
  permissionKey?: string | ((url: URL) => string)
  /** Prompt only when a permission is in the prompt state. Never bypass a denial. */
  requestPermission?: boolean
}

export class HttpError<T = unknown> extends Error {
  readonly name = 'HttpError'
  constructor(
    readonly response: HttpResponse<T>,
    readonly origin: string,
  ) {
    // URLs may contain credentials. Do not include query strings or headers in errors.
    super(`${origin} returned HTTP ${response.status}`)
  }
  get status(): number {
    return this.response.status
  }
}

export function networkPermissionKey(origin: string): string {
  new URL(origin)
  return 'network'
}

/** Typed convenience layer over the Host broker. Does not use fetch or grant permissions. */
export function createHttpClient(
  ctx: {
    http: Pick<PluginContext['http'], 'request'>
    permissions: Pick<PluginContext['permissions'], 'query' | 'request'>
  },
  options: HttpClientOptions,
) {
  const prompts = new Map<string, Promise<void>>()

  async function authorize(
    key: string,
    _origin: string,
    operation: OperationContext,
  ): Promise<void> {
    operation.signal.throwIfAborted()
    const state = await ctx.permissions.query({ key })
    if (state.status === 'granted') return
    if (state.status !== 'prompt' || !options.requestPermission)
      throw new Error(`Network permission ${key}: ${state.status}`)
    const promptKey = key
    let pending = prompts.get(promptKey)
    if (!pending) {
      pending = (async () => {
        const result = await ctx.permissions.request({
          key,
          intent: operation.userIntent,
        })
        if (result.status !== 'granted')
          throw new Error(`Network permission ${key}: ${result.status}`)
      })().finally(() => prompts.delete(promptKey))
      prompts.set(promptKey, pending)
    }
    await pending
    operation.signal.throwIfAborted()
  }

  async function request<T = unknown>(
    address: string,
    input: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    const url = new URL(address, options.baseURL)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Invalid HTTP URL')
    for (const [name, value] of Object.entries(input.query ?? {})) {
      url.searchParams.delete(name)
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item != null) url.searchParams.append(name, String(item))
      }
    }
    if ([input.json, input.form, input.body].filter((value) => value !== undefined).length > 1)
      throw new Error('Choose one of json, form or body')
    const key =
      input.permissionKey ??
      (typeof options.permissionKey === 'function'
        ? options.permissionKey(url)
        : (options.permissionKey ?? 'network'))
    await authorize(key, url.origin, input.operation)
    const headers = { ...options.headers, ...input.headers }
    let body = input.body
    if (input.json !== undefined) {
      body = JSON.stringify(input.json)
      if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type'))
        headers['Content-Type'] = 'application/json'
    }
    if (input.form) {
      body = new URLSearchParams(
        Object.entries(input.form)
          .filter(([, value]) => value != null)
          .map(([name, value]) => [name, String(value)]),
      ).toString()
      if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type'))
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    const result = await ctx.http.request({
      permissionKey: key,
      url: url.href,
      method: (input.method ?? 'GET').toUpperCase(),
      headers,
      body,
      credential: input.credential,
      timeoutMs: input.timeoutMs,
      operation: input.operation,
    })
    input.operation.signal.throwIfAborted()
    const response = { status: result.status, headers: result.headers, data: result.body as T }
    if (input.throwHttpErrors !== false && (result.status < 200 || result.status >= 300))
      throw new HttpError(response, url.origin)
    return response
  }

  return {
    request,
    authorize,
    async get<T = unknown>(address: string, input: Omit<HttpRequestOptions, 'method'>): Promise<T> {
      return (await request<T>(address, { ...input, method: 'GET' })).data
    },
    async post<T = unknown>(
      address: string,
      input: Omit<HttpRequestOptions, 'method'>,
    ): Promise<T> {
      return (await request<T>(address, { ...input, method: 'POST' })).data
    },
  }
}
