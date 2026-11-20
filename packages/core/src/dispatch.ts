import { CONTRACT, RPC, type ContractEntry, type RpcMethod } from './contract.js'
import type { PermissionName, PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'

export interface DispatchHooks {
  authorize(permissionKey: string | undefined, permission: PermissionName): Promise<void>
  log: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
  pluginId: string
  manifest: PluginManifest
  signal?: AbortSignal
}
export type HostServices = { [Key in RpcMethod]: (data: any, hooks: DispatchHooks) => Promise<any> }

export function createDispatcher(services: HostServices, hooks: DispatchHooks) {
  const pending = new Map<string, Promise<unknown>>()
  const operations = new Map<string, Set<AbortController>>()
  return async (method: string, data: any = {}) => {
    if (!Object.hasOwn(CONTRACT, method) || !Object.hasOwn(services, method))
      throw new Error('Unsupported RPC method: ' + method)
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid RPC payload')
    const name = method as RpcMethod
    const entry: ContractEntry = CONTRACT[name]
    const positional = name.startsWith('services.') || entry.positional
    if (positional && !Array.isArray(data.args))
      throw new Error('RPC expects positional arguments: ' + method)
    if (name === RPC.operations.cancel)
      for (const controller of operations.get(data.id) ?? []) controller.abort()
    const call = entry.keyIndex !== undefined ? data.args?.[entry.keyIndex] : undefined
    if (
      name.startsWith('music.') &&
      (entry.implicitKey
        ? data.args.length !== 0
        : data.args.length !== entry.keyIndex! + 1 ||
          !call ||
          typeof call.permissionKey !== 'string' ||
          !call.operation ||
          typeof call.operation.id !== 'string' ||
          !call.operation.id ||
          !Number.isFinite(call.operation.deadlineAt))
    )
      throw Error('Invalid music service call')
    const operation =
      entry.keyIndex !== undefined ? call?.operation : (data.operation ?? data.call?.operation)
    const id = typeof operation?.id === 'string' ? operation.id : undefined
    const expires = Math.min(
      entry.timeoutMs ?? 120000,
      Number.isFinite(operation?.deadlineAt) ? operation.deadlineAt - Date.now() : Infinity,
    )
    if (expires <= 0) throw new Error('RPC deadline exceeded')
    const controller = new AbortController()
    const signal = hooks.signal
      ? AbortSignal.any([controller.signal, hooks.signal])
      : controller.signal
    signal.throwIfAborted()
    if (id) {
      const active = operations.get(id) ?? new Set()
      active.add(controller)
      operations.set(id, active)
    }
    const timeout = setTimeout(
      () => controller.abort(new Error('Host RPC timed out: ' + method)),
      expires,
    )
    let abort!: () => void
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
    })
    const invoke = async () => {
      const permission =
        typeof entry.permission === 'function' ? entry.permission(data) : entry.permission
      if (permission)
        await hooks.authorize(
          entry.implicitKey
            ? hooks.manifest.uses?.permissions?.find((item) => item.name === permission)?.key
            : entry.keyIndex !== undefined
              ? call?.permissionKey
              : (data.permissionKey ?? data.call?.permissionKey),
          permission,
        )
      signal.throwIfAborted()
      entry.validate?.(data, hooks.manifest)
      const key = entry.dedupe && JSON.stringify([name, entry.dedupe(data)])
      if (key && pending.has(key)) return pending.get(key)
      const work = Promise.resolve().then(async () => {
        signal.throwIfAborted()
        const result = await services[name](data, { ...hooks, signal })
        signal.throwIfAborted()
        entry.validateResult?.(result, data)
        return result
      })
      const task = Promise.race([work, cancelled])
      if (key) pending.set(key, task)
      try {
        return await task
      } finally {
        if (key && pending.get(key) === task) pending.delete(key)
      }
    }
    try {
      const result = await Promise.race([invoke(), cancelled])
      hooks.log.debug('plugin-rpc', hooks.pluginId, method, 'ok')
      return result
    } catch (error) {
      hooks.log.warn('plugin-rpc', hooks.pluginId, method, 'rejected')
      throw error
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (id) {
        const active = operations.get(id)
        active?.delete(controller)
        if (!active?.size) operations.delete(id)
      }
    }
  }
}
