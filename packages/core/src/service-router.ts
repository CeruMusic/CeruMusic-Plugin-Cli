import semver from 'semver'
import type {
  JsonValue,
  PluginManifest,
  PluginDependency,
  ServiceDeclaration,
} from '@shiqianjiang/ceru-plugin-sdk'

export type ServiceNotice = { pluginId: string; service: string }
type Invoke = (
  service: string,
  method: string,
  input: JsonValue,
  caller: string,
  signal: AbortSignal,
) => Promise<unknown>
type Notify = (event: 'available' | 'unavailable', info: ServiceNotice) => void
type Registered = { declaration: ServiceDeclaration; stop: AbortController }
const keyOf = (id: string, service: string) => JSON.stringify([id, service])
const nested = 'Nested plugin service calls are not allowed'
function json(value: unknown): JsonValue {
  let nodes = 0,
    size = 0
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 32768 || depth > 64) throw Error('Plugin service payload exceeds limit')
    if (typeof item === 'string') {
      size += item.length
      if (size > 128 * 1024) throw Error('Plugin service payload exceeds limit')
      return
    }
    if (
      item === null ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return
    if (
      !item ||
      typeof item !== 'object' ||
      (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
    )
      throw Error('Plugin service requires JSON')
    for (const child of Object.values(item)) visit(child, depth + 1)
  }
  visit(value, 0)
  const text = JSON.stringify(value)
  if (Buffer.byteLength(text) > 128 * 1024) throw Error('Plugin service payload exceeds limit')
  return JSON.parse(text)
}
export function dependencyOrder(
  nodes: { id: string; dependencies: readonly Pick<PluginDependency, 'pluginId' | 'optional'>[] }[],
) {
  const graph = new Map(nodes.map((node) => [node.id, node.dependencies]))
  const ordered: string[] = [],
    cycles = new Set<string>(),
    marked = new Set<string>(),
    stack: string[] = [],
    visiting = new Map<string, number>()
  const visit = (id: string) => {
    if (marked.has(id) || !graph.has(id)) return
    const at = visiting.get(id)
    if (at !== undefined) {
      for (const member of stack.slice(at)) cycles.add(member)
      return
    }
    visiting.set(id, stack.length)
    stack.push(id)
    for (const dependency of graph.get(id)!) if (!dependency.optional) visit(dependency.pluginId)
    stack.pop()
    visiting.delete(id)
    marked.add(id)
    ordered.push(id)
  }
  for (const id of graph.keys()) visit(id)
  return { ordered, cycles }
}
export class ServiceRouter {
  private active = new Map<string, ServiceEndpoint>()
  private listeners = new Set<() => void>()
  onChange(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  connect(manifest: PluginManifest, invoke: Invoke, notify: Notify) {
    return new ServiceEndpoint(this, manifest, invoke, notify)
  }
  provider(id: string) {
    return this.active.get(id)
  }
  publish(endpoint: ServiceEndpoint) {
    this.active.set(endpoint.manifest.id, endpoint)
    this.changed()
  }
  remove(endpoint: ServiceEndpoint) {
    if (this.provider(endpoint.manifest.id) === endpoint) {
      this.active.delete(endpoint.manifest.id)
      this.changed()
    }
  }
  changed() {
    for (const endpoint of this.active.values()) endpoint.refresh()
    for (const listener of this.listeners) listener()
  }
  resolve(dep: PluginDependency) {
    const endpoint = this.provider(dep.pluginId),
      service = endpoint?.registered.get(dep.service)
    return endpoint && service && semver.satisfies(service.declaration.version, dep.version)
      ? { endpoint, service }
      : undefined
  }
  missing(dependencies: readonly PluginDependency[]) {
    return dependencies.find((dep) => !dep.optional && !this.resolve(dep))
  }
}
export class ServiceEndpoint {
  readonly registered = new Map<string, Registered>()
  private seen = new Map<string, ServiceNotice>()
  private readonly lifetime = new AbortController()
  private handling = 0
  private disposed = false
  constructor(
    private router: ServiceRouter,
    readonly manifest: PluginManifest,
    private deliver: Invoke,
    private notify: Notify,
  ) {}
  attach() {
    if (!this.disposed) this.router.publish(this)
  }
  dispose() {
    this.disposed = true
    this.lifetime.abort()
    for (const item of this.registered.values()) item.stop.abort()
    this.registered.clear()
    this.router.remove(this)
  }
  refresh() {
    const next = new Map<string, ServiceNotice>()
    for (const dep of this.manifest.uses?.plugins ?? [])
      if (this.router.resolve(dep))
        next.set(keyOf(dep.pluginId, dep.service), { pluginId: dep.pluginId, service: dep.service })
    const old = this.seen
    this.seen = next
    for (const [key, info] of old) if (!next.has(key)) this.notify('unavailable', info)
    for (const [key, info] of next) if (!old.has(key)) this.notify('available', info)
  }
  register(id: string, methods: string[] | null) {
    const declaration = this.manifest.provides?.services?.find((s) => s.id === id)
    if (this.disposed || !declaration) throw Error('Undeclared plugin service: ' + id)
    if (methods === null) {
      this.registered.get(id)?.stop.abort()
      this.registered.delete(id)
    } else {
      if (
        this.registered.has(id) ||
        !Array.isArray(methods) ||
        methods.length !== declaration.methods.length ||
        !declaration.methods.every((name) => methods.includes(name)) ||
        methods.some((name) => ['then', '__proto__', 'constructor', 'prototype'].includes(name))
      )
        throw Error('Invalid plugin service handlers')
      this.registered.set(id, { declaration, stop: new AbortController() })
    }
    if (this.router.provider(this.manifest.id) === this) this.router.changed()
  }
  private guard() {
    if (this.disposed) throw Error('Plugin stopped')
    if (this.handling) throw Error(nested)
  }
  private target(pluginId: string, service: string) {
    this.guard()
    const dep = this.manifest.uses?.plugins?.find(
      (dep) => dep.pluginId === pluginId && dep.service === service,
    )
    if (!dep) throw Error('Undeclared plugin dependency')
    const resolved = this.router.resolve(dep)
    if (!resolved && !dep.optional)
      throw Error('Missing plugin dependency: ' + pluginId + ' / ' + service + ' ' + dep.version)
    return resolved
  }
  use(id: string, service: string) {
    return this.target(id, service)?.service.declaration.methods.slice() ?? null
  }
  list() {
    this.guard()
    const grouped = new Map<string, ServiceDeclaration[]>()
    for (const dep of this.manifest.uses?.plugins ?? []) {
      const entry = this.router.resolve(dep)
      if (entry) {
        const group = grouped.get(dep.pluginId) ?? []
        group.push(structuredClone(entry.service.declaration))
        grouped.set(dep.pluginId, group)
      }
    }
    return [...grouped].map(([pluginId, services]) => ({ pluginId, services }))
  }
  async invoke(id: string, service: string, method: string, input: unknown, signal: AbortSignal) {
    const target = this.target(id, service)
    if (!target || !target.service.declaration.methods.includes(method))
      throw Error('Plugin service method unavailable')
    const lifetime = AbortSignal.any([
      signal,
      target.service.stop.signal,
      this.lifetime.signal,
      AbortSignal.timeout(30000),
    ])
    lifetime.throwIfAborted()
    const data = json(input)
    const provider = target.endpoint
    let abort!: () => void
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(lifetime.reason)
      lifetime.addEventListener('abort', abort, { once: true })
    })
    provider.handling++
    try {
      const value = await Promise.race([
        provider.deliver(service, method, data, this.manifest.id, lifetime),
        cancelled,
      ])
      lifetime.throwIfAborted()
      return json(value === undefined ? null : value)
    } finally {
      lifetime.removeEventListener('abort', abort)
      provider.handling--
    }
  }
}
