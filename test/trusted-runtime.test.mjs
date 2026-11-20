import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import net from 'node:net'
import { TrustedPluginRuntime } from '../packages/core/dist/trusted-runtime/index.js'
import { TrustedChannel, MAX_MESSAGE_BYTES, MAX_PENDING } from '../packages/core/dist/trusted-runtime/protocol.js'
import { extractNative } from '../packages/core/dist/trusted-runtime/native.js'
import { encodeArtifact, readArtifact, signArtifact, generateSigningKeys } from '../packages/issuer/dist/index.js'
import { buildProject } from '../packages/cli/dist/project.js'

const keys = generateSigningKeys()
const platform = process.platform + '-' + process.arch
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const settings = { timeout: 15_000 }
function artifact(source, options = {}) {
  const manifest = {
    manifestVersion: 3, id: 'test.trusted', name: 'Trusted fixture', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { server: { module: 'server.main', runtime: 'node', ...options.server }, ...(options.native ? { native: options.native } : {}) },
    provides: { actions: [{ id: 'inspect', title: 'Inspect' }] },
    uses: { permissions: [
      { key: 'trusted', name: 'runtime.trusted', reason: 'Tests require an independent Node process.' },
      { key: 'serve', name: 'network.serve', reason: 'Serve test responses.' },
      { key: 'lan', name: 'network.serve.lan', reason: 'Test explicit LAN authorization.' },
    ] },
  }
  const bytes = encodeArtifact({ formatVersion: 2, syntax: 'js', manifest, signature: null },
    `const Server = /* @ceru-self-contained */ ${source};\nexports.modules = { 'server.main': Server };\nexports.resources = ${JSON.stringify(options.resources ?? {})};\n`)
  return readArtifact(signArtifact(bytes, keys.privateKey), { trustedPublicKeys: [keys.publicKey] })
}
async function fixture(t, source = 'async function(ctx) {}', artifactOptions = {}, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ceru-trusted-test-'))
  const dataDir = join(root, 'data'), nativeDir = join(root, 'runtime')
  await mkdir(dataDir); await mkdir(nativeDir)
  const parsed = artifact(source, artifactOptions)
  const controller = new AbortController()
  const registered = [], authorizations = [], logs = [], calls = []
  let released = 0
  const opts = {
    artifact: parsed, executable: process.execPath, dataDir, nativeDir,
    verification: { signatureVerified: true, publisher: parsed.header.signature.keyId, codeDigest: parsed.codeDigest,
      nodeApiModules: (parsed.header.manifest.entry.native ?? []).map(item => item.name) },
    consent: { granted: true, pluginId: parsed.header.manifest.id, publisher: parsed.header.signature.keyId, signal: controller.signal },
    async rpc(method, data) { calls.push({ method, data }); return { fromHost: true } },
    async authorize(key, permission) { authorizations.push({ key, permission }) },
    onListen(value) { registered.push(value); return () => { released++ } },
    onLog(value) { logs.push(value) },
    ...overrides,
  }
  const runtime = new TrustedPluginRuntime(opts)
  t.after(async () => { await runtime.stop(); await rm(root, { recursive: true, force: true }) })
  return { root, dataDir, nativeDir, parsed, opts, runtime, controller, registered, authorizations, logs, calls, released: () => released }
}

test('trusted subpath is additive and preserves standalone HTTP server export', async () => {
  const pkg = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url)))
  assert.equal(pkg.exports['./trusted'].default, './dist/trusted-runtime/index.js')
  assert.equal(pkg.exports['./server'].default, './dist/http-server.js')
})

test('signature, matching consent, publisher, digest and trusted declaration are required before spawn', settings, async t => {
  for (const mutate of [
    o => { o.consent.granted = false },
    o => { o.consent.publisher = 'another publisher' },
    o => { o.consent.pluginId = 'another.plugin' },
    o => { o.verification.signatureVerified = false },
    o => { o.verification.codeDigest = 'mismatch' },
    o => { o.artifact.signatureStatus = 'unsigned' },
    o => { o.artifact.header.manifest.uses.permissions = [] },
  ]) {
    const f = await fixture(t)
    mutate(f.opts)
    await assert.rejects(f.runtime.start())
    assert.equal(f.runtime.pid, undefined)
    assert.deepEqual(await readdir(f.nativeDir), [])
  }
  const f = await fixture(t)
  f.controller.abort()
  await assert.rejects(f.runtime.start(), /consent/)
  assert.equal(f.runtime.pid, undefined)
})

test('utility launch requires explicit unrestricted consent before creating a process or files', settings, async t => {
  let launched = false
  const f = await fixture(t, undefined, {}, {
    launchUtilityProcess() { launched = true; throw Error('Must not launch') },
  })
  await assert.rejects(f.runtime.start(), /explicit unrestricted file-access consent/)
  assert.equal(launched, false)
  assert.equal(f.runtime.pid, undefined)
  assert.deepEqual(await readdir(f.nativeDir), [])
})

test('raw Node executes in a separate process, permissions apply, and contract RPC reaches host', settings, async t => {
  const f = await fixture(t, `async function(ctx) {
    const fs = module.require('node:fs');
    fs.writeFileSync(ctx.paths.data + '/ok.txt', 'scoped');
    const result = await ctx.app.getInfo();
    const failures = [];
    for (const action of [
      () => fs.readFileSync(${JSON.stringify(join(tmpdir(), 'outside-ceru-data'))}),
      () => fs.writeFileSync(ctx.paths.data + '/../escape.txt', 'bad'),
      () => module.require('node:child_process').spawn(process.execPath, ['-v']),
      () => new (module.require('node:worker_threads').Worker)('setInterval(()=>{},1000)', { eval: true }),
    ]) { try { action(); failures.push('allowed') } catch(error) { failures.push(error.code) } }
    ctx.actions.register('inspect', () => ({ pid: process.pid, result, failures,
      addon: process.permission.has('addon'), child: process.permission.has('child'), worker: process.permission.has('worker'),
      env: process.env.NODE_OPTIONS ?? null }));
  }`)
  await f.runtime.start()
  const info = await f.runtime.invoke('actions:inspect')
  assert.notEqual(info.pid, process.pid)
  assert.equal(info.pid, f.runtime.pid)
  assert.deepEqual(info.result, { fromHost: true })
  assert.deepEqual(info.failures, Array(4).fill('ERR_ACCESS_DENIED'))
  assert.equal(info.addon, false); assert.equal(info.child, false); assert.equal(info.worker, false)
  assert.equal(info.env, null)
  assert.equal(await readFile(join(f.dataDir, 'ok.txt'), 'utf8'), 'scoped')
  assert.deepEqual(f.calls, [{ method: 'services.app.getInfo', data: { args: [] } }])
})

test('unsigned development requires both explicit option and matching development consent', settings, async t => {
  for (const [development, consentDevelopment, allowed] of [[true, true, true], [true, false, false], [false, true, false], [false, false, false]]) {
    const f = await fixture(t)
    f.opts.artifact.header.signature = null
    f.opts.artifact.signatureStatus = 'unsigned'
    f.opts.verification.signatureVerified = false
    f.opts.development = development
    f.opts.consent.development = consentDevelopment
    if (allowed) { await f.runtime.start(); assert.equal(f.runtime.running, true) }
    else { await assert.rejects(f.runtime.start()); assert.equal(f.runtime.pid, undefined) }
  }
})

test('listen registers actual port, supports Node/Express style and Koa callback listeners, and close is idempotent', settings, async t => {
  for (const listener of [
    `(req, res) => { res.setHeader('content-type', 'text/plain'); res.end('express-shape') }`,
    `({ callback() { return (req, res) => { res.end('koa-shape') } } }).callback()`,
  ]) {
    const f = await fixture(t, `async function(ctx) {
      const handle = await ctx.server.listen(${listener});
      ctx.actions.register('inspect', async command => {
        if (command === 'close') { await handle.close(); await handle.close(); }
        return { port: ctx.server.port, url: ctx.server.url, handle: { port: handle.port, url: handle.url } };
      });
    }`)
    await f.runtime.start()
    const info = await f.runtime.invoke('actions:inspect')
    assert.equal(f.registered.length, 1)
    assert.equal(f.registered[0].port, info.port)
    assert.match(await (await fetch(info.url)).text(), /-shape$/)
    assert.deepEqual(f.authorizations, [{ key: 'serve', permission: 'network.serve' }])
    await f.runtime.invoke('actions:inspect', ['close'])
    assert.equal(f.released(), 1)
    await assert.rejects(fetch(info.url))
  }
})

test('occupied preferred port falls back and host records the allocated port', settings, async t => {
  const busy = net.createServer()
  busy.listen(0, '127.0.0.1'); await once(busy, 'listening')
  t.after(() => new Promise(resolve => busy.close(resolve)))
  const port = busy.address().port
  const f = await fixture(t, `async function(ctx) { await ctx.server.listen((req,res) => res.end('fallback')) }`, { server: { port } })
  await f.runtime.start()
  assert.notEqual(f.registered[0].port, port)
  assert.equal(await (await fetch(f.registered[0].url)).text(), 'fallback')
})

test('closing an old server handle cannot close a later listener', settings, async t => {
  const f = await fixture(t, `async function(ctx) {
    const first = await ctx.server.listen((req,res)=>res.end('first'));
    await first.close();
    const second = await ctx.server.listen((req,res)=>res.end('second'));
    await first.close();
    ctx.actions.register('inspect',()=>({port:ctx.server.port,url:ctx.server.url}));
  }`)
  await f.runtime.start()
  const current = await f.runtime.invoke('actions:inspect')
  assert.equal(f.released(), 1)
  assert.equal(await (await fetch(current.url)).text(), 'second')
  await f.runtime.stop()
  assert.equal(f.released(), 2)
})

test('revocation cannot be intercepted by a plugin SIGTERM handler', settings, async t => {
  const f = await fixture(t, `async function(ctx) {
    process.on('SIGTERM',()=>{});
    await ctx.server.listen((req,res)=>res.end('running'));
  }`)
  await f.runtime.start()
  f.controller.abort()
  await f.runtime.stop()
  await assert.rejects(fetch(f.registered[0].url))
  assert.deepEqual(await readdir(f.nativeDir), [])
})

test('server permissions and declared LAN policy fail closed', settings, async t => {
  const denied = await fixture(t, `async function(ctx) { await ctx.server.listen((req,res)=>res.end()) }`, {}, {
    authorize: async () => { throw Error('Host denied network.serve') },
  })
  await assert.rejects(denied.runtime.start(), /denied/)
  assert.equal(denied.registered.length, 0)
  const undeclared = await fixture(t, `async function(ctx) { await ctx.server.listen((req,res)=>res.end(), {lan:true}) }`)
  await assert.rejects(undeclared.runtime.start(), /undeclared/)
  assert.equal(undeclared.registered.length, 0)
  const lan = await fixture(t, `async function(ctx) { await ctx.server.listen((req,res)=>res.end('lan')) }`, { server: { lan: true } })
  await lan.runtime.start()
  assert.equal(lan.registered[0].host, '0.0.0.0')
  assert.deepEqual(lan.authorizations.map(item => item.permission), ['network.serve', 'network.serve.lan'])
})

test('revocation and host abort kill child, release port, and remove extracted session files', settings, async t => {
  for (const useHostSignal of [false, true]) {
    const hostController = new AbortController()
    const f = await fixture(t, `async function(ctx) { await ctx.server.listen((req,res)=>res.end('active')) }`, {},
      useHostSignal ? { signal: hostController.signal } : {})
    await f.runtime.start()
    const { url } = f.registered[0]
    ;(useHostSignal ? hostController : f.controller).abort()
    await f.runtime.stop()
    assert.equal(f.runtime.running, false)
    assert.equal(f.released(), 1)
    await assert.rejects(fetch(url))
    assert.deepEqual(await readdir(f.nativeDir), [])
    await f.runtime.stop()
    assert.equal(f.released(), 1)
  }
})

test('crash releases owned port and pending host invocations reject', settings, async t => {
  let exited
  const done = new Promise(resolve => { exited = resolve })
  const f = await fixture(t, `async function(ctx) {
    await ctx.server.listen((req,res)=>res.end('live'));
    ctx.actions.register('inspect', () => { process.exit(23) });
  }`, {}, { onExit: exited })
  await f.runtime.start()
  await assert.rejects(f.runtime.invoke('actions:inspect'), /exit|stopped|disconnected/)
  await done
  assert.equal(f.runtime.running, false)
  assert.equal(f.released(), 1)
  await assert.rejects(fetch(f.registered[0].url))
  assert.deepEqual(await readdir(f.nativeDir), [])
})

test('abort while host is registering disposes late registration exactly once', settings, async t => {
  let entered, release, disposed = 0
  const waiting = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const f = await fixture(t, `async function(ctx) { await ctx.server.listen((req,res)=>res.end()) }`, {}, {
    async onListen() { entered(); await gate; return () => { disposed++ } },
  })
  const started = f.runtime.start()
  const rejected = assert.rejects(started)
  await waiting
  f.controller.abort()
  release()
  await rejected
  await f.runtime.stop()
  assert.equal(disposed, 1)
})

test('activation deadline terminates a hung child and cleans up', settings, async t => {
  const f = await fixture(t, 'async function(ctx) { while(true) {} }', {}, { startupTimeoutMs: 400 })
  await assert.rejects(f.runtime.start(), /timed out/)
  assert.deepEqual(await readdir(f.nativeDir), [])
})

test('plugins cannot grant trusted runtime permission through individual or group RPC', settings, async t => {
  const f = await fixture(t, `async function(ctx) {
    const single = await ctx.permissions.request('trusted');
    const group = await ctx.permissions.requestGroup({group:'trustedRuntime'});
    ctx.actions.register('inspect', () => ({single,group}));
  }`)
  await f.runtime.start()
  assert.deepEqual(await f.runtime.invoke('actions:inspect'), {
    single: { status: 'denied' }, group: { group: 'trustedRuntime', status: 'denied', grants: [] },
  })
  assert.deepEqual(f.calls, [])
})

test('config remains a generated API and permission query accepts key or object', settings, async t => {
  const f = await fixture(t, `async function(ctx) {
    const config = await ctx.config.get();
    const byKey = await ctx.permissions.query('serve');
    const byObject = await ctx.permissions.query({key:'serve'});
    ctx.actions.register('inspect', () => ({config,byKey,byObject}));
  }`)
  await f.runtime.start()
  assert.deepEqual(await f.runtime.invoke('actions:inspect'), {
    config: { fromHost: true }, byKey: { fromHost: true }, byObject: { fromHost: true },
  })
  assert.equal(f.calls[0].method, 'config.get')
  assert.deepEqual(f.calls.slice(1), Array(2).fill({ method: 'permissions.query', data: { key: 'serve' } }))
})

test('real desktop native binary loads with its matching Electron and retains scoped Node restrictions', {
  timeout: 20_000,
  skip: !process.env.CERU_TRUSTED_NATIVE_FIXTURE || !process.env.CERU_TRUSTED_NATIVE_EXECUTABLE,
}, async t => {
  const bytes = await readFile(process.env.CERU_TRUSTED_NATIVE_FIXTURE)
  // This checks real addon extraction/loading, NOT Node-API certification. The
  // optional desktop fixture can use Electron's version-specific addon ABI.
  const f = await fixture(t, `async function(ctx) {
    const native = ctx.native.load('fixture.node');
    const fs = module.require('node:fs');
    const failures = [];
    for (const action of [
      () => fs.readFileSync(ctx.paths.data + '/../sibling.txt'),
      () => fs.writeFileSync(ctx.paths.data + '/../sibling.txt','overwrite'),
      () => module.require('node:child_process').spawn(process.execPath,['-v']),
      () => new (module.require('node:worker_threads').Worker)('0',{eval:true}),
    ]) { try { action(); failures.push('allowed') } catch(error) { failures.push(error.code) } }
    ctx.actions.register('inspect', () => ({exports:Object.keys(native),failures,platform:process.platform+'-'+process.arch}));
  }`, {
    native: [{ name: 'fixture.node', platforms: { [platform]: 'native.current' } }],
    resources: { 'native.current': { type: 'base64', value: bytes.toString('base64'), mime: 'application/octet-stream', sha256: hash(bytes) } },
  }, { executable: process.env.CERU_TRUSTED_NATIVE_EXECUTABLE })
  await writeFile(join(f.root, 'sibling.txt'), 'private sibling')
  await f.runtime.start()
  const info = await f.runtime.invoke('actions:inspect')
  assert.ok(info.exports.includes('Database'))
  assert.equal(info.platform, platform)
  assert.deepEqual(info.failures, Array(4).fill('ERR_ACCESS_DENIED'))
  assert.equal(await readFile(join(f.root, 'sibling.txt'), 'utf8'), 'private sibling')
})

test('packaged Electron host extracts standalone runner from ASAR and starts independent Node child', {
  timeout: 30_000, skip: !process.env.CERU_TRUSTED_INTEGRATION_TOOLS,
}, async t => {
  const require = createRequire(import.meta.url)
  const tools = createRequire(join(process.env.CERU_TRUSTED_INTEGRATION_TOOLS, 'package.json'))
  const { createPackage } = tools('@electron/asar')
  const f = await fixture(t, `async function(ctx) {
    await ctx.server.listen((req,res)=>res.end('from-asar'));
    ctx.actions.register('inspect',()=>({entry:__filename,runner:process.argv[1],pid:process.pid}));
  }`)
  const appRoot = join(f.root, 'app')
  await mkdir(join(appRoot, 'core', 'assets'), { recursive: true })
  await build({ entryPoints: [fileURLToPath(new URL('../packages/core/src/trusted-runtime/index.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    outfile: join(appRoot, 'core', 'dist', 'trusted-runtime', 'index.js') })
  await cp(new URL('../packages/core/assets/trusted-runner.cjs', import.meta.url), join(appRoot, 'core', 'assets', 'trusted-runner.cjs'))
  await writeFile(join(appRoot, 'package.json'), JSON.stringify({ name: 'trusted-asar-test', main: 'main.cjs', type: 'module' }))
  await writeFile(join(appRoot, 'main.cjs'), `
    const {app}=require('electron'); const {pathToFileURL}=require('node:url'); const path=require('node:path');
    app.setPath('userData', ${JSON.stringify(join(f.root, 'electron-user-data'))});
    app.whenReady().then(async()=>{
      const {TrustedPluginRuntime}=await import(pathToFileURL(path.join(__dirname,'core/dist/trusted-runtime/index.js')).href);
      let registration; const runtime=new TrustedPluginRuntime({
        artifact:${JSON.stringify(f.parsed)}, verification:${JSON.stringify(f.opts.verification)},
        consent:{granted:true,pluginId:${JSON.stringify(f.parsed.header.manifest.id)},publisher:${JSON.stringify(f.opts.verification.publisher)},signal:new AbortController().signal},
        executable:process.execPath,dataDir:${JSON.stringify(f.dataDir)},nativeDir:${JSON.stringify(f.nativeDir)},
        rpc:async()=>null,authorize:async()=>{},onListen(value){registration=value;return()=>{}},
      });
      try { await runtime.start(); const info=await runtime.invoke('actions:inspect');
        const body=await (await fetch(registration.url)).text();
        console.log('TRUSTED_ASAR_RESULT:'+JSON.stringify({info,body,host:process.pid}));
        await runtime.stop(); app.exit(0);
      } catch(error) {console.error(error.stack); await runtime.stop(); app.exit(1)}
    }).catch(error=>{console.error(error);app.exit(1)});
  `)
  const archive = join(f.root, 'app.asar')
  await createPackage(appRoot, archive)
  const child = spawn(require('electron'), [archive], { windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  let stdout = '', stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  const [code] = await once(child, 'exit')
  assert.equal(code, 0, stderr)
  const line = stdout.split(/\r?\n/).find(line => line.startsWith('TRUSTED_ASAR_RESULT:'))
  assert.ok(line, stdout + stderr)
  const result = JSON.parse(line.slice('TRUSTED_ASAR_RESULT:'.length))
  assert.equal(result.body, 'from-asar')
  assert.notEqual(result.info.pid, result.host)
  assert.doesNotMatch(result.info.runner, /\.asar/)
  assert.doesNotMatch(result.info.entry, /\.asar/)
  assert.deepEqual(await readdir(f.nativeDir), [])
})

test('native extraction selects exact platform and SHA-256; addons enabled only when declared', settings, async t => {
  const bytes = Buffer.from('fixture-declared-node-api-not-executed')
  const f = await fixture(t, `async function(ctx) {
    ctx.actions.register('inspect', () => ({ path: ctx.native.path('fixture.node'), addons: process.permission.has('addon') }));
  }`, {
    native: [{ name: 'fixture.node', platforms: { [platform]: 'native.current', [platform === 'linux-x64' ? 'darwin-arm64' : 'linux-x64']: 'native.other' } }],
    resources: { 'native.current': { type: 'base64', value: bytes.toString('base64'), mime: 'application/octet-stream', sha256: hash(bytes) },
      'native.other': { type: 'base64', value: Buffer.from('other').toString('base64'), mime: 'application/octet-stream', sha256: hash(Buffer.from('other')) } },
  })
  await f.runtime.start()
  const info = await f.runtime.invoke('actions:inspect')
  assert.equal(info.addons, true)
  assert.deepEqual(await readFile(info.path), bytes)
  assert.deepEqual(await readdir(dirname(info.path)), ['fixture.node'])
  await writeFile(info.path, 'tampered')
  await assert.rejects(f.runtime.invoke('actions:inspect'), /SHA-256 mismatch/)
})

test('wrong platform, missing Node-API attestation, traversal, and bad native hashes are rejected', settings, async t => {
  const bytes = Buffer.from('native')
  const base = artifact('async function(ctx) {}', {
    native: [{ name: 'fixture.node', platforms: { [platform]: 'bin' } }],
    resources: { bin: { type: 'base64', value: bytes.toString('base64'), mime: 'application/octet-stream', sha256: hash(bytes) } },
  })
  for (const [mutate, names, pattern] of [
    [a => { a.header.manifest.entry.native[0].platforms = { 'linux-mips': 'bin' } }, ['fixture.node'], /current platform/],
    [() => {}, [], /Node-API/],
    [a => { a.header.manifest.entry.native[0].name = '../fixture.node' }, ['../fixture.node'], /filename/],
    [a => { a.resources.bin.value = Buffer.from('tampered').toString('base64') }, ['fixture.node'], /SHA-256/],
    [a => { a.resources.bin.value = 'bmF0aXZl\n' }, ['fixture.node'], /SHA-256/],
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'ceru-native-reject-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const input = structuredClone(base); mutate(input)
    await assert.rejects(extractNative(input, root, names), pattern)
    assert.deepEqual(await readdir(root), [])
  }
})

test('IPC authenticates frames and bounds size, parallel calls and timeouts', settings, async () => {
  let failure
  const channel = new TrustedChannel('secret', (_value, done) => done(), async () => null, () => {}, error => { failure = error }, 25)
  channel.receive(JSON.stringify({ token: 'wrong', type: 'event', name: 'x' }))
  assert.match(failure.message, /Unauthenticated/)
  channel.receive(' '.repeat(MAX_MESSAGE_BYTES + 1))
  assert.match(failure.message, /frame/)
  await assert.rejects(channel.call('big', 'x'.repeat(MAX_MESSAGE_BYTES)), /exceeds/)
  const calls = Array.from({ length: MAX_PENDING }, () => channel.call('wait').catch(error => error))
  await assert.rejects(channel.call('overflow'), /pending limit/)
  assert.match((await calls[0]).message, /timed out/)
  await Promise.all(calls)
  channel.close()
  await assert.rejects(channel.call('closed'), /closed/)
})

test('Electron RUN_AS_NODE enforces scoped file, worker, child and addon permissions', settings, async t => {
  const require = createRequire(import.meta.url)
  const executable = require('electron')
  const f = await fixture(t, `async function(ctx) {
    const fs = module.require('node:fs'); let denied;
    try { fs.readFileSync(ctx.paths.data + '/../outside.txt') } catch(error) { denied = error.code }
    ctx.actions.register('inspect', () => ({ electron: process.versions.electron, denied,
      workers: process.permission.has('worker'), child: process.permission.has('child'), addons: process.permission.has('addon') }));
  }`, {}, { executable })
  await f.runtime.start()
  const result = await f.runtime.invoke('actions:inspect')
  assert.ok(result.electron)
  assert.equal(result.denied, 'ERR_ACCESS_DENIED')
  assert.equal(result.workers, false); assert.equal(result.child, false); assert.equal(result.addons, false)
})

test('CLI Node server bundles dependencies and hashes referenced native resources', settings, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-trusted-build-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const native = Buffer.from('native-fixture')
  await writeFile(join(root, 'fixture.node'), native)
  await mkdir(join(root, 'node_modules', 'framework'), { recursive: true })
  const sdkDir = join(root, 'node_modules', '@shiqianjiang', 'ceru-plugin-sdk')
  await mkdir(sdkDir, { recursive: true })
  await cp(new URL('../packages/sdk/dist', import.meta.url), join(sdkDir, 'dist'), { recursive: true })
  await cp(new URL('../packages/sdk/package.json', import.meta.url), join(sdkDir, 'package.json'))
  await writeFile(join(root, 'node_modules', 'framework', 'package.json'), JSON.stringify({ name: 'framework', main: 'index.js' }))
  await writeFile(join(root, 'node_modules', 'framework', 'index.js'), "const http = require('node:http'); module.exports = { response: () => http.STATUS_CODES[200] };")
  await writeFile(join(root, 'index.js'), "import framework from 'framework'; import { createHash } from 'node:crypto'; export default async function(ctx) { await ctx.server.listen((req,res) => res.end(framework.response() + createHash('sha256').update('x').digest('hex'))) }")
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, skipLibCheck: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [] }, include: ['index.js'] }))
  const parsed = artifact('async function(ctx) {}')
  parsed.header.manifest.entry.native = [{ name: 'fixture.node', platforms: { [platform]: 'native.current' } }]
  await writeFile(join(root, 'ceru.plugin.json'), JSON.stringify({ manifest: parsed.header.manifest, entries: { 'server.main': './index.js' },
    resources: { 'native.current': { path: './fixture.node', type: 'base64' } } }))
  const result = await buildProject(root)
  const built = readArtifact(await readFile(result.path))
  assert.equal(built.resources['native.current'].sha256, hash(native))
  assert.match(built.modules['server.main'], /node:crypto/)
  assert.doesNotMatch(built.modules['server.main'], /require\(["']framework["']\)/)
})

test('real Express and Koa packages bundle and serve through the trusted runner', {
  timeout: 30_000, skip: !process.env.CERU_TRUSTED_INTEGRATION_TOOLS,
}, async t => {
  for (const [framework, source] of [
    ['express', "import express from 'express'; export default async function(ctx) { const app=express(); app.get('/ping',(req,res)=>res.send('express')); await ctx.server.listen(app) }"],
    ['koa', "import Koa from 'koa'; export default async function(ctx) { const app=new Koa(); app.use(ctx=>{ctx.body='koa'}); await ctx.server.listen(app.callback()) }"],
  ]) {
    const project = await mkdtemp(join(process.env.CERU_TRUSTED_INTEGRATION_TOOLS, framework + '-'))
    t.after(() => rm(project, { recursive: true, force: true }))
    const sdkDir = join(project, 'node_modules', '@shiqianjiang', 'ceru-plugin-sdk')
    await mkdir(sdkDir, { recursive: true })
    await cp(new URL('../packages/sdk/dist', import.meta.url), join(sdkDir, 'dist'), { recursive: true })
    await cp(new URL('../packages/sdk/package.json', import.meta.url), join(sdkDir, 'package.json'))
    await writeFile(join(project, 'index.js'), source)
    await writeFile(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      allowJs: true, checkJs: false, skipLibCheck: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [],
    }, include: ['index.js'] }))
    const template = artifact('async function(ctx) {}')
    await writeFile(join(project, 'ceru.plugin.json'), JSON.stringify({ manifest: template.header.manifest, entries: { 'server.main': './index.js' } }))
    const built = await buildProject(project)
    const parsed = readArtifact(signArtifact(await readFile(built.path), keys.privateKey), { trustedPublicKeys: [keys.publicKey] })
    const f = await fixture(t)
    f.opts.artifact = parsed
    f.opts.verification.codeDigest = parsed.codeDigest
    await f.runtime.start()
    assert.equal(await (await fetch(f.registered[0].url + '/ping')).text(), framework)
    await f.runtime.stop()
    assert.equal(f.released(), 1)
  }
})
