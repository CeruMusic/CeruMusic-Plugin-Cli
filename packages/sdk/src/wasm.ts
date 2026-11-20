import type { AssetHandle } from './index.js'

export interface WasmAPI {
  /** Instantiate a WebAssembly resource embedded in this plugin's artifact. */
  instantiate(
    resource: AssetHandle | string,
    imports?: WebAssembly.Imports,
  ): Promise<WebAssembly.WebAssemblyInstantiatedSource>
}
