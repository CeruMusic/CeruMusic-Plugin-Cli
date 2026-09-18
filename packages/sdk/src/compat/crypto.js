import CryptoJS from 'crypto-js'
import { Buffer } from 'buffer'

const words = (value) => CryptoJS.enc.Hex.parse(Buffer.from(value).toString('hex'))
const bytes = (value) => Buffer.from(value.toString(CryptoJS.enc.Hex), 'hex')

export function createHash(name) {
  const factory = {
    md5: CryptoJS.algo.MD5,
    sha1: CryptoJS.algo.SHA1,
    sha256: CryptoJS.algo.SHA256,
  }[name.toLowerCase()]
  if (!factory) throw new Error('Unsupported digest: ' + name)
  const hash = factory.create()
  return {
    update(value) {
      hash.update(words(value))
      return this
    },
    digest(encoding) {
      const result = bytes(hash.finalize())
      return encoding ? result.toString(encoding) : result
    },
  }
}

function cipher(mode, key, iv, decrypt) {
  if (!/^aes-(128|192|256)-(cbc|ecb)$/i.test(mode)) throw new Error('Unsupported cipher: ' + mode)
  const chunks = []
  return {
    update(value) {
      chunks.push(Buffer.from(value))
      return Buffer.alloc(0)
    },
    final() {
      const data = words(Buffer.concat(chunks))
      const options = {
        mode: mode.endsWith('ecb') ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
        iv: words(iv || ''),
        padding: CryptoJS.pad.Pkcs7,
      }
      return bytes(
        decrypt
          ? CryptoJS.AES.decrypt({ ciphertext: data }, words(key), options)
          : CryptoJS.AES.encrypt(data, words(key), options).ciphertext,
      )
    },
  }
}
export const createCipheriv = (mode, key, iv) => cipher(mode, key, iv, false)
export const createDecipheriv = (mode, key, iv) => cipher(mode, key, iv, true)
export const randomBytes = (size) =>
  Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)))
export const randomUUID = () => globalThis.crypto.randomUUID()
export const constants = { RSA_NO_PADDING: 3 }

// SPKI public-key parsing for the existing NetEase no-padding RSA request format.
export function publicEncrypt(options, value) {
  if (options.padding !== constants.RSA_NO_PADDING) throw new Error('Unsupported RSA padding')
  const der = Buffer.from(options.key.replace(/-----[^-]+-----|\s/g, ''), 'base64')
  let offset = 0
  function tlv() {
    const tag = der[offset++]
    let length = der[offset++]
    if (length & 128) {
      let count = length & 127
      length = 0
      while (count--) length = length * 256 + der[offset++]
    }
    const start = offset
    offset += length
    if (offset > der.length) throw new Error('Invalid RSA key')
    return { tag, start, end: offset }
  }
  const outer = tlv()
  offset = outer.start
  tlv()
  const bits = tlv()
  offset = bits.start + 1
  const sequence = tlv()
  offset = sequence.start
  const modulus = tlv()
  const exponent = tlv()
  const n = BigInt('0x' + der.subarray(modulus.start, modulus.end).toString('hex'))
  let e = BigInt('0x' + der.subarray(exponent.start, exponent.end).toString('hex'))
  let base = BigInt('0x' + Buffer.from(value).toString('hex'))
  let result = 1n
  if (base >= n) throw new Error('RSA input exceeds modulus')
  while (e) {
    if (e & 1n) result = (result * base) % n
    base = (base * base) % n
    e >>= 1n
  }
  const size = Math.ceil(n.toString(16).length / 2)
  return Buffer.from(result.toString(16).padStart(size * 2, '0'), 'hex')
}
export default {
  createHash,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  randomBytes,
  randomUUID,
  constants,
}
