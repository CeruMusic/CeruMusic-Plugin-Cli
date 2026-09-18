import type { PluginContext, HostLodash } from './index.js'

export interface BuiltinModules {
  ceru: PluginContext
  '@ceru/http': PluginContext['http']
  '@ceru/ui': PluginContext['ui']
  '@ceru/socket': PluginContext['sockets']
  '@ceru/library': PluginContext['library']
  '@ceru/account': PluginContext['account']
  '@ceru/player': PluginContext['player']
  '@ceru/tools': PluginContext['utils']
  lodash: HostLodash
  '@ceru/crypto': typeof import('./compat/crypto.js')
  '@ceru/compression': typeof import('./compat/zlib.js')
  '@ceru/encoding': typeof import('./compat/encoding.js')
  '@ceru/legacy-http': typeof import('./legacy-http.js')
}
export interface PluginModules {
  require<K extends keyof BuiltinModules>(name: K): BuiltinModules[K]
}
