import type { ResourceRef } from './index.js'
import type { PluginManifest } from './manifest.js'
import { assertResourceRef } from './music.js'

export const PLUGIN_ROUTE_NAMES = ['welcome','home','find','songlist','local','recent','search','recognize','list','download','local-tag-editor','profile','community','settings','plugin-page'] as const
export type PluginRouteName = typeof PLUGIN_ROUTE_NAMES[number]
export interface PluginRoute { name: PluginRouteName; params: Record<string,string>; query: Record<string,string> }
export type PluginRouteTarget = Pick<PluginRoute,'name'> & Partial<Omit<PluginRoute,'name'>>
export type RouteGuard = (to: PluginRoute, from: PluginRoute | null) => void | false | PluginRouteTarget | Promise<void | false | PluginRouteTarget>
export interface PluginRouter {
  beforeEach(handler: RouteGuard): () => void
  afterEach(handler: (to: PluginRoute, from: PluginRoute | null) => void | Promise<void>): () => void
  current(): Promise<PluginRoute | null>
  push(to: PluginRouteTarget): Promise<boolean>
}
const routeKeys: Partial<Record<PluginRouteName,readonly string[]>> = { list:['id'], 'plugin-page':['pluginId','pageId'] }
const queryKeys: Partial<Record<PluginRouteName,readonly string[]>> = {search:['keyword'], list:['type','source'], settings:['section']}
const safeKey = (key: string) => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) && !['constructor','prototype','__proto__'].includes(key)
function routeFields(value: unknown, allowed: readonly string[] | undefined, strict: boolean, ids: boolean) {
  const result: Record<string,string> = {}
  if (value === undefined) return result
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid route fields')
  for (const [key, field] of Object.entries(value)) {
    if (!safeKey(key) || (allowed && !allowed.includes(key)) || typeof field !== 'string' || field.length > 1024 || (ids && !/^[a-zA-Z0-9._-]{1,256}$/.test(field))) {
      if (strict) throw Error('Invalid route field: '+key)
      continue
    }
    if (Object.keys(result).length >= 24) { if (strict) throw Error('Too many route fields'); break }
    result[key] = field
  }
  return result
}
export function projectPluginRoute(name: unknown, params: unknown, query: unknown, owner?: string): PluginRoute | null {
  if (!PLUGIN_ROUTE_NAMES.includes(name as PluginRouteName)) return null
  const route = name as PluginRouteName
  const fields = routeFields(params,routeKeys[route] ?? [],false,true)
  const ownPage = route === 'plugin-page' && owner !== undefined && owner === fields.pluginId
  return { name:route, params:fields, query:routeFields(query,ownPage ? undefined : queryKeys[route] ?? [],false,false) }
}
export function validatePluginRouteTarget(value: unknown, manifest: PluginManifest): PluginRoute {
  const target = value as PluginRouteTarget
  if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key=>!['name','params','query'].includes(key)) || !PLUGIN_ROUTE_NAMES.includes(target.name)) throw Error('Invalid named plugin route')
  const params = routeFields(target.params,routeKeys[target.name] ?? [],true,true)
  if (routeKeys[target.name]?.some(key=>!params[key])) throw Error('Missing route parameter')
  if (target.name === 'plugin-page' && (params.pluginId !== manifest.id || !manifest.ui?.pages?.some(page=>page.id===params.pageId))) throw Error('Plugin page is not owned by caller')
  return {name:target.name, params, query:routeFields(target.query,target.name === 'plugin-page' ? undefined : queryKeys[target.name] ?? [],true,false)}
}

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
      !manifest.ui?.pages?.some((page) => page.mount === 'playlist-section' && page.id === request.sectionId)
    )
      throw new Error('Unknown playlist section: ' + request.sectionId)
  }
}
