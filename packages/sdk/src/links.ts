/** Only explicit, single, credential-free URLs may enter the plugin hook pipeline. */
export function publicLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    if (!['https:', 'http:', 'cerumusic:', 'ceru:'].includes(url.protocol) || url.username || url.password) return null
    if(url.protocol==='ceru:')url.protocol='cerumusic:'
    const path = decodeURIComponent(url.host + url.pathname)
    if (/(?:^|\/)(?:oauth|auth|login|logout|callback)(?:\/|$)/i.test(path) || /^plugin(?:\/|$)/i.test(path)) return null
    if (url.hash) return null
    for (const key of url.searchParams.keys()) {
      if (/(?:token|secret|password|passwd|credential|authorization|signature|cookie|session|^code$|^state$|^key$|^url$|^redirect)/i.test(key)) return null
    }
    return url.href
  } catch { return null }
}
