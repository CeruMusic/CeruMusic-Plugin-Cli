import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { readArtifact, signArtifact } from '../packages/issuer/dist/index.js'
const manifest = {
  manifestVersion: 3,
  id: 'sample.component',
  name: 'Component',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: {
    logic: { module: 'logic.main' },
    views: [{ id: 'page', kind: 'component', module: 'view.page' }],
  },
}
const artifact = (body) =>
  'exports.manifest = ' +
  JSON.stringify(manifest) +
  ';\nexports.activate=function() {};\nexports.surfaces={page:function(deps){return bridge => {' +
  body +
  '}}};'
test('component policy checks executable syntax on both reading and signing, without executing it', () => {
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' })
  for (const expression of [
    'localStorage.getItem("key")',
    'sessionStorage.clear()',
    'window.api',
    'window.electron',
    'ipcRenderer',
    'document.cookie',
    'indexedDB',
    'Element.prototype',
    'Node.prototype',
    'Object.defineProperty(window,"key",{})',
    'eval("1")',
    'new Function("return 1")',
    'import("module")',
  ]) {
    for (const inspect of [readArtifact, (code) => signArtifact(Buffer.from(code), key)])
      assert.throws(() => inspect(artifact(expression)), expression.startsWith('import(') ? /dynamic import/ : /Component policy rejects/)
  }
  assert.doesNotThrow(() =>
    readArtifact(artifact('bridge.root.textContent="documentation: localStorage or import()"')),
  )
})

test('region views reject independent workers and WASM at both read and signing boundaries', () => {
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' })
  const regionManifest = {
    ...manifest,
    ui: { regions: [{ region: 'player.artwork', view: 'page' }] },
  }
  const regionArtifact = (body) => artifact(body).replace(JSON.stringify(manifest), JSON.stringify(regionManifest))
  for (const expression of [
    'new Worker("worker.js")',
    'new window.Worker("worker.js")',
    'new globalThis["SharedWorker"]("worker.js")',
    'self["WebAssembly"].compile(new Uint8Array())',
    'const { Worker: BackgroundWorker } = globalThis',
    'const compile = WebAssembly.compile',
  ]) {
    for (const inspect of [readArtifact, (code) => signArtifact(Buffer.from(code), key)])
      assert.throws(() => inspect(regionArtifact(expression)), /Component policy rejects/, expression)
  }
  assert.doesNotThrow(() => readArtifact(regionArtifact(
    'bridge.root.textContent="Worker and WebAssembly are documented here"; bridge.root.querySelector("canvas")?.getContext("webgl2")',
  )))
})

test('region restrictions do not remove logic WASM or change unrelated page views', () => {
  const parsed = readArtifact(artifact('bridge.root.textContent="page"').replace(
    'exports.activate=function() {}',
    'exports.activate=function(ctx) { ctx.wasm.instantiate("decoder"); }',
  ))
  assert.match(parsed.modules['logic.main'], /ctx.wasm.instantiate/)
  assert.doesNotThrow(() => readArtifact(artifact('const compile = WebAssembly.compile')))
})
