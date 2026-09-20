import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'
import type { GuestInfo } from '@shiqianjiang/ceru-plugin-sdk'
import { NodePluginSandbox } from './node.js'

export interface GuestServices {
  root: string
  artifact: Artifact
  approve(info: { name: string; version: string; author?: string }): Promise<boolean>
  authorize(info: GuestInfo, permission: 'network' | 'network.private'): Promise<boolean>
  request(input: any, privateAllowed: () => boolean, signal: AbortSignal): Promise<any>
  changed(): void
  event(guest: GuestInfo, type: string, data: any): void
}
type SavedGuest = Omit<GuestInfo, 'state'> & {
  digest: string
  grants: string[]
  description?: string
  homepage?: string
}
const digest = (script: string) => createHash('sha256').update(script).digest('hex')

export function readGuestInfo(script: string, fallback = '自定义音源') {
  if (Buffer.byteLength(script) > 2 * 1024 * 1024) throw new Error('子插件超过 2 MiB')
  const comment = /^\s*\/\*[\s\S]*?\*\//.exec(script)?.[0] ?? ''
  const field = (key: string) =>
    new RegExp('@' + key + '[ \t]+([^\r\n*]+)').exec(comment)?.[1]?.trim().slice(0, 500)
  return {
    name: field('name') || fallback,
    version: field('version') || '0.0.0',
    author: field('author'),
    description: field('description'),
    homepage: field('homepage'),
  }
}

/** Generic one-level Guest management. Platform semantics belong to the parent's bootstrap. */
export class GuestStore {
  private saved: SavedGuest[] = []
  private runtimes = new Map<string, NodePluginSandbox>()
  private starting = new Map<string, Promise<NodePluginSandbox>>()
  private errors = new Map<string, string>()
  private requests = new Map<string, Set<AbortController>>()
  private requestIds = new Map<string, AbortController>()
  private grantPrompts = new Map<string, Promise<boolean>>()
  private writes = Promise.resolve()
  private selection = Promise.resolve()
  private disposed = false
  private initialized?: Promise<void>
  constructor(private services: GuestServices) {}

  initialize(): Promise<void> {
    return (this.initialized ??= (async () => {
      await mkdir(this.services.root, { recursive: true })
      try {
        const value = JSON.parse(await readFile(join(this.services.root, 'index.json'), 'utf8'))
        if (!Array.isArray(value) || value.length > 64) throw new Error('子插件索引损坏')
        this.saved = value.filter(
          (item) =>
            /^[a-f0-9]{32}$/.test(item.id) &&
            typeof item.adapterId === 'string' &&
            Array.isArray(item.providers) &&
            Array.isArray(item.grants),
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })())
  }
  private adapter(id: string) {
    const manifest = this.services.artifact.header.manifest
    const adapter = manifest.contributes?.guestAdapters?.find((item) => item.id === id)
    if (!adapter || manifest.guestPolicy?.maxDepth !== 1) throw new Error('兼容环境未声明此格式')
    return adapter
  }
  list(): GuestInfo[] {
    return this.saved.map((item) => this.info(item))
  }
  private info(item: SavedGuest): GuestInfo {
    return {
      id: item.id,
      adapterId: item.adapterId,
      name: item.name,
      version: item.version,
      author: item.author,
      providers: structuredClone(item.providers),
      selected: item.selected,
      state: this.errors.has(item.id) ? 'error' : this.runtimes.has(item.id) ? 'ready' : 'stopped',
      ...(this.errors.has(item.id) ? { error: this.errors.get(item.id) } : {}),
    }
  }
  private find(id: string) {
    const item = this.saved.find((item) => item.id === id)
    if (!item) throw new Error('子插件不存在')
    return item
  }
  private async script(item: SavedGuest) {
    const script = await readFile(join(this.services.root, item.id + '.js'), 'utf8')
    if (digest(script) !== item.digest) throw new Error('子插件文件校验失败，请重新导入')
    return script
  }
  /** Only for a user-initiated Host export, never exposed through the parent's RPC. */
  async exportSelected(adapterId: string) {
    const item = this.saved.find((item) => item.adapterId === adapterId && item.selected)
    if (!item) throw new Error('请先使用一个子音源再分享')
    return { script: await this.script(item), info: this.info(item) }
  }
  private async persist() {
    const data = JSON.stringify(this.saved, null, 2)
    const write = this.writes.then(async () => {
      const temporary = join(this.services.root, 'index.' + randomUUID() + '.tmp')
      await writeFile(temporary, data, { mode: 0o600 })
      await rename(temporary, join(this.services.root, 'index.json'))
    })
    this.writes = write.catch(() => {})
    await write
  }
  async install(adapterId: string, script: string, fallback?: string): Promise<GuestInfo | null> {
    await this.initialize()
    this.adapter(adapterId)
    if (this.disposed) throw new Error('兼容环境已停止')
    const metadata = readGuestInfo(script, fallback)
    if (this.saved.some((item) => item.digest === digest(script)))
      throw new Error('这个子插件已经安装')
    if (this.saved.length >= 64) throw new Error('子插件数量已达上限')
    if (!(await this.services.approve(metadata))) return null
    if (this.disposed) throw new Error('兼容环境已停止')
    const item: SavedGuest = {
      ...metadata,
      id: randomUUID().replaceAll('-', ''),
      adapterId,
      digest: digest(script),
      selected: false,
      grants: [],
      providers: [],
    }
    this.saved.push(item)
    try {
      await writeFile(join(this.services.root, item.id + '.js'), script, { mode: 0o600 })
      await this.persist()
      this.services.changed()
      return this.info(item)
    } catch (error) {
      this.saved = this.saved.filter((entry) => entry !== item)
      this.stop(item.id)
      this.errors.delete(item.id)
      await unlink(join(this.services.root, item.id + '.js')).catch(() => {})
      await this.persist()
      throw error
    }
  }
  private async grant(item: SavedGuest, permission: 'network' | 'network.private') {
    const capability = permission === 'network' ? 'network.request' : 'network.private'
    if (
      !this.services.artifact.header.manifest.guestPolicy?.allowedCapabilities.includes(capability)
    )
      throw new Error('兼容环境未声明该子插件能力')
    if (item.grants.includes(permission)) return true
    if (item.grants.includes('deny:' + permission)) return false
    const key = item.id + ':' + permission
    let prompt = this.grantPrompts.get(key)
    if (!prompt) {
      prompt = this.services
        .authorize(this.info(item), permission)
        .then(async (allowed) => {
          if (this.disposed || !this.saved.includes(item)) return false
          item.grants.push(allowed ? permission : 'deny:' + permission)
          await this.persist()
          return allowed
        })
        .finally(() => this.grantPrompts.delete(key))
      this.grantPrompts.set(key, prompt)
    }
    return prompt
  }
  private async rpc(item: SavedGuest, method: string, input: any) {
    if (this.disposed || !this.saved.includes(item)) throw new Error('子插件已停止')
    if (method === 'guest.http.request') {
      if (!(await this.grant(item, 'network')))
        throw new Error('此子插件没有网络权限，请在插件权限中允许后重试')
      const controller = new AbortController()
      const key = item.id + ':' + String(input.requestId ?? randomUUID())
      if (this.requestIds.has(key)) throw new Error('重复的子插件请求 ID')
      const requests = this.requests.get(item.id) ?? new Set<AbortController>()
      if (requests.size >= 16) throw new Error('子插件并发请求过多')
      requests.add(controller)
      this.requests.set(item.id, requests)
      this.requestIds.set(key, controller)
      try {
        try {
          return await this.services.request(
            input,
            () => item.grants.includes('network.private'),
            controller.signal,
          )
        } catch (error) {
          if (
            error instanceof Error &&
            /局域网/.test(error.message) &&
            (await this.grant(item, 'network.private'))
          )
            return this.services.request(
              input,
              () => item.grants.includes('network.private'),
              controller.signal,
            )
          throw error
        }
      } finally {
        requests.delete(controller)
        this.requestIds.delete(key)
      }
    }
    if (method === 'guest.http.cancel') {
      this.requestIds.get(item.id + ':' + String(input.requestId))?.abort()
      return null
    }
    if (method === 'operations.cancel') {
      for (const request of this.requests.get(item.id) ?? []) request.abort()
      return null
    }
    if (method === 'guest.notify') {
      this.services.event(this.info(item), 'notify', input)
      return null
    }
    throw new Error('子插件没有此宿主能力: ' + method)
  }
  private async start(item: SavedGuest): Promise<NodePluginSandbox> {
    const pending = this.starting.get(item.id)
    if (pending) return pending
    const existing = this.runtimes.get(item.id)
    if (existing) return existing
    const job = (async () => {
      const adapter = this.adapter(item.adapterId)
      const script = await this.script(item)
      let ready = false
      const runtime = new NodePluginSandbox(
        (method, input) => this.rpc(item, method, input),
        (type, data) => {
          if (type === 'guest-metadata') {
            if (!Array.isArray(data?.providers) || data.providers.length > 32)
              throw new Error('子插件没有有效的平台声明')
            for (const provider of data.providers) {
              if (
                !provider ||
                typeof provider.id !== 'string' ||
                !/^[\w.-]{1,64}$/.test(provider.id) ||
                typeof provider.name !== 'string' ||
                !Array.isArray(provider.qualities) ||
                provider.qualities.length > 64 ||
                provider.qualities.some((q: unknown) => typeof q !== 'string' || q.length > 64) ||
                !Array.isArray(provider.protocols) ||
                provider.protocols.some((p: string) => !adapter.projectableProtocols.includes(p))
              )
                throw new Error('子插件能力超出兼容环境声明')
            }
            item.providers = data.providers
            ready = true
          } else if (type === 'closed') {
            if (this.runtimes.get(item.id) === runtime) {
              this.runtimes.delete(item.id)
              if (data?.reason) this.errors.set(item.id, String(data.reason))
              this.services.changed()
            }
          } else if (type === 'log' || type === 'notify')
            this.services.event(this.info(item), type, data)
        },
      )
      this.runtimes.set(item.id, runtime)
      try {
        await runtime.start(
          {
            ...this.services.artifact,
            header: {
              ...this.services.artifact.header,
              manifest: {
                ...this.services.artifact.header.manifest,
                modules: { logic: { entry: adapter.bootstrap } },
              },
            },
          },
          {
            id: item.id,
            script,
            info: {
              name: item.name,
              version: item.version,
              author: item.author,
              description: item.description,
              homepage: item.homepage,
            },
          },
        )
        if (!ready) throw new Error('子插件未完成初始化')
        if (this.disposed || !this.saved.includes(item) || this.runtimes.get(item.id) !== runtime)
          throw new Error('兼容环境已停止')
        this.errors.delete(item.id)
        return runtime
      } catch (error) {
        this.stop(item.id)
        this.errors.set(item.id, error instanceof Error ? error.message : String(error))
        throw error
      }
    })().finally(() => this.starting.delete(item.id))
    this.starting.set(item.id, job)
    return job
  }
  async select(id: string | null): Promise<void> {
    const next = this.selection.catch(() => {}).then(() => this.applySelection(id))
    this.selection = next
    return next
  }
  private async applySelection(id: string | null) {
    if (this.disposed) throw new Error('兼容环境已停止')
    if (id === null) {
      for (const item of this.saved) {
        item.selected = false
        this.stop(item.id)
      }
      await this.persist()
      this.services.changed()
      return
    }
    const item = this.find(id)
    const previous = this.saved.find((item) => item.selected)
    for (const entry of this.saved) if (entry.id !== id) this.stop(entry.id)
    try {
      await this.start(item)
    } catch (error) {
      if (previous && previous !== item && !this.disposed)
        await this.start(previous).catch(() => {})
      this.services.changed()
      throw error
    }
    for (const entry of this.saved) entry.selected = entry.id === id
    await this.persist()
    this.services.changed()
  }
  async remove(id: string) {
    this.find(id)
    this.stop(id)
    this.saved = this.saved.filter((item) => item.id !== id)
    await this.persist()
    await unlink(join(this.services.root, id + '.js')).catch(() => {})
    this.services.changed()
  }
  async replace(id: string, script: string) {
    const item = this.find(id)
    const metadata = readGuestInfo(script)
    if (metadata.name !== item.name) throw new Error('更新脚本名称与原子插件不一致')
    const old = structuredClone(item)
    const file = join(this.services.root, id + '.js')
    const previous = await readFile(file, 'utf8')
    this.stop(id)
    try {
      Object.assign(item, metadata, { digest: digest(script), providers: [] })
      await writeFile(file, script, { mode: 0o600 })
      if (item.selected) await this.start(item)
      await this.persist()
      this.services.changed()
      return this.info(item)
    } catch (error) {
      this.stop(id)
      Object.assign(item, old)
      await writeFile(file, previous, { mode: 0o600 })
      if (old.selected) await this.start(item).catch(() => {})
      await this.persist()
      this.services.changed()
      throw error
    }
  }
  permissions(id: string) {
    return this.find(id).grants.filter((key) => !key.startsWith('deny:'))
  }
  async setPermissions(id: string, keys: string[]) {
    if (!Array.isArray(keys) || keys.some((key) => !['network', 'network.private'].includes(key)))
      throw new Error('无效的子插件权限')
    const item = this.find(id)
    item.grants = ['network', 'network.private'].map((key) =>
      keys.includes(key) ? key : 'deny:' + key,
    )
    this.stop(id)
    await this.persist()
    this.services.changed()
  }
  async invoke(id: string, method: string, input: any) {
    const item = this.find(id)
    if (!item.selected) throw new Error('请先选择使用此子插件')
    if (!/^[a-zA-Z][\w.-]{0,127}$/.test(method)) throw new Error('无效的子插件方法')
    return (await this.start(item)).invoke('guest', id, method, [input])
  }
  private stop(id: string) {
    this.runtimes.get(id)?.dispose()
    this.runtimes.delete(id)
    for (const request of this.requests.get(id) ?? []) request.abort()
    this.requests.delete(id)
  }
  dispose() {
    this.disposed = true
    for (const id of this.runtimes.keys()) this.stop(id)
  }
}
