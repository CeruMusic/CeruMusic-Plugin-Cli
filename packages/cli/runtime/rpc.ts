/** Strip process-local cancellation objects while retaining their wire operation identity. */
export function prepareRpcPayload(data: any): {
  data: any
  operations: { id: string; signal: AbortSignal }[]
} {
  const operations = new Map<AbortSignal, { id: string; signal: AbortSignal }>()
  const seen = new Map<object, any>()
  const visit = (value: any): any => {
    if (!value || typeof value !== 'object') return value
    if (typeof value.id === 'string' && typeof value.deadlineAt === 'number' &&
      typeof value.signal?.throwIfAborted === 'function' && typeof value.signal?.addEventListener === 'function') {
      value.signal.throwIfAborted()
      operations.set(value.signal, { id: value.id, signal: value.signal })
      return {
        id: value.id, deadlineAt: value.deadlineAt,
        ...(value.connectionId === undefined ? {} : { connectionId: value.connectionId }),
        ...(value.userIntent === undefined ? {} : { userIntent: visit(value.userIntent) }),
      }
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date) return value
    if (seen.has(value)) return seen.get(value)
    const result: any = Array.isArray(value) ? [] : {}
    seen.set(value, result)
    for (const [key, item] of Object.entries(value))
      Object.defineProperty(result, key, { value: visit(item), enumerable: true, configurable: true, writable: true })
    return result
  }
  return { data: visit(data), operations: [...operations.values()] }
}
