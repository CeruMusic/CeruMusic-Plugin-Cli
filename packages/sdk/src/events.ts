import type { HookOperationName, HookResult, OperationInputs, OperationSource } from './hooks.js'
import type { PermissionName } from './catalog.js'

export type OperationEventName = HookOperationName | `${HookOperationName}:done`
type ReadonlyTree<T> = T extends object ? { readonly [K in keyof T]: ReadonlyTree<T[K]> } : T
export type OperationEvent<Name extends OperationEventName> = Name extends `${infer Op extends HookOperationName}:done`
  ? ReadonlyTree<{ input: OperationInputs[Op]; source: OperationSource; result: HookResult<Op>; prevented: boolean; handledBy: string[]; failed: boolean }>
  : Name extends HookOperationName ? ReadonlyTree<{ input: OperationInputs[Name]; source: OperationSource }> & { preventDefault(): void } : never

export function operationEventPermission(name: string): PermissionName | undefined {
  const done = name.endsWith(':done')
  const operation = done ? name.slice(0, -5) : name
  const group = operation.split('.')[0]
  const permissions: Record<string, readonly [PermissionName, PermissionName]> = {
    player: ['player.intercept', 'player.read'], queue: ['player.intercept', 'player.read'],
    track: ['library.intercept', 'library.read'], playlist: ['library.intercept', 'library.read'],
    account: ['account.intercept', 'account.profile'], search: ['search.intercept', 'search.read'],
    lyrics: ['lyrics.intercept', 'player.read'], download: ['downloads.intercept', 'downloads.manage'],
    share: ['sharing.intercept', 'music.read'], link: ['links.intercept', 'links.read'],
    notification: ['notifications.intercept', 'notifications.read'], window: ['window.intercept', 'window.read'],
  }
  return permissions[group]?.[done ? 1 : 0]
}
