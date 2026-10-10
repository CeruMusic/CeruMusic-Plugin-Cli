import type { ContentEntity } from './index.js'

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
    if (typeof ref.id !== 'string' || !ref.id)
      throw new Error('Invalid playlist removal item')
  }
}
