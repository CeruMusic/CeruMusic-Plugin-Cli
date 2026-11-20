import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { NodePluginSandbox } from '../packages/core/dist/node.js'
import { readArtifact } from '../packages/issuer/dist/index.js'

test('sandbox crypto TransformStreams match native encryption and reject invalid data and cancellation', async () => {
  const manifest = {
    manifestVersion: 3,
    id: 'test.crypto-streams',
    name: 'Crypto streams',
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' } },
    provides: {
      actions: [
        { id: 'probe', title: 'Probe' },
        { id: 'cancel', title: 'Cancel' },
      ],
    },
  }
  const code =
    'exports.manifest=' +
    JSON.stringify(manifest) +
    `;exports.activate=ctx=>{
    ctx.actions.register('probe',async input=>{
      const bytes=Buffer.from(input.data,'hex'),key=Buffer.from(input.key,'hex'),iv=Buffer.from(input.iv,'hex');
      const stream=new ReadableStream({start(controller){for(let offset=0;offset<bytes.length;offset+=13)controller.enqueue(Uint8Array.from(bytes.subarray(offset,offset+13)));controller.close()}});
      const transform=ctx.crypto[input.decrypt?'createDecipher':'createCipher'](input.algorithm,key,iv);
      const reader=stream.pipeThrough(transform).getReader(),chunks=[];
      while(true){const {value,done}=await reader.read();if(done)break;try{value.buffer.constructor.constructor('return process')();throw Error('Escaped native result')}catch(error){if(error.message==='Escaped native result')throw error}chunks.push(Buffer.from(value))}
      return Buffer.concat(chunks).toString('hex');
    });
    ctx.actions.register('cancel',async()=>{
      const controller=new AbortController();const transform=ctx.crypto.createCipher('aes-128-ctr','00'.repeat(16),'00'.repeat(16),{signal:controller.signal});
      const read=transform.readable.getReader().read();controller.abort();
      try{await read;return false}catch{return true}
    });
  }`
  const worker = new NodePluginSandbox(
    async () => null,
    () => {},
  )
  try {
    await worker.start(readArtifact(code))
    for (const algorithm of [
      'aes-128-ctr',
      'aes-256-ctr',
      'aes-128-cbc',
      'aes-256-cbc',
      'chacha20',
    ]) {
      const key = randomBytes(algorithm.startsWith('aes-128') ? 16 : 32),
        iv = randomBytes(16),
        bytes = randomBytes(1037)
      if (algorithm === 'chacha20') iv.writeUInt32LE(7, 0)
      const cipher = createCipheriv(algorithm, key, iv),
        expected = Buffer.concat([cipher.update(bytes), cipher.final()])
      const input = {
        algorithm,
        key: key.toString('hex'),
        iv: iv.toString('hex'),
        data: bytes.toString('hex'),
      }
      assert.equal(await worker.invoke('action', 'probe', '', [input]), expected.toString('hex'))
      assert.equal(
        await worker.invoke('action', 'probe', '', [
          { ...input, data: expected.toString('hex'), decrypt: true },
        ]),
        bytes.toString('hex'),
      )
      if (algorithm.endsWith('-cbc'))
        await assert.rejects(
          worker.invoke('action', 'probe', '', [
            { ...input, data: expected.subarray(0, -1).toString('hex'), decrypt: true },
          ]),
        )
    }
    assert.equal(await worker.invoke('action', 'cancel', '', [{}]), true)
  } finally {
    worker.dispose()
  }
})
