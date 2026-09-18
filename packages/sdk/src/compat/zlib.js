import { unzlibSync, decompressSync } from 'fflate'
import { Buffer } from 'buffer'
export const unzipSync = (input) => Buffer.from(decompressSync(input))
export function inflate(input, callback) {
  try {
    callback(null, Buffer.from(unzlibSync(input)))
  } catch (error) {
    callback(error)
  }
}
export default { unzipSync, inflate }
