declare module 'ceru' {
  const core: import('./index.js').PluginContext
  export = core
}
declare module '@ceru/http' {
  const http: import('./index.js').PluginContext['http']
  export = http
}
declare module '@ceru/ui' {
  const ui: import('./index.js').PluginContext['ui']
  export = ui
}
declare module '@ceru/socket' {
  const sockets: import('./index.js').PluginContext['sockets']
  export = sockets
}
declare module '@ceru/library' {
  const library: import('./index.js').PluginContext['library']
  export = library
}
declare module '@ceru/account' {
  const account: import('./index.js').PluginContext['account']
  export = account
}
declare module '@ceru/player' {
  const player: import('./index.js').PluginContext['player']
  export = player
}
declare module '@ceru/tools' {
  const tools: import('./index.js').PluginContext['utils']
  export = tools
}
declare module '@ceru/crypto' {
  const crypto: typeof import('./compat/crypto.js')
  export = crypto
}
declare module '@ceru/compression' {
  const compression: typeof import('./compat/zlib.js')
  export = compression
}
declare module '@ceru/encoding' {
  const encoding: typeof import('./compat/encoding.js')
  export = encoding
}
declare module '@ceru/legacy-http' {
  export const createLegacyHttpBridge: typeof import('./legacy-http.js').createLegacyHttpBridge
}
