import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { assertResolveResult, assertStreamSpec } from '../packages/sdk/dist/index.js'
import { openMediaStream, MediaRangeError } from '../packages/core/dist/media-stream.js'
import { chacha20 } from '../packages/core/dist/chacha20.js'

const bytes = randomBytes(512 * 1024 + 23)
test('portable ChaCha20 matches native crypto across chunk boundaries and counter limits', () => {
  const key = randomBytes(32),
    iv = randomBytes(16)
  iv.writeUInt32LE(17, 0)
  const native = createCipheriv('chacha20', key, iv),
    portable = chacha20(key, iv)
  const expected = Buffer.concat([native.update(bytes), native.final()]),
    chunks = []
  for (let start = 0; start < bytes.length; start += 79)
    chunks.push(portable.update(bytes.subarray(start, start + 79)))
  assert.deepEqual(Buffer.concat(chunks), expected)
  const finalIv = Buffer.from(iv)
  finalIv.writeUInt32LE(0xffffffff, 0)
  const last = chacha20(key, finalIv)
  assert.equal(last.update(Buffer.alloc(64)).length, 64)
  assert.throws(() => last.update(Buffer.alloc(1)), /counter overflow/)
})
const collect = async (stream) => {
  const out = []
  for await (const chunk of stream) out.push(chunk)
  return Buffer.concat(out)
}
function upstream(ciphertext, { ignoreRange = false, chunkSize = 8191 } = {}) {
  const ranges = []
  return {
    ranges,
    fetch: async (range, signal) => {
      signal.throwIfAborted()
      ranges.push(range)
      const match = range && !ignoreRange ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
      const start = match ? Number(match[1]) : 0,
        end = match?.[2] ? Math.min(Number(match[2]), ciphertext.length - 1) : ciphertext.length - 1
      const body = Readable.from(
        (function* () {
          for (let offset = start; offset <= end; offset += chunkSize)
            yield ciphertext.subarray(offset, Math.min(end + 1, offset + chunkSize))
        })(),
      )
      return {
        status: match ? 206 : 200,
        headers: {
          'content-length': String(end - start + 1),
          'content-type': 'audio/flac',
          ...(match ? { 'content-range': `bytes ${start}-${end}/${ciphertext.length}` } : {}),
        },
        body,
      }
    },
  }
}

for (const algorithm of ['aes-128-ctr', 'aes-256-ctr', 'aes-128-cbc', 'aes-256-cbc', 'chacha20']) {
  test(
    algorithm + ' streams exact plaintext for full, partial, suffix and ignored ranges',
    async () => {
      const key = randomBytes(algorithm.startsWith('aes-128') ? 16 : 32),
        iv = randomBytes(16)
      if (algorithm === 'chacha20') iv.writeUInt32LE(7, 0)
      const cipher = createCipheriv(algorithm, key, iv)
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
      const spec = {
        decrypt: { algorithm, key: key.toString('hex'), iv: iv.toString('hex') },
        contentType: 'audio/flac',
        contentLength: bytes.length,
      }
      for (const ignoreRange of [false, true])
        for (const [range, start, end] of [
          [undefined, 0, bytes.length - 1],
          ['bytes=0-0', 0, 0],
          ['bytes=31-8999', 31, 8999],
          ['bytes=16384-', 16384, bytes.length - 1],
          ['bytes=-75', bytes.length - 75, bytes.length - 1],
          ['bytes=524300-999999', 524300, bytes.length - 1],
        ]) {
          const source = upstream(ciphertext, { ignoreRange })
          const result = await openMediaStream(spec, source.fetch, { range })
          assert.equal(result.status, range ? 206 : 200)
          assert.equal(Number(result.headers['content-length']), end - start + 1)
          if (range)
            assert.equal(result.headers['content-range'], `bytes ${start}-${end}/${bytes.length}`)
          assert.deepEqual(
            await collect(result.body),
            bytes.subarray(start, end + 1),
            String(range) + ' ignored=' + ignoreRange,
          )
        }
    },
  )
}

test('unknown lengths stream without guessing CBC ciphertext length', async () => {
  for (const algorithm of ['aes-128-ctr', 'aes-128-cbc']) {
    const key = randomBytes(16),
      iv = randomBytes(16),
      cipher = createCipheriv(algorithm, key, iv)
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()])
    const spec = {
      decrypt: {
        algorithm,
        key: key.toString('base64'),
        iv: iv.toString('base64'),
        encoding: 'base64',
      },
    }
    const result = await openMediaStream(spec, upstream(encrypted).fetch, {
      range: 'bytes=101-999',
    })
    assert.equal(result.status, algorithm.endsWith('cbc') ? 200 : 206)
    assert.deepEqual(
      await collect(result.body),
      algorithm.endsWith('cbc') ? bytes : bytes.subarray(101, 1000),
    )
  }
})

test('invalid requests and crypto specs fail without consuming plaintext', async () => {
  const spec = {
    decrypt: { algorithm: 'aes-128-ctr', key: '00'.repeat(16), iv: '00'.repeat(16) },
    contentLength: 8,
  }
  for (const range of [
    'bytes=1-2,4-5',
    'bytes=9-',
    'bytes=-0',
    'bytes=3-2',
    'bytes=9007199254740999-',
  ])
    await assert.rejects(
      openMediaStream(spec, upstream(Buffer.alloc(8)).fetch, { range }),
      MediaRangeError,
    )
  for (const value of [
    null,
    {},
    { ...spec, contentLength: -1 },
    { ...spec, contentType: 'audio/flac\r\nHost: injected' },
    { ...spec, transform: 'one' },
    { decrypt: { ...spec.decrypt, key: 'x'.repeat(32) } },
  ])
    assert.throws(() => assertStreamSpec(value))
  assertResolveResult({ ok: true, url: 'https://example.test/plain', legacyField: 'unchanged' })
  assertResolveResult({ ok: true, url: 'https://example.test/cipher', stream: spec })
  assert.throws(() =>
    assertResolveResult({
      ok: true,
      url: 'https://example.test/cipher',
      stream: { decrypt: { algorithm: 'unknown' } },
    }),
  )
  await assert.rejects(
    openMediaStream(
      spec,
      async () => ({
        status: 206,
        headers: { 'content-range': 'bytes 7-8/9' },
        body: Readable.from([Buffer.alloc(2)]),
      }),
      { range: 'bytes=0-1' },
    ),
    /upstream content range/,
  )
})

test('cancellation and consumer close destroy the upstream body', async () => {
  const spec = {
    decrypt: { algorithm: 'aes-128-ctr', key: '00'.repeat(16), iv: '00'.repeat(16) },
    contentLength: 8,
  }
  const controller = new AbortController(),
    source = upstream(Buffer.alloc(8))
  const result = await openMediaStream(spec, source.fetch, { signal: controller.signal })
  const ended = collect(result.body)
  controller.abort(Error('revoked'))
  await assert.rejects(ended, /revoked/)
  let body
  const second = await openMediaStream(spec, async () => ({
    status: 200,
    headers: {},
    body: (body = Readable.from([Buffer.alloc(8)])),
  }))
  second.body.destroy()
  await new Promise((resolve) => second.body.once('close', resolve))
  assert.equal(body.destroyed, true)
})

test('custom transforms remain streaming and honor seekability', async () => {
  for (const seekable of [true, false]) {
    const offsets = []
    const transform = {
      seekable,
      create: ({ offset }) => {
        offsets.push(offset)
        return { transform: (chunk) => Uint8Array.from(chunk, (byte) => byte ^ 0x55) }
      },
    }
    const encrypted = Buffer.from(bytes.map((byte) => byte ^ 0x55)),
      source = upstream(encrypted)
    const result = await openMediaStream(
      { transform: 'xor', contentLength: bytes.length },
      source.fetch,
      { range: 'bytes=100-399', transform },
    )
    assert.deepEqual(await collect(result.body), seekable ? bytes.subarray(100, 400) : bytes)
    assert.deepEqual(offsets, [seekable ? 100 : 0])
    assert.equal(result.headers['accept-ranges'], seekable ? 'bytes' : 'none')
  }
})
