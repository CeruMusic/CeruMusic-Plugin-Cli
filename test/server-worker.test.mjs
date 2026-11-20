import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'

// Source mode validates this slice without writing the shared build's assets.
const root = path.resolve(import.meta.dirname, '..')
const sourceMode = process.env.CERU_SERVER_WORKER_SOURCE === '1'
const fixture = sourceMode
  ? await mkdtemp(path.join(root, '.test-tmp-server-'))
  : path.join(root, 'packages/core')
if (sourceMode) {
  after(() => rm(fixture, { recursive: true, force: true }))
  await mkdir(path.join(fixture, 'assets'))
  await Promise.all([
    build({
      entryPoints: [
        'packages/core/src/node.ts',
        'packages/core/src/node-worker.ts',
        'packages/core/src/http-server.ts',
      ],
      absWorkingDir: root,
      outdir: path.join(fixture, 'dist'),
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      target: 'node22',
    }),
    build({
      entryPoints: ['packages/issuer/src/index.ts'],
      absWorkingDir: root,
      outfile: path.join(fixture, 'dist/issuer.js'),
      bundle: true,
      packages: 'external',
      alias: {
        '@shiqianjiang/ceru-plugin-sdk/catalog': path.join(root, 'packages/sdk/src/catalog.ts'),
      },
      platform: 'node',
      format: 'esm',
      target: 'node22',
    }),
    ...['sandbox', 'node-globals'].map((name) =>
      build({
        entryPoints: [`packages/core/runtime/${name}.ts`],
        absWorkingDir: root,
        outfile: path.join(fixture, 'assets', name + '.js'),
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: 'es2022',
      }),
    ),
    copyFile(
      path.join(root, 'packages/core/assets/catalog.json'),
      path.join(fixture, 'assets/catalog.json'),
    ),
  ])
}
const { NodePluginSandbox } = await import(pathToFileURL(path.join(fixture, 'dist/node.js')).href)
const { readArtifact } = await import(
  pathToFileURL(
    sourceMode
      ? path.join(fixture, 'dist/issuer.js')
      : path.join(root, 'packages/issuer/dist/index.js'),
  ).href
)
const { PluginHttpServer } = await import(
  pathToFileURL(path.join(fixture, 'dist/http-server.js')).href
)

const manifest = {
  manifestVersion: 3,
  id: 'test.server-worker',
  name: 'Server worker',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: { logic: { module: 'main' }, server: { module: 'http', runtime: 'sandbox' } },
  provides: {
    actions: [
      { id: 'status', title: 'Status' },
      { id: 'close', title: 'Close' },
      { id: 'restart', title: 'Restart' },
    ],
  },
  uses: { permissions: [{ name: 'network.serve', key: 'serve', reason: 'Serve HTTP requests' }] },
}
const program = `exports.modules = {
  main: function(ctx) {
    ctx.sharedServerState = {aborts: 0, cancels: 0, pulls: 0};
    ctx.actions.register('status', () => ({...ctx.sharedServerState,url:ctx.server.url,port:ctx.server.port}));
    ctx.actions.register('close', async () => { await ctx.httpHandle.close(); await ctx.httpHandle.close(); return true });
  },
  http: async function(ctx) {
    const state = ctx.sharedServerState || (ctx.sharedServerState = {aborts:0,cancels:0,pulls:0});
    const handler = async request => {
      request.signal.addEventListener('abort', () => state.aborts++);
      const pathname = new URL(request.url).pathname;
      if (pathname === '/wait') return new Promise(() => {});
      if (pathname === '/early') return new Response('EARLY');
      if (pathname === '/length-long') return new Response('AB',{headers:{'content-length':'1'}});
      if (pathname === '/length-short') return new Response('A',{headers:{'content-length':'2'}});
      if (pathname === '/length-invalid') return new Response('A',{headers:{'content-length':'1, 2'}});
      if (pathname === '/length-empty') return new Response(null,{headers:{'content-length':'1'}});
      if (pathname === '/header-injection') {
        const response=new Response('A');
        response.headers=[['x-test','safe'+String.fromCharCode(13,10)+'Injected: yes']];
        return response;
      }
      if (pathname === '/stalled') return new Response(new ReadableStream({
        pull(){return new Promise(()=>{})},cancel(){state.cancels++}
      },{highWaterMark:0}));
      if (pathname === '/transfer-realm') {
        const {value}=await request.body.getReader().read();
        const buffer=value.buffer;
        let escaped=false;
        for(const probe of [buffer,buffer.slice(0),value.subarray(0),Object.getPrototypeOf(buffer),
          Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get]) {
          try{probe.constructor.constructor('return process')();escaped=true}catch{}
        }
        return Response.json({escaped,realm:buffer.constructor===ArrayBuffer});
      }
      if (pathname === '/fail') throw Error('handler failed');
      if (pathname === '/bad') return {};
      if (pathname === '/large') return new Response(new Uint8Array(1024*1024+1));
      if (pathname === '/live') return new Response(new ReadableStream({
        pull(controller) {state.pulls++; controller.enqueue(new Uint8Array([42]))},
        cancel() {state.cancels++}
      }, {highWaterMark:0}));
      if (pathname === '/stream') return new Response(request.body, {status:201,headers:{'x-echo':'yes'}});
      if (pathname === '/preflight') return new Response(null, {status:204,headers:{
        'access-control-allow-origin':request.headers.get('origin'),
        'access-control-allow-private-network':request.headers.get('access-control-request-private-network'),
        vary:'Origin'
      }});
      if (pathname === '/realm') {
        const probes=[Request,Response,Headers,request.constructor,request.headers.get,request.signal.addEventListener,
          Object.getPrototypeOf(request.headers),new Response('ok').body.getReader,
          (await request.arrayBuffer()).constructor,new Headers().entries().constructor];
        let escaped=false;
        for(const probe of probes){try{probe.constructor('return process')();escaped=true}catch{}}
        const response=Response.json({escaped,bridge:typeof __bridge,binary:typeof __ceruBinary});
        return response;
      }
      if (pathname === '/clone') {
        const clone=request.clone();
        const a=await request.text(),b=await clone.text();
        const headers=new Headers([['X-A',' one '],['x-a','two'],['set-cookie','a=1'],['set-cookie','b=2']]);
        return Response.json({a,b,values:[...headers.values()],cookies:headers.getSetCookie(),method:request.method,url:request.url});
      }
      return Response.json({method:request.method,origin:request.headers.get('origin'),body:await request.text()});
    };
    ctx.httpHandle = await ctx.server.serve(handler, {port:0, permissionKey:'serve'});
    ctx.actions.register('restart',async()=>{
      const previous=ctx.httpHandle;
      ctx.httpHandle=await ctx.server.serve(handler,{port:0,permissionKey:'serve'});
      await previous.close();
      return ctx.httpHandle.port;
    });
  }
}`
async function boot(options = {}) {
  const calls = []
  const worker = new NodePluginSandbox(
    async (method, data) => {
      calls.push({ method, data })
      if (method === 'server.start') {
        if (options.deny) throw Error('network.serve denied')
        return { url: 'http://127.0.0.1:43210', port: 43210 }
      }
      if (method === 'server.stop') return null
      throw Error('Unexpected RPC ' + method)
    },
    () => {},
  )
  try {
    if (options.address) worker.setServerAddress(options.address)
    const artifact = readArtifact(
      'exports.manifest=' +
        JSON.stringify(options.manifest ?? manifest) +
        ';' +
        (options.program ?? program),
    )
    // Isolate worker behavior from the separately tested trusted-manifest policy.
    if (options.nodeServer) artifact.header.manifest.entry.server.runtime = 'node'
    await worker.start(artifact)
    return { worker, calls }
  } catch (error) {
    worker.dispose()
    throw error
  }
}
const request = (url, init) => new Request('http://127.0.0.1:43210' + url, init)
const status = (worker) => worker.invoke('action', 'status', '', [{}])
const eventually = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail('Timed out waiting for cleanup')
}

test('starts distinct server entry and routes realm-local Request/Response/Headers', async () => {
  const { worker, calls } = await boot()
  try {
    assert.deepEqual(calls[0], {
      method: 'server.start',
      data: { port: 0, permissionKey: 'serve' },
    })
    const response = await worker.handleHttp(
      request('/clone', { method: 'POST', body: 'Hello 世界' }),
    )
    assert(response instanceof Response)
    assert.match(response.headers.get('content-type'), /application\/json/)
    assert.deepEqual(await response.json(), {
      a: 'Hello 世界',
      b: 'Hello 世界',
      values: ['a=1', 'b=2', 'one, two'],
      cookies: ['a=1', 'b=2'],
      method: 'POST',
      url: 'http://127.0.0.1:43210/clone',
    })
    assert.equal(worker.httpRequests.size, 0)
  } finally {
    worker.dispose()
  }
})

test('streams a large upload and response incrementally with bounded transferable chunks', async () => {
  const { worker } = await boot()
  try {
    let reads = 0
    const size = 3 * 1024 * 1024 + 7
    const body = new ReadableStream(
      {
        pull(controller) {
          reads++
          controller.enqueue(new Uint8Array(size).fill(91))
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const response = await worker.handleHttp(
      request('/stream', { method: 'POST', body, duplex: 'half' }),
    )
    assert.equal(reads, 0, 'response headers must not buffer the upload')
    assert.equal(response.status, 201)
    const reader = response.body.getReader()
    let received = 0,
      chunks = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      assert(value.length <= 1024 * 1024)
      assert(value.every((byte) => byte === 91))
      received += value.length
      chunks++
    }
    assert.equal(received, size)
    assert.equal(chunks, 4)
    assert.equal(worker.httpRequests.size, 0)
  } finally {
    worker.dispose()
  }
})

test('forwards CORS origin and private-network preflight headers without inventing policy', async () => {
  const { worker } = await boot()
  try {
    const response = await worker.handleHttp(
      request('/preflight', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://untrusted.example',
          'access-control-request-private-network': 'true',
        },
      }),
    )
    assert.equal(response.status, 204)
    assert.equal(response.body, null)
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://untrusted.example')
    assert.equal(response.headers.get('access-control-allow-private-network'), 'true')
    assert.equal(response.headers.get('vary'), 'Origin')
    const ordinary = await worker.handleHttp(request('/', { headers: { origin: 'null' } }))
    assert.equal(ordinary.headers.has('access-control-allow-origin'), false)
    assert.equal((await ordinary.json()).origin, 'null')
  } finally {
    worker.dispose()
  }
})

test('HTTP constructors, methods, iterators and transferred bytes cannot escape the realm', async () => {
  const { worker } = await boot()
  try {
    const response = await worker.handleHttp(request('/realm', { method: 'POST', body: 'probe' }))
    assert.deepEqual(await response.json(), {
      escaped: false,
      bridge: 'undefined',
      binary: 'undefined',
    })
  } finally {
    worker.dispose()
  }
})

test('propagates abort before headers, during response reads, and after headers', async () => {
  const { worker } = await boot()
  try {
    const controller = new AbortController()
    const waiting = worker.handleHttp(request('/wait', { signal: controller.signal }))
    await eventually(async () => worker.httpRequests.size === 1)
    controller.abort()
    await assert.rejects(waiting, /aborted/)
    const second = new AbortController()
    const response = await worker.handleHttp(request('/live', { signal: second.signal }))
    const reader = response.body.getReader()
    assert.deepEqual((await reader.read()).value, new Uint8Array([42]))
    second.abort()
    await assert.rejects(reader.read(), /aborted/)
    await eventually(async () => (await status(worker)).cancels >= 1)
    const before = new AbortController()
    before.abort()
    await assert.rejects(worker.handleHttp(request('/', { signal: before.signal })), /aborted/)
    assert.equal(worker.httpRequests.size, 0)
  } finally {
    worker.dispose()
  }
})

test('response cancellation stops the producer and does not prefetch', async () => {
  const { worker } = await boot()
  try {
    const response = await worker.handleHttp(request('/live'))
    assert.equal((await status(worker)).pulls, 0)
    const reader = response.body.getReader()
    await reader.read()
    assert.equal((await status(worker)).pulls, 1)
    await reader.cancel()
    await eventually(async () => (await status(worker)).cancels === 1)
    assert.equal(worker.httpRequests.size, 0)
  } finally {
    worker.dispose()
  }
})

test('rejects oversized output, invalid responses and failed handlers without losing the worker', async () => {
  const { worker } = await boot()
  try {
    await assert.rejects(worker.handleHttp(request('/fail')), /handler failed/)
    await assert.rejects(worker.handleHttp(request('/bad')), /must return a Response/)
    const oversized = await worker.handleHttp(request('/large'))
    await assert.rejects(oversized.arrayBuffer(), /1 MiB/)
    const okay = await worker.handleHttp(request('/'))
    assert.equal((await okay.json()).method, 'GET')
  } finally {
    worker.dispose()
  }
})

test('rejects response length mismatches and forged header injection before crossing the HTTP boundary', async () => {
  const { worker } = await boot()
  try {
    await assert.rejects(worker.handleHttp(request('/length-invalid')), /content-length/)
    await assert.rejects(worker.handleHttp(request('/length-empty')), /content-length/)
    for (const endpoint of ['/length-long', '/length-short']) {
      const response = await worker.handleHttp(request(endpoint))
      await assert.rejects(response.arrayBuffer(), /content-length/)
    }
  } finally {
    worker.dispose()
  }
})

test('rejects forged response headers and retains the realm of transferred request buffers', async () => {
  const { worker } = await boot()
  try {
    await assert.rejects(worker.handleHttp(request('/header-injection')), /header|Headers|invalid/i)
    const response = await worker.handleHttp(
      request('/transfer-realm', { method: 'POST', body: 'probe' }),
    )
    assert.deepEqual(await response.json(), { escaped: false, realm: true })
  } finally {
    worker.dispose()
  }
})

test('cancels a stalled response pull without waiting for the producer', async () => {
  const { worker } = await boot()
  try {
    const response = await worker.handleHttp(request('/stalled'))
    const reader = response.body.getReader()
    const pending = reader.read()
    await reader.cancel()
    assert.equal((await pending).done, true)
    await eventually(async () => (await status(worker)).cancels === 1)
    assert.equal(worker.httpRequests.size, 0)
  } finally {
    worker.dispose()
  }
})

test('limits concurrent requests and closes all active streams once', async () => {
  const { worker, calls } = await boot()
  try {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => worker.handleHttp(request('/live'))),
    )
    await assert.rejects(worker.handleHttp(request('/')), /capacity/)
    await worker.invoke('action', 'close', '', [{}])
    for (const response of responses) await assert.rejects(response.text(), /stopped/)
    assert.equal(calls.filter((call) => call.method === 'server.stop').length, 1)
    assert.deepEqual(calls.at(-1).data, { port: 43210 })
    assert.equal(worker.httpRequests.size, 0)
    await assert.rejects(worker.handleHttp(request('/')), /unavailable/)
  } finally {
    worker.dispose()
  }
})

test('worker disposal cancels active responses and stops its listener', async () => {
  const { worker, calls } = await boot()
  const response = await worker.handleHttp(request('/live'))
  worker.dispose()
  await assert.rejects(response.text(), /stopped/)
  assert.equal(worker.httpRequests.size, 0)
  assert.equal(calls.at(-1).method, 'server.stop')
})

test('host revocation clears the registration and permits restarting without stopping the new server', async () => {
  const { worker, calls } = await boot()
  try {
    const response = await worker.handleHttp(request('/live'))
    await worker.send('server-stopped', {})
    await assert.rejects(response.text(), /stopped/)
    assert.equal(await worker.invoke('action', 'restart', '', [{}]), 43210)
    assert.equal(calls.filter((call) => call.method === 'server.start').length, 2)
    assert.equal(
      calls.filter((call) => call.method === 'server.stop').length,
      0,
      'old handle must not stop a replacement listener',
    )
    const next = await worker.handleHttp(request('/'))
    assert.equal((await next.json()).method, 'GET')
  } finally {
    worker.dispose()
  }
})

test('serve uses manifest server port and LAN defaults', async () => {
  const defaults = {
    ...manifest,
    entry: { ...manifest.entry, server: { ...manifest.entry.server, port: 49123, lan: true } },
    uses: {
      permissions: [
        ...manifest.uses.permissions,
        { name: 'network.serve.lan', key: 'lan', reason: 'Serve on LAN' },
      ],
    },
  }
  const { worker, calls } = await boot({
    manifest: defaults,
    program: program.replace('handler, {port:0, permissionKey:', 'handler, {permissionKey:'),
  })
  try {
    assert.deepEqual(calls[0].data, { port: 49123, lan: true, permissionKey: 'serve' })
  } finally {
    worker.dispose()
  }
})

test('server getters follow sandbox and trusted address lifecycle events', async () => {
  const { worker, calls } = await boot()
  try {
    const started = await status(worker)
    assert.equal(started.url, 'http://127.0.0.1:43210')
    assert.equal(started.port, 43210)
    await worker.invoke('action', 'close', '', [{}])
    assert.equal((await status(worker)).url, undefined)
    await worker.send('server-listening', { url: 'http://127.0.0.1:54321', port: 54321 })
    const trusted = await status(worker)
    assert.equal(trusted.url, 'http://127.0.0.1:54321')
    assert.equal(trusted.port, 54321)
    await assert.rejects(worker.handleHttp(request('/')), /unavailable/)
    await worker.send('server-stopped', {})
    assert.equal((await status(worker)).port, undefined)
    assert.equal(calls.filter((call) => call.method === 'server.start').length, 1)
  } finally {
    worker.dispose()
  }
})

test('trusted address can be cached before activation and Node entries cannot serve in the sandbox', async () => {
  const { worker, calls } = await boot({
    nodeServer: true,
    address: { url: 'http://127.0.0.1:54321', port: 54321 },
    program: `exports.modules={main:ctx=>{
      const startupUrl=ctx.server.url,startupPort=ctx.server.port;
      ctx.actions.register('status',()=>({startupUrl,startupPort,url:ctx.server.url,port:ctx.server.port}));
      ctx.actions.register('close',()=>ctx.server.serve(()=>new Response('not allowed')));
    },http:ctx=>{throw Error('Node entry must not execute in sandbox')}}`,
  })
  try {
    assert.deepEqual(await status(worker), {
      startupUrl: 'http://127.0.0.1:54321',
      startupPort: 54321,
      url: 'http://127.0.0.1:54321',
      port: 54321,
    })
    await assert.rejects(worker.invoke('action', 'close', '', [{}]), /unavailable/)
    assert.equal(calls.length, 0)
    worker.setServerAddress(undefined)
    assert.equal((await status(worker)).url, undefined)
  } finally {
    worker.dispose()
  }
})

test('server-only entry boots and permission rejection fails activation', async () => {
  const only = { ...manifest, entry: { server: manifest.entry.server } }
  const { worker } = await boot({
    manifest: only,
    program: program.replace(/  main: function\(ctx\) \{[\s\S]*?\n  \},\n/, ''),
  })
  try {
    const response = await worker.handleHttp(request('/'))
    assert.equal((await response.json()).method, 'GET')
  } finally {
    worker.dispose()
  }
  await assert.rejects(boot({ deny: true }), /network.serve denied/)
})

test('real HTTP listener streams through worker and enforces host origin policy', async () => {
  let location
  const worker = new NodePluginSandbox(
    async (method, data) => {
      if (method === 'server.start') return (location = await server.start(data))
      if (method === 'server.stop') return server.stop()
      throw Error('Unexpected RPC ' + method)
    },
    () => {},
  )
  const server = new PluginHttpServer({ handler: (request) => worker.handleHttp(request) })
  try {
    await worker.start(readArtifact('exports.manifest=' + JSON.stringify(manifest) + ';' + program))
    const bytes = new Uint8Array(2 * 1024 * 1024 + 17).fill(23)
    const response = await fetch(location.url + '/stream', { method: 'POST', body: bytes })
    assert.equal(response.status, 201)
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
    const early = await fetch(location.url + '/early', {
      method: 'POST',
      body: new Uint8Array(8 * 1024 * 1024),
    })
    assert.equal(await early.text(), 'EARLY')
    const crossOrigin = await fetch(location.url + '/preflight', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://untrusted.example',
        'access-control-request-private-network': 'true',
      },
    })
    assert.equal(crossOrigin.status, 403)
    assert.equal(crossOrigin.headers.has('access-control-allow-origin'), false)
    const sameOrigin = await fetch(location.url + '/preflight', {
      method: 'OPTIONS',
      headers: {
        origin: location.url,
        'access-control-request-private-network': 'true',
      },
    })
    assert.equal(sameOrigin.status, 204)
    assert.equal(sameOrigin.headers.get('access-control-allow-origin'), location.url)
    assert.equal(sameOrigin.headers.get('access-control-allow-private-network'), 'true')
    await worker.invoke('action', 'close', '', [{}])
    await assert.rejects(fetch(location.url + '/'))
  } finally {
    worker.dispose()
    await server.stop()
  }
})
