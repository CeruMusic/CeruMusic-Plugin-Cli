import type { ContentEntity, SearchRequest } from './index.js'

export function assertSearchRequest(value: unknown): asserts value is SearchRequest {
  const request = value as Partial<SearchRequest> | null
  if (
    !request ||
    typeof request.query !== 'string' ||
    request.query.length > 4096 ||
    !Array.isArray(request.kinds) ||
    request.kinds.length > 32 ||
    !request.kinds.every(
      (kind) => typeof kind === 'string' && kind.length > 0 && kind.length <= 128,
    ) ||
    !request.filters ||
    typeof request.filters !== 'object' ||
    Array.isArray(request.filters) ||
    (request.cursor !== undefined &&
      (typeof request.cursor !== 'string' || request.cursor.length > 2048)) ||
    !Number.isSafeInteger(request.limit) ||
    request.limit! < 1 ||
    request.limit! > 1000
  )
    throw new Error('Invalid music search request')
}

/**
 * Reject anything that is not a plain track list before a destructive call.
 * Hosts pass untrusted renderer input here, so this must not depend on the
 * caller having already validated shapes.
 */
export function assertRemovableTracks(value: unknown): asserts value is ContentEntity[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Invalid playlist removal items')
  if (value.length > 1000) throw new Error('Invalid playlist removal items')
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Invalid playlist removal item')
    const ref = (item as ContentEntity).ref
    if (!ref || typeof ref !== 'object' || ref.kind !== 'track')
      throw new Error('Only tracks can be removed')
    if (typeof ref.id !== 'string' || !ref.id) throw new Error('Invalid playlist removal item')
  }
}
