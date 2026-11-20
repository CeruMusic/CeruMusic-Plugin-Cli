import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { requestNetworkStream, setNetworkProxyResolver } from '../packages/core/dist/network.js'

test('media transport pins destinations, streams beyond JSON limits, checks redirects and aborts', async () => {
  const received = []
  const target = createServer((request, response) => {
    received.push(request.headers)
    response.setHeader('Content-Type', 'audio/flac')
    if (request.url === '/encoded') {
      response.setHeader('Content-Encoding', 'gzip')
      response.end('invalid')
      return
    }
    if (request.url === '/slow') {
      response.write('start')
      return
    }
    if (request.headers.range) {
      response.writeHead(206, { 'Content-Range': 'bytes 4-7/8' })
      response.end('4567')
      return
    }
    response.end(Buffer.alloc(17 * 1024 * 1024, 0x51))
  })
  target.listen(0, '127.0.0.1')
  await once(target, 'listening')
  const destination = 'http://127.0.0.1:' + target.address().port
  const redirect = createServer((_request, response) => {
    response.writeHead(302, { Location: destination + '/audio' })
    response.end()
  })
  redirect.listen(0, '127.0.0.1')
  await once(redirect, 'listening')
  const origin = 'http://127.0.0.1:' + redirect.address().port
  const read = async (body) => {
    let size = 0
    for await (const bytes of body) size += bytes.length
    return size
  }
  const signal = new AbortController().signal
  try {
    await assert.rejects(
      requestNetworkStream({ url: destination }, () => false, signal),
      /owned plugin service/,
    )
    setNetworkProxyResolver(() => {
      throw Error('Owned loopback must not use configured proxy')
    })
    const large = await requestNetworkStream(
      {
        url: origin,
        headers: {
          Authorization: 'secret',
          Cookie: 'secret',
          'X-Token': 'secret',
          'X-Public': 'keep',
          'Accept-Encoding': 'gzip',
        },
      },
      () => true,
      signal,
    )
    assert.equal(await read(large.body), 17 * 1024 * 1024)
    assert.equal(received[0].authorization, undefined)
    assert.equal(received[0].cookie, undefined)
    assert.equal(received[0]['x-token'], undefined)
    assert.equal(received[0]['x-public'], 'keep')
    assert.equal(received[0]['accept-encoding'], 'identity')
    await assert.rejects(
      requestNetworkStream({ url: origin }, (url) => url.origin === origin, signal),
      /owned plugin service/,
    )
    const range = await requestNetworkStream(
      { url: destination, headers: { Range: 'bytes=4-7' } },
      () => true,
      signal,
    )
    assert.equal(range.status, 206)
    assert.equal(await read(range.body), 4)
    await assert.rejects(
      requestNetworkStream({ url: destination + '/encoded' }, () => true, signal),
      /Compressed/,
    )
    await assert.rejects(
      requestNetworkStream(
        { url: destination, headers: { 'Bad Header': 'x' } },
        () => true,
        signal,
      ),
      /Invalid media header/,
    )
    const controller = new AbortController()
    const slow = await requestNetworkStream(
      { url: destination + '/slow' },
      () => true,
      controller.signal,
    )
    const consumed = read(slow.body)
    controller.abort()
    await assert.rejects(consumed)
  } finally {
    setNetworkProxyResolver(undefined)
    target.closeAllConnections()
    redirect.closeAllConnections()
    await Promise.all([
      new Promise((resolve) => target.close(resolve)),
      new Promise((resolve) => redirect.close(resolve)),
    ])
  }
})
