import JSON5 from 'json5'
import type { OperationContext, PluginContext } from './index.js'
import { createHttpClient } from './http.js'

export interface LegacyOptions {
  method?: string
  headers?: Record<string, unknown>
  form?: Record<string, unknown>
  body?: unknown
  [key: string]: unknown
}

export function createLegacyHttpBridge(host: PluginContext) {
  const client = createHttpClient(host, {
    permissionKey: 'network',
    requestPermission: true,
  })
  let current: OperationContext | undefined
  let queue: Promise<unknown> = Promise.resolve()

  // Legacy adapters carry mutable paging/cache state. Serialize top-level operations;
  // the adapter's own independent HTTP requests can still run concurrently.
  function withOperation<T>(operation: OperationContext, work: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      operation.signal.throwIfAborted()
      current = operation
      try {
        return await work()
      } finally {
        current = undefined
      }
    })
    queue = result.catch(() => undefined)
    return result
  }

  function permissionKey(): string {
    return 'network'
  }

  const ensurePermission = client.authorize

  function httpFetch(address: string, options: LegacyOptions = {}) {
    const operation = current
    let cancelled = false
    const promise = (async () => {
      if (!operation) throw new Error('请求缺少操作上下文')
      operation.signal.throwIfAborted()
      const url = new URL(address)
      const key = permissionKey()
      await ensurePermission(key, url.origin, operation)
      if (cancelled) throw new Error('请求已取消')
      const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' }
      for (const [name, value] of Object.entries(options.headers ?? {})) {
        if (
          value != null &&
          !/^(host|connection|content-length|transfer-encoding|accept-encoding|proxy-.*|upgrade)$/i.test(
            name,
          )
        )
          headers[name] = String(value)
      }
      let body: string | undefined
      if (options.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        body = new URLSearchParams(
          Object.entries(options.form).map(([k, v]) => [k, String(v)]),
        ).toString()
      } else if (options.body != null) {
        if (typeof options.body === 'string') body = options.body
        else {
          body = JSON.stringify(options.body)
          headers['Content-Type'] = 'application/json'
        }
      }
      let response = await host.http.request({
        permissionKey: key,
        url: url.href,
        method: (options.method ?? 'GET').toUpperCase(),
        headers,
        body,
        timeoutMs: Number(options.timeout) || undefined,
        operation,
      })
      const firstLocation = response.headers.location
      // Follow public redirects through Host permissions; never forward credentials across origins.
      for (
        let count = 0;
        response.status >= 300 && response.status < 400 && response.headers.location;
        count++
      ) {
        if (count >= 4) throw new Error('平台重定向次数过多')
        const next = new URL(response.headers.location, url)
        if (!['http:', 'https:'].includes(next.protocol)) throw new Error('平台重定向协议不受支持')
        await ensurePermission(permissionKey(), next.origin, operation)
        response = await host.http.request({
          permissionKey: permissionKey(),
          url: next.href,
          method: 'GET',
          operation,
        })
        url.href = next.href
      }
      operation.signal.throwIfAborted()
      if (cancelled) throw new Error('请求已取消')
      if (response.status >= 400) throw new Error(url.hostname + ' 返回 HTTP ' + response.status)
      let parsed = response.body
      if (typeof parsed === 'string') {
        const content = parsed.trim().replace(/^[\w.$]+\s*\((\{[\s\S]*\})\)\s*;?$/, '$1')
        try {
          parsed = JSON5.parse(content)
        } catch {
          /* Lyrics / HTML responses stay text. */
        }
      }
      return {
        body: parsed as any,
        statusCode: response.status,
        headers: { ...response.headers, ...(firstLocation ? { location: url.href } : {}) },
        raw: response.body,
        url: url.href,
      }
    })()
    return {
      promise,
      cancelHttp() {
        cancelled = true
      },
    }
  }

  return { httpFetch, withOperation, ensurePermission, permissionKey }
}
