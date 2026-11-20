import assert from 'node:assert/strict'
import test from 'node:test'
import { Writable } from 'node:stream'
import {
  LIMITS,
  PreparedIssuer,
  createTemplate,
  digest,
  encodeArtifact,
  encodeHeader,
  generateSigningKeys,
  readArtifact,
  signArtifact,
  validateManifest,
} from '../packages/issuer/dist/index.js'

const platform = process.platform + '-' + process.arch
const supportedPlatforms = [
  'win32-x64',
  'win32-arm64',
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
  'linux-arm64',
]
const base = {
  manifestVersion: 3,
  id: 'test.native',
  name: 'Native validation',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: { logic: { module: 'logic.main' } },
}
const permission = (name, fields = {}) => ({
  key: name,
  name,
  reason: 'Run the local audio decoder.',
  ...fields,
})
const serverManifest = (runtime = 'node', permissions = [permission('runtime.trusted')]) => ({
  ...base,
  entry: { ...base.entry, server: { module: 'server.main', runtime } },
  uses: { permissions },
})
const nativeManifest = () => ({
  ...serverManifest(),
  entry: {
    ...serverManifest().entry,
    native: [{ name: 'decoder.node', platforms: { [platform]: 'binary.decoder' } }],
  },
})
const binary = (bytes = Buffer.from([0, 255, 128, 42])) => ({
  type: 'base64',
  value: bytes.toString('base64'),
  mime: 'application/octet-stream',
  sha256: digest(bytes),
})
const body = (manifest, resources = {}) =>
  'exports.modules = {' +
  (manifest.entry.logic ? '"logic.main": function(ctx) {},' : '') +
  (manifest.entry.server ? '"server.main": function(ctx) {},' : '') +
  '};\nexports.resources = ' +
  JSON.stringify(resources) +
  ';\n'
const header = (manifest) => ({ formatVersion: 2, syntax: 'js', manifest, signature: null })
const artifact = (manifest, resources = {}) =>
  encodeArtifact(header(manifest), body(manifest, resources))
const nativeArtifact = (resource = binary(), manifest = nativeManifest()) =>
  artifact(manifest, { 'binary.decoder': resource })

test('node and native declarations require runtime.trusted independently of permission key', () => {
  assert.throws(() => validateManifest(serverManifest('node', [])), /runtime.trusted/)
  const missing = nativeManifest()
  missing.uses.permissions = []
  assert.throws(() => validateManifest(missing), /runtime.trusted/)
  validateManifest(
    serverManifest('node', [permission('runtime.trusted', { key: 'local-decoder' })]),
  )
  validateManifest(base)
  validateManifest({ ...base, entry: { ...base.entry, native: [] } })
  validateManifest(serverManifest('sandbox', [permission('network.serve')]))
  for (const runtime of ['browser', '', true])
    assert.throws(() => validateManifest(serverManifest(runtime)), /runtime/)
})

test('trusted reasons are bounded plain text and optional is an actual boolean', () => {
  for (const reason of [
    'x'.repeat(10),
    'x'.repeat(300),
    '界'.repeat(10),
    '🎵'.repeat(10),
    'Audio size < 10 MB; allow local decoding.',
    'Use **local decoding** for [audio](https://example.com).',
  ])
    validateManifest(serverManifest('node', [permission('runtime.trusted', { reason })]))
  for (const reason of [
    '',
    ' '.repeat(30),
    'x'.repeat(9),
    'x'.repeat(301),
    ' '.repeat(301) + 'valid explanation',
    '<b>Audio decoder</b>',
    '<script>alert(1)</script>',
    'Load audio <!-- hidden --> locally.',
    'Load <img src=x onerror=alert(1)> audio.',
  ])
    assert.throws(
      () => validateManifest(serverManifest('node', [permission('runtime.trusted', { reason })])),
      /reason/,
    )
  const noReason = permission('runtime.trusted')
  delete noReason.reason
  assert.throws(() => validateManifest(serverManifest('node', [noReason])), /reason/)
  for (const optional of [true, false, undefined]) {
    const declaration = permission('runtime.trusted')
    if (optional !== undefined) declaration.optional = optional
    const manifest = serverManifest('node', [declaration])
    validateManifest(manifest)
    assert.deepEqual(manifest.uses.permissions[0], declaration)
  }
  for (const optional of ['false', 0, null])
    assert.throws(
      () => validateManifest(serverManifest('node', [permission('runtime.trusted', { optional })])),
      /optional/,
    )
  assert.throws(
    () =>
      validateManifest(
        serverManifest('node', [
          permission('runtime.trusted'),
          permission('runtime.trusted', { key: 'second' }),
        ]),
      ),
    /Duplicate runtime.trusted/,
  )
  // Other permissions retain their existing reason schema.
  validateManifest(serverManifest('sandbox', [permission('network.serve', { reason: 'Serve' })]))
})

test('sandbox serve and LAN permissions are required for their declared capabilities', () => {
  assert.throws(() => validateManifest(serverManifest('sandbox', [])), /network.serve/)
  assert.throws(
    () => validateManifest(serverManifest('sandbox', [permission('network.serve.lan')])),
    /requires network.serve$/,
  )
  for (const runtime of ['sandbox', 'node']) {
    const manifest = serverManifest(runtime, [
      permission(runtime === 'node' ? 'runtime.trusted' : 'network.serve'),
    ])
    manifest.entry.server.lan = true
    assert.throws(() => validateManifest(manifest), /network.serve.lan/)
    manifest.uses.permissions.push(permission('network.serve.lan'))
    validateManifest(manifest)
    manifest.entry.server.lan = false
    manifest.uses.permissions.pop()
    validateManifest(manifest)
  }
})

test('native filenames, platform keys and resource references reject malformed paths and duplicate names', () => {
  const check = (change) => {
    const manifest = nativeManifest()
    change(manifest)
    validateManifest(manifest)
  }
  for (const runtime of ['sandbox', undefined])
    assert.throws(
      () =>
        check((manifest) => {
          if (runtime) {
            manifest.entry.server.runtime = runtime
            manifest.uses.permissions.push(permission('network.serve'))
          } else delete manifest.entry.server
        }),
      /node server/,
    )
  for (const name of [
    '../decoder.node',
    'sub/decoder.node',
    'sub\\decoder.node',
    'C:decoder.node',
    '/decoder.node',
    '.',
    '..',
    'decoder',
    'decoder.dll',
    'decoder.node ',
    'CON.node',
    'aux.extra.node',
  ])
    assert.throws(
      () =>
        check((manifest) => {
          manifest.entry.native[0].name = name
        }),
      /name|filename/,
    )
  for (const key of ['windows-x64', 'win32-ia32', 'linux-mips', '../win32-x64', 'win32-x64/extra'])
    assert.throws(
      () =>
        check((manifest) => {
          manifest.entry.native[0].platforms = { [key]: 'binary.decoder' }
        }),
      /platforms/,
    )
  for (const resource of [
    '',
    '../binary.node',
    'a/b.node',
    'a\\b.node',
    'C:decoder.node',
    '.',
    '..',
    123,
    {},
  ])
    assert.throws(
      () =>
        check((manifest) => {
          manifest.entry.native[0].platforms[platform] = resource
        }),
      /platforms|resource id/,
    )
  assert.throws(
    () =>
      check((manifest) => {
        manifest.entry.native[0].platforms = {}
      }),
    /platforms/,
  )
  assert.throws(
    () =>
      check((manifest) => {
        manifest.entry.native.push({ ...manifest.entry.native[0], name: 'DECODER.node' })
      }),
    /Duplicate native name/,
  )
})

test('current-platform support is checked without executing native or server code', () => {
  for (const target of supportedPlatforms) {
    const manifest = nativeManifest()
    manifest.entry.native[0].platforms = { [target]: 'binary.decoder' }
    const input = nativeArtifact(binary(), manifest)
    readArtifact(input, { nativePlatform: target })
    const missing = supportedPlatforms.find((candidate) => candidate !== target)
    assert.throws(
      () => readArtifact(input, { nativePlatform: missing }),
      /does not support current platform/,
    )
  }
  assert.throws(
    () => readArtifact(nativeArtifact(), { nativePlatform: 'freebsd-x64' }),
    /Unsupported native platform/,
  )
  const manifest = nativeManifest()
  const input = Buffer.concat([
    encodeHeader(header(manifest)),
    Buffer.from(
      body(manifest, { 'binary.decoder': binary() }).replace(
        'function(ctx) {}',
        'function(ctx) { throw new Error("must never execute") }',
      ),
    ),
  ])
  assert.equal(readArtifact(input).resources['binary.decoder'].sha256, binary().sha256)
})

test('every declared platform references nonempty binary data with a verified SHA-256', () => {
  const manifest = nativeManifest()
  const other = supportedPlatforms.find((candidate) => candidate !== platform)
  manifest.entry.native[0].platforms[other] = 'binary.other'
  assert.throws(
    () => readArtifact(nativeArtifact(binary(), manifest)),
    /nonempty base64 resource: binary.other/,
  )
  assert.doesNotThrow(() =>
    readArtifact(
      artifact(manifest, {
        'binary.decoder': binary(),
        'binary.other': binary(Buffer.from('other platform')),
      }),
    ),
  )
  for (const resource of [
    { type: 'text', value: 'binary text' },
    { type: 'json', value: { data: 'AA==' } },
    { ...binary(), value: '', sha256: digest(Buffer.alloc(0)) },
    { type: 'base64', value: binary().value, mime: 'application/octet-stream' },
    { ...binary(), sha256: '00'.repeat(32) },
    { ...binary(), sha256: 'sha256:' + '00'.repeat(32) },
    { ...binary(), value: 'AA=!' },
    { ...binary(Buffer.from([0])), value: 'AB==' },
  ])
    assert.throws(() => readArtifact(nativeArtifact(resource)), /base64|SHA-256/)
  assert.throws(() => readArtifact(artifact(nativeManifest())), /nonempty base64 resource/)
})

test('existing non-native resources retain their schema and optional binary hashes are checked', () => {
  const resources = {
    json: { type: 'json', value: { enabled: true } },
    text: { type: 'text', value: 'hello' },
    binary: { type: 'base64', value: 'AA==', mime: 'application/octet-stream' },
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(readArtifact(artifact(base, resources)).resources)),
    resources,
  )
  assert.doesNotThrow(() => readArtifact(artifact(base, { binary: binary() })))
  assert.throws(
    () => readArtifact(artifact(base, { binary: { ...binary(), sha256: digest('different') } })),
    /SHA-256 mismatch/,
  )
})

test('native bytes and hashes are covered by the existing signature and format', () => {
  const keys = generateSigningKeys()
  const input = nativeArtifact()
  assert.equal(readArtifact(input).signatureStatus, 'unsigned')
  const signed = signArtifact(input, keys.privateKey)
  const checked = readArtifact(signed, { trustedPublicKeys: [keys.publicKey] })
  assert.equal(checked.header.formatVersion, 2)
  assert.equal(checked.header.signature.mode, 'single@1')
  assert.equal(checked.signatureStatus, 'verified-trusted')
  for (const tamperedBody of [
    checked.body.replace(binary().value, binary(Buffer.from('tampered')).value),
    checked.body.replace(binary().sha256, digest('tampered')),
    body(checked.header.manifest, { 'binary.decoder': binary(Buffer.from('tampered')) }),
  ])
    assert.throws(
      () => readArtifact(encodeArtifact(checked.header, tamperedBody)),
      /Signature verification failed/,
    )
})

test('native binaries above 10 MB are validated without base64 regex stack overflow', () => {
  const input = nativeArtifact(binary(Buffer.alloc(8 * 1024 * 1024, 0xa5)))
  assert.ok(input.length > LIMITS.file)
  assert.ok(input.length < LIMITS.nativeFile)
  const result = readArtifact(input)
  assert.equal(
    result.resources['binary.decoder'].sha256,
    digest(Buffer.alloc(8 * 1024 * 1024, 0xa5)),
  )
})

test('only a declared native artifact receives the 50 MB file limit on both read and write', () => {
  assert.equal(LIMITS.file, 10 * 1024 * 1024)
  assert.equal(LIMITS.nativeFile, 50 * 1024 * 1024)
  for (const manifest of [
    base,
    serverManifest(),
    { ...base, entry: { ...base.entry, native: [] } },
  ]) {
    const exactBody =
      body(manifest) +
      '/*' +
      'x'.repeat(LIMITS.file - encodeHeader(header(manifest)).length - body(manifest).length - 4) +
      '*/'
    const exact = encodeArtifact(header(manifest), exactBody)
    assert.equal(exact.length, LIMITS.file)
    readArtifact(exact)
    assert.throws(() => encodeArtifact(header(manifest), exactBody + ' '), /size limit/)
    assert.throws(() => readArtifact(Buffer.concat([exact, Buffer.from(' ')])), /size limit/)
  }
  const manifest = nativeManifest()
  const nativeBody = body(manifest, { 'binary.decoder': binary() })
  const exactBody =
    nativeBody +
    '/*' +
    'x'.repeat(LIMITS.nativeFile - encodeHeader(header(manifest)).length - nativeBody.length - 4) +
    '*/'
  const exact = encodeArtifact(header(manifest), exactBody)
  assert.equal(exact.length, LIMITS.nativeFile)
  readArtifact(exact)
  assert.throws(() => encodeArtifact(header(manifest), exactBody + ' '), /size limit/)
  assert.throws(() => readArtifact(Buffer.concat([exact, Buffer.from(' ')])), /size limit/)
})

test('template signing and buffered/streamed issuance preserve the native size allowance', async () => {
  const publisher = generateSigningKeys()
  const issuer = generateSigningKeys()
  const manifest = nativeManifest()
  const input = artifact(manifest, { 'binary.decoder': binary(Buffer.alloc(8 * 1024 * 1024)) })
  const template = createTemplate(input, {
    privateKey: publisher.privateKey,
    issuerPublicKeys: [issuer.publicKey],
  })
  const prepared = new PreparedIssuer(template, {
    issuerPrivateKey: issuer.privateKey,
    trustedPublicKeys: [publisher.publicKey],
  })
  const options = { deliveryId: 'native-delivery', now: new Date('2026-01-01T00:00:00Z') }
  const issued = prepared.issue({}, options)
  assert.ok(issued.length > LIMITS.file)
  const chunks = []
  await prepared.writeTo(
    new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    }),
    {},
    options,
  )
  assert.deepEqual(Buffer.concat(chunks), issued)
  assert.equal(
    readArtifact(issued, { trustedPublicKeys: [publisher.publicKey] }).signatureStatus,
    'verified-trusted',
  )
})
