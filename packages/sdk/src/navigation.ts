import type { ResourceRef } from './index.js'
import type { PluginManifest } from './manifest.js'
import { assertResourceRef } from './music.js'

export type HostNavigationRequest = {
  query?: string
  ref?: ResourceRef
} & (
  | { page: 'playlist'; sectionId?: string }
  | { page: 'search' | 'charts' | 'downloads' | 'account' | 'settings'; sectionId?: never }
)

/** Validate using the calling plugin's manifest, never a caller-supplied owner ID. */
export function assertNavigationRequest(
  value: unknown,
  manifest?: PluginManifest,
): asserts value is HostNavigationRequest {
  const request = value as HostNavigationRequest
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    !['search', 'playlist', 'charts', 'downloads', 'account', 'settings'].includes(request.page) ||
    (request.query !== undefined &&
      (typeof request.query !== 'string' || request.query.length > 8192))
  )
    throw new Error('Invalid Host navigation request')
  if (request.ref !== undefined) assertResourceRef(request.ref)
  if (request.sectionId !== undefined) {
    if (
      request.page !== 'playlist' ||
      typeof request.sectionId !== 'string' ||
      !request.sectionId.length ||
      request.sectionId.length > 128
    )
      throw new Error('sectionId is only valid for playlist navigation')
    if (
      manifest &&
      !manifest.contributes?.playlistSections?.some((section) => section.id === request.sectionId)
    )
      throw new Error('Unknown playlist section: ' + request.sectionId)
  }
}
