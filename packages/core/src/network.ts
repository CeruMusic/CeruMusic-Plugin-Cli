import axios from 'axios'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

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

export async function requestNetwork(
  input: any,
  privateAllowed: () => boolean,
  signal?: AbortSignal,
  redirects = 0,
): Promise<any> {
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
  const httpAgent = new HttpAgent({ lookup: pin })
  const httpsAgent = new HttpsAgent({ lookup: pin })
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
      maxContentLength: 16 * 1024 * 1024,
      maxBodyLength: 4 * 1024 * 1024,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      signal,
    })
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      if (redirects >= 5) throw new Error('重定向次数过多')
      const next = new URL(response.headers.location, url)
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
    const raw = Buffer.from(response.data).toString('utf8')
    let body: any = raw
    try {
      body = JSON.parse(raw)
    } catch {}
    return {
      status: response.status,
      headers: Object.fromEntries(
        Object.entries(response.headers)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ),
      body,
    }
  } catch (error) {
    if (axios.isAxiosError(error))
      throw new Error('网络请求失败: ' + (error.code ?? 'NETWORK_ERROR'))
    throw error
  } finally {
    httpAgent.destroy()
    httpsAgent.destroy()
  }
}
