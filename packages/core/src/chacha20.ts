/** Raw ChaCha20 fallback for Electron builds whose crypto backend omits this cipher. */
export function chacha20(key: Uint8Array, iv: Uint8Array) {
  if (key.byteLength !== 32 || iv.byteLength !== 16) throw Error('Invalid ChaCha20 key or IV')
  const state = new Uint32Array(16)
  state.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574])
  const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength)
  const ivView = new DataView(iv.buffer, iv.byteOffset, iv.byteLength)
  for (let i = 0; i < 8; i++) state[i + 4] = keyView.getUint32(i * 4, true)
  for (let i = 0; i < 4; i++) state[i + 12] = ivView.getUint32(i * 4, true)
  const block = new Uint8Array(64),
    view = new DataView(block.buffer)
  let position = 64,
    exhausted = false
  const rotate = (value: number, count: number) => (value << count) | (value >>> (32 - count))
  const words = new Uint32Array(16)
  function quarter(a: number, b: number, c: number, d: number) {
    words[a] += words[b]
    words[d] = rotate(words[d] ^ words[a], 16)
    words[c] += words[d]
    words[b] = rotate(words[b] ^ words[c], 12)
    words[a] += words[b]
    words[d] = rotate(words[d] ^ words[a], 8)
    words[c] += words[d]
    words[b] = rotate(words[b] ^ words[c], 7)
  }
  return {
    update(bytes: Uint8Array): Buffer {
      const output = Buffer.allocUnsafe(bytes.byteLength)
      for (let offset = 0; offset < bytes.byteLength; ) {
        if (position === 64) {
          if (exhausted) throw Error('Stream counter overflow')
          words.set(state)
          for (let round = 0; round < 10; round++) {
            quarter(0, 4, 8, 12)
            quarter(1, 5, 9, 13)
            quarter(2, 6, 10, 14)
            quarter(3, 7, 11, 15)
            quarter(0, 5, 10, 15)
            quarter(1, 6, 11, 12)
            quarter(2, 7, 8, 13)
            quarter(3, 4, 9, 14)
          }
          for (let i = 0; i < 16; i++) view.setUint32(i * 4, (words[i] + state[i]) >>> 0, true)
          exhausted = state[12] === 0xffffffff
          state[12]++
          position = 0
        }
        const end = Math.min(bytes.byteLength, offset + 64 - position)
        while (offset < end) output[offset] = bytes[offset++] ^ block[position++]
      }
      return output
    },
    final: () => Buffer.alloc(0),
    setAutoPadding: (_padding: boolean) => {},
  }
}
