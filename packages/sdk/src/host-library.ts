import { assertContentPage } from './music.js'
import type {
  LibraryAPI,
  LibraryPlaylist,
  PlaylistImportRequest,
  PlaylistImportResult,
  PlaylistLocation,
  PlaylistReference,
} from './library.js'
import type { ContentEntity, OperationContext, Page } from './index.js'

/** Bind these functions to existing app services. No database, account or UI is created here. */
export interface HostLibraryServices {
  authorize(
    permissionKey: string,
    capability: 'library.read' | 'library.write',
    operation: OperationContext,
    target?: PlaylistReference,
  ): Promise<void>
  chooseTarget(
    suggestedName: string | undefined,
    operation: OperationContext,
  ): Promise<PlaylistReference | null>
  list(
    location: PlaylistLocation | undefined,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<Page<LibraryPlaylist>>
  getTracks(
    target: PlaylistReference,
    cursor: string | undefined,
    operation: OperationContext,
  ): Promise<Page<ContentEntity>>
  /** Existing local/cloud service must deduplicate requestId per plugin/user/target. */
  append(
    input: PlaylistImportRequest & { target: PlaylistReference },
  ): Promise<{ added: number; skipped: number }>
  /** Notify the existing store/event bus only after persistence succeeds. */
  changed(target: PlaylistReference): void
}

function checkTarget(target: PlaylistReference) {
  if (
    !target ||
    typeof target.id !== 'string' ||
    !target.id ||
    !['local', 'cloud'].includes(target.location)
  )
    throw new Error('Invalid target playlist')
}

/** Core-side validation/delegation. Pass only a Host-authenticated OperationContext. */
export function createHostLibraryBridge(services: HostLibraryServices): LibraryAPI {
  return {
    playlists: {
      async list(input) {
        input.operation.signal.throwIfAborted()
        await services.authorize(input.permissionKey, 'library.read', input.operation)
        return services.list(input.location, input.cursor, input.operation)
      },
      async getTracks(input) {
        checkTarget(input.target)
        await services.authorize(input.permissionKey, 'library.read', input.operation, input.target)
        const result = await services.getTracks(input.target, input.cursor, input.operation)
        assertContentPage(result)
        return result
      },
      async import(input): Promise<PlaylistImportResult> {
        input.operation.signal.throwIfAborted()
        assertContentPage({ items: input.items })
        if (input.items.some((item) => item.ref.kind !== 'track'))
          throw new Error('Only tracks can be imported')
        if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 256)
          throw new Error('Invalid import request ID')
        await services.authorize(
          input.permissionKey,
          'library.write',
          input.operation,
          input.target,
        )
        const target =
          input.target ?? (await services.chooseTarget(input.suggestedName, input.operation))
        if (!target) return { cancelled: true, added: 0, skipped: 0 }
        checkTarget(target)
        // The final user-selected destination may have a different grant/account scope.
        await services.authorize(input.permissionKey, 'library.write', input.operation, target)
        input.operation.signal.throwIfAborted()
        const result = await services.append({ ...input, target })
        services.changed(target)
        return { cancelled: false, target, added: result.added, skipped: result.skipped }
      },
    },
  }
}
