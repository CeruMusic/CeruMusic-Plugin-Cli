import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import ts from 'typescript'

// Exercise the current source without rebuilding shared dist/runtime assets.
const source = await readFile(
  new URL('../packages/core/src/http-server.ts', import.meta.url),
  'utf8',
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
})
const { PluginHttpServer } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)
const settings = { timeout: 15_000 }
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function serve(t, handler, options = {}) {
  const server = new PluginHttpServer({ handler, ...options })
  t.after(() => server.stop())
  return { server, ...(await server.start()) }
}
function request(url, options = {}) {
  const outgoing = http.request(url, { agent: false, ...options })
  const response = once(outgoing, 'response').then(([value]) => value)
  return { outgoing, response }
}
async function collect(readable) {
  const chunks = []
  for await (const chunk of readable) chunks.push(chunk)
  return Buffer.concat(chunks)
}
async function raw(port, text) {
  const socket = net.connect({ host: '127.0.0.1', port })
  const response = collect(socket)
  await once(socket, 'connect')
  socket.end(text)
  return (await response).toString()
}

test('server subpath export points at the standalone bridge', async () => {
  const pkg = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url)))
  assert.deepEqual(pkg.exports['./server'], {
    types: './dist/http-server.d.ts',
    default: './dist/http-server.js',
  })
})

test('one listener, callback cleanup, concurrent stop and restart', settings, async (t) => {
  let listens = 0,
    cleanups = 0
  const server = new PluginHttpServer({
    handler: async () => new Response('ok'),
    onListen(port) {
      assert(port > 0)
      listens++
      return () => {
        cleanups++
      }
    },
  })
  t.after(() => server.stop())
  const starting = server.start()
  await assert.rejects(server.start(), /already started/)
  const { url, port } = await starting
  assert.equal(url, `http://127.0.0.1:${port}`)
  await assert.rejects(server.start(), /already started/)
  assert.equal(await (await fetch(url)).text(), 'ok')
  await Promise.all([server.stop(), server.stop()])
  assert.equal(cleanups, 1)
  await assert.rejects(fetch(url))
  await server.start()
  await server.stop()
  assert.equal(listens, 2)
  assert.equal(cleanups, 2)
})

test(
  'occupied requested port falls back; LAN returns a reachable loopback URL',
  settings,
  async (t) => {
    const occupied = net.createServer()
    occupied.listen(0, '0.0.0.0')
    await once(occupied, 'listening')
    t.after(() => new Promise((resolve) => occupied.close(resolve)))
    const server = new PluginHttpServer({ handler: async () => new Response('LAN') })
    t.after(() => server.stop())
    const { url, port } = await server.start({ port: occupied.address().port, lan: true })
    assert.notEqual(port, occupied.address().port)
    assert.equal(url, `http://127.0.0.1:${port}`)
    assert.equal(await (await fetch(url)).text(), 'LAN')
  },
)

test(
  'slow upload reaches the handler immediately and backpressures the sender',
  settings,
  async (t) => {
    const first = deferred(),
      resume = deferred()
    const total = 24 * 1024 * 1024,
      chunkSize = 64 * 1024
    let received = 0,
      produced = 0
    const { url } = await serve(t, async (req) => {
      assert.equal(req.method, 'POST')
      assert.equal(req.headers.get('content-length'), String(total))
      const reader = req.body.getReader()
      const initial = await reader.read()
      received += initial.value.byteLength
      first.resolve()
      await resume.promise
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        assert(value.every((byte) => byte === 73))
        received += value.byteLength
        await delay(1)
      }
      return new Response(String(received))
    })
    const { outgoing, response } = request(url, {
      method: 'POST',
      headers: { 'content-length': total },
    })
    t.after(() => {
      resume.resolve()
      outgoing.destroy()
    })
    const sending = (async () => {
      const chunk = Buffer.alloc(chunkSize, 73)
      while (produced < total) {
        produced += chunkSize
        if (!outgoing.write(chunk)) await once(outgoing, 'drain')
      }
      outgoing.end()
    })()
    await first.promise
    await delay(100)
    assert(produced < total, `sender buffered the full upload: ${produced}`)
    assert(received < total)
    resume.resolve()
    await sending
    assert.equal((await collect(await response)).toString(), String(total))
  },
)

test('slow fetch download backpressures the Web response producer', settings, async (t) => {
  const total = 24 * 1024 * 1024,
    chunkSize = 64 * 1024
  let produced = 0
  const { url } = await serve(
    t,
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (produced === total) {
              controller.close()
              return
            }
            produced += chunkSize
            controller.enqueue(new Uint8Array(chunkSize).fill(37))
          },
        }),
        { headers: { 'content-length': String(total) } },
      ),
  )
  const response = await fetch(url)
  const reader = response.body.getReader()
  let received = (await reader.read()).value.byteLength
  await delay(150)
  assert(produced < total, `producer buffered the full download: ${produced}`)
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    assert(value.every((byte) => byte === 37))
    received += value.byteLength
    await delay(1)
  }
  assert.equal(received, total)
})

test('chunked duplex upload streams back before the request ends', settings, async (t) => {
  const { url } = await serve(t, async (req) => new Response(req.body))
  const { outgoing, response } = request(url, { method: 'POST' })
  t.after(() => outgoing.destroy())
  outgoing.write('first')
  const incoming = await response
  const first = await once(incoming, 'data')
  assert.equal(first[0].toString(), 'first')
  const rest = collect(incoming)
  outgoing.end('last')
  assert.equal((await rest).toString(), 'last')
})

test('raw response overflow never writes a second response-shaped payload', settings, async (t) => {
  const injected = 'HTTP/1.1 200 OK\r\nContent-Length: 8\r\n\r\nINJECTED'
  for (const split of [false, true]) {
    let pulls = 0
    const { port } = await serve(
      t,
      async () =>
        new Response(
          new ReadableStream(
            {
              async pull(controller) {
                if (split && pulls++ === 0) {
                  controller.enqueue(new TextEncoder().encode('A'))
                  return
                }
                // Ensure the first valid byte is already on the wire before overflowing.
                if (split) await delay(30)
                controller.enqueue(new TextEncoder().encode((split ? '' : 'A') + injected))
                controller.close()
              },
            },
            { highWaterMark: 0 },
          ),
          { headers: { 'content-length': '1' } },
        ),
    )
    const socket = net.connect({ host: '127.0.0.1', port })
    t.after(() => socket.destroy())
    const wire = collect(socket)
    await once(socket, 'connect')
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
    const text = (await wire).toString()
    assert.equal((text.match(/HTTP\/1\.1 /g) ?? []).length, 1, text)
    assert.equal(text.includes('INJECTED'), false, text)
    if (split) {
      assert.match(text, /^HTTP\/1\.1 200 /)
      assert.equal(text.split('\r\n\r\n')[1], 'A')
    } else {
      assert.match(text, /^HTTP\/1\.1 500 /)
      assert.match(text, /\r\n\r\n(?:15\r\n)?Internal Server Error/)
    }
  }
})

test(
  'raw early POST response drains the remaining upload and preserves keep-alive',
  settings,
  async (t) => {
    let calls = 0
    const { port } = await serve(t, async (req) => {
      calls++
      assert.equal(req.method, calls === 1 ? 'POST' : 'GET')
      const text = calls === 1 ? 'EARLY' : 'NEXT'
      // Deliberately never read req.body.
      return new Response(text, { headers: { 'content-length': String(text.length) } })
    })
    const socket = net.connect({ host: '127.0.0.1', port })
    t.after(() => socket.destroy())
    const first = deferred()
    let wire = ''
    let socketError
    socket.on('error', (error) => {
      socketError = error
    })
    socket.on('data', (chunk) => {
      wire += chunk.toString()
      if (wire.includes('\r\n\r\nEARLY')) first.resolve()
    })
    const closed = new Promise((resolve) => socket.once('close', resolve))
    await once(socket, 'connect')
    const total = 16 * 1024 * 1024,
      chunk = Buffer.alloc(64 * 1024, 67)
    socket.write(
      `POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${total}\r\nConnection: keep-alive\r\n\r\n`,
    )
    socket.write(chunk)
    // Receiving the first response before sending the rest proves it was early.
    await Promise.race([
      first.promise,
      closed.then(() => {
        throw socketError ?? Error('Socket closed before the early response')
      }),
    ])
    for (let sent = chunk.length; sent < total; sent += chunk.length)
      if (!socket.write(chunk)) await once(socket, 'drain')
    socket.write('GET /next HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
    await closed
    assert.equal(socketError, undefined)
    assert.equal(calls, 2)
    assert.equal((wire.match(/HTTP\/1\.1 200 /g) ?? []).length, 2, wire)
    assert(wire.includes('\r\n\r\nEARLYHTTP/1.1 200 '), wire)
    assert(wire.endsWith('\r\n\r\nNEXT'), wire)
  },
)

test('aborting an upload aborts the worker request and its body reader', settings, async (t) => {
  const entered = deferred(),
    aborted = deferred(),
    bodyEnded = deferred()
  const { url } = await serve(t, async (req) => {
    req.signal.addEventListener('abort', () => aborted.resolve(req.signal.reason), { once: true })
    entered.resolve()
    try {
      for await (const _chunk of req.body) {
      }
    } catch {
      bodyEnded.resolve()
    }
    return new Response('finished')
  })
  const outgoing = http.request(url, { method: 'POST', agent: false })
  outgoing.on('error', () => {})
  t.after(() => outgoing.destroy())
  outgoing.write(Buffer.alloc(64 * 1024))
  await entered.promise
  outgoing.destroy()
  assert.equal((await aborted.promise).name, 'AbortError')
  await bodyEnded.promise
})

test(
  'fetch cancellation aborts the worker and cancels a pending response read',
  settings,
  async (t) => {
    const aborted = deferred(),
      cancelled = deferred()
    const { url } = await serve(t, async (req) => {
      req.signal.addEventListener('abort', () => aborted.resolve(), { once: true })
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
          },
          pull() {
            return new Promise(() => {})
          },
          cancel(reason) {
            cancelled.resolve(reason)
          },
        }),
      )
    })
    const controller = new AbortController()
    const response = await fetch(url, { signal: controller.signal })
    const reader = response.body.getReader()
    await reader.read()
    controller.abort()
    await assert.rejects(reader.read())
    await aborted.promise
    assert.equal((await cancelled.promise).name, 'AbortError')
  },
)

test(
  'stop closes active uploads, downloads, idle sockets and uncooperative handlers',
  settings,
  async (t) => {
    const entered = deferred(),
      blocked = deferred(),
      cancelled = deferred()
    const signals = []
    const { server, url, port } = await serve(t, async (req) => {
      signals.push(req.signal)
      if (signals.length === 3) entered.resolve()
      if (req.url.endsWith('/blocked')) return blocked.promise
      if (req.method === 'POST') {
        try {
          for await (const _chunk of req.body) {
          }
        } catch {}
        return new Response('upload')
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
          },
          pull() {
            return new Promise(() => {})
          },
          cancel() {
            cancelled.resolve()
          },
        }),
      )
    })
    const upload = http.request(url, { method: 'POST', agent: false })
    upload.on('error', () => {})
    upload.write('partial upload')
    const uploadClosed = new Promise((resolve) => upload.once('close', resolve))
    const response = await fetch(url)
    const reader = response.body.getReader()
    await reader.read()
    const bodyError = assert.rejects(reader.read())
    const blockedFetch = assert.rejects(fetch(`${url}/blocked`))
    const idle = net.connect(port, '127.0.0.1')
    await once(idle, 'connect')
    const idleClosed = once(idle, 'close')
    await entered.promise
    await server.stop()
    await Promise.all([bodyError, blockedFetch, uploadClosed, idleClosed, cancelled.promise])
    assert.equal(signals.length, 3)
    assert(signals.every((signal) => signal.aborted))
    const lateCancelled = deferred()
    blocked.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            lateCancelled.resolve()
          },
        }),
      ),
    )
    await lateCancelled.promise
    const reclaimed = net.createServer()
    reclaimed.listen(port, '127.0.0.1')
    await once(reclaimed, 'listening')
    await new Promise((resolve) => reclaimed.close(resolve))
  },
)

test('HEAD preserves representation headers and cancels the unused body', settings, async (t) => {
  const cancelled = deferred()
  const { url } = await serve(t, async (req) => {
    assert.equal(req.method, 'HEAD')
    return new Response(
      new ReadableStream({
        cancel() {
          cancelled.resolve()
        },
      }),
      {
        headers: { 'content-length': '1234', 'content-type': 'audio/flac' },
      },
    )
  })
  const response = await fetch(url, { method: 'HEAD' })
  assert.equal(response.headers.get('content-length'), '1234')
  assert.equal(response.headers.get('content-type'), 'audio/flac')
  assert.equal(await response.text(), '')
  await cancelled.promise
})

test(
  'sanitizes hop-by-hop and Connection-nominated headers both ways; keeps cookies',
  settings,
  async (t) => {
    const { url, port } = await serve(t, async (req) => {
      assert.equal(req.url, `http://127.0.0.1:${port}/headers`)
      for (const name of ['connection', 'x-private', 'keep-alive', 'te', 'proxy-authorization'])
        assert.equal(req.headers.get(name), null, name)
      assert.equal(req.headers.get('x-end-to-end'), 'yes')
      const headers = new Headers({
        connection: 'x-worker-secret, close',
        'x-worker-secret': 'hidden',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        trailer: 'x-footer',
        upgrade: 'websocket',
        'proxy-authenticate': 'Basic',
        'x-end-to-end': 'yes',
      })
      headers.append('set-cookie', 'a=1; Path=/')
      headers.append('set-cookie', 'b=2; Path=/')
      return new Response('safe', { headers })
    })
    const { outgoing, response } = request(`${url}/headers`, {
      headers: {
        host: 'attacker.invalid',
        connection: 'x-private, close',
        'x-private': 'hidden',
        'keep-alive': 'timeout=5',
        te: 'trailers',
        'proxy-authorization': 'secret',
        'x-end-to-end': 'yes',
      },
    })
    outgoing.end()
    const incoming = await response
    assert.equal((await collect(incoming)).toString(), 'safe')
    for (const name of [
      'x-worker-secret',
      'keep-alive',
      'trailer',
      'upgrade',
      'proxy-authenticate',
    ])
      assert.equal(incoming.headers[name], undefined, name)
    assert.equal(incoming.headers['x-end-to-end'], 'yes')
    assert.deepEqual(incoming.headers['set-cookie'], ['a=1; Path=/', 'b=2; Path=/'])
  },
)

test(
  'Node rejects oversized and ambiguous headers, upgrades, CONNECT and absolute targets',
  settings,
  async (t) => {
    let calls = 0
    const { port } = await serve(t, async () => {
      calls++
      return new Response('unexpected')
    })
    assert.match(
      await raw(
        port,
        `GET / HTTP/1.1\r\nHost: localhost\r\nX-Large: ${'x'.repeat(20 * 1024)}\r\n\r\n`,
      ),
      /^HTTP\/1\.1 431/,
    )
    assert.match(
      await raw(
        port,
        'POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
      ),
      /^HTTP\/1\.1 400/,
    )
    assert.match(
      await raw(
        port,
        'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      ),
      /^HTTP\/1\.1 405/,
    )
    assert.match(
      await raw(port, 'CONNECT example.org:443 HTTP/1.1\r\nHost: example.org\r\n\r\n'),
      /^HTTP\/1\.1 405/,
    )
    assert.match(
      await raw(
        port,
        'GET http://example.org/ HTTP/1.1\r\nHost: example.org\r\nConnection: close\r\n\r\n',
      ),
      /^HTTP\/1\.1 400/,
    )
    assert.equal(calls, 0)
  },
)

test(
  'handler failure is a generic 500 and response stream failure closes the connection',
  settings,
  async (t) => {
    const { url } = await serve(t, async (req) => {
      if (req.url.endsWith('/throw')) throw new Error('secret worker failure')
      let pulls = 0
      return new Response(
        new ReadableStream({
          async pull(controller) {
            if (pulls++ === 0) {
              controller.enqueue(new Uint8Array([1]))
              return
            }
            await delay(30)
            controller.error(new Error('stream failure'))
          },
        }),
      )
    })
    const response = await fetch(`${url}/throw`)
    assert.equal(response.status, 500)
    assert.equal(await response.text(), 'Internal Server Error')
    const broken = await fetch(url)
    await assert.rejects(broken.arrayBuffer())
  },
)

test('cross-origin browser writes are denied before reaching the worker', settings, async (t) => {
  let calls = 0
  const { url, port } = await serve(t, async () => {
    calls++
    return new Response('ok')
  })
  for (const origin of [
    'https://attacker.invalid',
    'null',
    `${url}/`,
    `${url}0`,
    `http://attacker.invalid:${port}`,
  ]) {
    const response = await fetch(url, {
      method: 'POST',
      body: 'must not arrive',
      headers: { origin, host: `attacker.invalid:${port}` },
    })
    assert.equal(response.status, 403, origin)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    await response.arrayBuffer()
  }
  assert.equal(calls, 0)
  // A Connection-nominated Origin must be checked before header sanitization.
  const { outgoing, response } = request(url, {
    method: 'POST',
    headers: { origin: 'https://attacker.invalid', connection: 'origin, close' },
  })
  outgoing.end('blocked')
  const denied = await response
  assert.equal(denied.statusCode, 403)
  await collect(denied)
  assert.equal(calls, 0)
  for (const origin of [undefined, url, `http://localhost:${port}`]) {
    const response = await fetch(url, {
      method: 'POST',
      body: 'allowed',
      headers: origin ? { origin } : {},
    })
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'ok')
  }
  assert.equal(calls, 3)
})

test(
  'request deadline aborts a stalled worker and closes the real connection',
  settings,
  async (t) => {
    const entered = deferred()
    let signal
    const { url } = await serve(t, async (req) => {
      signal = req.signal
      entered.resolve()
      return new Promise(() => {})
    })
    // Advance only the bridge's long deadline; transport still uses real TCP sockets.
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const outgoing = http.get(url, { agent: false })
    const disconnected = new Promise((resolve) => outgoing.once('error', resolve))
    await entered.promise
    t.mock.timers.tick(300_000)
    await disconnected
    assert.equal(signal.aborted, true)
    assert.equal(signal.reason.name, 'TimeoutError')
  },
)

test(
  'external abort, abort during bind, invalid ports and onListen failure clean up',
  settings,
  async (t) => {
    const controller = new AbortController()
    const { server, url } = await serve(t, async () => new Response('ok'), {
      signal: controller.signal,
    })
    controller.abort()
    await server.stop()
    await assert.rejects(fetch(url))
    await assert.rejects(server.start(), { name: 'AbortError' })
    const pending = new PluginHttpServer({ handler: async () => new Response('ok') })
    const starting = pending.start()
    const rejected = assert.rejects(starting, { name: 'AbortError' })
    await pending.stop()
    await rejected
    await pending.start()
    await pending.stop()
    for (const port of [-1, 65536, 1.5, NaN])
      await assert.rejects(pending.start({ port }), RangeError)
    let selectedPort
    const failed = new PluginHttpServer({
      handler: async () => new Response('ok'),
      onListen(port) {
        selectedPort = port
        throw new Error('registration failed')
      },
    })
    await assert.rejects(failed.start(), /registration failed/)
    await assert.rejects(fetch(`http://127.0.0.1:${selectedPort}`))
    await failed.stop()
  },
)
