import test from 'node:test'
import assert from 'node:assert/strict'
import { readArtifact } from '../packages/issuer/dist/index.js'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { openMediaStream } from '../packages/core/dist/media-stream.js'
import { Readable } from 'node:stream'

const manifest = {
  manifestVersion: 3,
  id: 'test.media-worker',
  name: 'Media worker',
  version: '1.0.0',
  engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
  entry: { logic: { module: 'main' } },
  provides: {
    actions: [
      { id: 'stop', title: 'Stop' },
      { id: 'status', title: 'Status' },
    ],
  },
}
const code =
  'exports.manifest=' +
  JSON.stringify(manifest) +
  `;exports.activate=ctx=>{
  let closed=0;
  const stop=ctx.streams.registerTransform('xor',{seekable:true,create({offset,info}){
    return {transform(chunk){
      if(info?.slow)return new Promise(resolve=>setTimeout(()=>resolve(chunk),200));
      let escaped=false;try{chunk.buffer.constructor.constructor('return process')();escaped=true}catch{}
      if(escaped)throw Error('Host realm escaped');
      for(let i=0;i<chunk.length;i++)chunk[i]^=info?.key??85;
      return chunk;
    },flush(){return new Uint8Array()},dispose(){closed++}};
  }});
  ctx.actions.register('stop',()=>{stop();return true});
  ctx.actions.register('status',()=>({closed,bridge:typeof __bridge,binary:typeof __ceruBinary}));
}`
const collect = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

test('custom transforms run inside the worker with transferable chunks and no native realm access', async () => {
  const worker = new NodePluginSandbox(
    async () => {
      throw Error('No RPC expected')
    },
    () => {},
  )
  try {
    await worker.start(readArtifact(code))
    const controller = new AbortController(),
      factory = worker.streamTransform('xor', controller.signal)
    assert.equal(factory.seekable, true)
    assert.equal(worker.streamTransform('missing'), undefined)
    const transform = await factory.create({ offset: 0, info: { key: 85 } })
    const input = new Uint8Array(1024 * 1024).fill(99)
    const original = input.buffer
    const transformed = await transform.transform(input)
    assert.equal(original.byteLength, 0, 'the input must transfer, not clone')
    assert.equal(transformed.length, 1024 * 1024)
    assert(transformed.every((byte) => byte === (99 ^ 85)))
    await transform.dispose()
    const plain = Buffer.alloc(3 * 1024 * 1024, 45),
      encrypted = Buffer.from(plain.map((byte) => byte ^ 85))
    const response = await openMediaStream(
      { transform: 'xor', contentLength: plain.length },
      async () => ({
        status: 200,
        headers: {},
        body: Readable.from(
          (function* () {
            for (let i = 0; i < encrypted.length; i += 65536) yield encrypted.subarray(i, i + 65536)
          })(),
        ),
      }),
      { transform: factory, signal: controller.signal },
    )
    assert.deepEqual(await collect(response.body), plain)
    const status = await worker.invoke('action', 'status', '', [{}])
    assert.equal(status.closed, 2)
    assert.equal(status.bridge, 'undefined')
    assert.equal(status.binary, 'undefined')
    const delayed = await factory.create({ offset: 0, info: { slow: true } })
    const pending = delayed.transform(new Uint8Array([1, 2, 3]))
    controller.abort()
    await assert.rejects(pending, /cancelled/)
    await delayed.dispose()
    await worker.invoke('action', 'stop', '', [{}])
    assert.equal(worker.streamTransform('xor'), undefined)
    await assert.rejects(factory.create({ offset: 0 }))
  } finally {
    worker.dispose()
  }
})

test('WebAssembly resource instantiation stays in the v3 realm and powers a streaming transform', async () => {
  const wasm = Buffer.from(
    '0061736d0100000001070160027f7f017f030201000707010361646400000a09010700200020016a0b',
    'hex',
  )
  const artifact = readArtifact(
    'exports.manifest=' +
      JSON.stringify(manifest) +
      `;exports.activate=async ctx=>{
    const {instance}=await ctx.wasm.instantiate('adder');
    ctx.streams.registerTransform('wasm',{seekable:true,create(){return {transform(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=instance.exports.add(bytes[i],1)&255;return bytes}}}});
    ctx.actions.register('status',()=>({native:typeof process,bridge:typeof __bridge}));
  }`,
  )
  artifact.resources.adder = {
    type: 'base64',
    mime: 'application/wasm',
    value: wasm.toString('base64'),
  }
  const worker = new NodePluginSandbox(
    async () => null,
    () => {},
  )
  try {
    await worker.start(artifact)
    const stream = await worker.streamTransform('wasm').create({ offset: 0 })
    const started = performance.now(),
      size = 8 * 1024 * 1024
    for (let offset = 0; offset < size; offset += 256 * 1024) {
      const bytes = await stream.transform(new Uint8Array(256 * 1024).fill(12))
      assert.equal(bytes[0], 13)
      assert.equal(bytes.at(-1), 13)
    }
    const megabytesPerSecond = size / 1024 / 1024 / ((performance.now() - started) / 1000)
    console.log('WASM worker throughput MiB/s:', megabytesPerSecond.toFixed(2))
    assert(megabytesPerSecond >= 4, 'WASM transform must process at least 4 MiB/s')
    await stream.dispose()
  } finally {
    worker.dispose()
  }
})
