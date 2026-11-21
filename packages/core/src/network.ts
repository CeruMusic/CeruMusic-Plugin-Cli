import axios from 'axios'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { MediaUpstream } from './media-stream.js'

export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase()
  if (value.startsWith('::ffff:')) {
    const tail = value.slice(7)
    if (tail.includes('.')) return isPrivateAddress(tail)
    const words = tail.split(':').map((part) => parseInt(part, 16))
    return isPrivateAddress(
      [words[0] >> 8, words[0] & 255, words[1] >> 8, words[1] & 255].join('.'),
    )
  }
  if (value.includes(':')) return !/^[23][0-9a-f]{3}:/.test(value)
  const [a, b] = value.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

export interface NetworkProxyAgents {
  httpAgent: any
  httpsAgent: any
}
export type NetworkProxyResolver = (url: string) => NetworkProxyAgents | null

let networkProxyResolver: NetworkProxyResolver | null = null

/**
 * 宿主注入的代理解析器:按目标 URL 返回代理 agents(null = 直连)。
 * 注入后重定向链的每一跳都会重新询问;DNS pin 仅在直连时保留。
 */
export function setNetworkProxyResolver(resolver: NetworkProxyResolver | null): void {
  networkProxyResolver = typeof resolver === 'function' ? resolver : null
}

export async function requestNetwork(
  input: any,
  privateAllowed: () => boolean,
  signal?: AbortSignal,
  redirects = 0,
): Promise<any> {
  const binary = input.responseType === 'arraybuffer'
  if (input.responseType !== undefined && !binary) throw Error('Unsupported HTTP responseType')
  const url = new URL(input.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('只支持 HTTP/HTTPS 请求')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true })
  if (!addresses.length) throw new Error('无法解析服务器地址')
  if (addresses.some((item) => isPrivateAddress(item.address)) && !privateAllowed())
    throw new Error('请先授予局域网访问权限')
  const chosen = addresses[0]
  const pin = ((_hostname: string, options: any, callback: any) =>
    options?.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family)) as any
  const proxyAgents = networkProxyResolver?.(url.href) ?? null
  const httpAgent = proxyAgents?.httpAgent ?? new HttpAgent({ lookup: pin })
  const httpsAgent = proxyAgents?.httpsAgent ?? new HttpsAgent({ lookup: pin })
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (/^(host|connection|content-length|transfer-encoding|proxy-.*|upgrade)$/i.test(name))
      continue
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('Invalid HTTP header')
    headers[name] = value
  }
  try {
    const response = await axios.request({
      url: url.href,
      method: input.method ?? 'GET',
      headers,
      data: input.body,
      httpAgent,
      httpsAgent,
      proxy: false,
      maxRedirects: 0,
      timeout: Math.min(60000, Math.max(1000, input.timeoutMs || 30000)),
      maxContentLength: (binary ? 1 : 16) * 1024 * 1024,
      maxBodyLength: 4 * 1024 * 1024,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      signal,
    })
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      if (input.rejectRedirects) throw Error('此请求不允许重定向')
      if (redirects >= 5) throw new Error('重定向次数过多')
      const next = new URL(response.headers.location, url)
      if (input.credential && next.origin !== url.origin) throw Error('账号请求不能跨来源重定向')
      if (next.origin !== url.origin)
        for (const name of Object.keys(headers))
          if (/authorization|cookie|token|key/i.test(name)) delete headers[name]
      const method =
        response.status === 303 || ([301, 302].includes(response.status) && input.method === 'POST')
          ? 'GET'
          : input.method
      return requestNetwork(
        {
          ...input,
          url: next.href,
          headers,
          method,
          body: method === 'GET' ? undefined : input.body,
        },
        privateAllowed,
        signal,
        redirects + 1,
      )
    }
    let body: any
    if (binary) {
      // Own an exact-sized backing store before transferring it to the worker.
      body = Uint8Array.from(response.data as Uint8Array).buffer
    } else {
      body = Buffer.from(response.data).toString('utf8')
      try { body = JSON.parse(body) } catch {}
    }
    return {
      status: response.status,
      headers: Object.fromEntries(
        Object.entries(response.headers)
          .filter(
            ([key, value]) =>
              value != null &&
              !(input.credential && /^(set-cookie2?|authorization|proxy-authenticate)$/i.test(key)),
          )
          .map(([k, v]) => [k, String(v)]),
      ),
      body,
      // 跟随重定向后的最终地址。插件侧（如 QQ 音乐短链）需要它来还原真实目标，
      // 因为重定向是由 core 内部跟随的，Location 头不会留给调用方。
      url: url.href,
    }
  } catch (error) {
    if (axios.isAxiosError(error))
      throw new Error('网络请求失败: ' + (error.code ?? 'NETWORK_ERROR'))
    throw error
  } finally {
    if (!proxyAgents) {
      httpAgent.destroy()
      httpsAgent.destroy()
    }
  }
}

/** Host-only binary transport; unlike requestNetwork this never buffers or decodes the body. */
export async function requestNetworkStream(
  input: { url: string; headers?: Record<string, string> },
  privateAllowed: (url: URL) => boolean,
  signal: AbortSignal,
  redirects = 0,
): Promise<MediaUpstream> {
  signal.throwIfAborted()
  const url = new URL(input.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw Error('Invalid media URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true })
  signal.throwIfAborted()
  if (
    !addresses.length ||
    (addresses.some((item) => isPrivateAddress(item.address)) && !privateAllowed(url))
  )
    throw Error('Media address is not an owned plugin service')
  const chosen = addresses[0]
  const pin = ((_hostname: string, options: any, callback: any) =>
    options?.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family)) as any
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (
      /^(host|connection|content-length|transfer-encoding|proxy-.*|upgrade|accept-encoding)$/i.test(
        name,
      )
    )
      continue
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      typeof value !== 'string' ||
      /[\r\n]/.test(value)
    )
      throw Error('Invalid media header')
    headers[name] = value
  }
  headers['Accept-Encoding'] = 'identity'
  // Owned loopback services must remain direct even when the user configures a proxy.
  const proxy = addresses.some((item) => isPrivateAddress(item.address))
    ? null
    : (networkProxyResolver?.(url.href) ?? null)
  const httpAgent = proxy?.httpAgent ?? new HttpAgent({ lookup: pin }),
    httpsAgent = proxy?.httpsAgent ?? new HttpsAgent({ lookup: pin })
  const release = () => {
    if (!proxy) {
      httpAgent.destroy()
      httpsAgent.destroy()
    }
  }
  try {
    const result = await axios.request({
      url: url.href,
      method: 'GET',
      headers,
      responseType: 'stream',
      decompress: false,
      httpAgent,
      httpsAgent,
      proxy: false,
      maxRedirects: 0,
      timeout: 30000,
      validateStatus: () => true,
      signal,
    })
    if ([301, 302, 303, 307, 308].includes(result.status) && result.headers.location) {
      result.data.destroy()
      release()
      if (redirects >= 5) throw Error('Too many media redirects')
      const next = new URL(String(result.headers.location), url)
      if (next.origin !== url.origin)
        for (const name of Object.keys(headers))
          if (/authorization|cookie|token|key/i.test(name)) delete headers[name]
      return requestNetworkStream(
        { url: next.href, headers },
        privateAllowed,
        signal,
        redirects + 1,
      )
    }
    if (result.headers['content-encoding'] && result.headers['content-encoding'] !== 'identity') {
      result.data.destroy()
      throw Error('Compressed encrypted media is not supported')
    }
    result.data.once('close', release)
    return {
      status: result.status,
      headers: Object.fromEntries(
        Object.entries(result.headers)
          .filter(([, value]) => value != null)
          .map(([name, value]) => [name, String(value)]),
      ),
      body: result.data,
    }
  } catch (error) {
    release()
    if (axios.isAxiosError(error))
      throw Error('Media request failed: ' + (error.code ?? 'NETWORK_ERROR'))
    throw error
  }
}
