import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, readFile, writeFile, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn } from 'node:child_process'
import { Writable } from 'node:stream'
import ts from 'typescript'
import {
  readArtifact,
  signArtifact,
  createTemplate,
  generateSigningKeys,
  PreparedIssuer,
  parseJsonStrict,
  encodeArtifact,
  DEFAULT_PERSONALIZATION_SCHEMA,
} from '../packages/issuer/dist/index.js'
import { scaffoldProject, buildProject, TEMPLATES } from '../packages/cli/dist/index.js'

const workspace = fileURLToPath(new URL('../', import.meta.url))
const temp = await mkdtemp(join(workspace, '.test-tmp-'))
const cli = resolve(workspace, 'packages/cli/dist/bin.js')
const fixtures = new Map()
function parseEditorConfig(file, text) {
  // VS Code config files are JSONC; Prettier may preserve trailing commas.
  const result = ts.parseConfigFileTextToJson(file, text)
  assert.equal(result.error, undefined)
  return result.config
}
async function fixture(name, template = 'source', language = 'ts') {
  const root = join(temp, name)
  await scaffoldProject(root, { template, language })
  const sdk = join(root, 'node_modules/@shiqianjiang/ceru-plugin-sdk')
  await mkdir(sdk, { recursive: true })
  await cp(resolve(workspace, 'packages/sdk/dist'), join(sdk, 'dist'), { recursive: true })
  await cp(resolve(workspace, 'packages/sdk/package.json'), join(sdk, 'package.json'))
  await mkdir(join(root, 'node_modules/@types'), { recursive: true })
  await cp(
    resolve(workspace, 'node_modules/@types/lodash'),
    join(root, 'node_modules/@types/lodash'),
    { recursive: true },
  )
  return realpath(root)
}
for (const template of TEMPLATES) {
  for (const language of ['ts', 'js']) {
    test(language + ' scaffold builds one JS: ' + template, async () => {
      const root = await fixture(template + '-' + language, template, language)
      const built = await buildProject(root)
      const bytes = await readFile(built.path)
      const artifact = readArtifact(bytes)
      assert.equal(artifact.header.syntax, 'js')
      assert.equal(artifact.signatureStatus, 'unsigned')
      assert.ok(Object.keys(artifact.modules).length >= 1)
      assert.equal(built.path, join(root, 'dist/plugin.js'))
      assert.ok(!artifact.body.includes('sourceMappingURL'))
      assert.equal(artifact.header.manifest.engines.libraries, undefined)
      assert.equal(artifact.sourceFormat, 'exports-v2')
      assert.match(artifact.body, /exports\.(activate|surfaces|modules)/)
      assert.ok(!artifact.body.includes('__ceruSharedRequire'))
      const editor = parseEditorConfig(
        'launch.json',
        await readFile(join(root, '.vscode/launch.json'), 'utf8'),
      )
      for (const entry of editor.configurations) {
        assert.equal(entry.request, 'attach')
        assert.equal(entry.address, '127.0.0.1')
        assert.equal(entry.urlFilter, 'http://127.0.0.1:4179/')
        assert.equal(entry.targetTypes, undefined)
      }
      assert.deepEqual(
        parseEditorConfig(
          'ceru-plugin.code-workspace',
          await readFile(join(root, 'ceru-plugin.code-workspace'), 'utf8'),
        ).folders,
        [{ path: '.' }],
      )
      if (template === 'web-dist') {
        const original = await readFile(
          resolve(workspace, 'packages/cli/templates/web-dist', language, 'web-dist/sample.png'),
        )
        assert.deepEqual(await readFile(join(root, 'web-dist/sample.png')), original)
        assert.ok(artifact.body.includes('data:image/png;base64,'))
      }
      if (language === 'ts') fixtures.set(template, { root, bytes, artifact })
    })
  }
}
test('JavaScript authoring also builds', async () => {
  const root = await fixture('plain-js', 'source', 'js')
  const result = await buildProject(root)
  assert.equal(readArtifact(await readFile(result.path)).header.manifest.id, 'local.plain-js')
})
test('legacy Vue sharedLibraries settings produce a self-contained release', async () => {
  const root = await fixture('legacy-vue', 'vue', 'ts')
  const file = join(root, 'ceru.plugin.json')
  const config = JSON.parse(await readFile(file, 'utf8'))
  config.sharedLibraries = { vue: '^3.5.43' }
  config.manifest.engines.libraries = { vue: '^3.5.43' }
  await writeFile(file, JSON.stringify(config))
  const result = await buildProject(root)
  const artifact = readArtifact(await readFile(result.path))
  assert.equal(artifact.header.manifest.engines.libraries, undefined)
  assert.ok(!artifact.body.includes('__ceruSharedRequire'))
  assert.ok(artifact.body.includes('function createApp'))
})
test('scaffold refuses to replace a populated directory', async () => {
  const root = fixtures.get('source').root
  const before = await readFile(join(root, 'src/index.ts'))
  await assert.rejects(scaffoldProject(root), /not empty/)
  assert.deepEqual(await readFile(join(root, 'src/index.ts')), before)
})
test('type errors fail before emitting an artifact', async () => {
  const root = await fixture('bad-types')
  await writeFile(
    join(root, 'src/index.ts'),
    "import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'\nexport default definePlugin(() => { const value: number = 'wrong' })\n",
  )
  await assert.rejects(buildProject(root), /not assignable/)
  await assert.rejects(readFile(join(root, 'dist/plugin.js')), /ENOENT/)
})
test('entry must default-export a callable function', async () => {
  const root = await fixture('no-default')
  await writeFile(join(root, 'src/index.ts'), 'export const unrelated = 1\n')
  await assert.rejects(buildProject(root), /default-export/)
})
test('TSX is compiled with an explicit local JSX factory', async () => {
  const root = await fixture('tsx', 'web-surface')
  const config = JSON.parse(await readFile(join(root, 'ceru.plugin.json')))
  config.entries['view.main'] = 'src/view-demo.tsx'
  await writeFile(join(root, 'ceru.plugin.json'), JSON.stringify(config))
  const tsconfig = JSON.parse(await readFile(join(root, 'tsconfig.json')))
  tsconfig.compilerOptions.jsx = 'react'
  tsconfig.compilerOptions.jsxFactory = 'h'
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify(tsconfig))
  await writeFile(
    join(root, 'src/view-demo.tsx'),
    [
      "import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'",
      'declare global { namespace JSX { interface IntrinsicElements { div: { children?: string } } } }',
      'function h(tag: string, _props: unknown, text: string) { const el = document.createElement(tag); el.textContent = text; return el }',
      'export default defineSurface((ctx) => { ctx.root.replaceChildren(<div>Hello TSX</div>) })',
    ].join('\n'),
  )
  const result = await buildProject(root)
  const artifact = readArtifact(await readFile(result.path))
  assert.ok(artifact.modules['view.main'].includes('Hello TSX'))
  assert.ok(!artifact.modules['view.main'].includes('<div>'))
})
test('input escape is rejected', async () => {
  const root = await fixture('escaped-input')
  const config = JSON.parse(await readFile(join(root, 'ceru.plugin.json')))
  config.entries['logic.main'] = '../source-ts/src/index.ts'
  await writeFile(join(root, 'ceru.plugin.json'), JSON.stringify(config))
  await assert.rejects(buildProject(root), /escapes project/)
})
test('static verification never executes module code', () => {
  const { artifact } = fixtures.get('source')
  const body =
    'CeruPlugin.define({ modules: { "logic.main": function(ctx) { globalThis.__ceruUnsafe = true; throw new Error("do not run") } }, resources: {} })'
  readArtifact(encodeArtifact(artifact.header, body))
  assert.equal(globalThis.__ceruUnsafe, undefined)
})
test('rejects extra execution, getters and duplicate keys', () => {
  const { artifact } = fixtures.get('source')
  assert.throws(
    () => readArtifact(encodeArtifact(artifact.header, artifact.body + '\nprocess.exit(0)')),
    /exports assignment/,
  )
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          artifact.header,
          'CeruPlugin.define({ get modules() { return {} }, resources: {} })',
        ),
      ),
    /literal object/,
  )
  assert.throws(() => parseJsonStrict('{"id":1,"id":2}'), /Duplicate key/)
  assert.throws(() => parseJsonStrict('{"__proto__":{"admin":true}}'), /Unsafe/)
})
test('a hand-written exports plugin validates without npm or the CLI', () => {
  const { artifact } = fixtures.get('source')
  const manifest = structuredClone(artifact.header.manifest)
  const text =
    'exports.manifest = ' +
    JSON.stringify(manifest) +
    ';\nexports.package = {"formatVersion":2,"syntax":"js","signature":null};\n' +
    "const http = require('@ceru/http');\n" +
    'exports.activate = async function(core) { return http && core; };\n'
  const parsed = readArtifact(text)
  assert.equal(parsed.sourceFormat, 'exports-v2')
  assert.ok(parsed.modules[manifest.modules.logic.entry])
})
test('the distributed hand-written example is a valid combined plugin', async () => {
  const artifact = readArtifact(
    await readFile(resolve(workspace, 'examples/handwritten/plugin.js')),
  )
  assert.equal(artifact.sourceFormat, 'exports-v2')
  assert.ok(artifact.modules['logic.main'])
  assert.ok(artifact.modules['view.hello'])
})
test('hand-written plugins may require only literal Host modules', () => {
  const { artifact } = fixtures.get('source')
  const header = artifact.header
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          header,
          "const name = '@ceru/http'; exports.activate = async function(core) { return require(name); };",
        ),
      ),
    /literal Host module/,
  )
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          header,
          "exports.activate = async function(core) { return require('axios'); };",
        ),
      ),
    /documented Host modules/,
  )
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          header,
          'const data = { value: globalThis.run() }; exports.activate = async function() {};',
        ),
      ),
    /literal object/,
  )
})
test('CLI bundles third-party CommonJS dependencies but keeps Host modules external', async () => {
  const root = await fixture('bundled-requires', 'source', 'js')
  await writeFile(
    join(root, 'src/index.js'),
    [
      "import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'",
      "const JSON5 = require('json5')",
      "const host = require('@ceru/http')",
      'export default definePlugin((ctx) => { ctx.log.info(String(JSON5.parse("{ok:true}").ok && !!host)) })',
    ].join('\n'),
  )
  await mkdir(join(root, 'node_modules/json5'), { recursive: true })
  await cp(resolve(workspace, 'node_modules/json5'), join(root, 'node_modules/json5'), {
    recursive: true,
  })
  const built = await buildProject(root)
  const artifact = readArtifact(await readFile(built.path))
  assert.ok(artifact.body.includes('__ceruRequire'))
  assert.ok(!artifact.body.includes("require('json5')"))
})
test('rejects runtime imports and malformed registration', () => {
  const { artifact } = fixtures.get('source')
  assert.throws(
    () =>
      readArtifact(
        encodeArtifact(
          artifact.header,
          'CeruPlugin.define({modules:{"logic.main":function(ctx){return import(ctx.url)}},resources:{}})',
        ),
      ),
    /import/,
  )
  assert.throws(
    () =>
      readArtifact(encodeArtifact(artifact.header, 'CeruPlugin.define({modules:{},resources:{}})')),
    /Missing module/,
  )
})
const publisher = generateSigningKeys()
const issuerKeys = generateSigningKeys()
let templateBytes
let issuer
test('Ed25519 verification distinguishes cryptographic validity from trust', () => {
  const signed = signArtifact(fixtures.get('source').bytes, publisher.privateKey)
  assert.equal(readArtifact(signed).signatureStatus, 'verified-untrusted')
  assert.equal(
    readArtifact(signed, { trustedPublicKeys: [publisher.publicKey] }).signatureStatus,
    'verified-trusted',
  )
  assert.throws(
    () => readArtifact(signed, { trustedPublicKeys: [issuerKeys.publicKey] }),
    /trust store/,
  )
  const artifact = readArtifact(signed)
  artifact.header.manifest.name = 'tampered'
  assert.throws(
    () => readArtifact(encodeArtifact(artifact.header, artifact.body)),
    /Signature verification/,
  )
  assert.throws(
    () => readArtifact(Buffer.concat([signed, Buffer.from('\n/* modified */')])),
    /Signature verification/,
  )
})
test('prepares a delegated template and issues personalized files', () => {
  const schema = structuredClone(DEFAULT_PERSONALIZATION_SCHEMA)
  schema.properties.config.properties.apiOrigin = {
    type: 'string',
    maxLength: 200,
    enum: ['https://source.example.com'],
  }
  templateBytes = createTemplate(fixtures.get('source').bytes, {
    privateKey: publisher.privateKey,
    issuerPublicKeys: [issuerKeys.publicKey],
    personalizationSchema: schema,
  })
  issuer = new PreparedIssuer(templateBytes, {
    issuerPrivateKey: issuerKeys.privateKey,
    trustedPublicKeys: [publisher.publicKey],
  })
  const name = 'Hello */\nprocess.exit(1) "中文"'
  const output = issuer.issue(
    { display: { name }, config: { apiOrigin: 'https://source.example.com' } },
    { deliveryId: 'known-delivery' },
  )
  const result = readArtifact(output, { trustedPublicKeys: [publisher.publicKey] })
  assert.equal(result.header.delivery.payload.personalization.display.name, name)
  assert.equal(result.header.delivery.payload.deliveryId, 'known-delivery')
  assert.equal(result.body, readArtifact(templateBytes).body)
})
test('issuer rejects privilege expansion and an undelegated key', () => {
  assert.throws(() => issuer.issue({ permissions: ['network.request'] }), /Invalid personalization/)
  assert.throws(
    () => issuer.issue({ config: { apiOrigin: 'http://127.0.0.1' } }),
    /Invalid personalization/,
  )
  assert.throws(
    () => new PreparedIssuer(templateBytes, { issuerPrivateKey: publisher.privateKey }),
    /not delegated/,
  )
})
test('personalization signature cannot be replaced or modified', () => {
  const output = issuer.issue({ display: { name: 'Original' } })
  const parsed = readArtifact(output)
  parsed.header.delivery.payload.personalization.display.name = 'Different'
  assert.throws(
    () => readArtifact(encodeArtifact(parsed.header, parsed.body)),
    /Signature verification/,
  )
  const badCore = parsed.body + '\n/* changed core */'
  assert.throws(() => readArtifact(encodeArtifact(parsed.header, badCore)), /digest mismatch/)
})
test('expiry is an activation policy, not loss of cryptographic validity', () => {
  const issued = issuer.issue(
    {
      activation: { mode: 'one-time-code', code: 'test-code' },
      activationExpiresAt: '2030-01-02T00:00:00Z',
    },
    { now: new Date('2030-01-01T00:00:00Z') },
  )
  assert.equal(
    readArtifact(issued, { now: new Date('2031-01-01T00:00:00Z') }).signatureStatus,
    'verified-untrusted',
  )
  assert.throws(
    () =>
      readArtifact(issued, {
        now: new Date('2031-01-01T00:00:00Z'),
        requireUnexpiredActivation: true,
      }),
    /expired/,
  )
})
test('streaming issuance preserves core and propagates destination failures', async () => {
  const chunks = []
  const out = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  await issuer.writeTo(out, { display: { name: 'Stream' } })
  out.end()
  assert.equal(
    readArtifact(Buffer.concat(chunks)).header.delivery.payload.personalization.display.name,
    'Stream',
  )
  const failing = new Writable({
    write(_chunk, _enc, cb) {
      cb(new Error('destination closed'))
    },
  })
  await assert.rejects(issuer.writeTo(failing, {}), /destination closed/)
})
test('repeat issuance isolates customer data and reuses the same core bytes', () => {
  const core = readArtifact(templateBytes).body
  for (let i = 0; i < 20; i++) {
    const output = issuer.issue(
      { display: { name: 'customer-' + i } },
      { deliveryId: 'delivery-' + i },
    )
    const parsed = readArtifact(output)
    assert.equal(parsed.body, core)
    assert.equal(parsed.header.delivery.payload.personalization.display.name, 'customer-' + i)
  }
})
test('CLI validates files without printing activation secrets', async () => {
  const path = join(temp, 'personalized.js')
  await writeFile(
    path,
    issuer.issue({ activation: { mode: 'one-time-code', code: 'SHOULD-NOT-PRINT' } }),
  )
  const result = spawnSync(process.execPath, [cli, 'validate', path, '--json'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.stdout.includes('SHOULD-NOT-PRINT'))
  assert.equal(JSON.parse(result.stdout).personalized, true)
})
test('create CLI is runnable and build error exits nonzero', () => {
  const create = resolve(workspace, 'packages/create/dist/bin.js')
  const result = spawnSync(
    process.execPath,
    [create, join(temp, 'cli-create'), '--template', 'source'],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const bad = spawnSync(process.execPath, [cli, 'build', '--project', join(temp, 'bad-types')], {
    encoding: 'utf8',
  })
  assert.equal(bad.status, 1)
})
test(
  'dev server serves generated JS on loopback and exits cleanly',
  { timeout: 30000 },
  async () => {
    const child = spawn(
      process.execPath,
      [cli, 'dev', '--project', fixtures.get('source').root, '--port', '0', '--no-open'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let url
    try {
      url = await new Promise((resolveUrl, reject) => {
        let text = ''
        child.stdout.on('data', (chunk) => {
          text += chunk.toString()
          const match = text.match(/http:\/\/127\.0\.0\.1:\d+\/plugin\.js/)
          if (match) resolveUrl(match[0])
        })
        child.once('exit', (code) => reject(new Error('dev exited: ' + code)))
        child.stderr.on('data', () => {})
      })
      const response = await fetch(url)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      readArtifact(new Uint8Array(await response.arrayBuffer()))
      assert.equal((await fetch(new URL('/../../package.json', url))).status, 404)
    } finally {
      child.kill()
      await new Promise((done) => child.once('exit', done))
    }
  },
)
