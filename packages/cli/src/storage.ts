import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

/** Private development data; persists across preview restarts and never enters the artifact. */
export class DevelopmentStorage {
  private values = new Map<string, unknown>()
  private initialized?: Promise<void>
  private writes: Promise<unknown> = Promise.resolve()
  private readonly path: string
  constructor(
    root: string,
    private readonly pluginId: string,
  ) {
    this.path = resolve(
      root,
      '.ceru-dev/storage',
      createHash('sha256').update(pluginId).digest('hex') + '.json',
    )
  }
  private initialize() {
    return (this.initialized ??= (async () => {
      try {
        const values = JSON.parse(await readFile(this.path, 'utf8'))
        if (!Array.isArray(values)) throw new Error('Invalid development storage')
        this.values = new Map(values)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })())
  }
  private key(value: any) {
    if (value?.pluginId && value.pluginId !== this.pluginId)
      throw new Error('Cross-plugin storage requires an installed Host')
    const key = typeof value === 'string' ? value : value?.key
    if (typeof key !== 'string' || !key || key.length > 256) throw new Error('Invalid storage key')
    return key
  }
  async invoke(method: 'get' | 'set' | 'delete', ref: unknown, value?: unknown): Promise<unknown> {
    await this.initialize()
    const key = this.key(ref)
    if (method === 'get') {
      await this.writes
      return structuredClone(this.values.get(key) ?? null)
    }
    const job = this.writes
      .catch(() => {})
      .then(async () => {
        const next = new Map(this.values)
        if (method === 'set') next.set(key, value)
        else next.delete(key)
        const data = JSON.stringify([...next])
        if (Buffer.byteLength(data) > 10 * 1024 * 1024) throw new Error('Storage exceeds 10 MiB')
        await mkdir(resolve(this.path, '..'), { recursive: true })
        const temporary = this.path + '.' + randomUUID() + '.tmp'
        await writeFile(temporary, data, { mode: 0o600 })
        await rename(temporary, this.path)
        this.values = next
        return null
      })
    this.writes = job.catch(() => {})
    return job
  }
}
